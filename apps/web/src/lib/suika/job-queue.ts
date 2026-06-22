/**
 * SUIKA X — Durable Job Queue.
 *
 * Database-backed persistent job queue. Replaces the in-process async queue.
 * Workers claim jobs via an atomic conditional update (UPDATE...WHERE
 * status='pending'), which provides exactly-once claiming. On crash, the
 * lease expires and the job is reclaimed by another worker (at-least-once
 * execution). The executor is idempotent because it writes to fixed task
 * rows — re-execution overwrites, doesn't duplicate.
 *
 * Lease model:
 *   - A worker claims a job → sets status='claimed', workerId, leaseExpiresAt
 *   - The worker heartbeats every LEASE_RENEWAL_MS, extending leaseExpiresAt
 *   - If leaseExpiresAt passes without heartbeat → job is "orphaned"
 *   - Orphaned jobs are reclaimed: status reset to 'pending', attempts++
 *   - If attempts >= maxAttempts → dead-lettered (status='dead_lettered')
 *
 * This module is used by:
 *   - The dispatch route (enqueue)
 *   - The worker process (claim, heartbeat, complete, fail)
 *   - The system route (recover orphaned jobs)
 *   - The jobs API (status, list, dead-letter)
 */
import { db } from "@/lib/db";
import { emit } from "@/lib/suika/kernel";
import { writeJSON, readJSON } from "@/lib/suika/json";
import type { AgentContext, TaskKind } from "@/lib/suika/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const LEASE_DURATION_MS = 30 * 1000; // 30 seconds per lease
const HEARTBEAT_INTERVAL_MS = 10 * 1000; // heartbeat every 10s
const ORPHAN_THRESHOLD_MS = 10 * 1000; // 10s past lease expiry = orphaned
const DEAD_LETER_RETRY_DELAY_MS = 60 * 1000; // 60s before dead-lettered jobs can be auto-retried

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "dead_lettered";

export interface JobDTO {
  id: string;
  taskId: string;
  status: JobStatus;
  workerId: string | null;
  leaseExpiresAt: string | null;
  lastHeartbeat: string | null;
  attempts: number;
  maxAttempts: number;
  title: string;
  workspaceId: string;
  error: string | null;
  deadLetterReason: string | null;
  createdAt: string;
  claimedAt: string | null;
  completedAt: string | null;
}

export interface EnqueueInput {
  taskId: string;
  title: string;
  workspaceId: string;
  agentContext: AgentContext;
  plan: { kinds: TaskKind[]; reasoning: string };
  maxAttempts?: number;
}

// ─── DTO serializer ──────────────────────────────────────────────────────────

type JobRow = {
  id: string;
  taskId: string;
  status: string;
  workerId: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeat: Date | null;
  attempts: number;
  maxAttempts: number;
  title: string;
  workspaceId: string;
  error: string | null;
  deadLetterReason: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  completedAt: Date | null;
};

export function toJobDTO(j: JobRow): JobDTO {
  return {
    id: j.id,
    taskId: j.taskId,
    status: j.status as JobStatus,
    workerId: j.workerId,
    leaseExpiresAt: j.leaseExpiresAt ? j.leaseExpiresAt.toISOString() : null,
    lastHeartbeat: j.lastHeartbeat ? j.lastHeartbeat.toISOString() : null,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    title: j.title,
    workspaceId: j.workspaceId,
    error: j.error,
    deadLetterReason: j.deadLetterReason,
    createdAt: j.createdAt.toISOString(),
    claimedAt: j.claimedAt ? j.claimedAt.toISOString() : null,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
  };
}

// ─── Enqueue ─────────────────────────────────────────────────────────────────

/**
 * Enqueue a new job. The AgentContext and DAG plan are frozen (serialized
 * into JSON) at enqueue time so the worker has everything it needs to
 * execute without re-querying the context. This is critical for durability:
 * even if the identity/relationship data changes between enqueue and
 * execution, the job runs with the context that was current at dispatch time.
 */
export async function enqueue(input: EnqueueInput): Promise<JobDTO> {
  const job = await db.executionJob.create({
    data: {
      taskId: input.taskId,
      title: input.title,
      workspaceId: input.workspaceId,
      agentContextJson: writeJSON(input.agentContext),
      planJson: writeJSON(input.plan),
      maxAttempts: input.maxAttempts ?? 5,
      status: "pending",
    },
  });
  await emit("info", "runtime", `Job enqueued: ${input.title}`, {
    jobId: job.id,
    taskId: input.taskId,
  });
  return toJobDTO(job);
}

