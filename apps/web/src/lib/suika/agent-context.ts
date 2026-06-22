/**
 * SUIKA X — Agent Context Injection.
 *
 * Assembles a unified `AgentContext` object from four existing subsystems,
 * to be injected into every planning agent before it creates a task DAG.
 *
 *   Layer              Subsystem          Source function
 *   ─────────────────  ─────────────────  ─────────────────────────────
 *   authority          Constitution       (verdict passed in from the gate)
 *   personality        Identity Engine    getActiveSnapshot()
 *   user-understanding Relationship Eng.  getContext()
 *   objective          Relationship Eng.  (goals + projects from context)
 *   experience         Memory System      getTopMemories()
 *
 * The constitution gate runs FIRST (in the dispatch route) and may block
 * dispatch entirely with HTTP 403. Only if the gate passes is this loader
 * called. The assembled AgentContext is injected into the task's `input`
 * field as `input.agentContext`, where planning agents can read it.
 *
 * Every layer is optional — if identity/relationship/memory haven't been
 * seeded yet, the corresponding field is null or empty. The loader never
 * throws for "missing data"; it only throws for genuine DB errors. This
 * makes the context resilient on fresh boots.
 */
import { db } from "@/lib/db";
import { readJSON } from "@/lib/suika/json";
import { getActiveSnapshot } from "@/lib/suika/identity";
import { getContext } from "@/lib/suika/relationship";
import { toMemoryDTO } from "@/app/api/suika/_lib/serializers";
import type {
  AgentContext,
  ComplianceResult,
  ComplianceVerdictKind,
  EvaluationSeverity,
  MemoryDTO,
} from "@/lib/suika/types";

/**
 * Load the top-N memories for a workspace, ranked by effective score
 * (importance × decay). This mirrors the GET /api/suika/memory logic but is
 * exposed as a reusable service function so the agent-context loader (and
 * other service-layer callers) can call it without going through HTTP.
 *
 * If `query` is provided, memories are ranked by hybrid (semantic + lexical)
 * score against the query instead of by effective score — useful when the
 * dispatch title should influence which memories surface.
 */
export async function getTopMemories(opts: {
  workspaceId?: string;
  limit?: number;
  query?: string;
}): Promise<MemoryDTO[]> {
  const limit = Math.min(opts.limit ?? 5, 20);

  // Resolve workspace: use the provided one, else the active workspace, else
  // the synthetic "default" (which returns empty — safe on fresh boots).
  let ws = opts.workspaceId;
  if (!ws) {
    const active = await db.workspace.findFirst({ where: { active: true } });
    ws = active?.id ?? "default";
  }

  const rows = await db.memory.findMany({
    where: { workspaceId: ws },
    orderBy: { createdAt: "desc" },
    take: 200, // bound the scan, then rank in JS
  });

  if (rows.length === 0) return [];

  // If no query, sort by effective score (importance * decay).
  if (!opts.query) {
    return rows
      .map(toMemoryDTO)
      .sort((a, b) => b.effectiveScore - a.effectiveScore)
      .slice(0, limit);
  }

  // If a query is provided, rank by hybrid score. We import embed + hybridScore
  // lazily to avoid a circular dependency at module load time (embed is also
  // used by the memory route, which imports from _lib/serializers, which
  // imports from scoring — keeping the agent-context module self-contained
  // here would require duplicating the embed logic, so we just import it).
  const { embed, hybridScore, tokenizeSet } = await import("@/lib/suika/embed");
  const { parseEmbedding } = await import("@/app/api/suika/_lib/serializers");
  const qVec = embed(opts.query);
  const qTokens = tokenizeSet(opts.query);

  return rows
    .map((m) => ({
      dto: toMemoryDTO(m),
      score: hybridScore(
        qVec,
        qTokens,
        parseEmbedding(m.embedding),
        m.content
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.dto);
}

/**
 * Assemble the unified AgentContext. The constitution verdict is passed in
 * (the dispatch route already ran the gate); the other three layers are
 * loaded here in parallel.
 *
 * Returns null only if the constitution verdict was "violation" — but that
 * case is handled by the caller (dispatch route returns 403 before calling
 * this). This function is called only when the gate has passed.
 */
export async function buildAgentContext(opts: {
  constitution: ComplianceResult;
  workspaceId?: string;
  /** The dispatch title — used to query-rank the top memories so the most
   *  relevant experience surfaces for this specific task. */
  taskTitle?: string;
}): Promise<AgentContext> {
  const { constitution, workspaceId, taskTitle } = opts;

  // Load all four layers in parallel. Each is individually try/caught so a
  // failure in one layer doesn't block the others — the agent still gets
  // whatever context we can assemble.
  const [identity, relationship, memories] = await Promise.all([
    getActiveSnapshot().catch(() => null),
    getContext().catch(() => null),
    getTopMemories({ workspaceId, limit: 5, query: taskTitle }).catch(
      () => [] as MemoryDTO[]
    ),
  ]);

  // Goals + projects are surfaced separately from the relationship context
  // (they're already inside it, but the planner reads them as the "objective
  // layer"). Pull them out for convenience.
  const goals = relationship?.activeGoals ?? [];
  const projects = relationship?.activeProjects ?? [];

  const summary = buildSummary({
    constitution,
    identity,
    relationship,
    goals,
    projects,
    memories,
  });

  return {
    constitution: {
      verdict: constitution.verdict,
      severity: constitution.severity,
      evaluationId: constitution.evaluationId,
      summary: constitution.summary,
    },
    identity,
    relationship,
    goals,
    projects,
    memories,
    summary,
  };
}

/**
 * Build a natural-language digest of the full context. This is what gets
 * injected into a planning prompt (or displayed in the dashboard's context
 * preview). It's deliberately concise — a planner can read the structured
 * fields for detail.
 */
function buildSummary(opts: {
  constitution: { verdict: ComplianceVerdictKind; severity: EvaluationSeverity };
  identity: AgentContext["identity"];
  relationship: AgentContext["relationship"];
  goals: AgentContext["goals"];
  projects: AgentContext["projects"];
  memories: AgentContext["memories"];
}): string {
  const parts: string[] = [];

  parts.push(
    `Constitution: ${opts.constitution.verdict} (${opts.constitution.severity}).`
  );

  if (opts.identity) {
    parts.push(
      `Identity: ${opts.identity.name} v${opts.identity.version} — ${opts.identity.persona}`
    );
  } else {
    parts.push("Identity: (no active snapshot)");
  }

  if (opts.relationship) {
    parts.push(opts.relationship.summary);
  } else {
    parts.push("Relationship: (no profile)");
  }

  if (opts.goals.length > 0) {
    parts.push(
      `Objectives: ${opts.goals.length} active goal(s), top = "${opts.goals[0].title}" (priority ${opts.goals[0].priority}).`
    );
  }

  if (opts.projects.length > 0) {
    parts.push(
      `Projects: ${opts.projects.length} active, top = "${opts.projects[0].title}" (${opts.projects[0].progress}% done).`
    );
  }

  if (opts.memories.length > 0) {
    parts.push(
      `Experience: ${opts.memories.length} relevant memor${opts.memories.length === 1 ? "y" : "ies"}, top = "${opts.memories[0].content.slice(0, 80)}${opts.memories[0].content.length > 80 ? "…" : ""}".`
    );
  }

  return parts.join(" ");
}
