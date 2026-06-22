/** SUIKA X — Memory System view: list, retrieve, create, decay, consolidate. */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, Meter, timeAgo } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Plus, Brain, Hourglass, GitMerge } from "lucide-react";

const kindTone: Record<string, "emerald" | "rose" | "amber"> = {
  episodic: "rose",
  semantic: "emerald",
  procedural: "amber",
};

export function MemoryView() {
  const qc = useQueryClient();
  const ws = useSuika((s) => s.workspaceId) ?? undefined;
  const bump = useSuika((s) => s.bump);

  const [kindFilter, setKindFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState("semantic");
  const [tags, setTags] = useState("");

  const list = useQuery({
    queryKey: ["memories", ws, kindFilter, query],
    queryFn: () =>
      api.memory.list({ ws, kind: kindFilter !== "all" ? kindFilter : undefined, q: query || undefined, limit: 60 }),
    refetchInterval: 7000,
  });

  const retrieve = useQuery({
    queryKey: ["retrieve", ws, query],
    queryFn: () => api.memory.retrieve({ query, ws, limit: 8 }),
    enabled: false,
  });

  const create = useMutation({
    mutationFn: () =>
      api.memory.create({
        kind,
        content,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        workspaceId: ws,
      }),
    onSuccess: () => {
      toast.success("Memory stored");
      setContent("");
      setTags("");
      qc.invalidateQueries({ queryKey: ["memories", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const consolidate = useMutation({
    mutationFn: () => api.memory.consolidate(),
    onSuccess: (d) => {
      toast.success(`Consolidated: ${d.applied} groups merged`);
      qc.invalidateQueries({ queryKey: ["memories", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decay = useMutation({
    mutationFn: () => api.memory.decay(),
    onSuccess: (d) => {
      toast.success(`Decay applied to ${d.updated} memories`);
      qc.invalidateQueries({ queryKey: ["memories", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const memories = list.data?.memories ?? [];
  const results = retrieve.data?.results ?? [];

  const runRetrieve = () => {
    if (!query.trim()) return;
    retrieve.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          title="Memory traces"
          desc="Ranked by effective score (importance × decay)"
          className="xl:col-span-2"
          right={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => decay.mutate()} disabled={decay.isPending}>
                <Hourglass className="h-3.5 w-3.5" /> Apply decay
              </Button>
              <Button size="sm" variant="outline" onClick={() => consolidate.mutate()} disabled={consolidate.isPending}>
                <GitMerge className="h-3.5 w-3.5" /> Consolidate
              </Button>
            </div>
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["all", "episodic", "semantic", "procedural"].map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search / rank memories…"
              className="h-8 flex-1"
              onKeyDown={(e) => e.key === "Enter" && setQuery(e.currentTarget.value)}
            />
            <Button size="sm" variant="secondary" onClick={runRetrieve}>
              <Search className="h-3.5 w-3.5" /> Retrieve
            </Button>
          </div>
          <ScrollArea className="suika-scroll max-h-[460px]">
            <ul className="divide-y divide-border/40">
              {memories.map((m) => (
                <li key={m.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Tag tone={kindTone[m.kind]}>{m.kind}</Tag>
                        {m.consolidated && <Tag tone="violet">consolidated</Tag>}
                        <span className="font-mono text-[10px] text-muted-foreground">{timeAgo(m.createdAt)} ago</span>
                        <span className="font-mono text-[10px] text-muted-foreground">· {m.accessCount}×</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm">{m.content}</p>
                      {m.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.tags.map((t) => (
                            <span key={t} className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">#{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-24 shrink-0 space-y-1.5 text-right">
                      <div>
                        <div className="text-[10px] text-muted-foreground">imp {m.importance.toFixed(2)}</div>
                        <Meter value={m.importance} tone="emerald" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">decay {m.decay.toFixed(2)}</div>
                        <Meter value={m.decay} tone="rose" />
                      </div>
                      <div className="pt-0.5 font-mono text-xs text-emerald-300">{m.effectiveScore.toFixed(3)}</div>
                    </div>
                  </div>
                </li>
              ))}
              {memories.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">No memories match.</li>
              )}
            </ul>
          </ScrollArea>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Hybrid retrieval" desc="Embed query → semantic 0.6 + lexical 0.4">
            {results.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-center text-xs text-muted-foreground">
                Run a retrieve query to see ranked matches.
              </div>
            ) : (
              <ScrollArea className="suika-scroll max-h-72">
                <ul className="space-y-2">
                  {results.map((r) => (
                    <li key={r.memory.id} className="rounded-lg border border-border/50 p-2">
                      <div className="flex items-center justify-between">
                        <Tag tone={kindTone[r.memory.kind]}>{r.memory.kind}</Tag>
                        <span className="font-mono text-xs text-emerald-300">{r.score.toFixed(3)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs">{r.memory.content}</p>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </SectionCard>

          <SectionCard title="Store memory" desc="Commit a new trace">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Kind</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["episodic", "semantic", "procedural"].map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Content</Label>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="what to remember…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tags (comma separated)</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="alpha, beta" />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={!content.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                <Plus className="h-4 w-4" /> Store memory
              </Button>
              <p className="text-[10px] text-muted-foreground">
                <Brain className="mr-1 inline h-3 w-3" />
                importance auto-estimated from content signals; decay starts at 1.0.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
