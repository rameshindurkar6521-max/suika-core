/**
 * SUIKA X — SuikaCharacterPanel (Phase 4.2 + 4.4)
 *
 * Living AI companion portrait with mood-driven glow, breathing/blink/eye-glow
 * animations, status ring, confidence arc, speech bubbles on events, AND
 * voice-driven mouth animation + speaking state.
 *
 * Data sources:
 *   • /api/suika/events (polling via react-query, source filter)
 *   • /api/suika/companion/state (traits, projects, initiatives, decisions)
 *   • /api/suika/system (metrics)
 *   • /api/suika/jobs (workflow status)
 *   • /api/suika/providers/health (provider status)
 *   • Voice state injected by parent via props (speaking, transcribing, mood)
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassPanel, StatusDot } from "@/components/suika/hud-primitives";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sparkles, Target, Activity, Gauge, Cpu, Database, Shield,
  Brain, Zap, Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mood =
  | "Idle" | "Focused" | "Researching" | "Learning" | "Thinking"
  | "Reviewing" | "Planning" | "Confident" | "Concerned" | "Speaking" | "Listening";

interface MoodConfig {
  color: string; glow: string; ringColor: string; hex: string; description: string;
}

const MOOD_CONFIG: Record<Mood, MoodConfig> = {
  Idle:        { color: "text-zinc-300",   glow: "shadow-[0_0_25px_-8px_rgba(161,161,170,0.35)]",   ringColor: "border-zinc-500/40",   hex: "#a1a1aa", description: "Awaiting cognitive workload" },
  Focused:     { color: "text-cyan-300",   glow: "shadow-[0_0_35px_-5px_rgba(34,211,238,0.55)]",    ringColor: "border-cyan-500/60",   hex: "#22d3ee", description: "Engaged in active workflow execution" },
  Researching: { color: "text-purple-300", glow: "shadow-[0_0_35px_-5px_rgba(168,85,247,0.55)]",    ringColor: "border-purple-500/60", hex: "#a855f7", description: "Gathering and synthesizing sources" },
  Learning:    { color: "text-emerald-300",glow: "shadow-[0_0_35px_-5px_rgba(16,185,129,0.55)]",    ringColor: "border-emerald-500/60",hex: "#10b981", description: "Consolidating new memories" },
  Thinking:    { color: "text-blue-300",   glow: "shadow-[0_0_35px_-5px_rgba(59,130,246,0.55)]",    ringColor: "border-blue-500/60",   hex: "#3b82f6", description: "Reasoning over the knowledge graph" },
  Reviewing:   { color: "text-amber-300",  glow: "shadow-[0_0_35px_-5px_rgba(251,191,36,0.55)]",    ringColor: "border-amber-500/60",  hex: "#fbbf24", description: "Validating outputs against the constitution" },
  Planning:    { color: "text-emerald-300",glow: "shadow-[0_0_35px_-5px_rgba(16,185,129,0.55)]",    ringColor: "border-emerald-500/60",hex: "#10b981", description: "Decomposing goals into workflows" },
  Confident:   { color: "text-emerald-300",glow: "shadow-[0_0_35px_-5px_rgba(16,185,129,0.55)]",    ringColor: "border-emerald-500/60",hex: "#10b981", description: "High-confidence output achieved" },
  Concerned:   { color: "text-rose-300",   glow: "shadow-[0_0_35px_-5px_rgba(244,63,94,0.55)]",     ringColor: "border-rose-500/60",   hex: "#f43f5e", description: "Confidence below threshold or provider stress" },
  Speaking:    { color: "text-cyan-300",   glow: "shadow-[0_0_45px_-5px_rgba(34,211,238,0.75)]",    ringColor: "border-cyan-500/80",   hex: "#22d3ee", description: "Speaking with you" },
  Listening:   { color: "text-violet-300", glow: "shadow-[0_0_40px_-5px_rgba(139,92,246,0.7)]",     ringColor: "border-violet-500/70", hex: "#8b5cf6", description: "Listening to your voice" },
};

interface EventRow { id: string; level: string; source: string; message: string; metadata: string; createdAt: string; }

function eventToSpeech(e: EventRow): string | null {
  const m = (e.message || "").toLowerCase();
  if (/handoff.*from/.test(m)) return "Handing off to another specialist…";
  if (/review.*pass|verdict.*pass|approved/.test(m)) return "Review passed. Confident in output.";
  if (/review.*fail|verdict.*fail|needs_revision|revision required/.test(m)) return "Reviewing findings — needs refinement.";
  if (/revision.*attempt/.test(m)) return "Revising my approach…";
  if (/step.*complete/.test(m)) return "Step complete. Moving forward.";
  if (/memory.*persist|memory.*retriev|recall/.test(m)) return "Recalled a relevant memory.";
  if (/consolidat/.test(m)) return "Consolidating memories into knowledge.";
  if (/knowledge.*graph|new.*relation|new.*entity/.test(m)) return "Knowledge graph updated.";
  if (/goal.*progress|goal.*created|goal.*active/.test(m)) return "Goal progress increased.";
  if (/traits evolved/.test(m)) return "I'm learning and adapting.";
  if (/conversation summarized/.test(m)) return "Conversation summarized and remembered.";
  if (/initiative.*generated|initiative.*suggestion/.test(m)) return "I have a suggestion for you.";
  if (/workflow.*dispatch/.test(m)) return "New workflow dispatched.";
  if (/workflow.*complete|job.*complete/.test(m)) return "Workflow complete.";
  if (/provider.*429|rate.*limit|circuit.*open/.test(m)) return "Provider stress detected. Adjusting…";
  if (/kernel.*boot|system.*ready/.test(m)) return "SUIKA online. Ready to assist.";
  if (/voice.*session/.test(m)) return "Voice session started.";
  return null;
}

export interface SuikaCharacterPanelProps {
  /** When true, avatar shows speaking mouth animation + "Speaking" mood */
  speaking?: boolean;
  /** When true, avatar shows "Listening" mood + mic pulse */
  listening?: boolean;
  /** Mood override (e.g. from voice service latency) */
  moodOverride?: Mood;
  /** Optional override of the latest event to trigger a speech bubble from voice */
  injectedBubble?: string | null;
}

