/**
 * SUIKA X — VoiceControlCenter (Phase 4.4)
 *
 * Real-time voice operating system HUD panel. Connects to the useVoice hook
 * to display microphone status, transcription stream, speech queue, current
 * speaker state, latency breakdown, and confidence.
 *
 * Layout:
 *   [ Mic Button + State ]  [ Waveform ]
 *   [ Live Transcription ]
 *   [ SUIKA Response ]
 *   [ Latency Breakdown ]
 *   [ Session History ]
 */
"use client";

import { GlassPanel, StatusDot } from "@/components/suika/hud-primitives";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mic, MicOff, Square, Volume2, VolumeX, Radio, Clock,
  Activity, Brain, Database, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type VoiceState, type UseVoiceResult } from "@/hooks/use-voice";

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "IDLE",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING",
  thinking: "THINKING",
  speaking: "SPEAKING",
  error: "ERROR",
};

const STATE_COLOR: Record<VoiceState, string> = {
  idle: "text-zinc-400",
  listening: "text-violet-300",
  transcribing: "text-cyan-300",
  thinking: "text-blue-300",
  speaking: "text-emerald-300",
  error: "text-rose-300",
};

const STATE_DOT: Record<VoiceState, string> = {
  idle: "muted",
  listening: "violet",
  transcribing: "cyan",
  thinking: "blue",
  speaking: "emerald",
  error: "rose",
};

