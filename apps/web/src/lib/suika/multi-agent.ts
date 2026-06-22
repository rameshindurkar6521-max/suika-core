/**
 * SUIKA X — Multi-Agent Runtime (Phase 9).
 *
 * Transforms SUIKA from single-agent to autonomous multi-agent:
 *
 *   WS1: Agent Registry     — persistent profiles, expertise, cost tracking
 *   WS2: Multi-Agent Planner — execution DAG + agent assignment graph
 *   WS3: Scheduler           — one-time, recurring, delayed, dependency jobs
 *   WS4: Tool Runtime        — 5 tools with tracing
 *   WS5: Agent Collaboration — handoffs, reviews, verification, arbitration
 *   WS6: Long Horizon        — checkpointed state, resume after restart
 */
import { db } from "@/lib/db";
import { emit } from "@/lib/suika/kernel";
import { readJSON, writeJSON } from "@/lib/suika/json";
import type { AgentContext, TaskKind } from "@/lib/suika/types";

// ─── WS1: Agent Registry ─────────────────────────────────────────────────────

export interface AgentWithProfile {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  status: string;
  reputation: number;
  wallet: number;
  expertise: Array<{ domain: string; level: number }>;
  costProfile: { costPerTask: number; costPerToken: number; monthlyBudget: number };
  providerPrefs: string[];
  totalTasksAssigned: number;
  totalTokensOut: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  successRate: number;
}

export async function getAgentWithProfile(agentId: string): Promise<AgentWithProfile | null> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    include: { profile: true },
  });
  if (!agent) return null;

  const profile = agent.profile;
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    capabilities: readJSON<string[]>(agent.capabilities, []),
    status: agent.status,
    reputation: agent.reputation,
    wallet: agent.wallet,
    expertise: profile ? readJSON(profile.expertise, []) : [],
    costProfile: profile ? readJSON(profile.costProfile, { costPerTask: 0.5, costPerToken: 0.001, monthlyBudget: 100 }) : { costPerTask: 0.5, costPerToken: 0.001, monthlyBudget: 100 },
    providerPrefs: profile ? readJSON<string[]>(profile.providerPrefs, []) : [],
    totalTasksAssigned: profile?.totalTasksAssigned ?? 0,
    totalTokensOut: profile?.totalTokensOut ?? 0,
    totalCostUsd: profile?.totalCostUsd ?? 0,
    avgLatencyMs: profile?.avgLatencyMs ?? 0,
    successRate: profile?.successRate ?? 1.0,
  };
}

export async function listAgentsWithProfiles(): Promise<AgentWithProfile[]> {
  const agents = await db.agent.findMany({
    include: { profile: true },
    orderBy: { reputation: "desc" },
  });
  const result: AgentWithProfile[] = [];
  for (const a of agents) {
    const p = a.profile;
    result.push({
      id: a.id, name: a.name, role: a.role,
      capabilities: readJSON<string[]>(a.capabilities, []),
      status: a.status, reputation: a.reputation, wallet: a.wallet,
      expertise: p ? readJSON(p.expertise, []) : [],
      costProfile: p ? readJSON(p.costProfile, { costPerTask: 0.5, costPerToken: 0.001, monthlyBudget: 100 }) : { costPerTask: 0.5, costPerToken: 0.001, monthlyBudget: 100 },
      providerPrefs: p ? readJSON<string[]>(p.providerPrefs, []) : [],
      totalTasksAssigned: p?.totalTasksAssigned ?? 0,
      totalTokensOut: p?.totalTokensOut ?? 0,
      totalCostUsd: p?.totalCostUsd ?? 0,
      avgLatencyMs: p?.avgLatencyMs ?? 0,
      successRate: p?.successRate ?? 1.0,
    });
  }
  return result;
}

/**
 * Ensure all agents have a profile. Creates default profiles for agents that
 * don't have one. Called on system boot.
 */
export async function ensureAgentProfiles(): Promise<void> {
  const agents = await db.agent.findMany({ include: { profile: true } });
  for (const a of agents) {
    if (!a.profile) {
      // Create a default profile based on the agent's role
      const expertise = getExpertiseForRole(a.role);
      await db.agentProfile.create({
        data: {
          agentId: a.id,
          expertise: writeJSON(expertise),
          costProfile: writeJSON({ costPerTask: 0.5, costPerToken: 0.001, monthlyBudget: 100 }),
          providerPrefs: writeJSON(["zai"]),
        },
      });
    }
  }
}

