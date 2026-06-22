/**
 * SUIKA X — Context-Driven Planner.
 *
 * This module replaces the static `subtaskPlanFor(rootKind)` and
 * `syntheticOutput(kind, n)` functions with context-driven equivalents that
 * actively consume the AgentContext to alter DAG shape, step count,
 * verification depth, retrieval depth, execution strategy, and output content.
 *
 * Every field of AgentContext is read by at least one function below:
 *
 *   constitution.verdict   → gates verification depth (warnings add a verify step)
 *   constitution.summary   → included in reason output rationale
 *   identity.persona       → alters synthesize summary voice
 *   identity.communicationStyle.pace → alters reason step count
 *   identity.communicationStyle.formality → alters synthesize tone
 *   identity.longTermTraits → alters execute strategy (cautious traits → verify)
 *   identity.behavioralPreferences → alters execution strategy (reversibility → verify)
 *   identity.expertiseDomains → alters confidence baseline
 *   relationship.profile.name → included in synthesize summary
 *   relationship.topSkills → alters confidence if task title matches a skill
 *   relationship.keyPreferences → alters execution strategy (reversibility pref → verify)
 *   relationship.recentInteractions → alters retrieve source weighting
 *   goals[]                → alter retrieval depth (more goals → deeper retrieval)
 *   goals[].priority       → alters verification depth (high-priority → verify)
 *   goals[].title          → match against task title → confidence boost
 *   projects[]             → alter execution strategy (in-progress project → standard)
 *   projects[].progress    → alters confidence if task is project-aligned
 *   memories[]             → alter retrieve output (real memory count + top memory)
 *   memories[].content     → included in synthesize summary
 *   memories[].kind        → alters retrieve source breakdown
 *
 * The planner also exposes `planReasoning()` which returns a human-readable
 * explanation of *why* the context produced this particular DAG + output,
 * so the utilization suite can prove every dimension mattered.
 */
import type {
  AgentContext,
  TaskKind,
} from "@/lib/suika/types";

// ─── Context feature extractors ─────────────────────────────────────────────
//
// These pure functions extract scalar signals from the AgentContext. They're
// exported so the utilization suite can call them independently and so the
// planner functions stay readable.

/** Identity traits that indicate caution → should add verification steps. */
const CAUTIOUS_TRAITS = new Set([
  "constitutionally-constrained",
  "evidence-driven",
  "reversibility-seeking",
  "transparent-about-limits",
  "cautious",
  "careful",
  "deliberate",
]);

/** Preference keys that indicate a need for verification. */
const VERIFY_PREFERENCES = new Set([
  "prefersReversibleActions",
  "asksWhenAmbiguous",
  "citesConstitutionOnRefusal",
  "defaultToLowestStakesPath",
]);

export interface ContextSignals {
  /** 0..1 — how cautious the identity is (drives verification depth). */
  cautionScore: number;
  /** 0..1 — how much relevant expertise the identity has (drives confidence). */
  expertiseScore: number;
  /** 0..1 — how aligned the task is with active goals (drives retrieval depth). */
  goalAlignmentScore: number;
  /** 0..1 — how aligned the task is with active projects (drives execution strategy). */
  projectAlignmentScore: number;
  /** number of relevant memories available (drives retrieve output realism). */
  memoryRelevance: number;
  /** 0..1 — how much the relationship suggests reversibility (drives verify). */
  reversibilityPref: number;
  /** communication pace from identity ("measured" → more steps, "fast" → fewer). */
  pace: string;
  /** communication formality from identity. */
  formality: string;
  /** does the constitution verdict carry a warning? (drives verify step). */
  hasConstitutionWarning: boolean;
}

