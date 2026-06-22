/** SUIKA X — Operations & Observability view.
 *
 *  5 tabs:
 *    1. Job Queue Dashboard — pending/claimed/running/completed/failed/dead-letter
 *    2. Execution Trace Explorer — prompt, model, latency, tokens, retries, memory
 *    3. Planner Inspector — context, signals, DAG, reasoning
 *    4. Worker Supervisor — worker status, heartbeat, leases, recovery
 *    5. Audit Timeline — constitution, identity, events, jobs in one stream
 *
 *  Success criteria: a user can watch a task travel from
 *    dispatch → plan → queue → worker → LLM → memory
 *  in real time.
 */
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, Meter, StatusDot, timeAgo } from "./primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Radar, ListChecks, GitBranch, Cpu, HardDrive, Clock,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Circle, Activity,
  Bot, Wrench, Network,
} from "lucide-react";
import { cn } from "@/lib/utils";

const jobStatusTone: Record<string, "emerald" | "rose" | "amber" | "sky" | "violet" | "muted"> = {
  pending: "amber",
  claimed: "sky",
  running: "sky",
  completed: "emerald",
  failed: "rose",
  dead_lettered: "violet",
};

const jobStatusIcon: Record<string, React.ReactNode> = {
  pending: <Circle className="h-3.5 w-3.5 text-amber-400" />,
  claimed: <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-rose-400" />,
  dead_lettered: <AlertTriangle className="h-3.5 w-3.5 text-violet-400" />,
};

// ─── 1. Job Queue Dashboard ──────────────────────────────────────────────────