function getExpertiseForRole(role: string): Array<{ domain: string; level: number }> {
  if (role.includes("memory") || role.includes("curator")) return [{ domain: "memory", level: 85 }, { domain: "retrieval", level: 80 }];
  if (role.includes("graph") || role.includes("navigator")) return [{ domain: "knowledge-graph", level: 82 }, { domain: "traversal", level: 78 }];
  if (role.includes("reasoning") || role.includes("planner") || role.includes("oracle")) return [{ domain: "reasoning", level: 90 }, { domain: "planning", level: 85 }];
  if (role.includes("code") || role.includes("forge")) return [{ domain: "code-generation", level: 84 }, { domain: "testing", level: 80 }];
  if (role.includes("safety") || role.includes("audit") || role.includes("sentinel")) return [{ domain: "verification", level: 88 }, { domain: "security", level: 85 }];
  if (role.includes("research") || role.includes("crawl") || role.includes("scout")) return [{ domain: "research", level: 71 }, { domain: "web-search", level: 75 }];
  return [{ domain: "general", level: 60 }];
}

/**
 * Select the best agent for a task based on capabilities + expertise + reputation.
 */
export async function selectBestAgent(
  taskKind: TaskKind,
  taskTitle: string,
  requiredCapability?: string
): Promise<string | null> {
  const agents = await db.agent.findMany({
    where: { status: "idle" },
    include: { profile: true },
  });
  if (agents.length === 0) return null;

  // Score each agent
  let bestAgent: string | null = null;
  let bestScore = -1;
  for (const a of agents) {
    const caps = readJSON<string[]>(a.capabilities, []);
    const expertise = a.profile ? readJSON<Array<{ domain: string; level: number }>>(a.profile.expertise, []) : [];

    let score = a.reputation * 0.4; // base: reputation

    // Capability match
    if (requiredCapability && caps.includes(requiredCapability)) score += 0.3;

    // Kind-based capability match
    const kindCapMap: Record<string, string[]> = {
      retrieve: ["retrieve", "search", "fetch"],
      reason: ["reason", "plan", "analyze"],
      execute: ["execute", "generate", "build"],
      synthesize: ["synthesize", "summarize", "consolidate"],
    };
    const matchingCaps = kindCapMap[taskKind] || [];
    for (const cap of matchingCaps) {
      if (caps.includes(cap)) score += 0.1;
    }

    // Expertise match (title tokens vs expertise domains)
    const titleTokens = new Set(taskTitle.toLowerCase().split(/\W+/).filter(Boolean));
    for (const exp of expertise) {
      const domainTokens = new Set(exp.domain.toLowerCase().split(/[-_]/));
      for (const t of domainTokens) {
        if (titleTokens.has(t)) score += 0.05 * (exp.level / 100);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestAgent = a.id;
    }
  }

  return bestAgent;
}

// ─── WS2: Multi-Agent Planner ────────────────────────────────────────────────

export interface MultiAgentPlanStep {
  stepIndex: number;
  kind: TaskKind;
  assignedAgentId: string | null;
  assignedRole: string;
  canParallelize: boolean;
  dependsOn: number[]; // step indices this depends on
  shouldDelegate: boolean;
  delegationReason?: string;
}

export interface MultiAgentPlan {
  steps: MultiAgentPlanStep[];
  dag: TaskKind[];
  assignments: Array<{ stepIndex: number; agentId: string | null; role: string }>;
  parallelism: number; // max parallel steps
  reasoning: string;
}

/**
 * Plan a multi-agent execution: decide which agent performs which step,
 * whether steps can run in parallel, and whether delegation is needed.
 */
export async function planMultiAgentExecution(
  dag: TaskKind[],
  ctx: AgentContext,
  taskTitle: string
): Promise<MultiAgentPlan> {
  const steps: MultiAgentPlanStep[] = [];
  const agents = await db.agent.findMany({
    where: { status: "idle" },
    include: { profile: true },
  });

  for (let i = 0; i < dag.length; i++) {
    const kind = dag[i];

    // Select best agent for this step
    const requiredCap = kind === "retrieve" ? "retrieve" : kind === "reason" ? "reason" : kind === "execute" ? "execute" : "synthesize";
    const agentId = await selectBestAgent(kind, taskTitle, requiredCap);

    // Determine if this step can parallelize with the previous
    const canParallelize = i > 0 && kind === "retrieve" && dag[i - 1] === "retrieve";

    // Determine if this should be delegated (if no agent has the right capability)
    const shouldDelegate = !agentId && agents.length > 0;
    const delegationReason = shouldDelegate ? `No idle agent with capability '${requiredCap}'; delegating to first available` : undefined;

    // Dependencies: each step depends on the previous (unless parallelizable)
    const dependsOn = canParallelize ? [i - 2] : i > 0 ? [i - 1] : [];

    // Role assignment
    const role = kind === "retrieve" ? "Researcher" : kind === "reason" ? "Analyst" : kind === "execute" ? "Builder" : "Synthesizer";

    steps.push({
      stepIndex: i,
      kind,
      assignedAgentId: agentId,
      assignedRole: role,
      canParallelize,
      dependsOn,
      shouldDelegate,
      delegationReason,
    });
  }

  // Calculate parallelism (max number of steps that can run simultaneously)
  const parallelism = Math.max(1, ...steps.map((s) => (s.canParallelize ? 2 : 1)));

  const assignments = steps.map((s) => ({
    stepIndex: s.stepIndex,
    agentId: s.assignedAgentId,
    role: s.assignedRole,
  }));

  const reasoning = `Planned ${steps.length} steps with ${parallelism}x parallelism. ` +
    `${steps.filter((s) => s.assignedAgentId).length} steps auto-assigned, ` +
    `${steps.filter((s) => s.shouldDelegate).length} steps delegated. ` +
    `Agents available: ${agents.length}.`;

  return { steps, dag, assignments, parallelism, reasoning };
}

// ─── WS3: Scheduler ──────────────────────────────────────────────────────────

export interface ScheduleInput {
  name: string;
  type: "one_time" | "recurring" | "delayed" | "dependency";
  taskTitle: string;
  taskKind?: string;
  agentId?: string;
  workspaceId?: string;
  scheduledAt?: string; // ISO for one_time / delayed
  cronExpr?: string; // for recurring
  dependsOnJobId?: string; // for dependency
  maxAttempts?: number;
}

export async function createSchedule(input: ScheduleInput) {
  let nextRunAt: Date | null = null;
  if (input.type === "one_time" || input.type === "delayed") {
    nextRunAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  } else if (input.type === "recurring" && input.cronExpr) {
    // Simple next-run: 1 hour from now (cron parsing is complex; this is a simplification)
    nextRunAt = new Date(Date.now() + 3600000);
  } else if (input.type === "dependency") {
    // Runs when the dependency completes
    nextRunAt = null;
  }

  const job = await db.scheduledJob.create({
    data: {
      name: input.name,
      type: input.type,
      taskTitle: input.taskTitle,
      taskKind: input.taskKind || "reason",
      agentId: input.agentId,
      workspaceId: input.workspaceId || "default",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      cronExpr: input.cronExpr,
      dependsOnJobId: input.dependsOnJobId,
      nextRunAt,
      maxAttempts: input.maxAttempts || 3,
    },
  });

  await emit("info", "runtime", `Scheduled job created: ${input.name} (${input.type})`, {
    scheduledJobId: job.id,
    type: input.type,
    nextRunAt: nextRunAt?.toISOString(),
  });

  return job;
}

export async function listSchedules(status?: string) {
  return db.scheduledJob.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function cancelSchedule(id: string) {
  return db.scheduledJob.update({
    where: { id },
    data: { status: "cancelled" },
  });
}

/**
 * Check for due scheduled jobs and dispatch them as ExecutionJobs.
 * Called periodically. Now actually creates ExecutionJob rows + Task rows
 * and enqueues them for the worker to pick up (WS8).
 */
export async function processDueSchedules(): Promise<number> {
  const now = new Date();
  const due = await db.scheduledJob.findMany({
    where: {
      status: "scheduled",
      nextRunAt: { lte: now },
    },
    take: 10,
  });

  let dispatched = 0;
  for (const sched of due) {
    // Mark as running
    await db.scheduledJob.update({
      where: { id: sched.id },
      data: { status: "running", lastRunAt: now, attempts: { increment: 1 } },
    });

    try {
      // WS8: Actually create a Task + ExecutionJob and enqueue it
      const task = await db.task.create({
        data: {
          title: `[Scheduled] ${sched.taskTitle}`,
          kind: sched.taskKind,
          workspaceId: sched.workspaceId,
          agentId: sched.agentId,
          status: "queued",
          depth: 0,
          input: writeJSON({ scheduledJobId: sched.id }),
        },
      });

      // Import enqueue dynamically to avoid circular dependency
      const { enqueue } = await import("@/lib/suika/job-queue");
      const { buildAgentContext } = await import("@/lib/suika/agent-context");
      const { evaluateCompliance } = await import("@/lib/suika/constitution");
      const { subtaskPlanFor } = await import("@/lib/suika/planner");

      const compliance = await evaluateCompliance({
        type: "agent.task",
        description: sched.taskTitle,
        source: "scheduler",
      });
      const ctx = await buildAgentContext({ constitution: compliance, taskTitle: sched.taskTitle });
      const plan = subtaskPlanFor(sched.taskKind as TaskKind, ctx, sched.taskTitle);

      const job = await enqueue({
        taskId: task.id,
        title: sched.taskTitle,
        workspaceId: sched.workspaceId,
        agentContext: ctx,
        plan,
      });

      await db.scheduledJob.update({
        where: { id: sched.id },
        data: {
          executionJobId: job.id,
          status: sched.type === "recurring" ? "scheduled" : "completed",
          nextRunAt: sched.type === "recurring" ? new Date(Date.now() + 3600000) : null,
        },
      });

      dispatched++;
      await emit("info", "runtime", `Scheduled job dispatched: ${sched.name} → ExecutionJob ${job.id}`, {
        scheduledJobId: sched.id,
        executionJobId: job.id,
        taskId: task.id,
        type: sched.type,
      });
    } catch (e) {
      await db.scheduledJob.update({
        where: { id: sched.id },
        data: { status: "failed", error: (e as Error).message },
      });
      await emit("warn", "runtime", `Scheduled job failed: ${sched.name}: ${(e as Error).message}`, {
        scheduledJobId: sched.id,
      });
    }
  }

  // Check dependency jobs: if their dependency completed, dispatch them
  const depJobs = await db.scheduledJob.findMany({
    where: { status: "scheduled", type: "dependency", dependsOnJobId: { not: null } },
    take: 10,
  });
  for (const dep of depJobs) {
    if (!dep.dependsOnJobId) continue;
    const dependency = await db.scheduledJob.findUnique({ where: { id: dep.dependsOnJobId } });
    if (dependency?.status === "completed") {
      // Dispatch the dependency job the same way
      try {
        const task = await db.task.create({
          data: {
            title: `[Scheduled-Dep] ${dep.taskTitle}`,
            kind: dep.taskKind,
            workspaceId: dep.workspaceId,
            agentId: dep.agentId,
            status: "queued",
            depth: 0,
            input: writeJSON({ scheduledJobId: dep.id, dependsOn: dep.dependsOnJobId }),
          },
        });

        const { enqueue } = await import("@/lib/suika/job-queue");
        const { buildAgentContext } = await import("@/lib/suika/agent-context");
        const { evaluateCompliance } = await import("@/lib/suika/constitution");
        const { subtaskPlanFor } = await import("@/lib/suika/planner");

        const compliance = await evaluateCompliance({
          type: "agent.task",
          description: dep.taskTitle,
          source: "scheduler.dependency",
        });
        const ctx = await buildAgentContext({ constitution: compliance, taskTitle: dep.taskTitle });
        const plan = subtaskPlanFor(dep.taskKind as TaskKind, ctx, dep.taskTitle);

        const job = await enqueue({
          taskId: task.id,
          title: dep.taskTitle,
          workspaceId: dep.workspaceId,
          agentContext: ctx,
          plan,
        });

        await db.scheduledJob.update({
          where: { id: dep.id },
          data: { status: "completed", lastRunAt: now, executionJobId: job.id },
        });
        dispatched++;
        await emit("info", "runtime", `Dependency job dispatched: ${dep.name} → ExecutionJob ${job.id}`, {
          scheduledJobId: dep.id,
          executionJobId: job.id,
        });
      } catch (e) {
        await db.scheduledJob.update({
          where: { id: dep.id },
          data: { status: "failed", error: (e as Error).message },
        });
      }
    }
  }

  return dispatched;
}

// ─── WS4: Tool Runtime ───────────────────────────────────────────────────────

export interface ToolResult {
  toolName: string;
  output: Record<string, unknown>;
  latencyMs: number;
  success: boolean;
  error?: string;
}

async function traceToolCall(
  toolName: string,
  input: Record<string, unknown>,
  result: ToolResult,
  agentId?: string,
  taskId?: string,
  jobId?: string
): Promise<void> {
  try {
    await db.toolCall.create({
      data: {
        toolName,
        agentId,
        taskId,
        jobId,
        input: writeJSON(input),
        output: writeJSON(result.output),
        latencyMs: result.latencyMs,
        success: result.success,
        error: result.error,
      },
    });
  } catch {}
}

export async function callTool(
  toolName: "web_search" | "memory_retrieval" | "db_query" | "planner_inspect" | "provider_health",
  input: Record<string, unknown>,
  ctx?: { agentId?: string; taskId?: string; jobId?: string }
): Promise<ToolResult> {
  const start = Date.now();
  try {
    let output: Record<string, unknown> = {};
    switch (toolName) {
      case "web_search": {
        // Simulated web search (no real search API available)
        const query = String(input.query || "");
        output = { query, results: [], note: "Web search not available in this environment" };
        break;
      }
      case "memory_retrieval": {
        const query = String(input.query || "");
        const ws = String(input.workspaceId || "default");
        const memories = await db.memory.findMany({
          where: { workspaceId: ws },
          orderBy: { importance: "desc" },
          take: 5,
        });
        output = {
          query,
          memories: memories.map((m) => ({ id: m.id, kind: m.kind, content: m.content.slice(0, 100), importance: m.importance })),
        };
        break;
      }
      case "db_query": {
        const model = String(input.model || "");
        const limit = Number(input.limit || 10);
        // Safe: only allow count queries
        if (model && ["entity", "memory", "agent", "task", "event", "executionJob"].includes(model)) {
          const count = await (db as any)[model].count();
          output = { model, count };
        } else {
          output = { error: "Invalid model or model not allowed" };
        }
        break;
      }
      case "planner_inspect": {
        // Return the current planner state (simplified)
        output = { note: "Use GET /api/suika/operations/planner-inspect for full inspection" };
        break;
      }
      case "provider_health": {
        const configs = await db.providerConfig.findMany({
          select: { providerId: true, displayName: true, circuitState: true, currentConcurrent: true, consecutiveFailures: true },
        });
        output = { providers: configs };
        break;
      }
      default:
        output = { error: `Unknown tool: ${toolName}` };
    }

    const result: ToolResult = {
      toolName,
      output,
      latencyMs: Date.now() - start,
      success: !output.error,
      error: output.error as string | undefined,
    };

    await traceToolCall(toolName, input, result, ctx?.agentId, ctx?.taskId, ctx?.jobId);
    return result;
  } catch (e) {
    const result: ToolResult = {
      toolName,
      output: {},
      latencyMs: Date.now() - start,
      success: false,
      error: (e as Error).message,
    };
    await traceToolCall(toolName, input, result, ctx?.agentId, ctx?.taskId, ctx?.jobId);
    return result;
  }
}

export async function listToolCalls(limit = 50) {
  return db.toolCall.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
}

// ─── WS5: Agent Collaboration ────────────────────────────────────────────────

export async function createHandoff(
  taskId: string,
  fromAgentId: string,
  toAgentId: string,
  handoffType: "delegate" | "review" | "verify" | "arbitrate" | "synthesize",
  notes?: string
) {
  const handoff = await db.agentHandoff.create({
    data: { taskId, fromAgentId, toAgentId, handoffType, notes: notes || "" },
  });
  await emit("info", "agents", `Handoff: ${handoffType} from ${fromAgentId.slice(-8)} to ${toAgentId.slice(-8)}`, {
    handoffId: handoff.id, taskId, handoffType,
  });
  return handoff;
}

export async function completeHandoff(handoffId: string, status: "accepted" | "completed" | "rejected") {
  return db.agentHandoff.update({
    where: { id: handoffId },
    data: { status, completedAt: new Date() },
  });
}

export async function listHandoffs(taskId?: string) {
  return db.agentHandoff.findMany({
    where: taskId ? { taskId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Assign a task to an agent and create a TaskAssignment record.
 */
export async function assignTask(
  taskId: string,
  agentId: string,
  role: string
) {
  const assignment = await db.taskAssignment.create({
    data: { taskId, agentId, assignedRole: role },
  });

  // Update the task's agentId
  await db.task.update({
    where: { id: taskId },
    data: { agentId },
  });

  // Update agent profile
  await db.agentProfile.updateMany({
    where: { agentId },
    data: { totalTasksAssigned: { increment: 1 } },
  });

  await emit("info", "agents", `Task assigned to agent`, {
    taskId, agentId, role, assignmentId: assignment.id,
  });

  return assignment;
}

/**
 * Review a task: set review status + create a review handoff.
 */
export async function reviewTask(
  taskId: string,
  reviewerAgentId: string,
  status: "approved" | "rejected",
  notes?: string
) {
  const assignment = await db.taskAssignment.findUnique({ where: { taskId } });
  if (assignment) {
    await db.taskAssignment.update({
      where: { taskId },
      data: { reviewStatus: status, reviewedBy: reviewerAgentId, reviewNotes: notes || "" },
    });
  }

  await createHandoff(taskId, reviewerAgentId, assignment?.agentId || "", "review", notes);

  await emit("info", "agents", `Task ${status} by reviewer`, {
    taskId, reviewerAgentId, status,
  });

  return { status, notes };
}

// ─── WS1: Review Runtime ─────────────────────────────────────────────────────

/**
 * Create a ReviewRecord. Called by the executor after a reviewer agent
 * inspects another agent's output. The verdict determines whether the
 * execution continues (APPROVE), creates a revision (REVISION_REQUIRED),
 * or fails the task (REJECT).
 */
export async function createReviewRecord(input: {
  taskId: string;
  stepId?: string;
  stepIndex: number;
  reviewerAgentId: string;
  targetAgentId: string;
  verdict: "APPROVE" | "REJECT" | "REVISION_REQUIRED";
  rationale: string;
  revisionAttempt?: number;
  revisionOfReviewId?: string;
}): Promise<string> {
  const record = await db.reviewRecord.create({
    data: {
      taskId: input.taskId,
      stepId: input.stepId || null,
      stepIndex: input.stepIndex,
      reviewerAgentId: input.reviewerAgentId,
      targetAgentId: input.targetAgentId,
      verdict: input.verdict,
      rationale: input.rationale,
      revisionAttempt: input.revisionAttempt || 0,
      revisionOfReviewId: input.revisionOfReviewId || null,
    },
  });

  await emit("info", "agents", `Review ${input.verdict} by ${input.reviewerAgentId.slice(-8)} on step ${input.stepIndex + 1}`, {
    taskId: input.taskId,
    reviewId: record.id,
    verdict: input.verdict,
    stepIndex: input.stepIndex,
    revisionAttempt: input.revisionAttempt || 0,
  });

  return record.id;
}

/**
 * Select a reviewer agent — different from the target agent, with
 * verification/audit expertise preferred.
 */
export async function selectReviewerAgent(
  targetAgentId: string,
  taskTitle: string
): Promise<string | null> {
  const agents = await db.agent.findMany({
    where: { status: "idle", id: { not: targetAgentId } },
    include: { profile: true },
  });
  if (agents.length === 0) return null;

  // Prefer agents with verification/security/audit expertise
  let best: string | null = null;
  let bestScore = -1;
  for (const a of agents) {
    const caps = readJSON<string[]>(a.capabilities, []);
    const expertise = a.profile ? readJSON<Array<{ domain: string; level: number }>>(a.profile.expertise, []) : [];
    let score = a.reputation * 0.4;
    if (caps.includes("verify") || caps.includes("audit") || caps.includes("enforce")) score += 0.4;
    for (const e of expertise) {
      if (["verification", "security", "audit", "safety"].includes(e.domain)) score += 0.1 * (e.level / 100);
    }
    if (score > bestScore) { bestScore = score; best = a.id; }
  }
  return best;
}

/**
 * List review records for a task or all.
 */
export async function listReviewRecords(taskId?: string, limit = 50) {
  return db.reviewRecord.findMany({
    where: taskId ? { taskId } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
}

// ─── WS6: Long Horizon Tasks ─────────────────────────────────────────────────

/**
 * Checkpoint a task's execution state. This is stored in the task's output
 * field as a JSON blob, allowing the worker to resume from the last
 * checkpoint after a restart.
 */
export async function checkpointTask(taskId: string, state: Record<string, unknown>) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return;

  const currentOutput = readJSON<Record<string, unknown>>(task.output, {});
  const checkpointed = {
    ...currentOutput,
    checkpoint: {
      ...state,
      checkpointAt: new Date().toISOString(),
    },
  };

  await db.task.update({
    where: { id: taskId },
    data: { output: writeJSON(checkpointed) },
  });

  await emit("debug", "agents", `Task checkpointed: ${task.title}`, {
    taskId,
    checkpointKeys: Object.keys(state),
  });
}

/**
 * Get the last checkpoint for a task. Used by the worker on resume.
 */
export async function getCheckpoint(taskId: string): Promise<Record<string, unknown> | null> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  const output = readJSON<Record<string, unknown>>(task.output, {});
  return (output.checkpoint as Record<string, unknown>) || null;
}
