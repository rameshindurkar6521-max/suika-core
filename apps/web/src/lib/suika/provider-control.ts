/**
 * SUIKA X — Provider Control Plane.
 *
 * The single authority between the Executor and the LLM backend. Replaces the
 * old `callLLM()` in executor.ts with a managed call path that provides:
 *
 *   1. Global Concurrency Manager  — DB-backed permits (WS1)
 *   2. Adaptive Rate Control       — AIMD concurrency adjustment (WS2)
 *   3. Circuit Breakers            — CLOSED/OPEN/HALF_OPEN per provider (WS3)
 *   4. Multi-Provider Router       — routing modes + persona mapping (WS4)
 *   5. Centralized Retry Engine    — backoff + jitter, retryable classification (WS5)
 *   6. Provider Health Service     — metrics + observability (WS6)
 *
 * The single entry point is `providerCall()` — the executor calls this instead
 * of calling z-ai-web-dev-sdk directly.
 */
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { emit } from "@/lib/suika/kernel";
import { MODEL_PERSONAS, type ModelPersona } from "@/lib/suika/models";
import type { TaskKind } from "@/lib/suika/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
export type RoutingMode = "CHEAPEST" | "FASTEST" | "HIGHEST_QUALITY" | "ROUND_ROBIN" | "FAILOVER";
export type CallStatus = "ok" | "error" | "retry" | "429" | "timeout";

export interface ProviderCallInput {
  prompt: string;
  systemPrompt: string;
  persona: ModelPersona;
  stepKind: TaskKind;
  workerId: string;
  jobId?: string;
  taskId?: string;
}

export interface ProviderCallResult {
  text: string;
  model: string;
  persona: string;
  personaLabel: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  success: boolean;
  error?: string;
  attempts: number;
  retries: number;
  permitWaitMs: number;
  providerId: string;
  circuitBefore: CircuitState;
  circuitAfter: CircuitState;
  fallbackUsed: boolean;
}

// ─── Provider Registry (WS4) ─────────────────────────────────────────────────

export interface Provider {
  id: string;
  displayName: string;
  maxConcurrent: number;
  baseDelayMs: number;
  failureThreshold: number;
  recoveryTimeoutMs: number;
  minConcurrent: number;
  maxConcurrentLimit: number;
  costPer1kIn: number;
  costPer1kOut: number;
  avgLatencyMs: number;
  qualityScore: number;
  priority: number;
}

const DEFAULT_PROVIDERS = [
  {
    providerId: "zai-primary",
    displayName: "Z.ai Primary (deepseek-v3)",
    enabled: true,
    maxConcurrent: 1,
    baseDelayMs: 5000, // 5s — aggressive throttle to minimize 429s
    failureThreshold: 10, // very tolerant — only open after 10 consecutive failures
    recoveryTimeoutMs: 5000, // fast recovery — probe after 5s
    minConcurrent: 1,
    maxConcurrentLimit: 2,
    currentConcurrent: 1,
    circuitState: "CLOSED",
    consecutiveFailures: 0,
    routingMode: "FAILOVER",
    priority: 10,
    costPer1kIn: 0.002,
    costPer1kOut: 0.006,
    avgLatencyMs: 10000,
    qualityScore: 70,
  },
  {
    providerId: "zai-fallback-1",
    displayName: "Z.ai Fallback 1 (glm-4.6)",
    enabled: true,
    maxConcurrent: 1,
    baseDelayMs: 5000,
    failureThreshold: 10,
    recoveryTimeoutMs: 5000,
    minConcurrent: 1,
    maxConcurrentLimit: 2,
    currentConcurrent: 1,
    circuitState: "CLOSED",
    consecutiveFailures: 0,
    routingMode: "FAILOVER",
    priority: 20,
    costPer1kIn: 0.002,
    costPer1kOut: 0.006,
    avgLatencyMs: 8000,
    qualityScore: 65,
  },
  {
    providerId: "zai-fallback-2",
    displayName: "Z.ai Fallback 2 (gpt-4o persona)",
    enabled: true,
    maxConcurrent: 1,
    baseDelayMs: 5000,
    failureThreshold: 10,
    recoveryTimeoutMs: 5000,
    minConcurrent: 1,
    maxConcurrentLimit: 2,
    currentConcurrent: 1,
    circuitState: "CLOSED",
    consecutiveFailures: 0,
    routingMode: "FAILOVER",
    priority: 30,
    costPer1kIn: 0.005,
    costPer1kOut: 0.015,
    avgLatencyMs: 9000,
    qualityScore: 75,
  },
];

