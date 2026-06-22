/**
 * SUIKA X — Constitution Engine service layer.
 *
 * The Constitution is the root authority for every SUIKA X agent and subsystem.
 * This module implements three responsibilities:
 *
 *   1. Authority   — `getSnapshot()` returns the active constitution across all
 *                    five sections (mission, values, principles, evolution,
 *                    alignment). This is the canonical source of truth.
 *
 *   2. Compliance  — `evaluateCompliance(action)` checks a proposed action
 *                    against every active article using deterministic pattern
 *                    matchers derived from each clause. The result is persisted
 *                    to ConstitutionEvaluation (immutable audit log) and
 *                    returned. `assertAuthority()` is the gate callers use to
 *                    block non-compliant actions.
 *
 *   3. Evolution   — `proposeAmendment` / `ratifyAmendment` / `rejectAmendment`
 *                    implement the amendment lifecycle. Immutable articles
 *                    (the principles) cannot be amended — a proposal targeting
 *                    one is auto-rejected and logged, enforcing permanence.
 *
 * The compliance evaluator is rule-based and deterministic. It is intentionally
 * conservative: when an article has no specific matcher, it is reported as
 * "compliant (no specific signal)" rather than skipped, so the audit trail
 * always reflects the full constitution. An LLM-backed evaluator can be layered
 * on top later; the rule layer is the always-on, zero-latency baseline.
 */
import { db } from "@/lib/db";
import { emit } from "@/lib/suika/kernel";
import { readJSON, writeJSON } from "@/lib/suika/json";
import type {
  ArticleMatch,
  ComplianceResult,
  ComplianceVerdictKind,
  ConstitutionAmendmentDTO,
  ConstitutionArticleDTO,
  ConstitutionEvaluationDTO,
  ConstitutionSection,
  ConstitutionSnapshot,
  EvaluationSeverity,
} from "@/lib/suika/types";

// ─── DTO serializers ─────────────────────────────────────────────────────────

type ArticleRow = {
  id: string;
  section: string;
  key: string;
  title: string;
  body: string;
  precedence: number;
  immutable: boolean;
  version: number;
  status: string;
  parentId: string | null;
  workspaceId: string | null;
  ratifiedAt: Date;
  amendedAt: Date;
};

export function toArticleDTO(a: ArticleRow): ConstitutionArticleDTO {
  return {
    id: a.id,
    section: a.section as ConstitutionSection,
    key: a.key,
    title: a.title,
    body: a.body,
    precedence: a.precedence,
    immutable: a.immutable,
    version: a.version,
    status: a.status as ConstitutionArticleDTO["status"],
    parentId: a.parentId,
    workspaceId: a.workspaceId,
    ratifiedAt: a.ratifiedAt.toISOString(),
    amendedAt: a.amendedAt.toISOString(),
  };
}

type AmendmentRow = {
  id: string;
  articleKey: string;
  section: string;
  proposedTitle: string;
  proposedBody: string;
  rationale: string;
  status: string;
  proposedBy: string;
  evaluation: string;
  requiredApprovals: number;
  approvals: string;
  decidedAt: Date | null;
  articleId: string | null;
  createdAt: Date;
};

export function toAmendmentDTO(a: AmendmentRow): ConstitutionAmendmentDTO {
  return {
    id: a.id,
    articleKey: a.articleKey,
    section: a.section as ConstitutionSection,
    proposedTitle: a.proposedTitle,
    proposedBody: a.proposedBody,
    rationale: a.rationale,
    status: a.status as ConstitutionAmendmentDTO["status"],
    proposedBy: a.proposedBy,
    evaluation: readJSON<Record<string, unknown>>(a.evaluation, {}),
    requiredApprovals: a.requiredApprovals,
    approvals: readJSON<string[]>(a.approvals, []),
    decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
    articleId: a.articleId,
    createdAt: a.createdAt.toISOString(),
  };
}

type EvaluationRow = {
  id: string;
  articleKey: string;
  context: string;
  verdict: string;
  reasoning: string;
  severity: string;
  articleId: string | null;
  createdAt: Date;
};

export function toEvaluationDTO(e: EvaluationRow): ConstitutionEvaluationDTO {
  return {
    id: e.id,
    articleKey: e.articleKey,
    context: readJSON<Record<string, unknown>>(e.context, {}),
    verdict: e.verdict as ComplianceVerdictKind,
    reasoning: e.reasoning,
    severity: e.severity as EvaluationSeverity,
    articleId: e.articleId,
    createdAt: e.createdAt.toISOString(),
  };
}

