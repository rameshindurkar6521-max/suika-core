/** SUIKA X — Model Router view: personas, route preview, real completions, call log. */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, Meter, timeAgo } from "./primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Shuffle, Sparkles, Eye, DollarSign, Timer, Hash, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { RouteDecision, ModelCallDTO } from "@/lib/suika/types";
import { cn } from "@/lib/utils";

const SAMPLES = [
  "Explain how the knowledge fabric retrieves a memory.",
  "def fib(n): return n if n<2 else fib(n-1)+fib(n-2)  # optimize this",
  "Prove that the sum of the first n integers is n(n+1)/2.",
  "Translate: The cognitive kernel orchestrates agent dispatch. → 中文",
  "Analyze the following 8000-word architecture document and propose three optimizations. (imagine it attached)",
];

export function RouterView() {
  const qc = useQueryClient();
  const bump = useSuika((s) => s.bump);

  const [prompt, setPrompt] = useState(SAMPLES[0]);
  const [forceModel, setForceModel] = useState<string>("auto");
  const [decision, setDecision] = useState<RouteDecision | null>(null);
  const [lastCall, setLastCall] = useState<ModelCallDTO | null>(null);

  const personas = useQuery({ queryKey: ["models"], queryFn: () => api.router.models() });
  const calls = useQuery({ queryKey: ["calls", "router"], queryFn: () => api.router.calls(40), refetchInterval: 6000 });

  const preview = useMutation({
    mutationFn: () => api.router.route(prompt),
    onSuccess: (d) => {
      setDecision(d.decision);
      setLastCall(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: () => api.router.complete(prompt, forceModel !== "auto" ? forceModel : undefined),
    onSuccess: (d) => {
      setDecision(d.decision);
      setLastCall(d.call);
      toast.success(`Routed to ${d.call.persona} · ${d.call.latencyMs}ms · $${d.call.costUsd.toFixed(5)}`);
      qc.invalidateQueries({ queryKey: ["calls", "router"] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const personaList = personas.data?.personas ?? [];
  const callList = calls.data?.calls ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          title="Prompt console"
          desc="Route to the best-fit model persona, then execute via the live inference backend"
          className="xl:col-span-2"
        >
          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              className="font-mono text-sm"
              placeholder="Enter a prompt to route…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={forceModel} onValueChange={setForceModel}>
                <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">auto-route</SelectItem>
                  {personaList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => preview.mutate()} disabled={preview.isPending || !prompt.trim()}>
                <Eye className="h-4 w-4" /> Preview route
              </Button>
              <Button size="sm" onClick={() => complete.mutate()} disabled={complete.isPending || !prompt.trim()}>
                <Sparkles className="h-4 w-4" /> {complete.isPending ? "Executing…" : "Execute"}
              </Button>
              <div className="ml-auto flex flex-wrap gap-1">
                {SAMPLES.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(s)}
                    className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/40"
                  >
                    sample {i + 1}
                  </button>
                ))}
              </div>
            </div>

            {decision && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Shuffle className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-semibold text-emerald-300">{decision.primary.label}</span>
                  <Tag tone="emerald">primary</Tag>
                </div>
                <p className="mt-1 text-muted-foreground">{decision.reason}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <Tag tone={decision.signals.hasCode ? "emerald" : "muted"}>code</Tag>
                  <Tag tone={decision.signals.needsReasoning ? "amber" : "muted"}>reasoning</Tag>
                  <Tag tone={decision.signals.needsLongContext ? "sky" : "muted"}>long-ctx</Tag>
                  <Tag tone={decision.signals.costSensitive ? "violet" : "muted"}>cost-sensitive</Tag>
                  <span className="font-mono text-muted-foreground">len {decision.signals.length}</span>
                </div>
                {decision.fallback.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[10px] text-muted-foreground">fallback chain:</span>{" "}
                    {decision.fallback.map((f) => (
                      <span key={f.id} className="ml-1 rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">{f.id}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {lastCall && (
              <div className="rounded-lg border border-border/50 bg-card/60 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {lastCall.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : lastCall.status === "fallback" ? <AlertTriangle className="h-4 w-4 text-amber-400" /> : <XCircle className="h-4 w-4 text-rose-400" />}
                  <span className="font-semibold">{lastCall.persona}</span>
                  {lastCall.fallback && <Tag tone="amber">fallback</Tag>}
                  <span className="ml-auto flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{lastCall.latencyMs}ms</span>
                    <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{lastCall.tokensIn}↑/{lastCall.tokensOut}↓</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />${lastCall.costUsd.toFixed(5)}</span>
                  </span>
                </div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 text-xs suika-scroll">{lastCall.response || "(empty response)"}</pre>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Model personas" desc="7-model ecosystem · all served via the live inference backend" bodyClassName="p-2">
          <ScrollArea className="suika-scroll max-h-[520px]">
            <ul className="space-y-1.5">
              {personaList.map((p) => (
                <li key={p.id} className="rounded-lg border border-border/50 bg-card/40 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{p.label}</span>
                    <Tag tone="sky">{p.family}</Tag>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.strengths.map((s) => (
                      <span key={s} className="rounded bg-muted/40 px-1 py-0 font-mono text-[9px] text-muted-foreground">{s}</span>
                    ))}
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                    <span>ctx {(p.contextWindow / 1000).toFixed(0)}k</span>
                    <span>${(p.costPer1kIn + p.costPer1kOut).toFixed(4)}/1k</span>
                    <span>~{p.avgLatencyMs}ms</span>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </SectionCard>
      </div>

      <SectionCard title="Call ledger" desc="Every routed completion, newest first" bodyClassName="p-0">
        <ScrollArea className="suika-scroll max-h-80">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 text-left text-muted-foreground backdrop-blur">
              <tr>
                <th className="p-2 pl-4 font-medium">model</th>
                <th className="p-2 font-medium">status</th>
                <th className="p-2 font-medium">prompt</th>
                <th className="p-2 font-medium">latency</th>
                <th className="p-2 font-medium">tokens</th>
                <th className="p-2 pr-4 font-medium">cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {callList.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="p-2 pl-4 font-mono text-[11px]">{c.model}</td>
                  <td className="p-2">
                    <Tag tone={c.status === "ok" ? "emerald" : c.status === "fallback" ? "amber" : "rose"}>{c.status}</Tag>
                  </td>
                  <td className="max-w-[280px] truncate p-2 text-muted-foreground">{c.prompt}</td>
                  <td className="p-2 font-mono">{c.latencyMs}ms</td>
                  <td className="p-2 font-mono">{c.tokensIn}↑/{c.tokensOut}↓</td>
                  <td className="p-2 pr-4 font-mono">${c.costUsd.toFixed(5)}</td>
                </tr>
              ))}
              {callList.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No calls yet. Execute a prompt above.</td></tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </SectionCard>
    </div>
  );
}
