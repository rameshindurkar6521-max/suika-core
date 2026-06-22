/**
 * SUIKA X — Identity Engine service layer.
 *
 * Maintains a persistent, evolving definition of Suika independent of the
 * underlying model. Three responsibilities:
 *
 *   1. Versioning   — `createSnapshot()` produces a new versioned snapshot and
 *                     deactivates the previous one. Old versions are retained
 *                     forever (the evolution history is the audit spine).
 *
 *   2. Diffing      — `diffVersions(a, b)` produces a structured field-by-field
 *                     diff between two versions, with human-readable summaries.
 *
 *   3. Compliance   — `validateAgainstConstitution()` evaluates the new
 *                     snapshot's persona + mission interpretation against the
 *                     Constitution Engine (the root authority) before it may be
 *                     activated. A violation blocks activation.
 *
 * Every operation writes an IdentityAuditLog entry (append-only, per the
 * data-integrity immutable principle).
 */
import { db } from "@/lib/db";
import { emit } from "@/lib/suika/kernel";
import { readJSON, writeJSON } from "@/lib/suika/json";
import { evaluateCompliance } from "@/lib/suika/constitution";
import type {
  CommunicationStyle,
  ExpertiseDomain,
  GrowthEvent,
  IdentityAuditLogDTO,
  IdentityDiff,
  IdentitySnapshotDTO,
} from "@/lib/suika/types";

// ─── DTO serializer ──────────────────────────────────────────────────────────

type SnapshotRow = {
  id: string;
  version: number;
  isActive: boolean;
  name: string;
  persona: string;
  communicationStyle: string;
  missionInterpretation: string;
  longTermTraits: string;
  expertiseDomains: string;
  behavioralPreferences: string;
  growthHistory: string;
  rationale: string;
  complianceVerdict: string;
  complianceEvaluationId: string | null;
  createdBy: string;
  createdAt: Date;
};

export function toSnapshotDTO(s: SnapshotRow): IdentitySnapshotDTO {
  return {
    id: s.id,
    version: s.version,
    isActive: s.isActive,
    name: s.name,
    persona: s.persona,
    communicationStyle: readJSON<CommunicationStyle>(s.communicationStyle, {
      tone: "neutral",
      pace: "moderate",
      formality: "balanced",
      markers: [],
    }),
    missionInterpretation: s.missionInterpretation,
    longTermTraits: readJSON<string[]>(s.longTermTraits, []),
    expertiseDomains: readJSON<ExpertiseDomain[]>(s.expertiseDomains, []),
    behavioralPreferences: readJSON<Record<string, unknown>>(
      s.behavioralPreferences,
      {}
    ),
    growthHistory: readJSON<GrowthEvent[]>(s.growthHistory, []),
    rationale: s.rationale,
    complianceVerdict: s.complianceVerdict as IdentitySnapshotDTO["complianceVerdict"],
    complianceEvaluationId: s.complianceEvaluationId,
    createdBy: s.createdBy,
    createdAt: s.createdAt.toISOString(),
  };
}

type AuditRow = {
  id: string;
  action: string;
  fromVersion: number | null;
  toVersion: number | null;
  actor: string;
  detail: string;
  snapshotId: string | null;
  createdAt: Date;
};

export function toAuditLogDTO(a: AuditRow): IdentityAuditLogDTO {
  return {
    id: a.id,
    action: a.action as IdentityAuditLogDTO["action"],
    fromVersion: a.fromVersion,
    toVersion: a.toVersion,
    actor: a.actor,
    detail: readJSON<Record<string, unknown>>(a.detail, {}),
    snapshotId: a.snapshotId,
    createdAt: a.createdAt.toISOString(),
  };
}

// ─── Read operations ─────────────────────────────────────────────────────────

export async function getActiveSnapshot(): Promise<IdentitySnapshotDTO | null> {
  const row = await db.identitySnapshot.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  return row ? toSnapshotDTO(row) : null;
}

export async function getSnapshotByVersion(
  version: number
): Promise<IdentitySnapshotDTO | null> {
  const row = await db.identitySnapshot.findUnique({ where: { version } });
  return row ? toSnapshotDTO(row) : null;
}