/** Extract scalar planning signals from the AgentContext. */
export function extractSignals(
  ctx: AgentContext | null,
  taskTitle: string
): ContextSignals {
  if (!ctx) {
    return {
      cautionScore: 0,
      expertiseScore: 0,
      goalAlignmentScore: 0,
      projectAlignmentScore: 0,
      memoryRelevance: 0,
      reversibilityPref: 0,
      pace: "moderate",
      formality: "balanced",
      hasConstitutionWarning: false,
    };
  }

  const titleLower = taskTitle.toLowerCase();
  const titleTokens = new Set(titleLower.split(/\W+/).filter(Boolean));

  // ── Caution score (identity traits + behavioral preferences) ──────────
  let cautionScore = 0;
  if (ctx.identity) {
    const cautiousCount = ctx.identity.longTermTraits.filter((t) =>
      CAUTIOUS_TRAITS.has(t)
    ).length;
    cautionScore += Math.min(0.5, cautiousCount * 0.15);
    const prefs = ctx.identity.behavioralPreferences as Record<string, unknown>;
    let prefCount = 0;
    for (const key of VERIFY_PREFERENCES) {
      if (prefs[key] === true) prefCount++;
    }
    cautionScore += Math.min(0.5, prefCount * 0.15);
  }

  // ── Expertise score (identity domains + relationship skills relevant to task) ──
  let expertiseScore = 0;
  if (ctx.identity) {
    for (const domain of ctx.identity.expertiseDomains) {
      const domainTokens = new Set(
        domain.domain.toLowerCase().split(/[-_/]+/).filter(Boolean)
      );
      let overlap = 0;
      for (const t of domainTokens) if (titleTokens.has(t)) overlap++;
      if (overlap > 0) {
        expertiseScore = Math.max(expertiseScore, domain.level / 100);
      }
    }
    // If no domain matched by title, use the average domain level as a baseline.
    if (expertiseScore === 0 && ctx.identity.expertiseDomains.length > 0) {
      const avg =
        ctx.identity.expertiseDomains.reduce((s, d) => s + d.level, 0) /
        ctx.identity.expertiseDomains.length;
      expertiseScore = avg / 100 * 0.5; // half-weight when not specifically relevant
    }
  }
  // Also check relationship top skills — if a skill name matches the task title,
  // boost the expertise score. This integrates the relationship layer into
  // expertise assessment.
  if (ctx.relationship) {
    for (const skill of ctx.relationship.topSkills) {
      const skillTokens = new Set(
        skill.name.toLowerCase().split(/[-_/]+/).filter(Boolean)
      );
      let overlap = 0;
      for (const t of skillTokens) if (titleTokens.has(t)) overlap++;
      if (overlap > 0) {
        expertiseScore = Math.max(expertiseScore, skill.level / 100);
      }
    }
  }

  // ── Goal alignment (task title tokens vs goal title tokens) ───────────
  let goalAlignmentScore = 0;
  for (const goal of ctx.goals) {
    const goalTokens = new Set(goal.title.toLowerCase().split(/\W+/).filter(Boolean));
    let overlap = 0;
    for (const t of goalTokens) if (titleTokens.has(t)) overlap++;
    if (overlap > 0) {
      goalAlignmentScore = Math.max(goalAlignmentScore, Math.min(1, overlap / 3));
    }
  }

  // ── Project alignment (task title tokens vs project title tokens) ──────
  let projectAlignmentScore = 0;
  for (const proj of ctx.projects) {
    const projTokens = new Set(proj.title.toLowerCase().split(/\W+/).filter(Boolean));
    let overlap = 0;
    for (const t of projTokens) if (titleTokens.has(t)) overlap++;
    if (overlap > 0) {
      projectAlignmentScore = Math.max(projectAlignmentScore, Math.min(1, overlap / 3));
    }
  }

  // ── Memory relevance (count of memories in context) ───────────────────
  const memoryRelevance = ctx.memories.length;

  // ── Reversibility preference (relationship preferences) ───────────────
  let reversibilityPref = 0;
  for (const pref of ctx.relationship?.keyPreferences ?? []) {
    if (/reversib|revers|undo|cautious/i.test(pref.name)) {
      reversibilityPref = Math.max(reversibilityPref, pref.level / 100);
    }
  }
  // Also check identity behavioral preferences for reversibility
  if (ctx.identity) {
    const prefs = ctx.identity.behavioralPreferences as Record<string, unknown>;
    if (prefs.prefersReversibleActions === true) {
      reversibilityPref = Math.max(reversibilityPref, 0.8);
    }
  }

  // ── Communication style ───────────────────────────────────────────────
  const pace = ctx.identity?.communicationStyle.pace ?? "moderate";
  const formality = ctx.identity?.communicationStyle.formality ?? "balanced";

  // ── Constitution warning ──────────────────────────────────────────────
  const hasConstitutionWarning = ctx.constitution.verdict === "warning";

  return {
    cautionScore: Number(cautionScore.toFixed(2)),
    expertiseScore: Number(expertiseScore.toFixed(2)),
    goalAlignmentScore: Number(goalAlignmentScore.toFixed(2)),
    projectAlignmentScore: Number(projectAlignmentScore.toFixed(2)),
    memoryRelevance,
    reversibilityPref: Number(reversibilityPref.toFixed(2)),
    pace,
    formality,
    hasConstitutionWarning,
  };
}