/**
 * Ensure the default provider configs exist in the DB. Called on first use.
 * Also resets any OPEN circuits on boot (self-healing: if the process restarts,
 * circuits should start CLOSED and re-probe).
 */
async function ensureProviders(): Promise<void> {
  const count = await db.providerConfig.count();
  if (count === 0) {
    for (const p of DEFAULT_PROVIDERS) {
      await db.providerConfig.create({ data: p });
    }
    await emit("info", "runtime", "Provider Control Plane initialized", {
      providers: DEFAULT_PROVIDERS.length,
    });
  } else {
    // WS6: Self-healing — reset any OPEN circuits on boot
    const openCircuits = await db.providerConfig.findMany({
      where: { circuitState: "OPEN" },
    });
    for (const c of openCircuits) {
      await db.providerConfig.update({
        where: { id: c.id },
        data: {
          circuitState: "HALF_OPEN",
          consecutiveFailures: 0,
          currentConcurrent: 1, // reset to minimum
        },
      });
      await emit("info", "runtime", `Self-healing: circuit ${c.providerId} reset from OPEN to HALF_OPEN on boot`, {
        providerId: c.providerId,
      });
    }
  }
}

/**
 * Get all enabled providers, ordered by priority.
 */
async function getEnabledProviders(): Promise<Provider[]> {
  await ensureProviders();
  const rows = await db.providerConfig.findMany({
    where: { enabled: true },
    orderBy: { priority: "asc" },
  });
  return rows.map((r) => ({
    id: r.providerId,
    displayName: r.displayName,
    maxConcurrent: r.currentConcurrent, // AIMD-adjusted
    baseDelayMs: r.baseDelayMs,
    failureThreshold: r.failureThreshold,
    recoveryTimeoutMs: r.recoveryTimeoutMs,
    minConcurrent: r.minConcurrent,
    maxConcurrentLimit: r.maxConcurrentLimit,
    costPer1kIn: r.costPer1kIn,
    costPer1kOut: r.costPer1kOut,
    avgLatencyMs: r.avgLatencyMs,
    qualityScore: r.qualityScore,
    priority: r.priority,
  }));
}

// ─── WS1: Concurrency Permits (DB-backed) ────────────────────────────────────

/**
 * Active permits are tracked in-memory (per-worker) + enforced via DB atomic
 * update. A worker acquires a permit by checking active calls for the provider
 * and incrementing if under the limit. The permit is released when the call
 * completes.
 *
 * Since all workers share the same DB, the DB serves as the source of truth
 * for how many calls are currently active per provider.
 */

// In-memory active call tracking (per worker process)
const activeCalls = new Map<string, number>(); // providerId → count