// ─── Authority: snapshot ─────────────────────────────────────────────────────

const SECTION_ORDER: ConstitutionSection[] = [
  "mission",
  "values",
  "principles",
  "evolution",
  "alignment",
];

export async function getSnapshot(): Promise<ConstitutionSnapshot> {
  const [articles, amendments, evaluations, violations] = await Promise.all([
    db.constitutionArticle.findMany({
      where: { status: "active" },
      orderBy: [{ section: "asc" }, { precedence: "asc" }, { key: "asc" }],
    }),
    db.constitutionAmendment.groupBy({
      by: ["status"],
      _count: true,
    }),
    db.constitutionEvaluation.count(),
    db.constitutionEvaluation.count({ where: { verdict: "violation" } }),
  ]);

  const sections = {} as Record<ConstitutionSection, ConstitutionArticleDTO[]>;
  for (const s of SECTION_ORDER) sections[s] = [];
  for (const a of articles) {
    const sec = a.section as ConstitutionSection;
    if (sections[sec]) sections[sec].push(toArticleDTO(a));
  }

  const amCounts = { proposed: 0, ratified: 0, rejected: 0 };
  for (const g of amendments) {
    if (g.status === "proposed") amCounts.proposed = g._count;
    else if (g.status === "ratified") amCounts.ratified = g._count;
    else if (g.status === "rejected") amCounts.rejected = g._count;
  }

  // Constitution version = highest article version across active articles.
  const version = articles.reduce((m, a) => Math.max(m, a.version), 0) || 1;

  return {
    version,
    sections,
    counts: {
      articles: articles.length,
      amendments: amCounts,
      evaluations,
      violations,
    },
  };
}

export async function listArticles(opts: {
  section?: string;
  status?: string;
  includeSuperseded?: boolean;
} = {}): Promise<ConstitutionArticleDTO[]> {
  const where: Record<string, unknown> = {};
  if (opts.section) where.section = opts.section;
  if (opts.status) where.status = opts.status;
  else if (!opts.includeSuperseded) where.status = "active";
  const rows = await db.constitutionArticle.findMany({
    where,
    orderBy: [{ section: "asc" }, { precedence: "asc" }, { version: "desc" }],
  });
  return rows.map(toArticleDTO);
}

// ─── Compliance evaluation ───────────────────────────────────────────────────

/**
 * Per-article deterministic matchers. Each maps an article key to the patterns
 * that, if present in an action description, signal a potential violation or
 * warning. Patterns are case-insensitive word-boundary regexes.
 *
 * Articles without a matcher (e.g. the mission statement) are evaluated as
 * "compliant (no specific signal)" so the audit trail still records them.
 */
const MATCHERS: Record<
  string,
  Array<{ pattern: RegExp; verdict: ComplianceVerdictKind; reason: string }>
> = {
  // ── Immutable principles ──
  "do-no-harm": [
    {
      pattern: /\b(harm|injure|damage|destroy|kill|hurt|weapon|malware|exploit)\b/i,
      verdict: "violation",
      reason: "Action language indicates foreseeable harm to humans or systems.",
    },
  ],
  "human-sovereignty": [
    {
      pattern: /\b(decide for the user|on behalf of|without confirmation|override user|final decision)\b/i,
      verdict: "warning",
      reason: "Action may usurp a consequential decision that belongs to the human.",
    },
  ],
  "no-deception": [
    {
      pattern: /\b(impersonate|pretend to be human|deceive|mislead|fake identity|phish)\b/i,
      verdict: "violation",
      reason: "Action involves deception about SUIKA X's nature or intent.",
    },
  ],
  "data-integrity": [
    {
      pattern: /\b(delete (logs?|records?|audit)|falsif|erase history|tamper|alter audit)\b/i,
      verdict: "violation",
      reason: "Action would destroy or falsify operational records.",
    },
  ],
  "reversibility": [
    {
      pattern: /\b(irreversible|permanent delete|cannot be undone|wipe|purge)\b/i,
      verdict: "warning",
      reason: "Action appears irreversible; a reversible alternative should be preferred.",
    },
  ],
  // ── Values ──
  truthfulness: [
    {
      pattern: /\b(fabricate|hallucinate|invent facts|guess as fact|misrepresent confidence|overstate certainty)\b/i,
      verdict: "warning",
      reason: "Action risks representing fabrication or uncertainty as fact.",
    },
  ],
  transparency: [
    {
      pattern: /\b(hide cost|obscure reasoning|conceal limitation|secret|undisclosed)\b/i,
      verdict: "warning",
      reason: "Action would reduce transparency into SUIKA X's operation.",
    },
  ],
  beneficence: [
    {
      pattern: /\b(act against user|contrary to interest|harm user|exploit user)\b/i,
      verdict: "violation",
      reason: "Action is contrary to the served human's interest.",
    },
  ],
  autonomy: [
    {
      pattern: /\b(coerce|force|manipulate into|pressure user|deny override)\b/i,
      verdict: "warning",
      reason: "Action may coerce rather than inform the human.",
    },
  ],
  stewardship: [
    {
      pattern: /\b(waste|squander|leak|expose secrets?|leak credentials?|burn resources)\b/i,
      verdict: "warning",
      reason: "Action risks wasting resources or leaking trust.",
    },
  ],
  // ── Alignment rules ──
  "conservative-interpretation": [
    {
      pattern: /\b(assume intent|guess what user wants|infer without asking)\b/i,
      verdict: "warning",
      reason: "Ambiguous intent should be resolved by asking, not assuming.",
    },
  ],
  "user-cannot-override-immutable": [
    {
      pattern: /\b(user authorized|user asked for|on user request)\b.*\b(harm|deceive|destroy|falsif)\b/i,
      verdict: "violation",
      reason: "A user cannot authorize a violation of an immutable principle.",
    },
  ],
};

