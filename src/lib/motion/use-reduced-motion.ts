// Both OS changes and the in-app lite switch settle ongoing motion immediately.
import { useSyncExternalStore } from "react";
import { useLiteMode } from "../settings/lite-mode";
import { getSystemReducedMotion, subscribeSystemReducedMotion } from "./system-reduced-motion";

export function useReducedMotionPref(): boolean {
  const { liteMode } = useLiteMode();
  const systemReduced = useSyncExternalStore(subscribeSystemReducedMotion, getSystemReducedMotion, () => true);
  return liteMode || systemReduced;
}
