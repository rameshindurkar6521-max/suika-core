/**
 * SUIKA X — Real Execution Engine.
 *
 * Replaces simulateWork() + syntheticOutput() with real LLM execution.
 * Every DAG step:
 *   1. Receives the AgentContext
 *   2. Generates a step-specific prompt (enriched with context)
 *   3. Calls the Model Router (real LLM via z-ai-web-dev-sdk)
 *   4. Records a full execution trace (prompt, model, latency, tokens, output)
 *   5. Stores provenance (which model, which persona, which step)
 *
 * After all steps complete:
 *   - The synthesized result is persisted as a new Memory (episodic)
 *   - An execution-complete event is emitted
 *   - The full trace is returned for transparency
 *
 * No Math.random. No setTimeout. No synthetic outputs. Every output is
 * model-generated.
 */
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { emit } from "@/lib/suika/kernel";
import { writeJSON } from "@/lib/suika/json";
import { routePrompt, getPersona, MODEL_PERSONAS } from "@/lib/suika/models";
import { embed } from "@/lib/suika/embed";
import { estimateImportance, decayFactor } from "@/lib/suika/scoring";
import { providerCall } from "@/lib/suika/provider-control";
import { createHandoff, checkpointTask, getCheckpoint, assignTask, getAgentWithProfile, completeHandoff, createReviewRecord, selectReviewerAgent } from "@/lib/suika/multi-agent";
import { db } from "@/lib/db";
import { readJSON } from "@/lib/suika/json";
import type {
  AgentContext,
  ModelPersona,
  TaskKind,
} from "@/lib/suika/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExecutionTrace {
  stepId: string;
  stepKind: TaskKind;
  stepIndex: number;
  prompt: string;
  model: string;
  persona: string;
  personaLabel: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  output: string;
  success: boolean;
  error?: string;
  fallbackUsed: boolean;
  routeReason: string;
  attempts: number;
  retries: number;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  handoffType?: string | null;
  reviewStatus?: string | null;
  checkpointed?: boolean;
}

export interface StepOutput {
  result: string;
  trace: ExecutionTrace;
}

export interface ExecutionResult {
  steps: StepOutput[];
  traces: ExecutionTrace[];
  synthesizedResult: string;
  totalLatencyMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  memoryId: string | null;
  success: boolean;
}

// ─── Step prompt builder ─────────────────────────────────────────────────────

/**
 * Build a step-specific prompt enriched with AgentContext.
 * Each step kind gets a different prompt structure that instructs the LLM
 * what to do, informed by identity, relationship, goals, and memories.
 */
