/**
 * SUIKA X — CompanionView (Phase 4.3 + 4.4 unified HUD)
 *
 * The default view of SUIKA. Composes:
 *   LEFT:   SuikaCharacterPanel (with voice sync) + Companion State
 *   CENTER: VoiceControlCenter + ThinkingStreamPanel
 *   RIGHT:  ProjectsPanel + InitiativesPanel
 *
 * The voice state is shared between VoiceControlCenter and SuikaCharacterPanel
 * so the avatar mouth-animates while speaking and shows "Listening" while
 * the user speaks.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { SuikaCharacterPanel } from "@/components/suika/SuikaCharacterPanel";
import { ThinkingStreamPanel } from "@/components/suika/ThinkingStreamPanel";
import { CompanionStatePanel, ProjectsPanel, InitiativesPanel } from "@/components/suika/CompanionPanels";
import { VoiceControlCenter } from "@/components/suika/VoiceControlCenter";
import { useVoice } from "@/hooks/use-voice";

export function CompanionView() {
  // Single voice state shared across the character panel + voice control center.
  // The useVoice hook is called here (parent) so the character panel can react
  // (mouth animation, listening mood) via props.
  const voice = useVoice();
  const [injectedBubble, setInjectedBubble] = useState<string | null>(null);
  const lastResponseRef = useRef<string>("");

  // When a new voice response arrives, surface a speech bubble on the avatar.
  // External state → React state sync; we defer setState to a microtask so we
  // don't trigger cascading renders during the effect commit phase.
  useEffect(() => {
    if (!voice.lastResponse || voice.lastResponse === lastResponseRef.current) return;
    lastResponseRef.current = voice.lastResponse;
    const bubble = voice.lastResponse.length > 80
      ? voice.lastResponse.slice(0, 80) + "…"
      : voice.lastResponse;
    Promise.resolve().then(() => setInjectedBubble(bubble));
  }, [voice.lastResponse]);

  // Clear the bubble when a new listening cycle starts.
  useEffect(() => {
    if (voice.state === "listening" && injectedBubble) {
      Promise.resolve().then(() => setInjectedBubble(null));
    }
  }, [voice.state, injectedBubble]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
      {/* LEFT column: SUIKA Character + Companion State */}
      <div className="flex flex-col gap-3">
        <SuikaCharacterPanel
          speaking={voice.state === "speaking"}
          listening={voice.state === "listening"}
          injectedBubble={injectedBubble}
        />
        <CompanionStatePanel />
      </div>

      {/* CENTER column: Voice Control Center + Thinking Stream */}
      <div className="flex flex-col gap-3">
        <VoiceControlCenter voice={voice} />
        <ThinkingStreamPanel />
      </div>

      {/* RIGHT column: Projects + Initiatives */}
      <div className="flex flex-col gap-3">
        <ProjectsPanel />
        <InitiativesPanel />
      </div>
    </div>
  );
}

export default CompanionView;
