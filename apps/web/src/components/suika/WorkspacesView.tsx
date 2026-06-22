/** SUIKA X — Workspace System view. */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, StatusDot, timeAgo } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, FolderKanban, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspacesView() {
  const qc = useQueryClient();
  const setWorkspace = useSuika((s) => s.setWorkspace);
  const activeWs = useSuika((s) => s.workspaceId);
  const bump = useSuika((s) => s.bump);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const list = useQuery({ queryKey: ["workspaces"], queryFn: () => api.workspaces.list(), refetchInterval: 8000 });

  const create = useMutation({
    mutationFn: () => api.workspaces.create({ name, description: desc }),
    onSuccess: (w) => {
      toast.success("Workspace created");
      setName("");
      setDesc("");
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.workspaces.activate(id),
    onSuccess: (w) => {
      toast.success(`Activated: ${w.name}`);
      setWorkspace(w.id);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const spaces = list.data?.workspaces ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard
          title="Workspaces"
          desc="Each workspace is an isolated cognitive context (entities, memories, agents, tasks)"
          right={<Tag tone="emerald">{spaces.length} total</Tag>}
          bodyClassName="p-3"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {spaces.map((w) => {
              const isActive = (activeWs ?? (spaces.find((s) => s.active)?.id ?? null)) === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => activate.mutate(w.id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    isActive ? "border-emerald-500/40 bg-emerald-500/5 suika-glow" : "border-border/50 bg-card/40 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-emerald-400" />
                      <div>
                        <p className="text-sm font-semibold">{w.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{w.id.slice(0, 12)}…</p>
                      </div>
                    </div>
                    {isActive && <Check className="h-4 w-4 text-emerald-400" />}
                  </div>
                  {w.description && <p className="mt-2 text-xs text-muted-foreground">{w.description}</p>}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <StatusDot tone={w.active ? "emerald" : "muted"} pulse={w.active} />
                    <span>{w.active ? "active" : "inactive"}</span>
                    <span>· created {timeAgo(w.createdAt)} ago</span>
                  </div>
                </button>
              );
            })}
            {spaces.length === 0 && <div className="col-span-2 p-6 text-center text-sm text-muted-foreground">No workspaces yet.</div>}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="New workspace" desc="Spin up an isolated cognitive context">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. research-alpha" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="what is this workspace for?" />
          </div>
          <Button size="sm" className="w-full" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            <Plus className="h-4 w-4" /> Create workspace
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Active workspace scopes every subsystem view. Switch by clicking a card.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