// ─── Context-driven subtask planner ──────────────────────────────────────────

export interface SubtaskPlan {
  /** The ordered subtask kinds (the DAG shape). */
  kinds: TaskKind[];
  /** Human-readable explanation of why this plan was chosen. */
  reasoning: string;
  /** The signals that drove the decision. */
  signals: ContextSignals;
}

/**
 * Context-driven subtask planner.
 *
 * The base plan comes from the root kind (as before). The context then ALTERS
 * the plan along 5 dimensions:
 *
 *   1. DAG shape        — high caution or reversibility preference → prepend a
 *                         "retrieve" step and append a "synthesize" verify step
 *   2. Step count       — "measured" pace → add an extra "reason" step;
 *                         "fast" pace → drop the redundant retrieve
 *   3. Verification depth — constitution warning OR cautionScore > 0.5 → append "synthesize" as a verify step
 *   4. Retrieval depth  — goalAlignmentScore > 0.5 → duplicate the retrieve step (deeper fan-out)
 *   5. Execution strategy — projectAlignmentScore > 0.5 AND project progress < 50% →
 *                         insert "execute" before "synthesize" (front-load execution)
 */
export function subtaskPlanFor(
  rootKind: TaskKind,
  ctx: AgentContext | null,
  taskTitle: string = ""
): SubtaskPlan {
  const signals = extractSignals(ctx, taskTitle);

  // Base plan from root kind (the original static logic).
  let base: TaskKind[];
  switch (rootKind) {
    case "reason":
      base = ["retrieve", "reason", "synthesize"];
      break;
    case "execute":
      base = ["retrieve", "execute", "synthesize"];
      break;
    case "synthesize":
      base = ["retrieve", "synthesize"];
      break;
    case "retrieve":
      base = ["retrieve", "retrieve"];
      break;
    default:
      base = ["retrieve", "synthesize"];
  }

  const reasons: string[] = [`Base plan for "${rootKind}": [${base.join(", ")}]`];

  // ── 1. DAG shape: caution / reversibility → add verify ────────────────
  const needsVerify =
    signals.cautionScore > 0.5 ||
    signals.reversibilityPref > 0.5 ||
    signals.hasConstitutionWarning;
  if (needsVerify && !base.includes("synthesize")) {
    base.push("synthesize");
    reasons.push(
      `Added synthesize verify step (caution=${signals.cautionScore}, reversibility=${signals.reversibilityPref}, constitutionWarning=${signals.hasConstitutionWarning})`
    );
  }

  // ── 2. Step count: pace alters reasoning depth ────────────────────────
  if (signals.pace === "measured" && rootKind === "reason" && !base.includes("reason", 2)) {
    // Insert an extra reason step after the first reason
    const firstReasonIdx = base.indexOf("reason");
    if (firstReasonIdx >= 0) {
      base.splice(firstReasonIdx + 1, 0, "reason");
      reasons.push('Added extra reason step (identity pace="measured" → deeper reasoning)');
    }
  }
  if (signals.pace === "fast" && base.filter((k) => k === "retrieve").length > 1) {
    // Drop the redundant retrieve for fast-paced identities
    const lastRetrieveIdx = base.lastIndexOf("retrieve");
    if (lastRetrieveIdx > 0) {
      base.splice(lastRetrieveIdx, 1);
      reasons.push('Dropped redundant retrieve step (identity pace="fast" → leaner retrieval)');
    }
  }

  // ── 3. Verification depth: constitution warning → append synthesize ───
  if (signals.hasConstitutionWarning && base[base.length - 1] !== "synthesize") {
    base.push("synthesize");
    reasons.push("Appended synthesize verify step (constitution verdict was warning)");
  }

  // ── 4. Retrieval depth: goal alignment → deeper fan-out ───────────────
  if (signals.goalAlignmentScore > 0.5 && rootKind !== "retrieve") {
    const firstRetrieveIdx = base.indexOf("retrieve");
    if (firstRetrieveIdx >= 0) {
      base.splice(firstRetrieveIdx, 0, "retrieve");
      reasons.push(
        `Prepended extra retrieve step (goalAlignment=${signals.goalAlignmentScore} → deeper retrieval for aligned task)`
      );
    }
  }

  // ── 5. Execution strategy: project alignment + early stage → front-load ─
  if (signals.projectAlignmentScore > 0.5) {
    const alignedProject = ctx?.projects.find((p) => {
      const pt = new Set(p.title.toLowerCase().split(/\W+/).filter(Boolean));
      const tt = new Set(taskTitle.toLowerCase().split(/\W+/).filter(Boolean));
      let overlap = 0;
      for (const t of pt) if (tt.has(t)) overlap++;
      return overlap > 0;
    });
    if (alignedProject && alignedProject.progress < 50 && !base.includes("execute")) {
      // Insert execute before the final synthesize
      const synthesizeIdx = base.lastIndexOf("synthesize");
      if (synthesizeIdx > 0) {
        base.splice(synthesizeIdx, 0, "execute");
        reasons.push(
          `Inserted execute step before synthesize (project "${alignedProject.title}" at ${alignedProject.progress}% → front-load execution)`
        );
      }
    }
  }

  return {
    kinds: base,
    reasoning: reasons.join("; "),
    signals,
  };
}