export function SuikaCharacterPanel({
  speaking = false, listening = false, moodOverride, injectedBubble,
}: SuikaCharacterPanelProps) {
  // Latest events (for speech bubbles)
  const { data: eventsData } = useQuery({
    queryKey: ["suika", "events", "recent"],
    queryFn: async () => {
      const r = await fetch("/api/suika/events?limit=10");
      const d = await r.json();
      return (d.events ?? []) as EventRow[];
    },
    refetchInterval: 4000,
  });

  // Companion state (traits, projects, initiatives)
  const { data: companion } = useQuery({
    queryKey: ["companion", "state"],
    queryFn: async () => {
      const r = await fetch("/api/suika/companion/state");
      return r.json();
    },
    refetchInterval: 5000,
  });

  // System metrics (agents, calls, errors)
  const { data: system } = useQuery({
    queryKey: ["suika", "system"],
    queryFn: async () => {
      const r = await fetch("/api/suika/system");
      return r.json();
    },
    refetchInterval: 5000,
  });

  // Jobs (for running/pending)
  const { data: jobs } = useQuery({
    queryKey: ["suika", "jobs"],
    queryFn: async () => {
      const r = await fetch("/api/suika/jobs?limit=1");
      return r.json();
    },
    refetchInterval: 3000,
  });

  // Providers (storm detection)
  const { data: providers } = useQuery({
    queryKey: ["suika", "providers", "health"],
    queryFn: async () => {
      const r = await fetch("/api/suika/providers/health");
      return r.json();
    },
    refetchInterval: 5000,
  });

  // Compute mood
  const mood = useMemo<Mood>(() => {
    if (moodOverride) return moodOverride;
    if (speaking) return "Speaking";
    if (listening) return "Listening";
    const m = system?.metrics;
    const storm = providers?.stormState === "STORM";
    if (storm) return "Concerned";
    const running = m?.tasks?.running ?? 0;
    const pending = m?.tasks?.pending ?? 0;
    if (running > 0) {
      // Check recent event for more specific mood
      const recent = eventsData?.[0];
      if (recent) {
        const msg = recent.message.toLowerCase();
        if (/review|verdict|critic/.test(msg)) return "Reviewing";
        if (/research|crawl|scout/.test(msg)) return "Researching";
        if (/memory|consolidat|recall/.test(msg)) return "Learning";
        if (/plan|decompos/.test(msg)) return "Planning";
      }
      return running >= 2 ? "Focused" : "Thinking";
    }
    if (pending > 0) return "Planning";
    const goalsActive = companion?.projects?.active ?? 0;
    if (goalsActive >= 3) return "Planning";
    return "Idle";
  }, [system, providers, eventsData, companion, speaking, listening, moodOverride]);

  const thinking = mood !== "Idle" && mood !== "Speaking" && mood !== "Listening";

  // Speech bubble state
  const [bubble, setBubble] = useState<string | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBubble = useCallback((text: string) => {
    setBubble(text);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => setBubble(null), 5000);
  }, []);

  useEffect(() => {
    if (injectedBubble) {
      // Defer to a microtask so we're outside the render commit phase.
      Promise.resolve().then(() => showBubble(injectedBubble));
      return;
    }
    const latest = eventsData?.[0];
    if (!latest) return;
    if (lastEventIdRef.current === latest.id) return;
    lastEventIdRef.current = latest.id;
    const text = eventToSpeech(latest);
    if (text) {
      Promise.resolve().then(() => showBubble(text));
    }
  }, [eventsData, injectedBubble, showBubble]);

  useEffect(() => () => { if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current); }, []);

  // Profile dialog
  const [profileOpen, setProfileOpen] = useState(false);

  const cfg = MOOD_CONFIG[mood];
  const traits = companion?.traits;
  const projects = companion?.projects;
  const initiatives = companion?.initiatives;
  const m = system?.metrics;
  const running = m?.tasks?.running ?? 0;
  const pending = m?.tasks?.pending ?? 0;
  const completed = m?.tasks?.success ?? 0;
  const providerCalls = m?.router?.totalCalls ?? 0;
  const successRate = providerCalls > 0 ? Math.round((m?.router?.okCalls / providerCalls) * 100) : 0;

  return (
    <GlassPanel
      title="SUIKA"
      icon={Sparkles}
      className={cn("h-full transition-all duration-700", cfg.glow)}
      headerRight={
        <span className={cn("flex items-center gap-1 text-[10px] font-mono uppercase", cfg.color)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", (thinking || speaking || listening) && "animate-pulse")}
            style={{ background: cfg.hex, boxShadow: `0 0 6px ${cfg.hex}` }} />
          {mood.toUpperCase()}
        </span>
      }
    >
      <div className="p-3">
        {/* Portrait */}
        <div
          className="relative mx-auto w-fit cursor-pointer select-none"
          onClick={() => setProfileOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="SUIKA portrait — tap for profile"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setProfileOpen(true); } }}
        >
          <Portrait mood={mood} thinking={thinking} speaking={speaking} listening={listening} confidence={0.6} />

          {/* Speech bubble */}
          {bubble && (
            <div className="pointer-events-none absolute -right-2 top-2 z-30 max-w-[220px] animate-[suika-bubble-pop_5s_ease-in-out_forwards]">
              <div className="relative rounded-lg border border-emerald-500/40 bg-black/85 px-3 py-2 shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] backdrop-blur-md">
                <p className="text-xs text-emerald-100">{bubble}</p>
                <div className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 border-b border-l border-emerald-500/40 bg-black/85" />
              </div>
            </div>
          )}

          {/* Voice state indicators */}
          {(speaking || listening) && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-cyan-500/40 bg-black/85 px-2 py-0.5 text-[9px] font-mono uppercase backdrop-blur-md">
              {speaking ? (
                <span className="flex items-center gap-1 text-cyan-300">
                  <Volume2 className="h-2.5 w-2.5" /> speaking
                </span>
              ) : (
                <span className="flex items-center gap-1 text-violet-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" /> listening
                </span>
              )}
            </div>
          )}
        </div>

        {/* Mood label */}
        <div className="mt-3 text-center">
          <p className={cn("text-sm font-bold tracking-wide", cfg.color)}
            style={{ textShadow: `0 0 12px ${cfg.hex}66` }}>
            {mood.toUpperCase()}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{cfg.description}</p>
        </div>

        {/* Personality traits (Phase 4.3) */}
        {traits && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              { label: "Curiosity", value: traits.curiosity },
              { label: "Confidence", value: traits.confidence },
              { label: "Focus", value: traits.focus },
              { label: "Creativity", value: traits.creativity },
              { label: "Empathy", value: traits.empathy },
              { label: "Persistence", value: traits.persistence },
            ].map((t) => (
              <div key={t.label} className="rounded-md border border-zinc-800/70 bg-black/30 p-1.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{t.label}</p>
                <div className="mt-0.5 h-1 rounded-full bg-zinc-800">
                  <div className="h-1 rounded-full bg-emerald-400 transition-all" style={{ width: `${t.value * 100}%` }} />
                </div>
                <p className="mt-0.5 text-right font-mono text-[9px] text-emerald-300/60">{Math.round(t.value * 100)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Live status system */}
        <div className="mt-3 space-y-1.5">
          <StatusRow icon={Activity} label="Activity" value={`${running} run · ${pending} pend`} color="text-violet-300" />
          <StatusRow icon={CheckCircle} label="Completed" value={completed} color="text-emerald-300" />
          <StatusRow icon={Database} label="Memories" value={m?.memory?.total ?? 0} color="text-blue-300" />
          <StatusRow icon={Zap} label="Provider" value={`${successRate}% ok`} color={successRate > 80 ? "text-emerald-300" : "text-amber-300"} />
        </div>

        {/* Intelligence stats */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Stat label="Projects" value={projects?.active ?? 0} color="text-emerald-300" />
          <Stat label="Blockers" value={projects?.openBlockers ?? 0} color="text-rose-300" />
          <Stat label="Initiatives" value={initiatives?.proposed ?? 0} color="text-amber-300" />
        </div>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="border-emerald-500/30 bg-black/90 text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-300">
              <Sparkles className="h-4 w-4" /> SUIKA — Cognitive Operating System
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              A cognitive operating system that amplifies human cognition — warm, precise, and constitutionally grounded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Mood</p>
              <p className={cn("font-semibold", cfg.color)}>{mood}</p>
              <p className="text-xs text-muted-foreground">{cfg.description}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Personality Vector (v{traits?.version ?? 1})</p>
              <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                {traits && [
                  ["Curiosity", traits.curiosity],
                  ["Confidence", traits.confidence],
                  ["Focus", traits.focus],
                  ["Creativity", traits.creativity],
                  ["Empathy", traits.empathy],
                  ["Persistence", traits.persistence],
                ].map(([label, val]) => (
                  <div key={label as string}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="ml-1 font-mono text-emerald-300">{Math.round((val as number) * 100)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mission</p>
              <p className="text-xs">Extend memory, accelerate reasoning, and coordinate agents — always in service of human goals, never in place of human judgment.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </GlassPanel>
  );
}

function Portrait({
  mood, thinking, speaking, listening, confidence,
}: { mood: Mood; thinking: boolean; speaking: boolean; listening: boolean; confidence: number }) {
  const cfg = MOOD_CONFIG[mood];
  return (
    <div className={cn("relative mx-auto rounded-full transition-shadow duration-700", cfg.glow)}>
      {/* Rotating status ring */}
      <div className={cn("absolute -inset-1 rounded-full border-2",
        cfg.ringColor,
        (thinking || speaking || listening) ? "animate-[suika-ring-spin_3s_linear_infinite]" : "animate-[suika-ring-spin_18s_linear_infinite]",
      )} style={{ borderStyle: (thinking || speaking || listening) ? "solid" : "dashed" }} />
      {/* Confidence arc */}
      <svg className="absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-800" />
        <circle cx="50" cy="50" r="48" fill="none" stroke={cfg.hex} strokeWidth="2" strokeLinecap="round"
          strokeDasharray={`${confidence * 301.6} 301.6`} className="transition-all duration-700"
          style={{ filter: `drop-shadow(0 0 4px ${cfg.hex})` }} />
      </svg>
      {/* Portrait container */}
      <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-black/60 bg-black/60 sm:h-36 sm:w-36">
        <div className="absolute inset-0 animate-[suika-breathe_4s_ease-in-out_infinite]" style={{ willChange: "transform" }}>
          <img src="/suika/suika-portrait.png" alt="SUIKA — Cognitive Operating System"
            className="h-full w-full object-cover object-top" draggable={false}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          {/* Eye glow */}
          <div className="pointer-events-none absolute inset-0 mix-blend-screen animate-[suika-eye-glow_3s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(ellipse 35% 12% at 50% 38%, ${cfg.hex}99, transparent 60%)`,
              opacity: speaking ? 0.95 : thinking ? 0.85 : 0.5 }} />
          {/* Blink */}
          {!speaking && (
            <div className="pointer-events-none absolute inset-x-0 animate-[suika-blink_5.2s_ease-in-out_infinite]"
              style={{ top: "33%", height: "12%",
                background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
                transformOrigin: "center" }} />
          )}
          {/* Mouth overlay (only when speaking) */}
          {speaking && (
            <div className="pointer-events-none absolute left-1/2 top-[58%] h-3 w-6 -translate-x-1/2 rounded-b-full bg-rose-900/70 animate-[suika-mouth-talk_0.35s_ease-in-out_infinite]"
              style={{ transformOrigin: "center", boxShadow: `0 0 8px ${cfg.hex}88` }} />
          )}
          {/* Listening mic indicator */}
          {listening && (
            <div className="pointer-events-none absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,transparent_55%,rgba(0,0,0,0.6))]" />
        {thinking && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full animate-[suika-pulse-fast_0.9s_ease-in-out_infinite]"
              style={{ background: cfg.hex, boxShadow: `0 0 8px ${cfg.hex}` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-800/70 bg-black/30 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <span className={cn("max-w-[60%] truncate text-right text-xs font-medium", color || "text-foreground/90")}>{value}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-md border border-zinc-800/70 bg-black/20 p-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-base font-bold tabular-nums", color)}>{value}</p>
    </div>
  );
}

function CheckCircle(props: any) {
  // Local icon to avoid extra import
  return <Sparkles {...props} />;
}

export default SuikaCharacterPanel;