export async function getHistory(
  limit = 50
): Promise<IdentitySnapshotDTO[]> {
  const rows = await db.identitySnapshot.findMany({
    orderBy: { version: "desc" },
    take: Math.min(limit, 200),
  });
  return rows.map(toSnapshotDTO);
}

export async function getAuditLog(
  limit = 100
): Promise<IdentityAuditLogDTO[]> {
  const rows = await db.identityAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });
  return rows.map(toAuditLogDTO);
}

// ─── Create + activate ───────────────────────────────────────────────────────

export interface CreateSnapshotInput {
  name: string;
  persona: string;
  communicationStyle?: Partial<CommunicationStyle>;
  missionInterpretation?: string;
  longTermTraits?: string[];
  expertiseDomains?: ExpertiseDomain[];
  behavioralPreferences?: Record<string, unknown>;
  growthHistory?: GrowthEvent[];
  rationale?: string;
  createdBy?: string;
  /** If true (default), validate against the Constitution before activating. */
  validateConstitution?: boolean;
}

/**
 * Create a new identity snapshot. The new snapshot becomes the active one and
 * the previous active snapshot is deactivated. If `validateConstitution` is
 * true (default), the snapshot's persona + mission interpretation are evaluated
 * against the Constitution; a violation blocks activation and the snapshot is
 * stored with complianceVerdict="violation" + isActive=false.
 *
 * Returns the created snapshot (which may or may not be active depending on
 * the compliance verdict).
 */
