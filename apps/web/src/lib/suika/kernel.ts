/**
 * SUIKA X — Kernel: event bus + metrics.
 *
 * Writes structured events to the Event table (the observability spine) and
 * exposes aggregate metrics computed live from the persistent store. Every
 * subsystem emits events through this module so the observability layer always
 * reflects reality.
 */
import { db } from "@/lib/db";
import type { EventLevel, EventSource, SystemMetrics } from "./types";

export async function emit(
  level: EventLevel,
  source: EventSource,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.event.create({
      data: {
        level,
        source,
        message,
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (e) {
    // Never let observability failures break the request path.
    console.error("[suika.emit] failed:", (e as Error).message);
  }
}

const BOOTED_AT = Date.now();

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    agentRows,
    taskRows,
    memRows,
    entityCount,
    relationCount,
    entityTypes,
    callRows,
    eventCount24,
    errorCount24,
  ] = await Promise.all([
    db.agent.findMany({ select: { status: true } }),
    db.task.findMany({ select: { status: true } }),
    db.memory.findMany({ select: { kind: true, importance: true, decay: true } }),
    db.entity.count(),
    db.relation.count(),
    db.entity.findMany({ select: { type: true }, distinct: ["type"] }),
    db.modelCall.findMany({
      select: {
        status: true,
        costUsd: true,
        latencyMs: true,
        tokensIn: true,
        tokensOut: true,
      },
    }),
    db.event.count({ where: { createdAt: { gte: since24 } } }),
    db.event.count({
      where: { createdAt: { gte: since24 }, level: "error" },
    }),
  ]);

  const byKind: Record<string, number> = {};
  let impSum = 0;
  let decaySum = 0;
  for (const m of memRows) {
    byKind[m.kind] = (byKind[m.kind] || 0) + 1;
    impSum += m.importance;
    decaySum += m.decay;
  }

  let okCalls = 0;
  let errorCalls = 0;
  let fallbackCalls = 0;
  let totalCost = 0;
  let totalLat = 0;
  let totalTokens = 0;
  for (const c of callRows) {
    if (c.status === "ok") okCalls++;
    else if (c.status === "error") errorCalls++;
    if (c.status === "fallback") fallbackCalls++;
    totalCost += c.costUsd;
    totalLat += c.latencyMs;
    totalTokens += c.tokensIn + c.tokensOut;
  }

  const taskByStatus = (s: string) => taskRows.filter((t) => t.status === s).length;
  const agentByStatus = (s: string) => agentRows.filter((a) => a.status === s).length;

  return {
    agents: {
      total: agentRows.length,
      busy: agentByStatus("busy"),
      idle: agentByStatus("idle"),
      error: agentByStatus("error"),
    },
    tasks: {
      total: taskRows.length,
      running: taskByStatus("running"),
      success: taskByStatus("success"),
      failed: taskByStatus("failed"),
      pending: taskByStatus("pending"),
    },
    memory: {
      total: memRows.length,
      byKind,
      avgImportance: memRows.length ? Number((impSum / memRows.length).toFixed(3)) : 0,
      avgDecay: memRows.length ? Number((decaySum / memRows.length).toFixed(3)) : 0,
    },
    fabric: {
      entities: entityCount,
      relations: relationCount,
      types: entityTypes.length,
    },
    router: {
      totalCalls: callRows.length,
      okCalls,
      errorCalls,
      fallbackCalls,
      totalCostUsd: Number(totalCost.toFixed(6)),
      avgLatencyMs: callRows.length ? Math.round(totalLat / callRows.length) : 0,
      totalTokens,
    },
    events: { last24h: eventCount24, errorLast24h: errorCount24 },
    uptimeSec: Math.round((Date.now() - BOOTED_AT) / 1000),
  };
}
