import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import type { HustleKExpressionId } from "@/lib/assets/hustlek";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { hustlekIdleDelay, hustlekIdleSequence, hustlekSpeechBeat, hustlekSpeechGap, type HustleKMouthPose } from "./hustlek-life";

function appVisible(): boolean {
  return AppState.currentState !== "background" && AppState.currentState !== "inactive"
    && (Platform.OS !== "web" || typeof document === "undefined" || !document.hidden);
}

/** Shared by the home typewriter and portrait so both pause when the app is hidden. */
export function useHustleKForeground(active = true): boolean {
  const [foreground, setForeground] = useState(appVisible);
  useEffect(() => {
    if (!active) return;
    const refresh = () => setForeground(appVisible());
    const app = AppState.addEventListener("change", refresh);
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      app.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", refresh);
    };
  }, [active]);
  return active && foreground && appVisible();
}

export function useHustleKLife({ speaking, speechText, idle, active, blocked }: {
  speaking: boolean;
  speechText?: string;
  idle: boolean;
  active: boolean;
  blocked: boolean;
}) {
  const reduce = useReducedMotionPref();
  const foreground = useHustleKForeground(active && (idle || speaking));
  const enabled = foreground && !reduce && !blocked;
  const textRef = useRef(speechText);
  textRef.current = speechText;
  const [mouth, setMouth] = useState<HustleKMouthPose | null>(null);
  const [idleExpression, setIdleExpression] = useState<HustleKExpressionId | null>(null);

  useEffect(() => {
    setMouth(null);
    if (!enabled || !speaking) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let beat = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const frame = hustlekSpeechBeat(beat);
      const gap = hustlekSpeechGap(textRef.current);
      setMouth(gap ? null : frame.mouth);
      if (!gap) beat += 1;
      timer = setTimeout(tick, gap ? 64 : frame.durationMs);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [enabled, speaking]);

  useEffect(() => {
    setIdleExpression(null);
    if (!enabled || !idle || speaking) return;
    // Every interaction, route return or foreground resume starts a fresh quiet stretch.
    const quietSince = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        const frames = hustlekIdleSequence(Date.now() - quietSince);
        let index = 0;
        const show = () => {
          if (cancelled) return;
          const frame = frames[index++];
          setIdleExpression(frame?.expression ?? null);
          if (frame) timer = setTimeout(show, frame.durationMs);
          else schedule();
        };
        show();
      }, hustlekIdleDelay());
    };
    schedule();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [enabled, idle, speaking]);

  return {
    // Close immediately on the same render that reaches punctuation or loses its gate.
    mouth: enabled && speaking && !hustlekSpeechGap(speechText) ? mouth : null,
    idleExpression: enabled && idle && !speaking ? idleExpression : null,
  };
}