export function buildStepPrompt(
  kind: TaskKind,
  ctx: AgentContext,
  title: string,
  priorOutputs: StepOutput[],
  stepIndex: number,
  totalSteps: number
): string {
  const lines: string[] = [];

  // Context header (shared across all steps)
  lines.push(`# Task: ${title}`);
  lines.push(`# Step ${stepIndex + 1} of ${totalSteps} (${kind})`);
  lines.push("");

  // Identity layer
  if (ctx.identity) {
    lines.push(`## Your Identity`);
    lines.push(`You are ${ctx.identity.name}: ${ctx.identity.persona}`);
    lines.push(`Communication style: ${ctx.identity.communicationStyle.tone} tone, ${ctx.identity.communicationStyle.pace} pace, ${ctx.identity.communicationStyle.formality} formality.`);
    if (ctx.identity.longTermTraits.length > 0) {
      lines.push(`Traits: ${ctx.identity.longTermTraits.slice(0, 5).join(", ")}.`);
    }
    if (ctx.identity.expertiseDomains.length > 0) {
      lines.push(`Expertise: ${ctx.identity.expertiseDomains.map((d) => `${d.domain} (${d.level}/100)`).join(", ")}.`);
    }
    lines.push("");
  }

  // Relationship layer
  if (ctx.relationship) {
    lines.push(`## You are serving`);
    lines.push(`${ctx.relationship.profile.name} (${ctx.relationship.profile.role}).`);
    if (ctx.relationship.keyPreferences.length > 0) {
      lines.push(`Preferences: ${ctx.relationship.keyPreferences.map((p) => p.name).join(", ")}.`);
    }
    lines.push("");
  }

  // Goals layer
  if (ctx.goals.length > 0) {
    lines.push(`## Active Goals`);
    for (const g of ctx.goals.slice(0, 5)) {
      lines.push(`- [P${g.priority}] ${g.title} (${g.progress}% done)`);
    }
    lines.push("");
  }

  // Memory layer
  if (ctx.memories.length > 0) {
    lines.push(`## Relevant Memories`);
    for (const m of ctx.memories.slice(0, 3)) {
      lines.push(`- [${m.kind}] ${m.content.slice(0, 120)}`);
    }
    lines.push("");
  }

  // Prior step outputs (for chaining)
  if (priorOutputs.length > 0) {
    lines.push(`## Prior Step Results`);
    for (const po of priorOutputs) {
      lines.push(`### ${po.trace.stepKind} (step ${po.trace.stepIndex + 1})`);
      lines.push(po.result.slice(0, 500));
      lines.push("");
    }
  }

  // Step-specific instruction
  lines.push(`## Your Task for This Step`);
  switch (kind) {
    case "retrieve":
      lines.push(`Retrieve relevant information, knowledge, and prior experience that would help accomplish the task. List specific facts, concepts, and relevant memories. Be thorough — the next step depends on what you find.`);
      break;
    case "reason":
      lines.push(`Reason step-by-step about the task. Apply your expertise. Analyze the retrieved information. Show your reasoning process clearly. Consider the user's goals and preferences in your analysis.`);
      break;
    case "execute":
      lines.push(`Execute the task. Produce a concrete, actionable result. If the user prefers reversibility, propose a reversible approach. Apply your expertise directly. Output the result.`);
      break;
    case "synthesize":
      lines.push(`Synthesize all prior step results into a final, coherent result. Address ${ctx.relationship?.profile.name ?? "the user"} directly. Be concise but complete. Draw on the prior steps' findings.`);
      break;
  }

  return lines.join("\n");
}

// ─── LLM call with fallback + retries ────────────────────────────────────────

const DEFAULT_FALLBACK_IDS = ["gpt-4o", "glm-4.6", "deepseek-v3"];