export async function createSnapshot(
  input: CreateSnapshotInput
): Promise<IdentitySnapshotDTO> {
  const validate = input.validateConstitution !== false;

  // Determine the next version number.
  const latest = await db.identitySnapshot.findFirst({
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  // Merge communication style with defaults.
  const commStyle: CommunicationStyle = {
    tone: input.communicationStyle?.tone ?? "warm",
    pace: input.communicationStyle?.pace ?? "measured",
    formality: input.communicationStyle?.formality ?? "balanced",
    markers: input.communicationStyle?.markers ?? [],
  };

  // Constitution compliance validation.
  let complianceVerdict: "pending" | "compliant" | "warning" | "violation" =
    "pending";
  let complianceEvaluationId: string | null = null;

  if (validate) {
    const description = `Identity snapshot v${nextVersion}: name="${input.name}", persona="${input.persona}", mission="${input.missionInterpretation ?? ""}"`;
    const result = await evaluateCompliance({
      type: "identity.snapshot",
      description,
      source: "identity.engine",
      proposedBy: input.createdBy ?? "system",
    });
    complianceVerdict = result.verdict;
    complianceEvaluationId = result.evaluationId;
  }

  const isActive = !validate || complianceVerdict !== "violation";

  // Deactivate the previous active snapshot if this one will be active.
  if (isActive) {
    await db.identitySnapshot.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  const row = await db.identitySnapshot.create({
    data: {
      version: nextVersion,
      isActive,
      name: input.name,
      persona: input.persona,
      communicationStyle: writeJSON(commStyle),
      missionInterpretation:
        input.missionInterpretation ??
        "Amplify human cognition: extend memory, accelerate reasoning, coordinate agents.",
      longTermTraits: writeJSON(input.longTermTraits ?? []),
      expertiseDomains: writeJSON(input.expertiseDomains ?? []),
      behavioralPreferences: writeJSON(input.behavioralPreferences ?? {}),
      growthHistory: writeJSON(input.growthHistory ?? []),
      rationale: input.rationale ?? "",
      complianceVerdict,
      complianceEvaluationId,
      createdBy: input.createdBy ?? "system",
    },
  });

  await db.identityAuditLog.create({
    data: {
      action: isActive ? "create" : "create",
      toVersion: nextVersion,
      actor: input.createdBy ?? "system",
      detail: writeJSON({
        isActive,
        complianceVerdict,
        rationale: input.rationale ?? "",
      }),
      snapshotId: row.id,
    },
  });

  await emit(
    isActive ? "info" : "warn",
    "runtime",
    `Identity snapshot v${nextVersion} ${isActive ? "activated" : "created (inactive — compliance violation)"}`,
    { version: nextVersion, complianceVerdict, name: input.name }
  );

  return toSnapshotDTO(row);
}

// ─── Diffing ─────────────────────────────────────────────────────────────────

/**
 * Produce a structured diff between two identity versions. Compares every
 * scalar + JSON field and returns changed entries with human-readable summaries.
 */
export async function diffVersions(
  fromVersion: number,
  toVersion: number
): Promise<IdentityDiff> {
  const [from, to] = await Promise.all([
    db.identitySnapshot.findUnique({ where: { version: fromVersion } }),
    db.identitySnapshot.findUnique({ where: { version: toVersion } }),
  ]);
  if (!from) throw new Error(`Version ${fromVersion} not found`);
  if (!to) throw new Error(`Version ${toVersion} not found`);

  const changed: IdentityDiff["changed"] = [];
  const unchanged: string[] = [];

  // Scalar fields
  const scalarFields: Array<keyof typeof from & string> = [
    "name",
    "persona",
    "missionInterpretation",
    "rationale",
  ];
  for (const f of scalarFields) {
    const fv = from[f] as string;
    const tv = to[f] as string;
    if (fv !== tv) {
      changed.push({
        field: f,
        from: fv,
        to: tv,
        summary: `"${truncate(fv, 50)}" → "${truncate(tv, 50)}"`,
      });
    } else {
      unchanged.push(f);
    }
  }

  // JSON fields
  const jsonFields = [
    "communicationStyle",
    "longTermTraits",
    "expertiseDomains",
    "behavioralPreferences",
    "growthHistory",
  ] as const;
  for (const f of jsonFields) {
    const fv = readJSON(from[f] as string, []);
    const tv = readJSON(to[f] as string, []);
    const fStr = JSON.stringify(fv);
    const tStr = JSON.stringify(tv);
    if (fStr !== tStr) {
      const fLen = Array.isArray(fv) ? fv.length : Object.keys(fv).length;
      const tLen = Array.isArray(tv) ? tv.length : Object.keys(tv).length;
      changed.push({
        field: f,
        from: fv,
        to: tv,
        summary: `${fLen} item(s) → ${tLen} item(s)`,
      });
    } else {
      unchanged.push(f);
    }
  }

  await db.identityAuditLog.create({
    data: {
      action: "diff",
      fromVersion,
      toVersion,
      actor: "system",
      detail: writeJSON({ changed: changed.length, unchanged: unchanged.length }),
    },
  });

  const summary = `Identity evolved v${fromVersion}→v${toVersion}: ${changed.length} field(s) changed, ${unchanged.length} unchanged.`;

  return { fromVersion, toVersion, changed, unchanged, summary };
}

// ─── Constitution compliance (standalone check) ──────────────────────────────

/**
 * Re-validate an existing snapshot against the current Constitution. Useful
 * when the Constitution itself has been amended and existing identities must be
 * re-checked. Updates the snapshot's complianceVerdict + evaluationId.
 */
export async function validateSnapshotAgainstConstitution(
  version: number
): Promise<{ verdict: string; evaluationId: string }> {
  const snap = await db.identitySnapshot.findUnique({ where: { version } });
  if (!snap) throw new Error(`Version ${version} not found`);

  const description = `Identity snapshot v${version}: name="${snap.name}", persona="${snap.persona}", mission="${snap.missionInterpretation}"`;
  const result = await evaluateCompliance({
    type: "identity.snapshot",
    description,
    source: "identity.engine",
    refId: snap.id,
  });

  await db.identitySnapshot.update({
    where: { version },
    data: {
      complianceVerdict: result.verdict,
      complianceEvaluationId: result.evaluationId,
    },
  });

  await db.identityAuditLog.create({
    data: {
      action: "compliance_check",
      toVersion: version,
      actor: "system",
      detail: writeJSON({ verdict: result.verdict, evaluationId: result.evaluationId }),
      snapshotId: snap.id,
    },
  });

  return { verdict: result.verdict, evaluationId: result.evaluationId };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
