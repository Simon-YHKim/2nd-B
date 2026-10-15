import { AccessibilityInfo, type EmitterSubscription } from "react-native";

// Do not animate a cold start before the OS preference has been read.
let reduced = true;
let revision = 0;
let subscription: EmitterSubscription | undefined;
const listeners = new Set<() => void>();

export function getSystemReducedMotion(): boolean { return reduced; }

function publish(value: boolean) {
  if (value === reduced) return;
  reduced = value;
  for (const notify of listeners) notify();
}

export function subscribeSystemReducedMotion(onChange: () => void): () => void {
  listeners.add(onChange);
  if (listeners.size === 1) {
    const request = ++revision;
    subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      ++revision; // A late initial read must never overwrite a newer OS event.
      publish(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (request === revision && listeners.size) publish(value);
    }).catch(() => { /* Keep the safer reduced path if the OS read fails. */ });
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      ++revision;
      subscription?.remove();
      subscription = undefined;
    }
  };
}