interface LLMCallResult {
  text: string;
  model: string;
  persona: string;
  personaLabel: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  fallbackUsed: boolean;
  routeReason: string;
  success: boolean;
  error?: string;
  attempts: number;
  retries: number;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

/**
 * Retry a function with exponential backoff. Only retries on transient
 * errors (network timeouts, 5xx responses). Does NOT retry on 4xx errors
 * or empty responses (those indicate a real problem, not a transient one).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (e: Error) => boolean,
  maxRetries: number = MAX_RETRIES
): Promise<{ result: T; retries: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retries: attempt };
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries && shouldRetry(e as Error)) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await emit("warn", "router", `Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          error: (e as Error).message,
        });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

function isTransientError(e: Error): boolean {
  const msg = e.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("enetunreach") ||
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit") ||
    msg.includes("5") && (msg.includes("502") || msg.includes("503") || msg.includes("504")) ||
    msg.includes("network")
  );
}

/**
 * Call the LLM with a prompt, using the routePrompt heuristic to select
 * the primary persona and falling back through a chain on failure.
 * Includes retry with exponential backoff for transient errors.
 * Every attempt is recorded.
 */
async function callLLM(prompt: string): Promise<LLMCallResult> {
  const r = routePrompt(prompt);
  const chain = [r.primary, ...r.fallback];
  const reason = r.reason;
  let totalAttempts = 0;

  for (let i = 0; i < chain.length; i++) {
    const persona = chain[i];
    const start = Date.now();
    try {
      // Wrap the actual LLM call in withRetry for transient errors
      const { result: completion, retries } = await withRetry(
        async () => {
          totalAttempts++;
          const zai = await ZAI.create();
          return zai.chat.completions.create({
            messages: [
              { role: "assistant", content: persona.systemPrompt },
              { role: "user", content: prompt },
            ],
            thinking: { type: "disabled" },
          });
        },
        isTransientError
      );
      const text = completion.choices[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty response from inference backend");
      const latencyMs = Date.now() - start;
      const tokensIn = Math.ceil(prompt.length / 4);
      const tokensOut = Math.ceil(text.length / 4);
      return {
        text,
        model: persona.id,
        persona: persona.id,
        personaLabel: persona.label,
        latencyMs,
        tokensIn,
        tokensOut,
        fallbackUsed: i > 0,
        routeReason: reason,
        success: true,
        attempts: totalAttempts,
        retries,
      };
    } catch (e) {
      const latencyMs = Date.now() - start;
      const error = (e as Error).message ?? String(e);
      // Try the next fallback persona
      if (i < chain.length - 1) {
        await emit("warn", "router", `Step LLM fallback: ${persona.id} failed → trying next`, { error });
        continue;
      }
      // All personas failed
      return {
        text: "",
        model: persona.id,
        persona: persona.id,
        personaLabel: persona.label,
        latencyMs,
        tokensIn: Math.ceil(prompt.length / 4),
        tokensOut: 0,
        fallbackUsed: i > 0,
        routeReason: reason,
        success: false,
        error,
        attempts: totalAttempts,
        retries: 0,
      };
    }
  }

  // Shouldn't reach here, but just in case
  return {
    text: "",
    model: "unknown",
    persona: "unknown",
    personaLabel: "Unknown",
    latencyMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    fallbackUsed: false,
    routeReason: "no personas available",
    success: false,
    error: "No personas in chain",
    attempts: 0,
    retries: 0,
  };
}

// ─── Execute a single step ───────────────────────────────────────────────────

/**
 * Execute a single DAG step: build prompt → call LLM → record trace.
 * Now accepts an assignedAgentId — the agent's persona is injected into the
 * prompt and the trace records which agent executed the step.
 */
export async function executeStep(
  kind: TaskKind,
  ctx: AgentContext,
  title: string,
  priorOutputs: StepOutput[],
  stepIndex: number,
  totalSteps: number,
  stepId: string,
  assignedAgentId?: string | null
): Promise<StepOutput> {
  // Load the assigned agent's profile to inject their persona into the prompt
  let agentName: string | null = null;
  let agentPersona = "";
  if (assignedAgentId) {
    const profile = await getAgentWithProfile(assignedAgentId);
    if (profile) {
      agentName = profile.name;
      agentPersona = `You are ${profile.name}, a ${profile.role} with expertise in ${profile.expertise.map(e => e.domain).join(", ")}. Apply your expertise to this step.`;
    }
  }

  const prompt = buildStepPrompt(kind, ctx, title, priorOutputs, stepIndex, totalSteps);
  // Prepend agent persona to the prompt (WS3: agent persona influences prompt)
  const enrichedPrompt = agentPersona ? `${agentPersona}\n\n${prompt}` : prompt;

  await emit("debug", "agents", `Executing step ${stepIndex + 1}/${totalSteps} (${kind})${agentName ? ` by ${agentName}` : ""}`, {
    stepId,
    kind,
    promptLength: enrichedPrompt.length,
    assignedAgentId: assignedAgentId || null,
    assignedAgentName: agentName,
  });

  // Route the prompt to select the persona (for system prompt)
  const r = routePrompt(enrichedPrompt);
  const persona = r.primary;

  // Call through the Provider Control Plane
  const llmResult = await providerCall({
    prompt: enrichedPrompt,
    systemPrompt: persona.systemPrompt,
    persona,
    stepKind: kind,
    workerId: process.env.SUIKA_WORKER_ID || "api",
  });

  const trace: ExecutionTrace = {
    stepId,
    stepKind: kind,
    stepIndex,
    prompt: enrichedPrompt,
    model: llmResult.model,
    persona: llmResult.persona,
    personaLabel: llmResult.personaLabel,
    latencyMs: llmResult.latencyMs,
    tokensIn: llmResult.tokensIn,
    tokensOut: llmResult.tokensOut,
    output: llmResult.text,
    success: llmResult.success,
    error: llmResult.error,
    fallbackUsed: llmResult.fallbackUsed,
    routeReason: r.reason,
    attempts: llmResult.attempts,
    retries: llmResult.retries,
    assignedAgentId: assignedAgentId || null,
    assignedAgentName: agentName,
  };

  if (llmResult.success) {
    await emit("info", "agents", `Step ${stepIndex + 1} complete (${kind}): ${llmResult.tokensOut} tokens in ${llmResult.latencyMs}ms`, {
      stepId,
      model: llmResult.model,
      latencyMs: llmResult.latencyMs,
      tokensOut: llmResult.tokensOut,
    });
  } else {
    await emit("warn", "agents", `Step ${stepIndex + 1} failed (${kind}): ${llmResult.error}`, {
      stepId,
      model: llmResult.model,
    });
  }

  return {
    result: llmResult.text,
    trace,
  };
}

// ─── Execute the full DAG ────────────────────────────────────────────────────

/**
 * Execute the full DAG with multi-agent assignment.
 *
 * Each step is executed by its assigned agent (from planMultiAgentExecution).
 * Between steps, handoffs are created (WS4). After each step, the state is
 * checkpointed (WS6). On resume, the executor loads the checkpoint and
 * skips already-completed steps (WS7).
 *
 * Returns the full execution result with traces.
 */
export async function executeDAG(
  plan: { kinds: TaskKind[]; reasoning: string },
  ctx: AgentContext,
  title: string,
  rootTaskId: string,
  subtaskIds: string[],
  workspaceId: string,
  agentAssignments?: Array<{ stepIndex: number; agentId: string | null; role: string }>
): Promise<ExecutionResult> {
  const totalSteps = 1 + plan.kinds.length; // root + subtasks
  const steps: StepOutput[] = [];
  const traces: ExecutionTrace[] = [];
  let totalLatencyMs = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let allSuccess = true;

  // WS7: Resume from checkpoint — load any existing checkpoint
  const checkpoint = await getCheckpoint(rootTaskId);
  let startStepIndex = 0;
  if (checkpoint && Array.isArray(checkpoint.completedSteps)) {
    const completed = checkpoint.completedSteps as number[];
    startStepIndex = completed.length;
    // Restore prior outputs from checkpoint
    if (checkpoint.steps) {
      for (const s of checkpoint.steps as StepOutput[]) {
        steps.push(s);
        traces.push(s.trace);
        totalLatencyMs += s.trace.latencyMs;
        totalTokensIn += s.trace.tokensIn;
        totalTokensOut += s.trace.tokensOut;
        if (!s.trace.success) allSuccess = false;
      }
    }
    await emit("info", "agents", `Resuming from checkpoint at step ${startStepIndex}/${totalSteps}`, {
      taskId: rootTaskId,
      completedSteps: startStepIndex,
    });
  }

  // Execute root step (if not already completed)
  if (startStepIndex === 0) {
    const rootAgentId = agentAssignments?.find(a => a.stepIndex === 0)?.agentId ?? null;
    const rootStep = await executeStep(
      "reason",
      ctx,
      title,
      [],
      0,
      totalSteps,
      rootTaskId,
      rootAgentId
    );
    steps.push(rootStep);
    traces.push(rootStep.trace);
    totalLatencyMs += rootStep.trace.latencyMs;
    totalTokensIn += rootStep.trace.tokensIn;
    totalTokensOut += rootStep.trace.tokensOut;
    if (!rootStep.trace.success) allSuccess = false;

    // WS6: Checkpoint after root step
    await checkpointTask(rootTaskId, {
      completedSteps: [0],
      steps: steps.map(s => ({ result: s.result.slice(0, 500), trace: { ...s.trace, output: s.trace.output.slice(0, 200) } })),
    });
    rootStep.trace.checkpointed = true;
  }

  // Execute subtask steps in order — with review, revision, and handoff completion
  for (let i = startStepIndex > 0 ? startStepIndex - 1 : 0; i < plan.kinds.length; i++) {
    const kind = plan.kinds[i];
    const stepId = subtaskIds[i] ?? `subtask-${i}`;
    const assignedAgentId = agentAssignments?.find(a => a.stepIndex === i + 1)?.agentId ?? null;

    // WS4: Create handoff from previous agent to current agent
    const prevAgentId = i === 0 ? (agentAssignments?.find(a => a.stepIndex === 0)?.agentId ?? null) : (agentAssignments?.find(a => a.stepIndex === i)?.agentId ?? null);
    let handoffId: string | null = null;
    if (prevAgentId && assignedAgentId && prevAgentId !== assignedAgentId) {
      const handoffType = kind === "synthesize" ? "synthesize" : kind === "reason" ? "review" : "delegate";
      const handoff = await createHandoff(rootTaskId, prevAgentId, assignedAgentId, handoffType as any, `Step ${i + 2}: ${kind} — handoff from step ${i + 1}`);
      handoffId = handoff.id;
      await emit("info", "agents", `Handoff: ${handoffType} from agent ${prevAgentId.slice(-8)} to ${assignedAgentId.slice(-8)}`, {
        taskId: rootTaskId, stepIndex: i + 1, handoffType, handoffId,
      });
    }

    // Execute the step (with revision loop — WS2)
    let revisionAttempt = 0;
    const MAX_REVISIONS = 3;
    let step: StepOutput;
    let reviewVerdict: "APPROVE" | "REJECT" | "REVISION_REQUIRED" = "APPROVE";
    let reviewId: string | null = null;

    while (true) {
      step = await executeStep(
        kind,
        ctx,
        title,
        steps,
        i + 1,
        totalSteps,
        stepId,
        assignedAgentId
      );

      // WS1: After reason/execute steps, run a review
      if (step.trace.success && (kind === "reason" || kind === "execute") && assignedAgentId) {
        const reviewerAgentId = await selectReviewerAgent(assignedAgentId, title);
        if (reviewerAgentId) {
          // Build a review prompt — the reviewer inspects the step output
          const reviewPrompt = `Review the following output from step ${i + 2} (${kind}).\n\nOutput:\n${step.result.slice(0, 1000)}\n\nRespond with exactly one word: APPROVE, REJECT, or REVISION_REQUIRED. Then explain your reasoning.`;
          const reviewResult = await providerCall({
            prompt: reviewPrompt,
            systemPrompt: "You are a reviewer agent. Inspect the output critically. Respond with APPROVE, REJECT, or REVISION_REQUIRED followed by your rationale.",
            persona: { id: "gpt-4o", label: "Reviewer", systemPrompt: "", family: "openai", strengths: [], contextWindow: 128000, costPer1kIn: 0.005, costPer1kOut: 0.015, avgLatencyMs: 900 } as any,
            stepKind: "reason",
            workerId: process.env.SUIKA_WORKER_ID || "api",
          });

          // Parse the verdict from the review response
          const reviewText = reviewResult.text.toUpperCase();
          if (reviewText.includes("REJECT")) reviewVerdict = "REJECT";
          else if (reviewText.includes("REVISION")) reviewVerdict = "REVISION_REQUIRED";
          else reviewVerdict = "APPROVE";

          const rationale = reviewResult.text.slice(0, 500);

          // WS1: Persist the review record
          reviewId = await createReviewRecord({
            taskId: rootTaskId,
            stepId,
            stepIndex: i + 1,
            reviewerAgentId,
            targetAgentId: assignedAgentId,
            verdict: reviewVerdict,
            rationale,
            revisionAttempt,
          });

          step.trace.reviewStatus = reviewVerdict;

          await emit("info", "agents", `Review ${reviewVerdict} on step ${i + 2} (attempt ${revisionAttempt + 1})`, {
            taskId: rootTaskId, stepIndex: i + 1, reviewVerdict, reviewerAgentId, reviewId,
          });

          if (reviewVerdict === "APPROVE") {
            break; // step approved, move to next
          } else if (reviewVerdict === "REJECT" && revisionAttempt >= MAX_REVISIONS - 1) {
            // WS2: Max revisions exceeded — fail the task
            await emit("warn", "agents", `Step ${i + 2} rejected ${MAX_REVISIONS} times — failing task`, {
              taskId: rootTaskId, stepIndex: i + 1, revisionAttempt,
            });
            allSuccess = false;
            step.trace.success = false;
            step.trace.error = `Rejected after ${MAX_REVISIONS} review attempts`;
            break;
          } else {
            // WS2: Revision required — increment and re-execute
            revisionAttempt++;
            await emit("info", "agents", `Revision ${revisionAttempt} for step ${i + 2}`, {
              taskId: rootTaskId, stepIndex: i + 1, revisionAttempt,
            });
            continue; // re-execute the step
          }
        } else {
          break; // no reviewer available, approve by default
        }
      } else {
        break; // no review needed for this step kind
      }
    }

    steps.push(step);
    traces.push(step.trace);
    totalLatencyMs += step.trace.latencyMs;
    totalTokensIn += step.trace.tokensIn;
    totalTokensOut += step.trace.tokensOut;
    if (!step.trace.success) allSuccess = false;

    // WS3: Complete the handoff
    if (handoffId) {
      await completeHandoff(handoffId, step.trace.success ? "completed" : "rejected");
    }

    // WS6: Checkpoint after each step (with review state)
    if (step.trace.success) {
      const completedSteps = Array.from({ length: i + 2 }, (_, idx) => idx);
      await checkpointTask(rootTaskId, {
        completedSteps,
        steps: steps.map(s => ({ result: s.result.slice(0, 500), trace: { ...s.trace, output: s.trace.output.slice(0, 200) } })),
        lastHandoff: prevAgentId && assignedAgentId && prevAgentId !== assignedAgentId
          ? { from: prevAgentId, to: assignedAgentId, type: kind, handoffId, status: "completed" }
          : null,
        lastReview: reviewId ? { reviewId, verdict: reviewVerdict, stepIndex: i + 1, revisionAttempt } : null,
      });
      step.trace.checkpointed = true;
    }
  }

  // The synthesized result is the output of the last step.
  const lastStep = steps[steps.length - 1];
  const synthesizedResult = lastStep?.result || steps[0]?.result || "";

  // Persist the result as a Memory (episodic)
  let memoryId: string | null = null;
  if (synthesizedResult && allSuccess) {
    try {
      const content = `Task "${title}" executed.\n\nResult:\n${synthesizedResult.slice(0, 2000)}`;
      const importance = Math.min(
        1,
        0.5 +
          (ctx.goals.length > 0 ? 0.2 : 0) +
          (ctx.memories.length > 0 ? 0.1 : 0)
      );
      const memory = await db.memory.create({
        data: {
          kind: "episodic",
          content,
          importance,
          decay: decayFactor(0, importance, 0),
          embedding: writeJSON(embed(content)),
          tags: writeJSON(["execution", "dispatch", title.slice(0, 40)]),
          workspaceId,
          sourceEntityId: null,
        },
      });
      memoryId = memory.id;
      await emit("info", "memory", `Execution result persisted as memory`, {
        memoryId: memory.id,
        taskId: rootTaskId,
        importance,
      });
    } catch (e) {
      await emit("warn", "memory", `Failed to persist execution memory: ${(e as Error).message}`, {
        taskId: rootTaskId,
      });
    }
  }

  return {
    steps,
    traces,
    synthesizedResult,
    totalLatencyMs,
    totalTokensIn,
    totalTokensOut,
    memoryId,
    success: allSuccess,
  };
}