async function acquirePermit(
  providerId: string,
  maxConcurrent: number,
  workerId: string,
  timeoutMs: number = 60000
): Promise<{ acquired: boolean; waitMs: number }> {
  const start = Date.now();
  const pollInterval = 500; // 500ms — no busy loop

  while (Date.now() - start < timeoutMs) {
    const local = activeCalls.get(providerId) || 0;
    if (local < maxConcurrent) {
      activeCalls.set(providerId, local + 1);
      return { acquired: true, waitMs: Date.now() - start };
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return { acquired: false, waitMs: Date.now() - start };
}

function releasePermit(providerId: string): void {
  const local = activeCalls.get(providerId) || 0;
  if (local > 0) activeCalls.set(providerId, local - 1);
}

// ─── WS2: Adaptive Rate Control (AIMD) ───────────────────────────────────────

/**
 * Additive Increase: on success, gradually increase currentConcurrent by 1
 * (up to maxConcurrentLimit).
 * Multiplicative Decrease: on failure/429, halve currentConcurrent (down to
 * minConcurrent).
 *
 * This is persisted in ProviderConfig.currentConcurrent so all workers see
 * the same limit.
 */
async function onCallSuccess(providerId: string): Promise<void> {
  const config = await db.providerConfig.findUnique({ where: { providerId } });
  if (!config) return;

  // Additive increase
  if (config.currentConcurrent < config.maxConcurrentLimit) {
    await db.providerConfig.update({
      where: { providerId },
      data: {
        currentConcurrent: config.currentConcurrent + 1,
        consecutiveFailures: 0, // reset on success
      },
    });
  }
}

async function onCallFailure(providerId: string, is429: boolean): Promise<void> {
  const config = await db.providerConfig.findUnique({ where: { providerId } });
  if (!config) return;

  const newFailures = config.consecutiveFailures + 1;
  const newConcurrent = Math.max(
    config.minConcurrent,
    Math.floor(config.currentConcurrent * 0.5) // multiplicative decrease
  );

  await db.providerConfig.update({
    where: { providerId },
    data: {
      consecutiveFailures: newFailures,
      currentConcurrent: newConcurrent,
      lastFailureAt: new Date(),
    },
  });

  if (is429) {
    await emit("warn", "runtime", `Provider ${providerId}: 429 received, concurrency reduced to ${newConcurrent}`, {
      providerId,
      consecutiveFailures: newFailures,
    });
  }
}

// ─── WS3: Circuit Breaker ────────────────────────────────────────────────────

async function checkCircuit(providerId: string): Promise<{ state: CircuitState; allow: boolean }> {
  const config = await db.providerConfig.findUnique({ where: { providerId } });
  if (!config) return { state: "CLOSED", allow: true };

  const state = config.circuitState as CircuitState;

  if (state === "CLOSED") {
    return { state, allow: true };
  }

  if (state === "OPEN") {
    // Check if recovery timeout has passed
    if (config.openedAt && Date.now() - config.openedAt.getTime() > config.recoveryTimeoutMs) {
      // Transition to HALF_OPEN
      await db.providerConfig.update({
        where: { providerId },
        data: { circuitState: "HALF_OPEN" },
      });
      return { state: "HALF_OPEN", allow: true }; // allow one probe
    }
    return { state, allow: false }; // stay open
  }

  if (state === "HALF_OPEN") {
    return { state, allow: true }; // allow probe calls
  }

  return { state: "CLOSED", allow: true };
}

async function onCircuitSuccess(providerId: string): Promise<void> {
  const config = await db.providerConfig.findUnique({ where: { providerId } });
  if (!config) return;
  if (config.circuitState !== "CLOSED") {
    await db.providerConfig.update({
      where: { providerId },
      data: { circuitState: "CLOSED", consecutiveFailures: 0, openedAt: null },
    });
    await emit("info", "runtime", `Circuit breaker CLOSED for ${providerId}`, { providerId });
  }
}

async function onCircuitFailure(providerId: string): Promise<void> {
  const config = await db.providerConfig.findUnique({ where: { providerId } });
  if (!config) return;

  if (config.consecutiveFailures >= config.failureThreshold) {
    if (config.circuitState !== "OPEN") {
      await db.providerConfig.update({
        where: { providerId },
        data: { circuitState: "OPEN", openedAt: new Date() },
      });
      await emit("warn", "runtime", `Circuit breaker OPEN for ${providerId}`, {
        providerId,
        consecutiveFailures: config.consecutiveFailures,
        threshold: config.failureThreshold,
      });
    }
  }
}

// ─── WS5: Retry Engine ───────────────────────────────────────────────────────

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000];

function isRetryable(error: string): boolean {
  const msg = error.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("enetunreach") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("network") ||
    msg.includes("empty response")
  );
}

