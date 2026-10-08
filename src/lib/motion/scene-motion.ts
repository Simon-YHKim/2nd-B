import { pixelSteps } from "./pixel-physical";

export type MotionScope = "phone" | "world";
export type SceneMotionKind = "push" | "back" | "open" | "home" | "page-forward" | "page-back" | "replace" | "sheet";
export interface SceneMotionSpec {
  duration: number;
  easing: (t: number) => number;
  from: { x: number; y: number; scale: number; opacity: number };
}

// Simon 2026-10-08: phone movement follows iPhone spatial conventions while
// the world remains stepped pixel animation. This exception is movement only;
// the phone's artwork, corners and settled geometry remain pixel art.
const phoneEaseOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const worldEase = pixelSteps(6);
const identity = { x: 0, y: 0, scale: 1, opacity: 1 };

export function sceneMotion(scope: MotionScope, kind: SceneMotionKind, reduced: boolean): SceneMotionSpec {
  const easing = scope === "phone" ? phoneEaseOut : worldEase;
  if (reduced) return { duration: 0, easing, from: identity };
  const from = { ...identity, opacity: 0 };
  if (scope === "phone") {
    switch (kind) {
      case "push": from.x = 96; break;
      case "back": from.x = -64; break;
      case "open": from.scale = 0.88; from.y = 20; break;
      case "home": from.scale = 1.06; break;
      case "page-forward": from.x = 120; break;
      case "page-back": from.x = -120; break;
      case "replace": from.y = 12; break;
      case "sheet": from.y = 64; break;
    }
    return { duration: kind === "open" || kind === "sheet" ? 320 : 280, easing, from };
  }
  // All distances are multiples of six. The easing's six steps therefore
  // move whole pixels on both native and web; scaling would blur the artwork.
  switch (kind) {
    case "push": case "page-forward": from.x = 24; break;
    case "back": case "page-back": from.x = -24; break;
    case "open": from.y = 24; break;
    case "home": from.y = -24; break;
    case "replace": from.y = 12; break;
    case "sheet": from.y = 48; break;
  }
  return { duration: kind === "open" || kind === "sheet" ? 240 : 180, easing, from };
}
