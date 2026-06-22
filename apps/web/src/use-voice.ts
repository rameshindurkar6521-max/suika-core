/**
 * SUIKA X — useVoice hook (Phase 4.4)
 *
 * Manages microphone capture, voice-service communication, audio playback,
 * and interruption handling for the real-time voice operating system.
 *
 * Pipeline: mic capture → MediaRecorder → base64 → POST /api/suika/voice/...
 * (proxied to voice-service on port 3003 via gateway XTransformPort)
 * → audio response → playback → mouth animation sync.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VOICE_PORT = 3003;
// Voice service endpoints accessed via gateway with XTransformPort
const voiceUrl = (path: string) => `/api/suika/voice${path}?XTransformPort=${VOICE_PORT}`;
// But the conversation/asr/tts endpoints aren't proxied in main app — call voice service directly via gateway root
const directVoiceUrl = (path: string) => `${path}?XTransformPort=${VOICE_PORT}`;

export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

export interface VoiceTurn {
  transcript: string;
  response: string;
  mood: string;
  latency: {
    transcriptionMs: number;
    contextFusionMs: number;
    llmMs: number;
    ttsMs: number;
    totalMs: number;
  };
  timestamp: string;
}

export interface UseVoiceResult {
  state: VoiceState;
  sessionId: string | null;
  transcript: string;            // live transcript (after ASR completes)
  lastResponse: string;          // last SUIKA response text
  lastTurn: VoiceTurn | null;
  error: string | null;
  history: VoiceTurn[];
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  interrupt: () => void;
  reset: () => void;
  audioLevel: number;            // 0..1 mic level (for waveform)
  speakingProgress: number;      // 0..1 TTS playback progress
}

export function useVoice(): UseVoiceResult {
  const [state, setState] = useState<VoiceState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [lastTurn, setLastTurn] = useState<VoiceTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [speakingProgress, setSpeakingProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const interruptFlagRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Keep ref in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Audio level monitoring
  const startAudioLevel = useCallback((stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(1, avg / 100));
        animationFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // AudioContext not available
    }
  }, []);

  const stopAudioLevel = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Play audio response with interrupt support + progress tracking
  const playAudio = useCallback(async (base64Wav: string): Promise<void> => {
    return new Promise((resolve) => {
      if (interruptFlagRef.current) { resolve(); return; }
      const audio = new Audio(`data:audio/wav;base64,${base64Wav}`);
      audioElementRef.current = audio;
      audio.onplay = () => setState("speaking");
      audio.onended = () => {
        setSpeakingProgress(1);
        setState("idle");
        audioElementRef.current = null;
        resolve();
      };
      audio.ontimeupdate = () => {
        if (audio.duration > 0) {
          setSpeakingProgress(audio.currentTime / audio.duration);
        }
      };
      audio.onerror = () => {
        setState("idle");
        audioElementRef.current = null;
        resolve();
      };
      audio.play().catch(() => {
        setState("idle");
        resolve();
      });
    });
  }, []);

  // Full conversation pipeline
  const runConversation = useCallback(async (audioBase64: string) => {
    setState("transcribing");
    setError(null);
    try {
      // Hit the voice service conversation endpoint via gateway
      const r = await fetch(directVoiceUrl("/conversation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_base64: audioBase64,
          profileId: "default",
          sessionId: sessionIdRef.current,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Conversation failed" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
      }
      setTranscript(data.transcript || "");
      setLastResponse(data.response || "");

      const turn: VoiceTurn = {
        transcript: data.transcript || "",
        response: data.response || "",
        mood: data.mood || "Focused",
        latency: data.latency || { transcriptionMs: 0, contextFusionMs: 0, llmMs: 0, ttsMs: 0, totalMs: 0 },
        timestamp: new Date().toISOString(),
      };
      setLastTurn(turn);
      setHistory((prev) => [turn, ...prev].slice(0, 50));

      // Play the audio response (unless interrupted)
      if (data.audio_base64 && !interruptFlagRef.current) {
        setState("thinking");
        await playAudio(data.audio_base64);
      } else {
        setState("idle");
      }
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, [playAudio]);

  const startListening = useCallback(async () => {
    setError(null);
    interruptFlagRef.current = false;
    try {
      // Stop any playing audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startAudioLevel(stream);

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stopAudioLevel();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size < 1000) { setState("idle"); return; } // too small, probably empty
        const base64 = await blobToBase64(blob);
        await runConversation(base64);
      };
      mr.start();
      setState("listening");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, [runConversation, startAudioLevel, stopAudioLevel]);

  const stopListening = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const interrupt = useCallback(() => {
    interruptFlagRef.current = true;
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    setState("idle");
    setSpeakingProgress(0);

    // Send interrupt to voice service (best effort)
    if (sessionIdRef.current) {
      fetch(directVoiceUrl("/conversation/interrupt"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    }
  }, []);

  const reset = useCallback(() => {
    interrupt();
    setSessionId(null);
    sessionIdRef.current = null;
    setTranscript("");
    setLastResponse("");
    setLastTurn(null);
    setError(null);
    setHistory([]);
    setState("idle");
  }, [interrupt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioLevel();
      if (audioElementRef.current) audioElementRef.current.pause();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
    };
  }, [stopAudioLevel]);

  return {
    state, sessionId, transcript, lastResponse, lastTurn, error, history,
    startListening, stopListening, interrupt, reset,
    audioLevel, speakingProgress,
  };
}