export function VoiceControlCenter({ voice }: { voice: UseVoiceResult }) {
  const isListening = voice.state === "listening";
  const isSpeaking = voice.state === "speaking";
  const isBusy = voice.state !== "idle" && voice.state !== "error";

  return (
    <GlassPanel
      title="Voice Control Center"
      icon={Radio}
      className="h-full"
      headerRight={
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 text-[10px] font-mono uppercase", STATE_COLOR[voice.state])}>
            <StatusDot tone={STATE_DOT[voice.state]} pulse={isBusy} />
            {STATE_LABEL[voice.state]}
          </span>
        </div>
      }
    >
      <div className="space-y-3 p-3">
        {/* Mic + speaker controls */}
        <div className="flex items-center gap-3">
          {/* Big mic button */}
          <button
            onClick={isListening ? voice.stopListening : voice.startListening}
            disabled={voice.state === "transcribing" || voice.state === "thinking"}
            className={cn(
              "relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all",
              isListening
                ? "border-violet-400 bg-violet-500/20 text-violet-300 shadow-[0_0_25px_-5px_rgba(139,92,246,0.7)]"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
              (voice.state === "transcribing" || voice.state === "thinking") && "opacity-50 cursor-not-allowed",
            )}
            aria-label={isListening ? "Stop listening" : "Start listening"}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            {isListening && (
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-violet-400/50" />
            )}
          </button>

          {/* Waveform / status */}
          <div className="flex-1">
            <Waveform active={isListening} level={voice.audioLevel} color="violet" />
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {isListening ? "Tap to stop" :
                 voice.state === "transcribing" ? "Transcribing…" :
                 voice.state === "thinking" ? "Thinking…" :
                 voice.state === "speaking" ? "Speaking…" :
                 voice.state === "error" ? "Error" :
                 "Tap mic to speak"}
              </span>
              {voice.sessionId && (
                <span className="font-mono">session {voice.sessionId.slice(-6)}</span>
              )}
            </div>
          </div>

          {/* Interrupt button */}
          {isSpeaking && (
            <Button
              size="sm"
              variant="outline"
              onClick={voice.interrupt}
              className="h-9 gap-1 border-rose-500/40 px-2 text-[10px] text-rose-300 hover:bg-rose-500/10"
            >
              <VolumeX className="h-3 w-3" /> STOP
            </Button>
          )}
        </div>

        {/* Error display */}
        {voice.error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-[10px] text-rose-300">
            {voice.error}
          </div>
        )}

        {/* Live transcription */}
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Mic className="h-2.5 w-2.5" /> You said
          </p>
          <div className="min-h-[40px] rounded-md border border-violet-500/20 bg-violet-500/5 p-2">
            <p className="text-xs text-violet-100">
              {voice.transcript || <span className="text-muted-foreground/50">—</span>}
            </p>
          </div>
        </div>

        {/* SUIKA response */}
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Volume2 className="h-2.5 w-2.5" /> SUIKA responded
          </p>
          <div className="min-h-[60px] rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
            {isSpeaking && <SpeakingWaveform progress={voice.speakingProgress} />}
            <p className="text-xs text-emerald-100">
              {voice.lastResponse || <span className="text-muted-foreground/50">—</span>}
            </p>
          </div>
        </div>

        {/* Latency breakdown */}
        {voice.lastTurn && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-2.5 w-2.5" /> Last turn latency
            </p>
            <div className="grid grid-cols-5 gap-1">
              <LatencyStat icon={Mic} label="ASR" ms={voice.lastTurn.latency.transcriptionMs} color="text-violet-300" />
              <LatencyStat icon={Database} label="CTX" ms={voice.lastTurn.latency.contextFusionMs} color="text-cyan-300" />
              <LatencyStat icon={Brain} label="LLM" ms={voice.lastTurn.latency.llmMs} color="text-emerald-300" />
              <LatencyStat icon={Zap} label="TTS" ms={voice.lastTurn.latency.ttsMs} color="text-amber-300" />
              <LatencyStat icon={Activity} label="TOTAL" ms={voice.lastTurn.latency.totalMs} color="text-rose-300" />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Mood inferred: <span className="text-emerald-300">{voice.lastTurn.mood}</span>
            </p>
          </div>
        )}

        {/* Session history */}
        {voice.history.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Activity className="h-2.5 w-2.5" /> Session history ({voice.history.length})
            </p>
            <ScrollArea className="h-[100px] suika-scroll">
              <div className="space-y-1">
                {voice.history.map((t, i) => (
                  <div key={i} className="rounded-md border border-zinc-800/70 bg-black/30 p-1.5">
                    <p className="truncate text-[10px] text-violet-200">
                      <span className="text-muted-foreground">You:</span> {t.transcript}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-emerald-200">
                      <span className="text-muted-foreground">SUIKA:</span> {t.response}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground/60">
                      {t.latency.totalMs}ms · {t.mood}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function Waveform({ active, level, color }: { active: boolean; level: number; color: string }) {
  const bars = 24;
  return (
    <div className="flex h-8 items-center gap-0.5">
      {Array.from({ length: bars }).map((_, i) => {
        const phase = i / bars;
        const wave = Math.sin(phase * Math.PI * 4 + Date.now() / 200) * 0.5 + 0.5;
        const height = active ? Math.max(0.15, Math.min(1, level * 2 + wave * 0.5)) : 0.1;
        return (
          <div
            key={i}
            className={cn("flex-1 rounded-full transition-all duration-100",
              color === "violet" ? "bg-violet-400" : "bg-emerald-400")}
            style={{
              height: `${height * 100}%`,
              animation: active ? `voice-bar ${0.3 + (i % 4) * 0.1}s ease-in-out infinite` : "none",
              animationDelay: `${i * 0.02}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function SpeakingWaveform({ progress }: { progress: number }) {
  return (
    <div className="mb-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className="h-full rounded-full bg-emerald-400 transition-all"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

function LatencyStat({ icon: Icon, label, ms, color }: { icon: any; label: string; ms: number; color: string }) {
  return (
    <div className="rounded-md border border-zinc-800/70 bg-black/30 p-1 text-center">
      <Icon className={cn("mx-auto h-2.5 w-2.5", color)} />
      <p className="mt-0.5 text-[8px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-[10px] font-bold", color)}>
        {ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}
      </p>
    </div>
  );
}

export default VoiceControlCenter;
