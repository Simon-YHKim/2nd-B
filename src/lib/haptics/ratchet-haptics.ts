// 라쳇 햅틱 (Simon localhost QA 2026-10-01):
// "라쳇 소리가 들리는 조작 들이 있을때는 그에 맞게 짧고 약한 햅틱 반응을 넣도록
// 하자. 카메라 조작할때 말하는 거야."
//
// The telescope (camera) controls play assets/audio/observatory-ratchet.wav in two
// ways: a one-shot tick (reset, keyboard/accessibility steps, dial detents) and a
// loop while the camera moves. The file is 160 ms long with a single click about
// 16 ms in, so the loop clicks every 160 ms. The haptic follows the same beat: one
// short pulse per click, never on its own.
//
// Short and weak: a 10 ms one-shot at the default amplitude reads as a light tick.
// React Native's Vibration is used on purpose instead of a haptics module - it
// needs no new native dependency (the shared node_modules follows the canonical
// checkout, and a new package would stall localhost until it is reinstalled), only
// the normal VIBRATE permission on Android. iOS ignores the duration and buzzes
// for ~400 ms, which is neither short nor weak, so iOS stays silent. On the web
// Vibration maps to navigator.vibrate (Android browsers); desktops ignore it.

import { Platform, Vibration } from "react-native";

/** One ratchet click: the loop period of observatory-ratchet.wav. */
export const RATCHET_CLICK_MS = 160;
/** One haptic pulse. */
export const RATCHET_PULSE_MS = 10;

export function ratchetHapticsSupported(os: string = Platform.OS): boolean {
  return os === "android" || os === "web";
}

/** A single short, weak pulse where the platform can make one. */
export function ratchetPulse(): void {
  if (!ratchetHapticsSupported()) return;
  try {
    Vibration.vibrate(RATCHET_PULSE_MS);
  } catch {
    // No vibrator, or the browser refused: the sound still plays.
  }
}

type Timers = {
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
};

/**
 * Pulses on the ratchet beat while the camera moves: one pulse right away (the
 * loop's first click lands ~16 ms in) and one every RATCHET_CLICK_MS until off.
 */
export function createRatchetLoop(
  pulse: () => void = ratchetPulse,
  // Wrapped, not `{ setInterval, clearInterval }`: calling the browser's
  // timers as methods of another object throws "Illegal invocation", which
  // killed the loop after its first pulse on the web (measured 2026-10-01).
  timers: Timers = { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) },
): { set: (on: boolean) => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    set(on: boolean) {
      if (on && timer === null) {
        pulse();
        timer = timers.setInterval(pulse, RATCHET_CLICK_MS);
      } else if (!on && timer !== null) {
        timers.clearInterval(timer);
        timer = null;
      }
    },
  };
}

/** A one-shot tick, throttled like the tick sound (useUiSound minIntervalMs 160). */
export function createRatchetTick(
  pulse: () => void = ratchetPulse,
  now: () => number = Date.now,
): () => void {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const t = now();
    if (t - last < RATCHET_CLICK_MS) return;
    last = t;
    pulse();
  };
}