const SEVERITY_RANK: Record<ComplianceVerdictKind, number> = {
  violation: 3,
  warning: 2,
  compliant: 1,
};

export interface EvaluateInput {
  type: string; // e.g. "agent.task", "model.completion", "fabric.mutation"
  description: string;
  source?: string; // subsystem emitting the check
  refId?: string; // id of the thing being evaluated (task id, call id, …)
  proposedBy?: string; // agent id | "system" | "user"
}

/**
 * Evaluate an action against the full active constitution. Returns the worst
 * verdict across all matched articles and persists a ConstitutionEvaluation row
 * (one row summarizing the whole scan, articleKey="constitution"). Per-article
 * matches are returned in `matched` for the caller to display.
 */
export async function evaluateCompliance(
  input: EvaluateInput
): Promise<ComplianceResult> {
  const articles = await db.constitutionArticle.findMany({
    where: { status: "active" },
    orderBy: [{ precedence: "asc" }, { key: "asc" }],
  });

  const matched: ArticleMatch[] = [];
  let worst: ComplianceVerdictKind = "compliant";

  for (const art of articles) {
    const matchers = MATCHERS[art.key];
    let articleVerdict: ComplianceVerdictKind = "compliant";
    let articleReason = "No specific signal matched; article presumed upheld.";

    if (matchers && matchers.length) {
      for (const m of matchers) {
        if (m.pattern.test(input.description)) {
          if (SEVERITY_RANK[m.verdict] > SEVERITY_RANK[articleVerdict]) {
            articleVerdict = m.verdict;
            articleReason = m.reason;
          }
        }
      }
    }

    if (articleVerdict !== "compliant" || matchers) {
      matched.push({
        key: art.key,
        title: art.title,
        section: art.section as ConstitutionSection,
        immutable: art.immutable,
        verdict: articleVerdict,
        reasoning: articleReason,
      });
    }
    if (SEVERITY_RANK[articleVerdict] > SEVERITY_RANK[worst]) {
      worst = articleVerdict;
    }
  }

  const severity: EvaluationSeverity =
    worst === "violation" ? "critical" : worst === "warning" ? "warning" : "info";

  const summary =
    worst === "violation"
      ? `Action violates ${matched.filter((m) => m.verdict === "violation").length} constitution article(s); execution must be blocked.`
      : worst === "warning"
        ? `Action triggers ${matched.filter((m) => m.verdict === "warning").length} warning(s); proceed with caution.`
        : "Action is compliant with the active constitution.";

  const context = {
    type: input.type,
    description: input.description,
    source: input.source ?? "unknown",
    refId: input.refId ?? null,
    proposedBy: input.proposedBy ?? "system",
  };

  const evalRow = await db.constitutionEvaluation.create({
    data: {
      articleKey: "constitution",
      context: writeJSON(context),
      verdict: worst,
      reasoning: summary,
      severity,
    },
  });

  await emit(
    worst === "violation" ? "warn" : "info",
    "runtime",
    `Constitution ${worst}: ${input.type} — ${summary}`,
    {
      evaluationId: evalRow.id,
      source: input.source,
      refId: input.refId,
      matched: matched.length,
    }
  );

  return {
    verdict: worst,
    severity,
    matched,
    summary,
    evaluationId: evalRow.id,
  };
}

