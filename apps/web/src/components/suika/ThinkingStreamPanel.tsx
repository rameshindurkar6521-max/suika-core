/**
 * SUIKA X — ThinkingStreamPanel (Phase 4.1)
 *
 * Live scrolling feed of SUIKA's internal events, converted to human-readable
 * thoughts. Polls /api/suika/events (the existing event endpoint) every 2s and
 * renders an Iron Man HUD–style animated feed with 8 color-coded categories.
 *
 * Features: filtering (8 categories), search, pause/resume, clear, 500-event cap.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassPanel } from "@/components/suika/hud-primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Pause, Play, Trash2, Search, Filter, X,
  Brain, Activity, Globe, Shield, Database, Cpu, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "THOUGHT" | "ACTION" | "RESEARCH" | "REVIEW" | "MEMORY" | "KNOWLEDGE" | "SYSTEM" | "PROVIDER" | "COMPANION" | "VOICE" | "PROJECT";

interface ThoughtEvent {
  id: string;
  timestamp: string;
  agent: string;
  agentColor: string;
  category: Category;
  message: string;
}

const CATEGORY_META: Record<Category, { color: string; bg: string; border: string; glow: string; icon: any; label: string }> = {
  THOUGHT:   { color: "text-emerald-300", bg: "bg-emerald-500/5",  border: "border-emerald-500/30", glow: "shadow-[0_0_10px_-3px_rgba(16,185,129,0.5)]",  icon: Brain,    label: "THOUGHT" },
  ACTION:    { color: "text-cyan-300",    bg: "bg-cyan-500/5",     border: "border-cyan-500/30",    glow: "shadow-[0_0_10px_-3px_rgba(34,211,238,0.5)]",    icon: Activity, label: "ACTION" },
  RESEARCH:  { color: "text-purple-300",  bg: "bg-purple-500/5",   border: "border-purple-500/30",  glow: "shadow-[0_0_10px_-3px_rgba(168,85,247,0.5)]",   icon: Globe,    label: "RESEARCH" },
  REVIEW:    { color: "text-amber-300",   bg: "bg-amber-500/5",    border: "border-amber-500/30",   glow: "shadow-[0_0_10px_-3px_rgba(251,191,36,0.5)]",   icon: Shield,   label: "REVIEW" },
  MEMORY:    { color: "text-violet-300",  bg: "bg-violet-500/5",   border: "border-violet-500/30",  glow: "shadow-[0_0_10px_-3px_rgba(139,92,246,0.5)]",   icon: Database, label: "MEMORY" },
  KNOWLEDGE: { color: "text-blue-300",    bg: "bg-blue-500/5",     border: "border-blue-500/30",    glow: "shadow-[0_0_10px_-3px_rgba(59,130,246,0.5)]",   icon: Globe,    label: "KNOWLEDGE" },
  SYSTEM:    { color: "text-zinc-200",    bg: "bg-zinc-500/5",     border: "border-zinc-500/30",    glow: "shadow-[0_0_10px_-3px_rgba(161,161,170,0.4)]",  icon: Cpu,      label: "SYSTEM" },
  PROVIDER:  { color: "text-rose-300",    bg: "bg-rose-500/5",     border: "border-rose-500/30",    glow: "shadow-[0_0_10px_-3px_rgba(244,63,94,0.5)]",    icon: Zap,      label: "PROVIDER" },
  COMPANION: { color: "text-pink-300",    bg: "bg-pink-500/5",     border: "border-pink-500/30",    glow: "shadow-[0_0_10px_-3px_rgba(236,72,153,0.5)]",   icon: Brain,    label: "COMPANION" },
  VOICE:     { color: "text-cyan-300",    bg: "bg-cyan-500/5",     border: "border-cyan-500/30",    glow: "shadow-[0_0_10px_-3px_rgba(34,211,238,0.5)]",    icon: Activity, label: "VOICE" },
  PROJECT:   { color: "text-emerald-300", bg: "bg-emerald-500/5",  border: "border-emerald-500/30", glow: "shadow-[0_0_10px_-3px_rgba(16,185,129,0.5)]",   icon: Cpu,      label: "PROJECT" },
};

const ALL_CATEGORIES: Category[] = ["THOUGHT", "ACTION", "RESEARCH", "REVIEW", "MEMORY", "KNOWLEDGE", "SYSTEM", "PROVIDER", "COMPANION", "VOICE", "PROJECT"];

const AGENT_PERSONA: Record<string, { label: string; color: string }> = {
  "Scout-6":     { label: "Scout-6",     color: "text-cyan-300" },
  "Oracle-3":    { label: "Oracle-3",    color: "text-purple-300" },
  "Sentinel-5":  { label: "Critic",      color: "text-amber-300" },
  "Forge-4":     { label: "Forge-4",     color: "text-emerald-300" },
  "Archivist-1": { label: "Memory",      color: "text-violet-300" },
  "Navigator-2": { label: "Navigator-2", color: "text-blue-300" },
};

function detectAgent(message: string, source: string): { label: string; color: string } {
  for (const name of Object.keys(AGENT_PERSONA)) {
    if (message.includes(name)) return AGENT_PERSONA[name];
  }
  if (source === "memory") return AGENT_PERSONA["Archivist-1"];
  if (source === "fabric") return { label: "Knowledge", color: "text-blue-300" };
  if (source === "router") return { label: "Provider", color: "text-rose-300" };
  if (source === "companion") return { label: "Companion", color: "text-pink-300" };
  if (source === "voice") return { label: "Voice", color: "text-cyan-300" };
  if (source === "project") return { label: "Project", color: "text-emerald-300" };
  if (/handoff|execut/i.test(message)) return { label: "Executive", color: "text-rose-300" };
  if (/plan|decompos/i.test(message)) return { label: "Planner", color: "text-emerald-300" };
  if (/review|verdict|critic/i.test(message)) return { label: "Critic", color: "text-amber-300" };
  if (/research|search|crawl/i.test(message)) return { label: "Scout", color: "text-cyan-300" };
  return { label: "System", color: "text-zinc-200" };
}

function categorize(message: string, source: string): Category {
  const m = (message || "").toLowerCase();
  if (source === "memory") return "MEMORY";
  if (source === "fabric") return "KNOWLEDGE";
  if (source === "router") return "PROVIDER";
  if (source === "companion") return "COMPANION";
  if (source === "voice") return "VOICE";
  if (source === "project") return "PROJECT";
  if (/review|verdict|critic|validation|approve|reject/i.test(m)) return "REVIEW";
  if (/memory|recall|retriev|consolidat|episodic|semantic|procedural/i.test(m)) return "MEMORY";
  if (/knowledge|graph|entity|relation|edge|node|fabric/i.test(m)) return "KNOWLEDGE";
  if (/research|search|crawl|scout|fetch|literature|sources/i.test(m)) return "RESEARCH";
  if (/handoff|execut|step|run|dispatch|assign|claim|start|complet/i.test(m)) return "ACTION";
  if (/provider|openrouter|api|response|rate|circuit|429/i.test(m)) return "PROVIDER";
  if (/boot|kernel|system|seed|constitut|identity|health/i.test(m)) return "SYSTEM";
  if (/analyz|reason|think|compar|synthes|infer|evaluat/i.test(m)) return "THOUGHT";
  return "THOUGHT";
}

function humanize(message: string, category: Category): string {
  if (!message) return "…";
  const trimmed = message.trim();
  const cap = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  if (category === "THOUGHT" && !/[.!?…]$/.test(cap)) return `${cap}…`;
  return cap;
}

function toThought(e: any): ThoughtEvent {
  const agent = detectAgent(e.message || "", e.source || "");
  const category = categorize(e.message || "", e.source || "");
  return {
    id: e.id,
    timestamp: e.createdAt,
    agent: agent.label,
    agentColor: agent.color,
    category,
    message: humanize(e.message || "", category),
  };
}

export function ThinkingStreamPanel() {
  const [events, setEvents] = useState<ThoughtEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCats, setActiveCats] = useState<Set<Category>>(new Set(ALL_CATEGORIES));
  const pausedRef = useRef(false);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch("/api/suika/events?limit=50");
        if (!r.ok) { setConnected(false); return; }
        const d = await r.json();
        const newEvents: ThoughtEvent[] = (d.events ?? []).map(toThought);
        setConnected(true);
        if (!pausedRef.current) {
          setEvents((prev) => {
            // Merge: only add events we haven't seen
            const seen = new Set(prev.map((e) => e.id));
            const fresh = newEvents.filter((e) => !seen.has(e.id));
            if (fresh.length === 0) return prev;
            return [...fresh.reverse(), ...prev].slice(0, 500);
          });
        }
      } catch {
        setConnected(false);
      }
    };
    poll();
    timer = setInterval(poll, 2500);
    return () => clearInterval(timer);
  }, []);

  const clear = useCallback(() => setEvents([]), []);
  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const toggleCat = useCallback((c: Category) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.category] = (c[e.category] || 0) + 1;
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (!activeCats.has(e.category)) return false;
      if (!q) return true;
      return e.message.toLowerCase().includes(q) || e.agent.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    });
  }, [events, search, activeCats]);

  return (
    <GlassPanel
      title="Live Thinking Stream"
      icon={Brain}
      className="flex h-full flex-col"
      headerRight={
        <span className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase",
          connected ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>
          <span className={cn("h-1.5 w-1.5 rounded-full",
            connected && !paused && "animate-pulse bg-emerald-400",
            connected && paused && "bg-amber-400",
            !connected && "bg-rose-400")} />
          {!connected ? "OFFLINE" : paused ? "PAUSED" : "LIVE"}
        </span>
      }
    >
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-emerald-500/10 px-3 py-2">
        <Filter className="mr-1 h-3 w-3 text-muted-foreground" />
        <Button size="sm" variant="ghost" onClick={() => setActiveCats(new Set(ALL_CATEGORIES))} className="h-6 px-2 text-[10px] text-muted-foreground hover:text-emerald-300">ALL</Button>
        <Button size="sm" variant="ghost" onClick={() => setActiveCats(new Set())} className="mr-1 h-6 px-2 text-[10px] text-muted-foreground hover:text-rose-300">NONE</Button>
        {ALL_CATEGORIES.map((c) => {
          const meta = CATEGORY_META[c];
          const isActive = activeCats.has(c);
          const Icon = meta.icon;
          return (
            <button key={c} onClick={() => toggleCat(c)}
              className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-all",
                isActive ? cn(meta.border, meta.bg, meta.color, meta.glow) : "border-zinc-800 bg-transparent text-muted-foreground/60 hover:text-foreground")}>
              <Icon className="h-2.5 w-2.5" />
              <span>{meta.label}</span>
              <span className="font-mono text-[9px] opacity-70">{counts[c] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-emerald-500/10 px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search thoughts…"
            className="h-7 border-zinc-800 bg-black/30 pl-7 text-xs text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-emerald-500/30" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={togglePause}
          className={cn("h-7 gap-1 border-zinc-800 px-2 text-[10px]",
            paused ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" : "bg-transparent text-muted-foreground hover:text-emerald-300")}>
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {paused ? "RESUME" : "PAUSE"}
        </Button>
        <Button size="sm" variant="outline" onClick={clear}
          className="h-7 gap-1 border-zinc-800 px-2 text-[10px] text-muted-foreground hover:text-rose-300">
          <Trash2 className="h-3 w-3" /> CLEAR
        </Button>
      </div>

      {/* Scrolling feed */}
      <div className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-12 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="suika-scroll h-full max-h-[360px] overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
              <Brain className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                {events.length === 0 ? "Awaiting cognitive activity…" : "No thoughts match the current filter."}
              </p>
              <p className="text-[10px] text-muted-foreground/60">Dispatch a workflow or speak to SUIKA.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((t, i) => {
                const meta = CATEGORY_META[t.category];
                const Icon = meta.icon;
                const fadeOpacity = Math.max(0.35, 1 - i * 0.012);
                return (
                  <div key={t.id}
                    className={cn("group relative flex items-start gap-2 rounded-lg border px-2.5 py-1.5 transition-all duration-300 animate-[fadeInUp_0.35s_ease-out]",
                      meta.bg, meta.border, meta.glow, "hover:translate-x-0.5")}
                    style={{ opacity: fadeOpacity }}>
                    <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", meta.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="font-mono text-muted-foreground/70">{t.timestamp.slice(11, 19)}</span>
                        <span className={cn("font-semibold uppercase tracking-wide", t.agentColor)}>{t.agent}:</span>
                        <span className={cn("rounded px-1 text-[9px] font-bold", meta.bg, meta.color)}>{meta.label}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">{t.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-emerald-500/10 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="font-mono">showing <span className="text-emerald-300">{filtered.length}</span> / {events.length} thoughts</span>
        <span className="font-mono">buffer cap: 500</span>
      </div>
    </GlassPanel>
  );
}

export default ThinkingStreamPanel;