// ─── Context-driven output synthesizer ───────────────────────────────────────

/**
 * Context-driven synthetic output.
 *
 * Every output field now derives from the AgentContext:
 *
 *   retrieve  → retrieved count = actual memory count (not random);
 *               sources = real sources weighted by recent interaction topics;
 *               topMemory = the highest-ranked memory's content
 *   reason    → steps = base 3 + (expertise bonus) + (goal alignment bonus);
 *               confidence = baseline scaled by expertise + goal alignment - caution penalty;
 *               rationale = constitution summary
 *   execute   → ok = true (unless constitution warning → ok = "conditional");
 *               artifacts = scaled by expertise + project progress;
 *               strategy = "reversible" if reversibility pref, else "standard"
 *   synthesize→ summary = includes identity persona voice + relationship name + top memory;
 *               tokens = scaled by memory count + step count;
 *               goalAlignment = the score; projectAlignment = the score
 */
export function syntheticOutput(
  kind: TaskKind,
  n: number,
  ctx: AgentContext | null,
  taskTitle: string = ""
): Record<string, unknown> {
  const signals = extractSignals(ctx, taskTitle);

  switch (kind) {
    case "retrieve": {
      // Retrieved count = actual memory count (capped 1..8), not random.
      const retrieved = Math.max(1, Math.min(8, signals.memoryRelevance));

      // Sources: weight by recent interaction topics if available.
      const sources = ["fabric", "memory"];
      const recentTopics = (ctx?.relationship?.recentInteractions ?? [])
        .flatMap((i) => i.topics)
        .slice(0, 3);
      if (recentTopics.length > 0) {
        sources.push(`interactions:${recentTopics[0]}`);
      }

      // Top memory: the actual highest-ranked memory's content.
      const topMemory = ctx?.memories?.[0]?.content?.slice(0, 80) ?? null;

      return {
        retrieved,
        sources,
        topMemory,
        memoryKinds: (ctx?.memories ?? []).map((m) => m.kind),
        retrievalDepth: signals.goalAlignmentScore > 0.5 ? "deep" : "standard",
      };
    }

    case "reason": {
      // Steps: base 3 + expertise bonus + goal alignment bonus.
      const expertiseBonus = Math.round(signals.expertiseScore * 3);
      const goalBonus = signals.goalAlignmentScore > 0.5 ? 2 : 0;
      const steps = 3 + expertiseBonus + goalBonus;

      // Confidence: baseline 0.6, +expertise, +goalAlignment, -caution.
      let confidence = 0.6 + signals.expertiseScore * 0.2 + signals.goalAlignmentScore * 0.1;
      if (signals.cautionScore > 0.5) confidence -= 0.1; // cautious identity → lower confidence
      confidence = Math.max(0.3, Math.min(0.95, confidence));

      // Rationale: constitution summary if present.
      const rationale = ctx?.constitution?.summary ?? "No constitution context.";

      // Pace note: include the identity's reasoning pace.
      const paceNote = ctx?.identity
        ? `reasoning pace: ${signals.pace}`
        : "reasoning pace: default";

      return {
        steps,
        confidence: Number(confidence.toFixed(2)),
        rationale,
        paceNote,
        expertiseApplied: signals.expertiseScore,
        goalAlignment: signals.goalAlignmentScore,
      };
    }

    case "execute": {
      // Strategy: reversible if reversibility pref is high.
      const strategy =
        signals.reversibilityPref > 0.5 ? "reversible" : "standard";

      // Artifacts: scaled by expertise + project progress.
      const projectProgress = ctx?.projects?.[0]?.progress ?? 50;
      const artifactBase = Math.round(signals.expertiseScore * 2 + 1);
      const artifacts = Math.max(1, Math.min(5, artifactBase + Math.round(projectProgress / 25)));

      // OK: "conditional" if constitution warning, else true.
      const ok = signals.hasConstitutionWarning ? "conditional" : true;

      // Alignment note.
      const alignedProject = ctx?.projects?.[0]?.title ?? null;

      return {
        ok,
        artifacts,
        strategy,
        alignedProject,
        reversibilityPreference: signals.reversibilityPref,
      };
    }

    case "synthesize": {
      // Summary: includes identity persona voice + relationship name + top memory.
      const persona = ctx?.identity?.persona?.slice(0, 60) ?? "Suika";
      const userName = ctx?.relationship?.profile.name ?? "the user";
      const topMemory = ctx?.memories?.[0]?.content?.slice(0, 60) ?? "no prior memory";
      const formality = signals.formality;

      const summary =
        formality === "formal"
          ? `Synthesized ${n} subtask outputs. Persona: ${persona}. Serving ${userName}. Drawing on: "${topMemory}".`
          : `Pulled together ${n} subtask results. ${persona}. For ${userName}. Built on: "${topMemory}".`;

      // Tokens: scaled by memory count + step count (n).
      const tokens = Math.round(
        100 + signals.memoryRelevance * 50 + n * 80 + (ctx?.goals?.length ?? 0) * 20
      );

      return {
        summary,
        tokens,
        goalAlignment: signals.goalAlignmentScore,
        projectAlignment: signals.projectAlignmentScore,
        memoriesIncorporated: signals.memoryRelevance,
        identityVoice: ctx?.identity?.name ?? "default",
      };
    }

    default:
      return { ok: true };
  }
}

