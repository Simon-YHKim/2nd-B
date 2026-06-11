// Render-path subscription for the reduced-motion preference (lite-mode
// review #2).
//
// prefersReducedMotion() became user-mutable when lite mode (O-R2 ③) started
// ORing into it, but the React Compiler memoizes zero-input render calls per
// component instance - a component that read the pure function during render
// would freeze on the value it saw at mount and never follow a lite toggle.
// This hook subscribes to the lite-mode store so consumers re-render on
// toggle; the OS matchMedia half keeps the per-mount read it always had
// (OS-level pref changes mid-session were never supported).
//
// Rule of thumb: render paths (and effects that gate ambient loops) use this
// hook; one-shot effect/handler reads may keep the pure function.

import { useLiteMode } from "../settings/lite-mode";
import { prefersReducedMotion } from "./signature";

export function useReducedMotionPref(): boolean {
  const { liteMode } = useLiteMode();
  return liteMode || prefersReducedMotion();
}
