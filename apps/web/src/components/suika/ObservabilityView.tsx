/** SUIKA X — Observability view: events table + level/source filters + metrics. */
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, KpiCard, timeAgo } from "./primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertTriangle, Bug, Info, ShieldAlert, DollarSign, Timer } from "lucide-react";

const levelTone: Record<string, "emerald" | "rose" | "amber" | "sky" | "muted"> = {
  info: "sky",
  warn: "amber",
  error: "rose",
  debug: "muted",
};

export function ObservabilityView() {
  const tick = useSuika((s) => s.tick);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");

  const events = useQuery({
    queryKey: ["events", level, source, tick],
    queryFn: () =>
      api.events.list({
        limit: 200,
        level: level !== "all" ? level : undefined,
        source: source !== "all" ? source : undefined,
      }),
    refetchInterval: 4000,
  });

  const system = useQuery({
    queryKey: ["system", tick],
    queryFn: () => api.system.get(),
    refetchInterval: 5000,
  });

  const evts = events.data?.events ?? [];
  const m = system.data?.metrics;

  const bySource: Record<string, number> = {};
  for (const e of evts) bySource[e.source] = (bySource[e.source] || 0) + 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Events (24h)" value={m?.events.last24h ?? "—"} icon={Activity} accent="sky" />
        <KpiCard label="Errors (24h)" value={m?.events.errorLast24h ?? "—"} icon={ShieldAlert} accent="rose" />
        <KpiCard label="Router cost" value={`$${(m?.router.totalCostUsd ?? 0).toFixed(5)}`} icon={DollarSign} accent="amber" />
        <KpiCard label="Avg latency" value={`${m?.router.avgLatencyMs ?? 0}ms`} icon={Timer} accent="emerald" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Event stream" desc="Structured observability spine" className="lg:col-span-2" bodyClassName="p-0"
          right={
            <div className="flex gap-2">
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{["all", "info", "warn", "error", "debug"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{["all", "system", "fabric", "memory", "agents", "router", "runtime"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          }
        >
          <ScrollArea className="suika-scroll max-h-[520px]">
            <ul className="divide-y divide-border/40 font-mono text-[11px]">
              {evts.map((e) => (
                <li key={e.id} className="flex items-start gap-2 px-3 py-1.5">
                  <span className="w-12 shrink-0 text-muted-foreground">{timeAgo(e.createdAt)}</span>
                  <Tag tone={levelTone[e.level] ?? "muted"}>{e.level}</Tag>
                  <span className="text-emerald-400/70">[{e.source}]</span>
                  <span className="flex-1 break-words text-foreground/90">{e.message}</span>
                </li>
              ))}
              {evts.length === 0 && <li className="p-6 text-center text-muted-foreground">No events match filters.</li>}
            </ul>
          </ScrollArea>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="By source" desc="Event volume in current view">
            <ul className="space-y-2 text-sm">
              {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
                <li key={src} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-emerald-400/70">[{src}]</span>
                  <span className="font-mono text-lg">{count}</span>
                </li>
              ))}
              {Object.keys(bySource).length === 0 && <li className="text-sm text-muted-foreground">No events.</li>}
            </ul>
          </SectionCard>

          <SectionCard title="Level legend" desc="Severity mapping">
            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-2"><Info className="h-3.5 w-3.5 text-sky-400" /> <Tag tone="sky">info</Tag> normal operations</li>
              <li className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> <Tag tone="amber">warn</Tag> degraded but functional</li>
              <li className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-rose-400" /> <Tag tone="rose">error</Tag> failure requiring attention</li>
              <li className="flex items-center gap-2"><Bug className="h-3.5 w-3.5 text-muted-foreground" /> <Tag tone="muted">debug</Tag> fine-grained trace</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