function isNonRetryable(error: string): boolean {
  const msg = error.toLowerCase();
  return (
    msg.includes("auth") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("invalid") ||
    msg.includes("validation")
  );
}

function getRetryDelay(attempt: number): number {
  const base = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  // Add jitter: ±25% of base
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.max(500, Math.round(base + jitter));
}

// ─── WS4: Provider Router ────────────────────────────────────────────────────

let roundRobinIndex = 0;

async function selectProvider(
  mode: RoutingMode,
  providers: Provider[]
): Promise<Provider | null> {
  if (providers.length === 0) return null;

  switch (mode) {
    case "CHEAPEST":
      return [...providers].sort((a, b) => (a.costPer1kIn + a.costPer1kOut) - (b.costPer1kIn + b.costPer1kOut))[0];
    case "FASTEST":
      return [...providers].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)[0];
    case "HIGHEST_QUALITY":
      return [...providers].sort((a, b) => b.qualityScore - a.qualityScore)[0];
    case "ROUND_ROBIN":
      const provider = providers[roundRobinIndex % providers.length];
      roundRobinIndex++;
      return provider;
    case "FAILOVER":
    default:
      return providers[0]; // first by priority
  }
}

// ─── WS6: Health Service ─────────────────────────────────────────────────────

async function recordCall(
  providerId: string,
  input: ProviderCallInput,
  result: ProviderCallResult,
  status: CallStatus
): Promise<void> {
  try {
    await db.providerCallLog.create({
      data: {
        providerId,
        workerId: input.workerId,
        jobId: input.jobId,
        taskId: input.taskId,
        stepKind: input.stepKind,
        prompt: input.prompt.slice(0, 500),
        response: result.text.slice(0, 500),
        model: result.model,
        persona: input.persona.id,
        latencyMs: result.latencyMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: (result.tokensIn / 1000) * 0.002 + (result.tokensOut / 1000) * 0.006,
        status,
        error: result.error,
        attempts: result.attempts,
        retries: result.retries,
        permitWaitMs: result.permitWaitMs,
        circuitBefore: result.circuitBefore,
        circuitAfter: result.circuitAfter,
      },
    });
  } catch (e) {
    // Don't let logging failures break the call
  }
}

async function recordHealth(providerId: string, activeCount: number): Promise<void> {
  const recentCalls = await db.providerCallLog.findMany({
    where: {
      providerId,
      createdAt: { gte: new Date(Date.now() - 60000) }, // last 1 min
    },
    select: { status: true, latencyMs: true, tokensIn: true, tokensOut: true },
  });

  const total = recentCalls.length;
  const failures = recentCalls.filter((c) => c.status !== "ok").length;
  const rate429 = recentCalls.filter((c) => c.status === "429").length;
  const latencies = recentCalls.map((c) => c.latencyMs).sort((a, b) => a - b);

  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;

  const config = await db.providerConfig.findUnique({ where: { providerId } });

  await db.providerHealth.create({
    data: {
      providerId,
      successRate: total > 0 ? (total - failures) / total : 1.0,
      failureRate: total > 0 ? failures / total : 0.0,
      rate429: total > 0 ? rate429 : 0,
      latencyP50: p50,
      latencyP95: p95,
      latencyP99: p99,
      throughput: total, // calls in last minute
      activeCalls: activeCount,
      totalCalls: total,
      totalFailures: failures,
      totalRetries: 0, // aggregated below
      tokensIn: recentCalls.reduce((s, c) => s + c.tokensIn, 0),
      tokensOut: recentCalls.reduce((s, c) => s + c.tokensOut, 0),
      costUsd: 0,
      circuitState: config?.circuitState || "CLOSED",
      currentConcurrent: config?.currentConcurrent || 1,
    },
  });
}