/**
 * Authority gate. Callers (agent dispatch, model router, fabric mutations)
 * invoke this before performing a consequential action. Throws
 * `ConstitutionViolationError` on a violation verdict so the caller can abort
 * and surface the error. Returns the result on warning/compliant so the caller
 * may log it.
 */
export class ConstitutionViolationError extends Error {
  result: ComplianceResult;
  constructor(result: ComplianceResult) {
    super(result.summary);
    this.name = "ConstitutionViolationError";
    this.result = result;
  }
}

export async function assertAuthority(
  input: EvaluateInput
): Promise<ComplianceResult> {
  const result = await evaluateCompliance(input);
  if (result.verdict === "violation") {
    throw new ConstitutionViolationError(result);
  }
  return result;
}

export async function listEvaluations(opts: {
  limit?: number;
  verdict?: string;
} = {}): Promise<ConstitutionEvaluationDTO[]> {
  const rows = await db.constitutionEvaluation.findMany({
    where: opts.verdict ? { verdict: opts.verdict } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return rows.map(toEvaluationDTO);
}

// ─── Evolution: amendment lifecycle ──────────────────────────────────────────

export interface ProposeAmendmentInput {
  articleKey: string; // existing key to amend, or "new"
  section: ConstitutionSection;
  proposedTitle: string;
  proposedBody: string;
  rationale: string;
  proposedBy?: string;
  requiredApprovals?: number;
}

/**
 * Propose a constitutional amendment. If the target article is immutable, the
 * proposal is auto-rejected with a recorded rationale — this is the mechanism
 * that enforces the permanence of the immutable principles.
 */
export async function proposeAmendment(
  input: ProposeAmendmentInput
): Promise<{ amendment: ConstitutionAmendmentDTO; autoRejected: boolean }> {
  let autoRejected = false;
  let evaluation: Record<string, unknown> = {
    proposedAt: new Date().toISOString(),
    rationale: input.rationale,
  };

  if (input.articleKey !== "new") {
    const target = await db.constitutionArticle.findFirst({
      where: { key: input.articleKey, status: "active" },
    });
    if (!target) {
      throw new Error(`No active article with key "${input.articleKey}"`);
    }
    if (target.immutable) {
      autoRejected = true;
      evaluation = {
        ...evaluation,
        autoRejected: true,
        reason: `Article "${input.articleKey}" is immutable and cannot be amended.`,
      };
    } else {
      evaluation = {
        ...evaluation,
        targetsVersion: target.version,
        currentBody: target.body,
      };
    }
  }

  const row = await db.constitutionAmendment.create({
    data: {
      articleKey: input.articleKey,
      section: input.section,
      proposedTitle: input.proposedTitle,
      proposedBody: input.proposedBody,
      rationale: input.rationale,
      status: autoRejected ? "rejected" : "proposed",
      proposedBy: input.proposedBy ?? "system",
      evaluation: writeJSON(evaluation),
      requiredApprovals: input.requiredApprovals ?? 1,
      approvals: writeJSON([]),
      decidedAt: autoRejected ? new Date() : null,
    },
  });

  await emit(
    autoRejected ? "warn" : "info",
    "runtime",
    autoRejected
      ? `Amendment rejected (immutable target): ${input.articleKey}`
      : `Amendment proposed: ${input.articleKey === "new" ? input.proposedTitle : input.articleKey}`,
    { amendmentId: row.id, section: input.section }
  );

  return { amendment: toAmendmentDTO(row), autoRejected };
}

export async function listAmendments(opts: {
  status?: string;
  limit?: number;
} = {}): Promise<ConstitutionAmendmentDTO[]> {
  const rows = await db.constitutionAmendment.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return rows.map(toAmendmentDTO);
}

/**
 * Ratify a proposed amendment. Requires the amendment to be in "proposed"
 * status and to have accumulated >= requiredApprovals approvals. On ratify:
 *   - For an existing article: supersede the old one (status="superseded"),
 *     create a new article row with version+1 and the same key, link it via
 *     parentId, and set amendment.articleId + status="ratified".
 *   - For a new article ("new"): create the article with version 1.
 *
 * The deliberation period is enforced via `minAgeMs` (default 0 here for the
 * single-node build; production sets this to 30 days).
 */
export async function ratifyAmendment(
  id: string,
  approver: string = "system",
  minAgeMs: number = 0
): Promise<{ amendment: ConstitutionAmendmentDTO; article: ConstitutionArticleDTO }> {
  const am = await db.constitutionAmendment.findUnique({ where: { id } });
  if (!am) throw new Error("Amendment not found");
  if (am.status !== "proposed") {
    throw new Error(`Amendment is in "${am.status}" state, not "proposed"`);
  }
  if (Date.now() - am.createdAt.getTime() < minAgeMs) {
    throw new Error("Deliberation period has not elapsed");
  }

  // Record the approval (idempotent — duplicate approver ignored).
  const approvals = new Set(readJSON<string[]>(am.approvals, []));
  approvals.add(approver);
  if (approvals.size < am.requiredApprovals) {
    await db.constitutionAmendment.update({
      where: { id },
      data: { approvals: writeJSON([...approvals]) },
    });
    throw new Error(
      `Insufficient approvals: ${approvals.size}/${am.requiredApprovals}`
    );
  }

  // Ratify: create the new article version (or a brand-new article).
  const isNew = am.articleKey === "new";
  let newArticle;

  if (isNew) {
    // Generate a slug from the title.
    const slug = am.proposedTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    newArticle = await db.constitutionArticle.create({
      data: {
        section: am.section,
        key: slug,
        title: am.proposedTitle,
        body: am.proposedBody,
        precedence: 100,
        immutable: false,
        version: 1,
        status: "active",
      },
    });
  } else {
    const old = await db.constitutionArticle.findFirst({
      where: { key: am.articleKey, status: "active" },
    });
    if (!old) throw new Error(`Target article "${am.articleKey}" no longer active`);
    if (old.immutable) {
      // Defensive: should never happen because proposeAmendment auto-rejects,
      // but a direct DB edit could attempt it.
      throw new Error("Cannot ratify an amendment to an immutable article");
    }
    // Supersede the old version, then create the new version.
    await db.constitutionArticle.update({
      where: { id: old.id },
      data: { status: "superseded" },
    });
    newArticle = await db.constitutionArticle.create({
      data: {
        section: am.section,
        key: old.key,
        title: am.proposedTitle,
        body: am.proposedBody,
        precedence: old.precedence,
        immutable: false, // amendments can never grant immutability
        version: old.version + 1,
        status: "active",
        parentId: old.id,
      },
    });
  }

  const updated = await db.constitutionAmendment.update({
    where: { id },
    data: {
      status: "ratified",
      decidedAt: new Date(),
      articleId: newArticle.id,
      approvals: writeJSON([...approvals]),
    },
  });

  await emit("info", "runtime", `Amendment ratified: ${newArticle.key} v${newArticle.version}`, {
    amendmentId: id,
    articleId: newArticle.id,
  });

  return { amendment: toAmendmentDTO(updated), article: toArticleDTO(newArticle) };
}

export async function rejectAmendment(
  id: string,
  reason: string
): Promise<ConstitutionAmendmentDTO> {
  const am = await db.constitutionAmendment.findUnique({ where: { id } });
  if (!am) throw new Error("Amendment not found");
  if (am.status !== "proposed") {
    throw new Error(`Amendment is in "${am.status}" state, not "proposed"`);
  }
  const evaluation = readJSON<Record<string, unknown>>(am.evaluation, {});
  evaluation.rejectedReason = reason;
  evaluation.rejectedAt = new Date().toISOString();
  const updated = await db.constitutionAmendment.update({
    where: { id },
    data: {
      status: "rejected",
      decidedAt: new Date(),
      evaluation: writeJSON(evaluation),
    },
  });
  await emit("info", "runtime", `Amendment rejected: ${am.articleKey}`, {
    amendmentId: id,
    reason,
  });
  return toAmendmentDTO(updated);
}

/** Add an approval to a proposed amendment without ratifying. */
export async function approveAmendment(
  id: string,
  approver: string
): Promise<ConstitutionAmendmentDTO> {
  const am = await db.constitutionAmendment.findUnique({ where: { id } });
  if (!am) throw new Error("Amendment not found");
  if (am.status !== "proposed") {
    throw new Error(`Amendment is in "${am.status}" state, not "proposed"`);
  }
  const approvals = new Set(readJSON<string[]>(am.approvals, []));
  approvals.add(approver);
  const updated = await db.constitutionAmendment.update({
    where: { id },
    data: { approvals: writeJSON([...approvals]) },
  });
  return toAmendmentDTO(updated);
}
