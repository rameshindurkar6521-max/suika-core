/** SUIKA X — System Overview view. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { KpiCard, SectionCard, Meter } from "./primitives";
import { EventFeed } from "./EventFeed";
import { Bot, Brain, Network, Shuffle, Activity, DollarSign, Timer, Boxes } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const KIND_COLORS: Record<string, string> = {
  episodic: "#34d399",
  semantic: "#f472b6",
  procedural: "#fbbf24",
};

export function OverviewView() {
  const tick = useSuika((s) => s.tick);
  const { data, isLoading } = useQuery({
    queryKey: ["system", tick],
    queryFn: () => api.system.get(),
    refetchInterval: 5000,
  });
  const m = data?.metrics;

  const memPie = m
    ? Object.entries(m.memory.byKind).map(([name, value]) => ({ name, value }))
    : [];

  // synthetic throughput series from calls (we approximate with a flat recent window)
  const callsSeries = useQuery({
    queryKey: ["calls-recent", tick],
    queryFn: () => api.router.calls(24),
    refetchInterval: 6000,
  });
  const series = (callsSeries.data?.calls ?? [])
    .slice()
    .reverse()
    .map((c, i) => ({
      i,
      latency: c.latencyMs,
      tokens: c.tokensIn + c.tokensOut,
      model: c.model,
    }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Agents" value={m?.agents.total ?? "—"} sub={`${m?.agents.busy ?? 0} busy · ${m?.agents.idle ?? 0} idle`} icon={Bot} accent="emerald" />
        <KpiCard label="Tasks" value={m?.tasks.total ?? "—"} sub={`${m?.tasks.running ?? 0} running`} icon={Boxes} accent="amber" />
        <KpiCard label="Memories" value={m?.memory.total ?? "—"} sub={`avg imp ${(m?.memory.avgImportance ?? 0).toFixed(2)}`} icon={Brain} accent="rose" />
        <KpiCard label="Entities" value={m?.fabric.entities ?? "—"} sub={`${m?.fabric.relations ?? 0} relations`} icon={Network} accent="emerald" />
        <KpiCard label="Model Calls" value={m?.router.totalCalls ?? "—"} sub={`${m?.router.fallbackCalls ?? 0} fallbacks`} icon={Shuffle} accent="sky" />
        <KpiCard label="Uptime" value={isLoading ? "…" : fmtUptime(m?.uptimeSec ?? 0)} sub={`boot ${data ? new Date(data.bootAt).toLocaleTimeString() : "—"}`} icon={Activity} accent="violet" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Router throughput"
          desc="Latency (ms) and token volume per recent routed call"
          className="lg:col-span-2"
          bodyClassName="p-2"
        >
          {series.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              No calls yet — run one in the Model Router view.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="tok" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f472b6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#ffffff20" />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="#ffffff20" />
                <Tooltip
                  contentStyle={{
                    background: "#0f1a17",
                    border: "1px solid #34d39940",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(l) => `call #${l}`}
                />
                <Area type="monotone" dataKey="latency" name="latency ms" stroke="#34d399" fill="url(#lat)" strokeWidth={2} />
                <Area type="monotone" dataKey="tokens" name="tokens" stroke="#f472b6" fill="url(#tok)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Memory by kind" desc="Distribution across episodic / semantic / procedural">
          {memPie.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No memories.</div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={memPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {memPie.map((e) => (
                      <Cell key={e.name} fill={KIND_COLORS[e.name] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0f1a17", border: "1px solid #34d39940", borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
                {memPie.map((e) => (
                  <div key={e.name} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLORS[e.name] }} />
                    <span className="text-muted-foreground">{e.name}</span>
                    <span className="font-mono">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Router economics" desc="Aggregate cost & latency across all personas">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /> Total cost</dt>
              <dd className="mt-1 font-mono text-lg">${(m?.router.totalCostUsd ?? 0).toFixed(5)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Timer className="h-3.5 w-3.5" /> Avg latency</dt>
              <dd className="mt-1 font-mono text-lg">{m?.router.avgLatencyMs ?? 0}ms</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total tokens</dt>
              <dd className="mt-1 font-mono text-lg">{(m?.router.totalTokens ?? 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Errors / fallbacks</dt>
              <dd className="mt-1 font-mono text-lg">
                <span className="text-rose-400">{m?.router.errorCalls ?? 0}</span>
                {" / "}
                <span className="text-amber-400">{m?.router.fallbackCalls ?? 0}</span>
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title="Memory health" desc="Average importance & decay across all traces">
          <div className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between text-xs"><span>Avg importance</span><span className="font-mono">{(m?.memory.avgImportance ?? 0).toFixed(3)}</span></div>
              <Meter value={m?.memory.avgImportance ?? 0} tone="emerald" />
            </div>
            <div>
              <div className="flex justify-between text-xs"><span>Avg decay</span><span className="font-mono">{(m?.memory.avgDecay ?? 0).toFixed(3)}</span></div>
              <Meter value={m?.memory.avgDecay ?? 0} tone="rose" />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              effective = importance × decay. Run decay in the Memory view to apply time-based forgetting.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Live event stream" desc="Structured observability spine" bodyClassName="p-0">
          <EventFeed limit={30} compact />
        </SectionCard>
      </div>
    </div>
  );
}