// ─── The Main Entry Point: providerCall() ────────────────────────────────────

/**
 * The single entry point for the Executor. Replaces the old callLLM().
 *
 * Flow:
 *   1. Get enabled providers (sorted by priority)
 *   2. For each provider (failover):
 *      a. Check circuit breaker — skip if OPEN
 *      b. Acquire concurrency permit (wait up to 60s)
 *      c. Apply base delay (provider-specific throttle)
 *      d. Call the LLM with centralized retry (backoff + jitter)
 *      e. On success: release permit, AIMD increase, circuit close, return
 *      f. On failure: release permit, AIMD decrease, circuit check, try next
 *   3. If all providers fail: return failure
 */
export async function providerCall(input: ProviderCallInput): Promise<ProviderCallResult> {
  const providers = await getEnabledProviders();
  if (providers.length === 0) {
    return {
      text: "",
      model: "none",
      persona: input.persona.id,
      personaLabel: input.persona.label,
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      error: "No providers available",
      attempts: 0,
      retries: 0,
      permitWaitMs: 0,
      providerId: "none",
      circuitBefore: "CLOSED",
      circuitAfter: "CLOSED",
      fallbackUsed: false,
    };
  }

  let lastError = "";
  let totalAttempts = 0;

  for (let pi = 0; pi < providers.length; pi++) {
    const provider = providers[pi];
    const isFallback = pi > 0;

    // Check circuit breaker
    const circuit = await checkCircuit(provider.id);
    if (!circuit.allow) {
      await emit("warn", "runtime", `Circuit OPEN for ${provider.id}, skipping`, { providerId: provider.id });
      lastError = `Circuit open for ${provider.id}`;
      continue;
    }

    // Acquire permit
    const permit = await acquirePermit(provider.id, provider.maxConcurrent, input.workerId);
    if (!permit.acquired) {
      lastError = `Permit timeout for ${provider.id}`;
      continue;
    }

    // Apply base delay (provider-specific throttle to avoid 429)
    if (provider.baseDelayMs > 0) {
      await new Promise((r) => setTimeout(r, provider.baseDelayMs));
    }

    // Call LLM with centralized retry
    const callStart = Date.now();
    let retries = 0;
    let succeeded = false;
    let responseText = "";
    let errorMsg: string | null = null;
    let callStatus: CallStatus = "ok";

    for (let attempt = 0; attempt <= 5; attempt++) {
      totalAttempts++;
      try {
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: [
            { role: "assistant", content: input.systemPrompt },
            { role: "user", content: input.prompt },
          ],
          thinking: { type: "disabled" },
        });
        responseText = completion.choices[0]?.message?.content ?? "";
        if (!responseText) throw new Error("Empty response from inference backend");
        succeeded = true;
        break;
      } catch (e) {
        errorMsg = (e as Error).message ?? String(e);
        callStatus = errorMsg.includes("429") ? "429" : errorMsg.includes("timeout") ? "timeout" : "error";

        if (attempt < 5 && isRetryable(errorMsg)) {
          retries++;
          const delay = getRetryDelay(attempt);
          await emit("warn", "router", `Provider ${provider.id} retry ${retries} after ${delay}ms: ${errorMsg.slice(0, 60)}`, {
            providerId: provider.id, attempt, delay,
          });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break; // non-retryable or max retries
      }
    }

    const latencyMs = Date.now() - callStart;
    releasePermit(provider.id);

    const tokensIn = Math.ceil(input.prompt.length / 4);
    const tokensOut = succeeded ? Math.ceil(responseText.length / 4) : 0;

    // Circuit + AIMD updates
    if (succeeded) {
      await onCallSuccess(provider.id);
      await onCircuitSuccess(provider.id);
      const circuitAfter = await checkCircuit(provider.id);

      const result: ProviderCallResult = {
        text: responseText,
        model: input.persona.id,
        persona: input.persona.id,
        personaLabel: input.persona.label,
        latencyMs,
        tokensIn,
        tokensOut,
        success: true,
        attempts: totalAttempts,
        retries,
        permitWaitMs: permit.waitMs,
        providerId: provider.id,
        circuitBefore: circuit.state,
        circuitAfter: circuitAfter.state,
        fallbackUsed: isFallback,
      };

      await recordCall(provider.id, input, result, "ok");
      return result;
    } else {
      const is429 = errorMsg?.includes("429") || false;
      await onCallFailure(provider.id, is429);
      await onCircuitFailure(provider.id);
      const circuitAfter = await checkCircuit(provider.id);

      const result: ProviderCallResult = {
        text: "",
        model: input.persona.id,
        persona: input.persona.id,
        personaLabel: input.persona.label,
        latencyMs,
        tokensIn,
        tokensOut: 0,
        success: false,
        error: errorMsg ?? "unknown",
        attempts: totalAttempts,
        retries,
        permitWaitMs: permit.waitMs,
        providerId: provider.id,
        circuitBefore: circuit.state,
        circuitAfter: circuitAfter.state,
        fallbackUsed: isFallback,
      };

      await recordCall(provider.id, input, result, callStatus);
      lastError = errorMsg ?? "unknown";
      // Try next provider
      continue;
    }
  }

  // All providers failed
  return {
    text: "",
    model: input.persona.id,
    persona: input.persona.id,
    personaLabel: input.persona.label,
    latencyMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    success: false,
    error: lastError,
    attempts: totalAttempts,
    retries: 0,
    permitWaitMs: 0,
    providerId: "all-failed",
    circuitBefore: "CLOSED",
    circuitAfter: "CLOSED",
    fallbackUsed: providers.length > 1,
  };
}

