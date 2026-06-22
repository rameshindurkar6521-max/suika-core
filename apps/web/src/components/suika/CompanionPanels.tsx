/**
 * SUIKA X — CompanionPanels (Phase 4.3)
 *
 * Three HUD panels:
 *   1. CompanionStatePanel — personality traits + relationship state + recent decisions
 *   2. ProjectsPanel — project progress, milestones, tasks, blockers (with detail dialog)
 *   3. InitiativesPanel — proposed actions from the Initiative Engine (accept/reject/execute)
 */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GlassPanel, StatusDot } from "@/components/suika/hud-primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, Target, ListTodo, AlertTriangle, Sparkles, Check, X,
  ChevronRight, FolderKanban, Lightbulb, Trophy, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Companion State Panel ─────────────────────────────────────────────────

export function CompanionStatePanel() {
  const { data, refetch } = useQuery({
    queryKey: ["companion", "state"],
    queryFn: async () => {
      const r = await fetch("/api/suika/companion/state");
      return r.json();
    },
    refetchInterval: 5000,
  });

  const traits = data?.traits;
  const relationship = data?.relationship;
  const initiatives = data?.initiatives;
  const recentDecisions = data?.recentDecisions ?? [];

  return (
    <GlassPanel title="Companion State" icon={Brain} className="h-full">
      <div className="space-y-3 p-3">
        {/* Personality traits */}
        {traits && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Personality Vector (v{traits.version})</p>
            <div className="space-y-1.5">
              {[
                ["Curiosity", traits.curiosity, "text-cyan-300"],
                ["Confidence", traits.confidence, "text-emerald-300"],
                ["Focus", traits.focus, "text-amber-300"],
                ["Creativity", traits.creativity, "text-purple-300"],
                ["Empathy", traits.empathy, "text-rose-300"],
                ["Persistence", traits.persistence, "text-blue-300"],
              ].map(([label, val, color]) => (
                <div key={label as string} className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-muted-foreground">{label as string}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-zinc-800">
                    <div className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(val as number) * 100}%`, background: "currentColor" }}
                      // @ts-expect-error — color is dynamic
                      data-color={color} />
                  </div>
                  <span className={cn("w-8 text-right font-mono text-[10px]", color as string)}>{Math.round((val as number) * 100)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relationship state */}
        {relationship && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Relationship</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Stat label="Trust" value={Math.round(relationship.trustLevel * 100)} color="text-emerald-300" suffix="%" />
              <Stat label="Rapport" value={Math.round(relationship.rapportLevel * 100)} color="text-cyan-300" suffix="%" />
              <Stat label="Interactions" value={relationship.totalInteractions} color="text-violet-300" />
              <Stat label="Open Threads" value={relationship.openThreadsCount} color="text-amber-300" />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Engagement: <span className="text-emerald-300">{relationship.engagementTrend}</span>
            </p>
          </div>
        )}

        {/* Recent decisions */}
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Recent Decisions</p>
          <ScrollArea className="h-[120px] suika-scroll">
            <div className="space-y-1">
              {recentDecisions.length === 0 && (
                <p className="text-[10px] text-muted-foreground/60">No decisions logged yet.</p>
              )}
              {recentDecisions.map((d: any) => (
                <div key={d.id} className="rounded-md border border-zinc-800/70 bg-black/30 p-1.5">
                  <p className="truncate text-xs font-medium text-emerald-200">{d.title}</p>
                  {d.rationale && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{d.rationale}</p>}
                  <p className="mt-0.5 text-[9px] text-muted-foreground/60">{new Date(d.decidedAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </GlassPanel>
  );
}

// ─── Projects Panel ────────────────────────────────────────────────────────

export function ProjectsPanel() {
  const { data, refetch } = useQuery({
    queryKey: ["companion", "projects"],
    queryFn: async () => {
      const r = await fetch("/api/suika/companion/projects");
      return r.json();
    },
    refetchInterval: 5000,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projects = data?.projects ?? [];

  return (
    <GlassPanel title="Projects" icon={FolderKanban} className="h-full"
      headerRight={<span className="font-mono text-[10px] text-muted-foreground">{projects.length} active</span>}>
      <ScrollArea className="h-[280px] suika-scroll">
        <div className="space-y-1.5 p-2">
          {projects.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">No projects yet.</p>
          )}
          {projects.map((p: any) => (
            <button key={p.id} onClick={() => setSelectedId(p.id)}
              className="w-full rounded-lg border border-zinc-800/70 bg-black/30 p-2 text-left transition-all hover:border-emerald-500/30 hover:bg-emerald-500/5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-xs font-semibold text-emerald-200">{p.name}</span>
                  <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[8px] text-cyan-300">{p.category}</Badge>
                </div>
                <StatusDot tone={p.status === "active" ? "emerald" : p.status === "completed" ? "blue" : "muted"} />
              </div>
              {p.description && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{p.description}</p>}
              <div className="mt-1.5 flex items-center gap-2">
                <Progress value={p.progress} className="h-1 flex-1" />
                <span className="font-mono text-[10px] text-emerald-300">{p.progress}%</span>
              </div>
              <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-0.5"><Trophy className="h-2 w-2" /> {p.milestones.achieved}/{p.milestones.total}</span>
                <span className="flex items-center gap-0.5"><ListTodo className="h-2 w-2" /> {p.tasks.done}/{p.tasks.total}</span>
                {p.openBlockers > 0 && (
                  <span className="flex items-center gap-0.5 text-rose-300"><AlertTriangle className="h-2 w-2" /> {p.openBlockers}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      <ProjectDetailDialog projectId={selectedId} onClose={() => setSelectedId(null)} onMutated={() => refetch()} />
    </GlassPanel>
  );
}

function ProjectDetailDialog({ projectId, onClose, onMutated }: { projectId: string | null; onClose: () => void; onMutated: () => void }) {
  const { data, refetch } = useQuery({
    queryKey: ["companion", "project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const r = await fetch(`/api/suika/companion/projects/${projectId}`);
      return r.json();
    },
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  return (
    <Dialog open={!!projectId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-emerald-500/30 bg-black/95 text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-300">
            <FolderKanban className="h-4 w-4" /> {data?.name ?? "Project"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">{data?.description}</DialogDescription>
        </DialogHeader>
        {data && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Progress" value={`${data.progress}%`} color="text-emerald-300" />
              <Stat label="Priority" value={data.priority} color="text-amber-300" />
              <Stat label="Blockers" value={data.openBlockers} color="text-rose-300" />
            </div>
            <p className="text-xs text-muted-foreground">Manage milestones, tasks, decisions, and blockers via the companion API.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Initiatives Panel ─────────────────────────────────────────────────────

export function InitiativesPanel() {
  const queryClient = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ["companion", "initiatives"],
    queryFn: async () => {
      const r = await fetch("/api/suika/companion/initiatives?status=proposed&limit=20");
      return r.json();
    },
    refetchInterval: 8000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      // Login first to satisfy middleware
      const loginResp = await fetch("/api/suika/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: "admin", password: "suika-admin-2024" }),
      });
      return loginResp.json();
    },
    onSuccess: async () => {
      const r = await fetch("/api/suika/companion/initiatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxSuggestions: 5 }),
      });
      return r.json();
    },
  });

  const decideMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "accept" | "reject" }) => {
      await fetch("/api/suika/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: "admin", password: "suika-admin-2024" }),
      });
      const r = await fetch(`/api/suika/companion/initiatives/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      return r.json();
    },
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["companion", "state"] }); },
  });

  const executeMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch("/api/suika/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: "admin", password: "suika-admin-2024" }),
      });
      const r = await fetch(`/api/suika/companion/initiatives/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return r.json();
    },
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["companion", "state"] }); },
  });

  const initiatives = data?.initiatives ?? [];

  return (
    <GlassPanel title="Suggested Actions" icon={Lightbulb} className="h-full"
      headerRight={
        <Button size="sm" variant="outline" onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="h-6 gap-1 border-emerald-500/30 px-2 text-[10px] text-emerald-300 hover:bg-emerald-500/10">
          <Sparkles className="h-2.5 w-2.5" />
          {generateMutation.isPending ? "Generating…" : "Generate"}
        </Button>
      }>
      <ScrollArea className="h-[260px] suika-scroll">
        <div className="space-y-1.5 p-2">
          {initiatives.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Lightbulb className="h-5 w-5 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No pending suggestions.</p>
              <p className="text-[10px] text-muted-foreground/60">Click "Generate" to ask SUIKA what's most useful right now.</p>
            </div>
          )}
          {initiatives.map((it: any) => (
            <div key={it.id} className="rounded-lg border border-zinc-800/70 bg-black/30 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={cn("px-1 py-0 text-[8px]",
                      it.kind === "autonomous_workflow" ? "border-emerald-500/40 text-emerald-300" :
                      it.kind === "research_task" ? "border-purple-500/40 text-purple-300" :
                      it.kind === "reminder" ? "border-amber-500/40 text-amber-300" :
                      "border-cyan-500/40 text-cyan-300")}>
                      {it.kind.replace("_", " ")}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">P{it.priority}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-emerald-200">{it.title}</p>
                  {it.description && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{it.description}</p>}
                  {it.rationale && <p className="mt-0.5 line-clamp-2 text-[9px] italic text-muted-foreground/70">Why: {it.rationale}</p>}
                </div>
              </div>
              <div className="mt-2 flex gap-1">
                {(it.kind === "autonomous_workflow" || it.kind === "research_task") && (
                  <Button size="sm" variant="outline"
                    onClick={() => executeMutation.mutate(it.id)}
                    disabled={executeMutation.isPending}
                    className="h-6 gap-1 border-emerald-500/30 px-2 text-[9px] text-emerald-300 hover:bg-emerald-500/10">
                    <Sparkles className="h-2.5 w-2.5" /> Execute
                  </Button>
                )}
                <Button size="sm" variant="outline"
                  onClick={() => decideMutation.mutate({ id: it.id, decision: "accept" })}
                  disabled={decideMutation.isPending}
                  className="h-6 gap-1 border-cyan-500/30 px-2 text-[9px] text-cyan-300 hover:bg-cyan-500/10">
                  <Check className="h-2.5 w-2.5" /> Accept
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => decideMutation.mutate({ id: it.id, decision: "reject" })}
                  disabled={decideMutation.isPending}
                  className="h-6 gap-1 border-rose-500/30 px-2 text-[9px] text-rose-300 hover:bg-rose-500/10">
                  <X className="h-2.5 w-2.5" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </GlassPanel>
  );
}

// ─── Shared Stat ───────────────────────────────────────────────────────────

function Stat({ label, value, color, suffix }: { label: string; value: number | string; color: string; suffix?: string }) {
  return (
    <div className="rounded-md border border-zinc-800/70 bg-black/30 p-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-sm font-bold tabular-nums", color)}>{value}{suffix}</p>
    </div>
  );
}