function JobQueueDashboard() {
  const tick = useSuika((s) => s.tick);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ops-jobs", statusFilter, tick],
    queryFn: () => api.operations.listJobs(statusFilter !== "all" ? statusFilter : undefined),
    refetchInterval: 3000,
  });
  const jobs = data?.jobs ?? [];

  const selectedJob = useQuery({
    queryKey: ["ops-job-detail", selectedJobId, tick],
    queryFn: () => api.operations.getJob(selectedJobId!),
    enabled: !!selectedJobId,
    refetchInterval: 3000,
  });

  // Also fetch task detail for traces
  const taskDetail = useQuery({
    queryKey: ["ops-task-detail", selectedJob?.data?.job?.taskId, tick],
    queryFn: () => api.operations.getTask(selectedJob?.data?.job?.taskId!),
    enabled: !!selectedJob?.data?.job?.taskId,
    refetchInterval: 3000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "pending", "claimed", "running", "completed", "failed", "dead_lettered"].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{jobs.length} jobs</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Job Queue" desc="Durable execution jobs — real-time status" bodyClassName="p-0">
          <ScrollArea className="suika-scroll max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card/95 text-left text-muted-foreground backdrop-blur">
                <tr>
                  <th className="p-2 pl-3 font-medium">Status</th>
                  <th className="p-2 font-medium">Title</th>
                  <th className="p-2 font-medium">Attempts</th>
                  <th className="p-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {jobs.map((j: any) => (
                  <tr
                    key={j.id}
                    className={cn("cursor-pointer hover:bg-muted/30", selectedJobId === j.id && "bg-emerald-500/10")}
                    onClick={() => setSelectedJobId(j.id)}
                  >
                    <td className="p-2 pl-3">
                      <div className="flex items-center gap-1.5">
                        {jobStatusIcon[j.status]}
                        <Tag tone={jobStatusTone[j.status]}>{j.status}</Tag>
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate p-2">{j.title}</td>
                    <td className="p-2 font-mono">{j.attempts}/{j.maxAttempts}</td>
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">{timeAgo(j.updatedAt)}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No jobs.</td></tr>}
              </tbody>
            </table>
          </ScrollArea>
        </SectionCard>

        <SectionCard title="Job Detail + Execution Trace" desc="Click a job to inspect its execution" bodyClassName="p-3">
          {!selectedJob?.data?.job ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Select a job →</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-xs">
                <div className="flex items-center gap-2">
                  {jobStatusIcon[selectedJob.data.job.status]}
                  <span className="font-semibold">{selectedJob.data.job.title}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                  <span>jobId: {selectedJob.data.job.id.slice(0, 16)}…</span>
                  <span>taskId: {selectedJob.data.job.taskId?.slice(0, 16)}…</span>
                  <span>worker: {selectedJob.data.job.workerId || "—"}</span>
                  <span>attempts: {selectedJob.data.job.attempts}/{selectedJob.data.job.maxAttempts}</span>
                  {selectedJob.data.job.leaseExpiresAt && <span>lease: {timeAgo(selectedJob.data.job.leaseExpiresAt)}</span>}
                  {selectedJob.data.job.error && <span className="text-rose-400">error: {selectedJob.data.job.error.slice(0, 60)}</span>}
                </div>
              </div>

              {/* Execution traces from task output */}
              {taskDetail?.data?.task?.output?.traces && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Execution Traces</p>
                  <ScrollArea className="suika-scroll max-h-60">
                    <ul className="space-y-1.5">
                      {taskDetail.data.task.output.traces.map((t: any, i: number) => (
                        <li key={i} className="rounded border border-border/40 bg-card/30 p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-emerald-400">[{t.stepKind}]</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{t.model}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{t.latencyMs}ms</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{t.tokensIn}↑/{t.tokensOut}↓</span>
                            {t.retries > 0 && <Tag tone="amber">retry×{t.retries}</Tag>}
                            {t.fallbackUsed && <Tag tone="amber">fallback</Tag>}
                            {t.success ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3 text-rose-400" />}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{t.output?.slice(0, 120)}…</p>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}

              {/* Memory write-back */}
              {taskDetail?.data?.task?.output?.memoryId && (
                <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs">
                  <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-400" />
                  Memory written: <span className="font-mono text-[10px]">{taskDetail.data.task.output.memoryId.slice(0, 20)}…</span>
                  <span className="ml-2 text-muted-foreground">{taskDetail.data.task.output.totalTokensOut} tokens · {taskDetail.data.task.output.totalLatencyMs}ms</span>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── 2. Execution Trace Explorer ─────────────────────────────────────────────

function TraceExplorer() {
  const tick = useSuika((s) => s.tick);
  const [jobId, setJobId] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["ops-trace", jobId, tick],
    queryFn: async () => {
      if (!jobId) return null;
      const jobRes = await api.operations.getJob(jobId);
      if (!jobRes.job?.taskId) return null;
      const taskRes = await api.operations.getTask(jobRes.job.taskId);
      return { job: jobRes.job, task: taskRes.task, children: taskRes.children };
    },
    enabled: !!jobId,
    refetchInterval: 3000,
  });

  // Also list recent completed jobs for quick selection
  const recentJobs = useQuery({
    queryKey: ["ops-recent-jobs", tick],
    queryFn: () => api.operations.listJobs("completed"),
    refetchInterval: 10000,
  });

  return (
    <SectionCard title="Execution Trace Explorer" desc="Inspect the full execution path: prompt → model → latency → tokens → retries → memory">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="paste job ID or pick from recent…"
            className="h-8 flex-1 font-mono text-xs"
          />
          {recentJobs.data?.jobs?.[0] && (
            <Select onValueChange={setJobId}>
              <SelectTrigger className="h-8 w-48"><SelectValue placeholder="recent completions" /></SelectTrigger>
              <SelectContent>
                {recentJobs.data.jobs.slice(0, 10).map((j: any) => (
                  <SelectItem key={j.id} value={j.id}>{j.title.slice(0, 30)}…</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!data ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Enter a job ID to explore traces.</div>
        ) : (
          <div className="space-y-3">
            {/* Job summary */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-card/40 p-3 text-xs">
              <Tag tone={jobStatusTone[data.job.status]}>{data.job.status}</Tag>
              <span className="font-semibold">{data.job.title}</span>
              <span className="font-mono text-[10px] text-muted-foreground">attempts: {data.job.attempts}</span>
              {data.task?.output?.totalLatencyMs && <span className="font-mono text-[10px] text-muted-foreground">{data.task.output.totalLatencyMs}ms total</span>}
              {data.task?.output?.totalTokensOut && <span className="font-mono text-[10px] text-muted-foreground">{data.task.output.totalTokensOut} tokens out</span>}
              {data.task?.output?.memoryId && <Tag tone="emerald">memory written</Tag>}
            </div>

            {/* Step-by-step traces */}
            {data.task?.output?.traces && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">DAG Execution Steps</p>
                {data.task.output.traces.map((t: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border/50 bg-card/30 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-[10px] text-emerald-400">Step {t.stepIndex + 1}</span>
                      <Tag tone="sky">{t.stepKind}</Tag>
                      <span className="font-mono text-[10px] text-muted-foreground">model: {t.model}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">latency: {t.latencyMs}ms</span>
                      <span className="font-mono text-[10px] text-muted-foreground">tokens: {t.tokensIn}↑/{t.tokensOut}↓</span>
                      {t.retries > 0 && <Tag tone="amber">retries: {t.retries}</Tag>}
                      {t.fallbackUsed && <Tag tone="amber">fallback</Tag>}
                      {t.success ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                    </div>
                    {/* Prompt preview */}
                    <div className="mt-2">
                      <p className="text-[10px] text-muted-foreground">Prompt (first 200 chars):</p>
                      <pre className="mt-0.5 max-h-20 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-1.5 text-[10px] suika-scroll">{t.prompt?.slice(0, 200)}…</pre>
                    </div>
                    {/* Output preview */}
                    <div className="mt-2">
                      <p className="text-[10px] text-muted-foreground">Output (first 200 chars):</p>
                      <pre className="mt-0.5 max-h-20 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-1.5 text-[10px] suika-scroll">{t.output?.slice(0, 200)}…</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pipeline visualization */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
              <span className="text-muted-foreground">Pipeline:</span>
              <Tag tone="amber">dispatch</Tag>
              <span className="text-muted-foreground">→</span>
              <Tag tone="sky">plan</Tag>
              <span className="text-muted-foreground">→</span>
              <Tag tone="sky">queue</Tag>
              <span className="text-muted-foreground">→</span>
              <Tag tone="sky">worker</Tag>
              <span className="text-muted-foreground">→</span>
              <Tag tone="emerald">LLM ({data.task?.output?.traces?.length || 0} steps)</Tag>
              <span className="text-muted-foreground">→</span>
              {data.task?.output?.memoryId ? <Tag tone="emerald">memory ✅</Tag> : <Tag tone="muted">memory (pending)</Tag>}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── 3. Planner Inspector ────────────────────────────────────────────────────

function PlannerInspector() {
  const [title, setTitle] = useState("Explain how the knowledge fabric works");
  const [kind, setKind] = useState("reason");
  const [runTitle, setRunTitle] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ops-planner", runTitle, kind],
    queryFn: () => api.operations.plannerInspect(runTitle || title, kind),
    enabled: !!runTitle,
  });

  return (
    <SectionCard title="Planner Inspector" desc="See HOW context influences the DAG — without dispatching">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Task title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["reason", "execute", "retrieve", "synthesize"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => setRunTitle(title)} disabled={isLoading}>
            <Activity className="h-4 w-4" /> Inspect
          </Button>
        </div>

        {data && (
          <div className="space-y-3">
            {/* DAG */}
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Planned DAG</p>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {data.plan.dag.map((k: string, i: number) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground">→</span>}
                    <Tag tone="sky">{k}</Tag>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{data.plan.reasoning}</p>
            </div>

            {/* Signals */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {Object.entries(data.plan.signals).map(([key, val]: [string, any]) => (
                <div key={key} className="rounded border border-border/40 bg-card/30 p-2 text-xs">
                  <p className="text-[10px] text-muted-foreground">{key}</p>
                  <p className="font-mono">{typeof val === "number" ? val.toFixed(2) : String(val)}</p>
                  {typeof val === "number" && val > 0 && <Meter value={val} tone={val > 0.5 ? "emerald" : "amber"} />}
                </div>
              ))}
            </div>

            {/* Context layers */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {data.context.identity && (
                <div className="rounded border border-border/40 bg-card/30 p-2 text-xs">
                  <p className="font-semibold text-sky-300">Identity</p>
                  <p>{data.context.identity.name} v{data.context.version} — {data.context.identity.persona}</p>
                  <p className="text-[10px] text-muted-foreground">pace: {data.context.identity.pace} · formality: {data.context.identity.formality}</p>
                  <p className="text-[10px] text-muted-foreground">traits: {data.context.identity.traits?.join(", ")}</p>
                </div>
              )}
              {data.context.relationship && (
                <div className="rounded border border-border/40 bg-card/30 p-2 text-xs">
                  <p className="font-semibold text-violet-300">Relationship</p>
                  <p>Serving: {data.context.relationship.name}</p>
                  <p className="text-[10px] text-muted-foreground">goals: {data.context.relationship.goals} · projects: {data.context.relationship.projects}</p>
                  <p className="text-[10px] text-muted-foreground">skills: {data.context.relationship.topSkills?.join(", ")}</p>
                </div>
              )}
              {data.context.goals?.length > 0 && (
                <div className="rounded border border-border/40 bg-card/30 p-2 text-xs">
                  <p className="font-semibold text-amber-300">Goals (objective)</p>
                  {data.context.goals.map((g: any, i: number) => (
                    <p key={i} className="text-[10px]">P{g.priority} {g.title} ({g.progress}%)</p>
                  ))}
                </div>
              )}
              {data.context.memories?.length > 0 && (
                <div className="rounded border border-border/40 bg-card/30 p-2 text-xs">
                  <p className="font-semibold text-rose-300">Memories (experience)</p>
                  {data.context.memories.map((m: any, i: number) => (
                    <p key={i} className="text-[10px]">[{m.kind}] {m.content}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── 4. Worker Supervisor ────────────────────────────────────────────────────

function WorkerSupervisor() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-workers", tick],
    queryFn: () => api.operations.workerStatus(),
    refetchInterval: 5000,
  });

  const workers = data?.workers ?? [];
  const jobCounts = data?.jobCounts ?? {};
  const recovered = data?.recoveredJobs ?? 0;

  return (
    <div className="space-y-4">
      {/* Job counts by status */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {["pending", "claimed", "running", "completed", "failed", "dead_lettered"].map((s) => (
          <div key={s} className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
            <div className="flex items-center justify-center">{jobStatusIcon[s]}</div>
            <p className="mt-1 font-mono text-lg">{jobCounts[s] || 0}</p>
            <p className="text-[10px] text-muted-foreground">{s}</p>
          </div>
        ))}
      </div>

      {recovered > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-400" />
          {recovered} orphaned job(s) recovered (lease expired)
        </div>
      )}

      <SectionCard title="Workers" desc="Inferred from ExecutionJob table — workers that have claimed jobs" bodyClassName="p-0">
        {workers.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No workers have claimed jobs yet. Start a worker: <code className="rounded bg-muted/40 px-1">cd mini-services/worker && bun index.ts</code></div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-border/40 text-left text-muted-foreground">
              <tr>
                <th className="p-2 pl-3 font-medium">Worker ID</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Last Job</th>
                <th className="p-2 font-medium">Last Seen</th>
                <th className="p-2 font-medium">Lease</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {workers.map((w: any) => (
                <tr key={w.workerId} className="hover:bg-muted/30">
                  <td className="p-2 pl-3 font-mono text-[10px]">{w.workerId}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <StatusDot tone={w.status === "active" ? "emerald" : w.status === "idle" ? "sky" : "muted"} pulse={w.status === "active"} />
                      <span className="text-[10px]">{w.status}</span>
                    </div>
                  </td>
                  <td className="max-w-[150px] truncate p-2 text-muted-foreground">{w.lastJobTitle}</td>
                  <td className="p-2 font-mono text-[10px] text-muted-foreground">{w.lastSeen ? timeAgo(w.lastSeen) : "—"}</td>
                  <td className="p-2">
                    {w.leaseActive ? <Tag tone="emerald">active</Tag> : w.leaseExpiresAt ? <Tag tone="muted">expired</Tag> : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Queue config */}
      {data?.queueConstants && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span>lease: {data.queueConstants.leaseDurationMs / 1000}s</span>
          <span>heartbeat: {data.queueConstants.heartbeatIntervalMs / 1000}s</span>
          <span>orphan threshold: {data.queueConstants.orphanThresholdMs / 1000}s</span>
        </div>
      )}
    </div>
  );
}

// ─── 5. Audit Timeline ───────────────────────────────────────────────────────

function AuditTimeline() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-audit", tick],
    queryFn: () => api.operations.auditTimeline(100),
    refetchInterval: 4000,
  });
  const timeline = data?.timeline ?? [];

  const typeIcon: Record<string, React.ReactNode> = {
    constitution: <Scale className="h-3 w-3 text-emerald-400" />,
    identity: <Cpu className="h-3 w-3 text-sky-400" />,
    event: <Activity className="h-3 w-3 text-amber-400" />,
    job: <HardDrive className="h-3 w-3 text-violet-400" />,
  };

  return (
    <SectionCard
      title="Audit Timeline"
      desc="Unified stream: constitution decisions, identity changes, dispatch lifecycle, memory writes, job events"
      right={
        data?.counts && (
          <div className="flex gap-2 text-[10px]">
            <span>const:{data.counts.constitution}</span>
            <span>ident:{data.counts.identity}</span>
            <span>events:{data.counts.events}</span>
            <span>jobs:{data.counts.jobs}</span>
          </div>
        )
      }
      bodyClassName="p-0"
    >
      <ScrollArea className="suika-scroll max-h-[600px]">
        <ul className="divide-y divide-border/40">
          {timeline.map((e: any, i: number) => (
            <li key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
              <span className="mt-0.5 w-8 shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(e.timestamp)}</span>
              <span className="mt-0.5 shrink-0">{typeIcon[e.type] || <Circle className="h-3 w-3 text-muted-foreground" />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-mono text-[10px] text-emerald-400/70">[{e.source}]</span>{" "}
                  {e.message}
                </p>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <p className="text-[10px] text-muted-foreground/70">
                    {Object.entries(e.metadata).slice(0, 3).map(([k, v]) => `${k}=${String(v).slice(0, 30)}`).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          ))}
          {timeline.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No audit entries.</li>}
        </ul>
      </ScrollArea>
    </SectionCard>
  );
}

// ─── 6. Provider Health Tab ──────────────────────────────────────────────────

function ProviderHealthTab() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-providers", tick],
    queryFn: () => api.operations.providers(),
    refetchInterval: 5000,
  });
  const providers = data?.providers ?? [];

  const circuitTone: Record<string, "emerald" | "rose" | "amber"> = {
    CLOSED: "emerald", OPEN: "rose", HALF_OPEN: "amber",
  };

  return (
    <SectionCard title="Provider Health" desc="Live provider status — circuit state, concurrency, success rate">
      {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> : (
        <div className="space-y-2">
          {providers.map((p: any) => (
            <div key={p.providerId} className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot tone={p.circuitState === "CLOSED" ? "emerald" : p.circuitState === "OPEN" ? "rose" : "amber"} pulse={p.circuitState !== "CLOSED"} />
                  <span className="text-sm font-semibold">{p.displayName}</span>
                  <Tag tone={circuitTone[p.circuitState]}>{p.circuitState}</Tag>
                  {!p.enabled && <Tag tone="muted">disabled</Tag>}
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{p.providerId}</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-xs md:grid-cols-8">
                <div><span className="text-muted-foreground">Concurrent:</span> {p.currentConcurrent}/{p.maxConcurrent}</div>
                <div><span className="text-muted-foreground">Success:</span> {(p.stats.successRate * 100).toFixed(0)}%</div>
                <div><span className="text-muted-foreground">P50:</span> {p.stats.p50}ms</div>
                <div><span className="text-muted-foreground">P95:</span> {p.stats.p95}ms</div>
                <div><span className="text-muted-foreground">Calls:</span> {p.stats.totalCalls}</div>
                <div><span className="text-muted-foreground">429s:</span> {p.stats.rate429s}</div>
                <div><span className="text-muted-foreground">Retries:</span> {p.stats.totalRetries}</div>
                <div><span className="text-muted-foreground">Failures:</span> {p.consecutiveFailures}</div>
              </div>
            </div>
          ))}
          {providers.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No providers configured.</div>}
        </div>
      )}
    </SectionCard>
  );
}

// ─── 7. Provider Metrics Tab ─────────────────────────────────────────────────

function ProviderMetricsTab() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-provider-metrics", tick],
    queryFn: () => api.operations.providers(),
    refetchInterval: 5000,
  });
  const providers = data?.providers ?? [];

  return (
    <SectionCard title="Provider Metrics" desc="Detailed call statistics and token usage">
      {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> : (
        <ScrollArea className="suika-scroll max-h-96">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 text-left text-muted-foreground backdrop-blur">
              <tr>
                <th className="p-2 pl-3 font-medium">Provider</th>
                <th className="p-2 font-medium">Calls</th>
                <th className="p-2 font-medium">Success</th>
                <th className="p-2 font-medium">P50</th>
                <th className="p-2 font-medium">P95</th>
                <th className="p-2 font-medium">P99</th>
                <th className="p-2 font-medium">429s</th>
                <th className="p-2 font-medium">Retries</th>
                <th className="p-2 font-medium">Tokens In</th>
                <th className="p-2 font-medium">Tokens Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {providers.map((p: any) => (
                <tr key={p.providerId} className="hover:bg-muted/30">
                  <td className="p-2 pl-3 font-medium">{p.displayName}</td>
                  <td className="p-2 font-mono">{p.stats.totalCalls}</td>
                  <td className="p-2 font-mono">{(p.stats.successRate * 100).toFixed(0)}%</td>
                  <td className="p-2 font-mono">{p.stats.p50}ms</td>
                  <td className="p-2 font-mono">{p.stats.p95}ms</td>
                  <td className="p-2 font-mono">{p.stats.p99}ms</td>
                  <td className="p-2 font-mono text-rose-400">{p.stats.rate429s}</td>
                  <td className="p-2 font-mono text-amber-400">{p.stats.totalRetries}</td>
                  <td className="p-2 font-mono">{p.stats.tokensIn.toLocaleString()}</td>
                  <td className="p-2 font-mono">{p.stats.tokensOut.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </SectionCard>
  );
}

// ─── 8. Concurrency Control Tab ──────────────────────────────────────────────

function ConcurrencyControlTab() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-concurrency", tick],
    queryFn: () => api.operations.providers(),
    refetchInterval: 3000,
  });
  const providers = data?.providers ?? [];

  return (
    <SectionCard title="Concurrency Control" desc="AIMD-adjusted concurrency limits per provider">
      {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> : (
        <div className="space-y-3">
          {providers.map((p: any) => (
            <div key={p.providerId} className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{p.displayName}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {p.currentConcurrent} / {p.maxConcurrent} concurrent
                </span>
              </div>
              <div className="mt-2">
                <Meter value={p.currentConcurrent / Math.max(1, p.maxConcurrent)} tone="emerald" />
              </div>
              <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                <span>min: {1}</span>
                <span>max limit: {10}</span>
                <span>priority: {p.priority}</span>
                <span>base delay: {2000}ms</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── 9. Circuit Breaker Tab ──────────────────────────────────────────────────

function CircuitBreakerTab() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-circuits", tick],
    queryFn: () => api.operations.providers(),
    refetchInterval: 3000,
  });
  const providers = data?.providers ?? [];

  const circuitColor: Record<string, string> = {
    CLOSED: "text-emerald-400",
    OPEN: "text-rose-400",
    HALF_OPEN: "text-amber-400",
  };

  return (
    <SectionCard title="Circuit Breakers" desc="Per-provider circuit state and failure tracking">
      {isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> : (
        <div className="space-y-2">
          {providers.map((p: any) => (
            <div key={p.providerId} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="flex items-center gap-3">
                <div className={cn("rounded-full border-2 px-3 py-1 text-xs font-bold", p.circuitState === "CLOSED" ? "border-emerald-500/40 text-emerald-400" : p.circuitState === "OPEN" ? "border-rose-500/40 text-rose-400" : "border-amber-500/40 text-amber-400")}>
                  {p.circuitState}
                </div>
                <div>
                  <p className="text-sm font-semibold">{p.displayName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    consecutive failures: {p.consecutiveFailures} / threshold: 3
                  </p>
                </div>
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                <p>recovery timeout: 30s</p>
                <p>opened: {p.circuitState === "OPEN" ? "active" : "—"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── 10. Agent Registry Tab ──────────────────────────────────────────────────

function AgentRegistryTab() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-multi-agents", tick],
    queryFn: () => api.operations.multiAgentList(),
    refetchInterval: 10000,
  });
  const agents = data?.agents ?? [];

  return (
    <SectionCard title="Agent Registry" desc="Multi-agent registry — expertise, cost profiles, execution history" bodyClassName="p-0">
      <ScrollArea className="suika-scroll max-h-96">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card/95 text-left text-muted-foreground backdrop-blur">
            <tr>
              <th className="p-2 pl-3 font-medium">Agent</th>
              <th className="p-2 font-medium">Role</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Rep</th>
              <th className="p-2 font-medium">Tasks</th>
              <th className="p-2 font-medium">Tokens</th>
              <th className="p-2 font-medium">Expertise</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {agents.map((a: any) => (
              <tr key={a.id} className="hover:bg-muted/30">
                <td className="p-2 pl-3 font-medium">{a.name}</td>
                <td className="p-2 text-muted-foreground">{a.role}</td>
                <td className="p-2"><StatusDot tone={a.status === "idle" ? "emerald" : a.status === "busy" ? "amber" : "rose"} /> {a.status}</td>
                <td className="p-2 font-mono">{a.reputation.toFixed(2)}</td>
                <td className="p-2 font-mono">{a.totalTasksAssigned}</td>
                <td className="p-2 font-mono">{a.totalTokensOut.toLocaleString()}</td>
                <td className="p-2">{a.expertise?.map((e: any) => `${e.domain}(${e.level})`).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </SectionCard>
  );
}

// ─── 11. Scheduler Tab ───────────────────────────────────────────────────────

function SchedulerTab() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-scheduler", tick],
    queryFn: () => api.operations.schedulerList(),
    refetchInterval: 5000,
  });
  const schedules = data?.schedules ?? [];

  return (
    <SectionCard title="Scheduler" desc="Durable job scheduler — one-time, recurring, delayed, dependency" bodyClassName="p-0">
      <ScrollArea className="suika-scroll max-h-96">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card/95 text-left text-muted-foreground backdrop-blur">
            <tr>
              <th className="p-2 pl-3 font-medium">Name</th>
              <th className="p-2 font-medium">Type</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Next Run</th>
              <th className="p-2 font-medium">Attempts</th>
              <th className="p-2 font-medium">Task Title</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {schedules.map((s: any) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="p-2 pl-3 font-medium">{s.name}</td>
                <td className="p-2"><Tag tone="sky">{s.type}</Tag></td>
                <td className="p-2"><Tag tone={s.status === "completed" ? "emerald" : s.status === "scheduled" ? "amber" : "rose"}>{s.status}</Tag></td>
                <td className="p-2 font-mono text-[10px]">{s.nextRunAt ? timeAgo(s.nextRunAt) : "—"}</td>
                <td className="p-2 font-mono">{s.attempts}/{s.maxAttempts}</td>
                <td className="max-w-[150px] truncate p-2 text-muted-foreground">{s.taskTitle}</td>
              </tr>
            ))}
            {schedules.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No scheduled jobs.</td></tr>}
          </tbody>
        </table>
      </ScrollArea>
    </SectionCard>
  );
}

// ─── 12. Tool Trace Tab ──────────────────────────────────────────────────────

function ToolTraceTab() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["ops-tools", tick],
    queryFn: () => api.operations.toolList(50),
    refetchInterval: 5000,
  });
  const calls = data?.calls ?? [];

  const toolIcon: Record<string, string> = {
    web_search: "🔍", memory_retrieval: "🧠", db_query: "🗄️",
    planner_inspect: "📋", provider_health: "❤️",
  };

  return (
    <SectionCard title="Tool Traces" desc="Every tool call is traced — web search, memory retrieval, DB query, planner inspect, provider health" bodyClassName="p-0">
      <ScrollArea className="suika-scroll max-h-96">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card/95 text-left text-muted-foreground backdrop-blur">
            <tr>
              <th className="p-2 pl-3 font-medium">Tool</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Latency</th>
              <th className="p-2 font-medium">Agent</th>
              <th className="p-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {calls.map((c: any) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="p-2 pl-3">{toolIcon[c.toolName] || "🔧"} {c.toolName}</td>
                <td className="p-2">{c.success ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-rose-400" />}</td>
                <td className="p-2 font-mono">{c.latencyMs}ms</td>
                <td className="p-2 font-mono text-[10px] text-muted-foreground">{c.agentId?.slice(-8) || "—"}</td>
                <td className="p-2 font-mono text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</td>
              </tr>
            ))}
            {calls.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No tool calls yet.</td></tr>}
          </tbody>
        </table>
      </ScrollArea>
    </SectionCard>
  );
}

// ─── 13. Multi-Agent Execution Graph Tab ─────────────────────────────────────

function MultiAgentGraphTab() {
  const [title, setTitle] = useState("Explain how the knowledge fabric works");
  const [runTitle, setRunTitle] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ops-ma-plan", runTitle],
    queryFn: () => api.operations.multiAgentPlan({ title: runTitle || title }),
    enabled: !!runTitle,
  });

  const plan = data?.plan;

  return (
    <SectionCard title="Multi-Agent Execution Graph" desc="Plan which agent performs which step — delegation, parallelism, assignment">
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Task title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
          </div>
          <Button size="sm" onClick={() => setRunTitle(title)} disabled={isLoading}>
            <Network className="h-4 w-4" /> Plan Multi-Agent
          </Button>
        </div>

        {plan && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs">{plan.reasoning}</p>
              <div className="mt-1 flex gap-2 text-[10px]">
                <Tag tone="emerald">{plan.parallelism}x parallelism</Tag>
                <Tag tone="sky">{plan.steps.length} steps</Tag>
                <Tag tone="amber">{plan.steps.filter((s: any) => s.shouldDelegate).length} delegations</Tag>
              </div>
            </div>

            <div className="space-y-1.5">
              {plan.steps.map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded border border-border/40 bg-card/30 p-2 text-xs">
                  <span className="font-mono text-[10px] text-muted-foreground">Step {i + 1}</span>
                  <Tag tone="sky">{s.kind}</Tag>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{s.assignedRole}</span>
                  {s.assignedAgentId ? (
                    <Tag tone="emerald">assigned</Tag>
                  ) : s.shouldDelegate ? (
                    <Tag tone="amber">delegate</Tag>
                  ) : (
                    <Tag tone="muted">unassigned</Tag>
                  )}
                  {s.canParallelize && <Tag tone="violet">parallel</Tag>}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    deps: {s.dependsOn.length > 0 ? s.dependsOn.map((d: number) => d + 1).join(",") : "none"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function OperationsView() {
  const [tab, setTab] = useState("queue");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-violet-500/5 p-4 suika-glow">
        <div className="rounded-lg bg-emerald-500/15 p-2.5">
          <Radar className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Operations & Observability</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Watch a task travel: dispatch → plan → queue → worker → LLM → memory
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-13">
          <TabsTrigger value="queue" className="text-xs"><ListChecks className="mr-1 h-3.5 w-3.5" /> Jobs</TabsTrigger>
          <TabsTrigger value="traces" className="text-xs"><GitBranch className="mr-1 h-3.5 w-3.5" /> Traces</TabsTrigger>
          <TabsTrigger value="planner" className="text-xs"><Cpu className="mr-1 h-3.5 w-3.5" /> Planner</TabsTrigger>
          <TabsTrigger value="workers" className="text-xs"><HardDrive className="mr-1 h-3.5 w-3.5" /> Workers</TabsTrigger>
          <TabsTrigger value="providers" className="text-xs"><Radar className="mr-1 h-3.5 w-3.5" /> Providers</TabsTrigger>
          <TabsTrigger value="health" className="text-xs"><Activity className="mr-1 h-3.5 w-3.5" /> Health</TabsTrigger>
          <TabsTrigger value="concurrency" className="text-xs"><Cpu className="mr-1 h-3.5 w-3.5" /> Concurrency</TabsTrigger>
          <TabsTrigger value="circuits" className="text-xs"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Circuits</TabsTrigger>
          <TabsTrigger value="agents" className="text-xs"><Bot className="mr-1 h-3.5 w-3.5" /> Agents</TabsTrigger>
          <TabsTrigger value="scheduler" className="text-xs"><Clock className="mr-1 h-3.5 w-3.5" /> Scheduler</TabsTrigger>
          <TabsTrigger value="tools" className="text-xs"><Wrench className="mr-1 h-3.5 w-3.5" /> Tools</TabsTrigger>
          <TabsTrigger value="graph" className="text-xs"><Network className="mr-1 h-3.5 w-3.5" /> Graph</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs"><Clock className="mr-1 h-3.5 w-3.5" /> Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4"><JobQueueDashboard /></TabsContent>
        <TabsContent value="traces" className="mt-4"><TraceExplorer /></TabsContent>
        <TabsContent value="planner" className="mt-4"><PlannerInspector /></TabsContent>
        <TabsContent value="workers" className="mt-4"><WorkerSupervisor /></TabsContent>
        <TabsContent value="providers" className="mt-4"><ProviderHealthTab /></TabsContent>
        <TabsContent value="health" className="mt-4"><ProviderMetricsTab /></TabsContent>
        <TabsContent value="concurrency" className="mt-4"><ConcurrencyControlTab /></TabsContent>
        <TabsContent value="circuits" className="mt-4"><CircuitBreakerTab /></TabsContent>
        <TabsContent value="agents" className="mt-4"><AgentRegistryTab /></TabsContent>
        <TabsContent value="scheduler" className="mt-4"><SchedulerTab /></TabsContent>
        <TabsContent value="tools" className="mt-4"><ToolTraceTab /></TabsContent>
        <TabsContent value="graph" className="mt-4"><MultiAgentGraphTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTimeline /></TabsContent>
      </Tabs>
    </div>
  );
}