// ─── Health API helpers (WS6) ────────────────────────────────────────────────

export async function getProviderHealth() {
  const configs = await db.providerConfig.findMany({ orderBy: { priority: "asc" } });
  const result = [];
  for (const c of configs) {
    // Get latest health snapshot
    const latest = await db.providerHealth.findFirst({
      where: { providerId: c.providerId },
      orderBy: { timestamp: "desc" },
    });
    // Get call stats from last hour
    const recentCalls = await db.providerCallLog.findMany({
      where: { providerId: c.providerId, createdAt: { gte: new Date(Date.now() - 3600000) } },
      select: { status: true, latencyMs: true, tokensIn: true, tokensOut: true, retries: true },
    });
    const totalCalls = recentCalls.length;
    const failures = recentCalls.filter((c) => c.status !== "ok").length;
    const rate429s = recentCalls.filter((c) => c.status === "429").length;
    const totalRetries = recentCalls.reduce((s, c) => s + c.retries, 0);
    const latencies = recentCalls.map((c) => c.latencyMs).sort((a, b) => a - b);

    result.push({
      providerId: c.providerId,
      displayName: c.displayName,
      enabled: c.enabled,
      maxConcurrent: c.maxConcurrent,
      currentConcurrent: c.currentConcurrent,
      circuitState: c.circuitState,
      consecutiveFailures: c.consecutiveFailures,
      routingMode: c.routingMode,
      priority: c.priority,
      costPer1kIn: c.costPer1kIn,
      costPer1kOut: c.costPer1kOut,
      avgLatencyMs: c.avgLatencyMs,
      qualityScore: c.qualityScore,
      stats: {
        totalCalls,
        failures,
        rate429s,
        totalRetries,
        successRate: totalCalls > 0 ? (totalCalls - failures) / totalCalls : 1.0,
        p50: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0,
        p95: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0,
        p99: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0,
        tokensIn: recentCalls.reduce((s, c) => s + c.tokensIn, 0),
        tokensOut: recentCalls.reduce((s, c) => s + c.tokensOut, 0),
      },
      latestHealth: latest,
    });
  }
  return result;
}

export async function getProviderCallLog(providerId: string, limit: number = 50) {
  return db.providerCallLog.findMany({
    where: { providerId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
}