// ─── Claim (atomic) ──────────────────────────────────────────────────────────

/**
 * Atomically claim the next pending job. Uses a conditional UPDATE
 * (WHERE status='pending' AND id = X) so only one worker can claim a given
 * job, even if multiple workers poll simultaneously.
 *
 * Returns the claimed job, or null if no pending jobs exist.
 */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  // Find the oldest pending job
  const pending = await db.executionJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (!pending) return null;

  // Atomic claim: only succeeds if status is still 'pending'
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  const updated = await db.executionJob.updateMany({
    where: { id: pending.id, status: "pending" },
    data: {
      status: "claimed",
      workerId,
      claimedAt: now,
      leaseExpiresAt,
      lastHeartbeat: now,
      attempts: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    // Another worker claimed it first — try again
    return claimNextJob(workerId);
  }

  const job = await db.executionJob.findUnique({ where: { id: pending.id } });
  if (!job) return null;

  return {
    job: toJobDTO(job),
    agentContext: readJSON<AgentContext>(job.agentContextJson, {} as AgentContext),
    plan: readJSON<{ kinds: TaskKind[]; reasoning: string }>(job.planJson, { kinds: [], reasoning: "" }),
    taskId: job.taskId,
    workspaceId: job.workspaceId,
    title: job.title,
    jobId: job.id,
  };
}

export interface ClaimedJob {
  job: JobDTO;
  agentContext: AgentContext;
  plan: { kinds: TaskKind[]; reasoning: string };
  taskId: string;
  workspaceId: string;
  title: string;
  jobId: string;
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

/**
 * Renew the lease on a claimed job. The worker calls this periodically
 * (every HEARTBEAT_INTERVAL_MS) to prove it's still alive. If the worker
 * crashes, the lease expires and the job becomes reclaimable.
 */
export async function heartbeat(
  jobId: string,
  workerId: string
): Promise<boolean> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  const result = await db.executionJob.updateMany({
    where: {
      id: jobId,
      workerId,
      status: { in: ["claimed", "running"] },
    },
    data: {
      lastHeartbeat: now,
      leaseExpiresAt,
      status: "running",
    },
  });
  return result.count > 0;
}

// ─── Complete ────────────────────────────────────────────────────────────────

/**
 * Mark a job as completed. Stores the execution result JSON.
 */
export async function completeJob(
  jobId: string,
  workerId: string,
  result: Record<string, unknown>
): Promise<boolean> {
  const now = new Date();
  const result2 = await db.executionJob.updateMany({
    where: {
      id: jobId,
      workerId,
      status: { in: ["claimed", "running"] },
    },
    data: {
      status: "completed",
      completedAt: now,
      result: writeJSON(result),
      leaseExpiresAt: null,
    },
  });
  if (result2.count > 0) {
    await emit("info", "runtime", `Job completed: ${jobId}`, { jobId });
  }
  return result2.count > 0;
}

// ─── Fail ────────────────────────────────────────────────────────────────────

/**
 * Mark a job as failed. If attempts < maxAttempts, the job is requeued
 * (status → pending) for retry. If attempts >= maxAttempts, the job is
 * dead-lettered.
 */
export async function failJob(
  jobId: string,
  workerId: string,
  error: string
): Promise<{ requeued: boolean; deadLettered: boolean }> {
  const job = await db.executionJob.findUnique({ where: { id: jobId } });
  if (!job) return { requeued: false, deadLettered: false };

  const shouldDeadLetter = job.attempts >= job.maxAttempts;
  const now = new Date();

  if (shouldDeadLetter) {
    await db.executionJob.update({
      where: { id: jobId },
      data: {
        status: "dead_lettered",
        error,
        deadLetterReason: `Exceeded max attempts (${job.maxAttempts})`,
        completedAt: now,
        leaseExpiresAt: null,
      },
    });
    await emit("warn", "runtime", `Job dead-lettered: ${jobId}`, {
      jobId,
      attempts: job.attempts,
      error,
    });
    return { requeued: false, deadLettered: true };
  }

  // Requeue for retry
  await db.executionJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      error,
      workerId: null,
      leaseExpiresAt: null,
      lastHeartbeat: null,
    },
  });
  await emit("warn", "runtime", `Job requeued for retry: ${jobId}`, {
    jobId,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error,
  });
  return { requeued: true, deadLettered: false };
}

// ─── Recover orphaned jobs ───────────────────────────────────────────────────

