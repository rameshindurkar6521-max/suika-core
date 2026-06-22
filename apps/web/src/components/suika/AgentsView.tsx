/** SUIKA X — Agent Runtime view: registry, dispatch, task DAG tree. */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, Meter, StatusDot, timeAgo } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Bot, Plus, Rocket, Wallet, Star, CheckCircle2, XCircle, Loader2, Circle, Layers, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskDTO, AgentContext } from "@/lib/suika/types";

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-rose-400" />,
};

function TaskTree({ task, children }: { task: TaskDTO; children: TaskDTO[] }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-xs">
        {statusIcon[task.status]}
        <span className="font-mono text-[10px] text-muted-foreground">[{task.kind}]</span>
        <span className="flex-1 truncate">{task.title}</span>
        {task.durationMs > 0 && <span className="font-mono text-[10px] text-muted-foreground">{task.durationMs}ms</span>}
        <Tag tone={task.status === "success" ? "emerald" : task.status === "failed" ? "rose" : task.status === "running" ? "amber" : "muted"}>{task.status}</Tag>
      </div>
      {children.length > 0 && (
        <div className="ml-4 border-l border-border/40 pl-3">
          {children.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1 text-xs">
              {statusIcon[c.status]}
              <span className="font-mono text-[10px] text-muted-foreground">[{c.kind}]</span>
              <span className="flex-1 truncate">{c.title}</span>
              {c.durationMs > 0 && <span className="font-mono text-[10px] text-muted-foreground">{c.durationMs}ms</span>}
              <Tag tone={c.status === "success" ? "emerald" : c.status === "failed" ? "rose" : "muted"}>{c.status}</Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentsView() {
  const qc = useQueryClient();
  const ws = useSuika((s) => s.workspaceId) ?? undefined;
  const bump = useSuika((s) => s.bump);

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [title, setTitle] = useState("Analyze the knowledge fabric topology");
  const [kind, setKind] = useState("reason");
  const [decompose, setDecompose] = useState(true);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newCaps, setNewCaps] = useState("");

  const agents = useQuery({
    queryKey: ["agents", ws],
    queryFn: () => api.agents.list({ ws }),
    refetchInterval: 6000,
  });

  const tasks = useQuery({
    queryKey: ["tasks", ws],
    queryFn: () => api.tasks.list({ ws }),
    refetchInterval: 5000,
  });

  const selectedTask = useQuery({
    queryKey: ["task-tree", selectedAgent],
    queryFn: () => {
      // find latest root task for the selected agent
      const agentTasks = tasks.data?.tasks.filter((t) => t.agentId === selectedAgent && !t.parentId) ?? [];
      const latest = agentTasks[0];
      if (!latest) return null;
      return api.tasks.get(latest.id);
    },
    enabled: !!selectedAgent && !!tasks.data,
  });

  const dispatch = useMutation({
    mutationFn: () => {
      if (!selectedAgent) return Promise.reject(new Error("Select an agent first"));
      return api.agents.dispatch(selectedAgent, { title, kind, decompose });
    },
    onSuccess: (d) => {
      toast.success(`Dispatched: ${d.task.title} (${d.children.length} subtasks)`);
      qc.invalidateQueries({ queryKey: ["tasks", ws] });
      qc.invalidateQueries({ queryKey: ["agents", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createAgent = useMutation({
    mutationFn: () =>
      api.agents.create({
        name: newName,
        role: newRole,
        capabilities: newCaps.split(",").map((c) => c.trim()).filter(Boolean),
        workspaceId: ws,
      }),
    onSuccess: () => {
      toast.success("Agent registered");
      setNewName("");
      setNewRole("");
      setNewCaps("");
      qc.invalidateQueries({ queryKey: ["agents", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const agentList = agents.data?.agents ?? [];
  const taskList = tasks.data?.tasks ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          title="Agent cohort"
          desc={`${agentList.length} agents · ${agentList.filter((a) => a.status === "busy").length} busy`}
          className="xl:col-span-2"
          bodyClassName="p-3"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {agentList.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  selectedAgent === a.id
                    ? "border-emerald-500/40 bg-emerald-500/5 suika-glow"
                    : "border-border/50 bg-card/40 hover:border-border hover:bg-muted/30"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-emerald-500/10 p-1.5"><Bot className="h-3.5 w-3.5 text-emerald-400" /></div>
                    <div>
                      <p className="text-sm font-semibold">{a.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{a.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot tone={a.status === "busy" ? "amber" : a.status === "error" ? "rose" : "emerald"} pulse={a.status === "busy"} />
                    <span className="text-[10px] text-muted-foreground">{a.status}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.capabilities.map((c) => (
                    <span key={c} className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{c}</span>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <div className="flex items-center gap-1 text-muted-foreground"><Star className="h-3 w-3" /> rep</div>
                    <div className="font-mono">{a.reputation.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-muted-foreground"><Wallet className="h-3 w-3" /> wallet</div>
                    <div className="font-mono">{a.wallet.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">gen</div>
                    <div className="font-mono">{a.generation}</div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground">
                  <span className="text-emerald-400">{a.tasksCompleted} ok</span>
                  <span className="text-rose-400">{a.tasksFailed} fail</span>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Dispatch task" desc="Execute a task DAG on the selected agent">
            <div className="space-y-3">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2 text-xs">
                {selectedAgent ? (
                  <span>Target: <span className="font-semibold text-emerald-300">{agentList.find((a) => a.id === selectedAgent)?.name}</span></span>
                ) : (
                  <span className="text-muted-foreground">Select an agent →</span>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kind</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["execute", "reason", "retrieve", "synthesize"].map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 p-2">
                <div>
                  <Label className="text-xs">Decompose into DAG</Label>
                  <p className="text-[10px] text-muted-foreground">Spawn subtasks by kind pattern</p>
                </div>
                <Switch checked={decompose} onCheckedChange={setDecompose} />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={!selectedAgent || dispatch.isPending}
                onClick={() => dispatch.mutate()}
              >
                <Rocket className="h-4 w-4" /> Dispatch
              </Button>
              {dispatch.isPending && <p className="text-center text-[10px] text-amber-400">Executing DAG…</p>}
            </div>
          </SectionCard>

          <SectionCard title="Register agent" desc="Add a new agent to the runtime">
            <div className="space-y-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name e.g. Weaver-7" />
              <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="role e.g. graph.weaver" />
              <Input value={newCaps} onChange={(e) => setNewCaps(e.target.value)} placeholder="capabilities: embed, traverse" />
              <Button size="sm" variant="outline" className="w-full" disabled={!newName || !newRole || createAgent.isPending} onClick={() => createAgent.mutate()}>
                <Plus className="h-4 w-4" /> Register
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Latest task DAG" desc="Most recent root task + children for the selected agent" bodyClassName="p-3">
          {selectedTask.data ? (
            <TaskTree task={selectedTask.data.task} children={selectedTask.data.children} />
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              {selectedAgent ? "No tasks yet — dispatch one." : "Select an agent to view its DAG."}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Task ledger" desc="All tasks, newest first" bodyClassName="p-0">
          <ScrollArea className="suika-scroll max-h-80">
            <ul className="divide-y divide-border/40">
              {taskList.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  {statusIcon[t.status]}
                  <span className="font-mono text-[10px] text-muted-foreground">[{t.kind}]</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.durationMs > 0 && <span className="font-mono text-[10px] text-muted-foreground">{t.durationMs}ms</span>}
                  <span className="font-mono text-[10px] text-muted-foreground">{timeAgo(t.createdAt)}</span>
                </li>
              ))}
              {taskList.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No tasks yet.</li>}
            </ul>
          </ScrollArea>
        </SectionCard>
      </div>

      <AgentContextPreview title={title} />
    </div>
  );
}

/** AgentContext preview panel — shows the unified context that would be
 *  injected into a planning agent for the current dispatch title. Read-only. */
function AgentContextPreview({ title }: { title: string }) {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["agent-context-preview", title, tick],
    queryFn: () => api.agents.previewContext(title || undefined),
    refetchInterval: 10000,
  });
  const ctx: AgentContext | undefined = data?.context;

  return (
    <SectionCard
      title="Agent Context Injection"
      desc="The unified context every planning agent receives before creating a task DAG. Constitution (authority) → Identity (personality) → Relationship (user-understanding) → Goals (objective) → Memory (experience)."
      right={
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-emerald-400" />
          <Tag tone="emerald">5 layers</Tag>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : !ctx ? (
        <p className="p-4 text-center text-sm text-muted-foreground">No context available.</p>
      ) : (
        <div className="space-y-3">
          {/* Layer chips */}
          <div className="flex flex-wrap gap-2">
            <Tag tone={ctx.constitution.verdict === "compliant" ? "emerald" : ctx.constitution.verdict === "warning" ? "amber" : "rose"}>
              Authority: {ctx.constitution.verdict}
            </Tag>
            <Tag tone="sky">{ctx.identity ? `Personality: ${ctx.identity.name} v${ctx.identity.version}` : "Personality: (none)"}</Tag>
            <Tag tone="violet">{ctx.relationship ? `User: ${ctx.relationship.profile.name}` : "User: (none)"}</Tag>
            <Tag tone="amber">Objectives: {ctx.goals.length} goals</Tag>
            <Tag tone="rose">Experience: {ctx.memories.length} memories</Tag>
          </div>

          {/* Summary digest */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-xs text-foreground/90">{ctx.summary}</p>
          </div>

          {/* Layer details grid */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {/* Identity */}
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                <Eye className="h-3 w-3" /> Identity (personality)
              </p>
              {ctx.identity ? (
                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">persona:</span> {ctx.identity.persona.slice(0, 60)}{ctx.identity.persona.length > 60 ? "…" : ""}</p>
                  <p><span className="text-muted-foreground">tone:</span> {ctx.identity.communicationStyle.tone} · <span className="text-muted-foreground">pace:</span> {ctx.identity.communicationStyle.pace}</p>
                  <p><span className="text-muted-foreground">traits:</span> {ctx.identity.longTermTraits.slice(0, 4).join(", ")}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">(no active identity)</p>
              )}
            </div>

            {/* Relationship */}
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                <Eye className="h-3 w-3" /> Relationship (user)
              </p>
              {ctx.relationship ? (
                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">name:</span> {ctx.relationship.profile.name}</p>
                  <p><span className="text-muted-foreground">top skills:</span> {ctx.relationship.topSkills.map((s) => s.name).join(", ") || "none"}</p>
                  <p><span className="text-muted-foreground">recent:</span> {ctx.relationship.recentInteractions[0]?.summary.slice(0, 50) || "none"}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">(no relationship profile)</p>
              )}
            </div>

            {/* Goals (objective) */}
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Eye className="h-3 w-3" /> Goals (objective)
              </p>
              {ctx.goals.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {ctx.goals.slice(0, 3).map((g) => (
                    <li key={g.id} className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground">P{g.priority}</span>
                      <span className="truncate">{g.title}</span>
                    </li>
                  ))}
                  {ctx.goals.length > 3 && <li className="text-[10px] text-muted-foreground">+{ctx.goals.length - 3} more</li>}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">(no active goals)</p>
              )}
            </div>

            {/* Projects */}
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Eye className="h-3 w-3" /> Projects (execution)
              </p>
              {ctx.projects.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {ctx.projects.slice(0, 3).map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-emerald-400">{p.progress}%</span>
                      <span className="truncate">{p.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">(no active projects)</p>
              )}
            </div>

            {/* Memory (experience) */}
            <div className="rounded-lg border border-border/50 bg-card/40 p-3 md:col-span-2">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                <Eye className="h-3 w-3" /> Memory (experience) — ranked by relevance to &quot;{title || "preview"}&quot;
              </p>
              {ctx.memories.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {ctx.memories.map((m) => (
                    <li key={m.id} className="flex items-start gap-2">
                      <Tag tone={m.kind === "episodic" ? "rose" : m.kind === "semantic" ? "emerald" : "amber"}>{m.kind}</Tag>
                      <span className="flex-1 truncate text-foreground/80">{m.content}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{m.effectiveScore.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">(no relevant memories)</p>
              )}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