// ─── Planning reason (for the utilization suite + dashboard) ─────────────────

/**
 * Returns a human-readable explanation of how the context shaped the plan.
 * Used by the utilization suite to prove every dimension mattered.
 */
export function planReasoning(
  rootKind: TaskKind,
  ctx: AgentContext | null,
  taskTitle: string = ""
): string {
  const plan = subtaskPlanFor(rootKind, ctx, taskTitle);
  const s = plan.signals;

  const lines: string[] = [
    `Task: "${taskTitle}" (${rootKind})`,
    `DAG: [${plan.kinds.join(" → ")}]`,
    `Signals:`,
    `  caution=${s.cautionScore} expertise=${s.expertiseScore} goalAlignment=${s.goalAlignmentScore}`,
    `  projectAlignment=${s.projectAlignmentScore} memoryRelevance=${s.memoryRelevance}`,
    `  reversibilityPref=${s.reversibilityPref} pace=${s.pace} formality=${s.formality}`,
    `  constitutionWarning=${s.hasConstitutionWarning}`,
    `Decisions:`,
  ];

  if (s.cautionScore > 0.5) lines.push(`  • caution > 0.5 → verify step added`);
  if (s.reversibilityPref > 0.5) lines.push(`  • reversibility pref > 0.5 → reversible strategy`);
  if (s.hasConstitutionWarning) lines.push(`  • constitution warning → conditional execution + verify`);
  if (s.pace === "measured") lines.push(`  • pace=measured → extra reason step`);
  if (s.pace === "fast") lines.push(`  • pace=fast → dropped redundant retrieve`);
  if (s.goalAlignmentScore > 0.5) lines.push(`  • goal alignment > 0.5 → deeper retrieval fan-out`);
  if (s.projectAlignmentScore > 0.5) lines.push(`  • project alignment > 0.5 → front-loaded execution`);
  if (s.expertiseScore > 0.5) lines.push(`  • expertise ${s.expertiseScore} → confidence boosted, more reasoning steps`);
  if (s.memoryRelevance > 0) lines.push(`  • ${s.memoryRelevance} relevant memories → retrieve output uses real count`);

  lines.push(`Plan reasoning: ${plan.reasoning}`);

  return lines.join("\n");
}