/**
 * Find jobs whose lease has expired (worker crashed or stopped heartbeating)
 * and requeue them for retry. Called on server boot and periodically.
 *
 * A job is orphaned if:
 *   - status is 'claimed' or 'running'
 *   - leaseExpiresAt < now - ORPHAN_THRESHOLD_MS
 */
export async function recoverOrphanedJobs(): Promise<number> {
  const threshold = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
  const orphans = await db.executionJob.findMany({
    where: {
      status: { in: ["claimed", "running"] },
      leaseExpiresAt: { lt: threshold },
    },
  });

  let recovered = 0;
  for (const orphan of orphans) {
    if (orphan.attempts >= orphan.maxAttempts) {
      // Dead-letter instead of requeueing
      await db.executionJob.update({
        where: { id: orphan.id },
        data: {
          status: "dead_lettered",
          error: "Orphaned (lease expired, max attempts reached)",
          deadLetterReason: `Worker ${orphan.workerId} stopped heartbeating; lease expired at ${orphan.leaseExpiresAt?.toISOString()}`,
          completedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
      await emit("warn", "runtime", `Orphaned job dead-lettered: ${orphan.id}`, {
        jobId: orphan.id,
        workerId: orphan.workerId,
      });
    } else {
      // Requeue for retry
      await db.executionJob.update({
        where: { id: orphan.id },
        data: {
          status: "pending",
          workerId: null,
          leaseExpiresAt: null,
          lastHeartbeat: null,
          error: `Orphaned (lease expired, retry ${orphan.attempts}/${orphan.maxAttempts})`,
        },
      });
      await emit("warn", "runtime", `Orphaned job recovered: ${orphan.id}`, {
        jobId: orphan.id,
        attempts: orphan.attempts,
      });
      recovered++;
    }
  }
  return recovered;
}

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * WS4: Dead-Letter Recovery — automatically requeue dead-lettered jobs after
 * a delay. This gives providers time to recover (circuit breaker to close)
 * before retrying. Called from the system health check.
 */
export async function recoverDeadLetteredJobs(): Promise<number> {
  const threshold = new Date(Date.now() - DEAD_LETER_RETRY_DELAY_MS);
  const deadLettered = await db.executionJob.findMany({
    where: {
      status: "dead_lettered",
      updatedAt: { lt: threshold }, // only retry jobs dead-lettered > 60s ago
    },
    take: 5, // limit recovery rate
  });

  let recovered = 0;
  for (const dl of deadLettered) {
    await db.executionJob.update({
      where: { id: dl.id },
      data: {
        status: "pending",
        attempts: 0, // reset attempts for fresh retry
        error: null,
        deadLetterReason: null,
        workerId: null,
        leaseExpiresAt: null,
        lastHeartbeat: null,
      },
    });
    recovered++;
    await emit("info", "runtime", `Dead-lettered job auto-recovered: ${dl.title}`, {
      jobId: dl.id,
      deadLetterReason: dl.deadLetterReason,
    });
  }
  return recovered;
}

export async function getJob(jobId: string): Promise<JobDTO | null> {
  const job = await db.executionJob.findUnique({ where: { id: jobId } });
  return job ? toJobDTO(job) : null;
}

export async function getJobByTaskId(taskId: string): Promise<JobDTO | null> {
  const job = await db.executionJob.findUnique({ where: { taskId } });
  return job ? toJobDTO(job) : null;
}

export async function listJobs(opts: {
  status?: string;
  limit?: number;
} = {}): Promise<JobDTO[]> {
  const jobs = await db.executionJob.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  });
  return jobs.map(toJobDTO);
}

export async function getDeadLetterJobs(limit = 50): Promise<JobDTO[]> {
  const jobs = await db.executionJob.findMany({
    where: { status: "dead_lettered" },
    orderBy: { updatedAt: "desc" },
    take: Math.min(limit, 200),
  });
  return jobs.map(toJobDTO);
}

/**
 * Requeue a dead-lettered job manually (admin operation).
 */
export async function requeueDeadLetter(jobId: string): Promise<boolean> {
  const result = await db.executionJob.updateMany({
    where: { id: jobId, status: "dead_lettered" },
    data: {
      status: "pending",
      attempts: 0,
      error: null,
      deadLetterReason: null,
      workerId: null,
      leaseExpiresAt: null,
      lastHeartbeat: null,
      completedAt: null,
    },
  });
  return result.count > 0;
}

export const QUEUE_CONSTANTS = {
  LEASE_DURATION_MS,
  HEARTBEAT_INTERVAL_MS,
  ORPHAN_THRESHOLD_MS,
  DEAD_LETER_RETRY_DELAY_MS,
};
