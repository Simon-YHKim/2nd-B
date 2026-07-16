// SecondB face geometry — the single source of truth for every expression the
// head can make. Pure data + pure policy (no React, no RN) so the whole
// vocabulary is unit-testable and SecondbHead.tsx stays a renderer.
//
// The face is procedural (two glowing eyes + an SVG mouth over the fixed canon
// head PNG), so an "expression" is just geometry: per-eye lid height / tilt /
// arc, a mouth kind, and a blink cadence. Everything stays inside the
// deep-space cyan identity — no new assets, no extra colors, no floating orbs.
//
// Vocabulary (13). The three base moods stay for back-compat; the rest map to
// concrete app moments (wired via EXPRESSION_BY_EVENT + reactExpression call
// sites):
//   neutral / positive / negative  — base moods (screens' `mood` prop)
//   happy      저장·완료             — arc-closed smiling eyes + open smile
//   delight    정보 업데이트·통찰      — wide bright eyes + open smile
//   smug       제안 성공·잘난척        — one lid half-lowered + side smirk
//   wink       승인(ratify)·가벼운 OK — one eye closed arc + smile
//   surprised  뜻밖의 새 소식          — round wide eyes + small o mouth
//   thinking   AI 응답 대기 (hold)    — eyes drift up-side + short flat mouth
//   sad        데이터 삭제·소실        — deep droop + frown, longer hold
//   bored      한참 조용할 때          — half lids + look-away + flat mouth
//   whistle    한가할 때 딴청          — relaxed lids + small o mouth + notelet
//   sleepy     아주 오래 조용할 때     — near-closed lids + slow blink

export type Expression =
  | "neutral"
  | "positive"
  | "negative"
  | "happy"
  | "delight"
  | "smug"
  | "wink"
  | "surprised"
  | "thinking"
  | "sad"
  | "bored"
  | "whistle"
  | "sleepy";

export type MouthKind = "smile" | "flat" | "frown" | "open" | "o" | "smirk";

export interface EyeSpec {
  /** Lid openness vs neutral (1 = fully open). Ignored when `arc`. */
  h: number;
  /** Vertical center as a fraction of head size. */
  top: number;
  /** Outer-corner tilt in degrees (mirrored per side by the renderer). */
  tilt: number;
  /** Render as a closed smiling arc (∪) instead of a glowing pill. */
  arc?: boolean;
}

export interface FaceSpec {
  /** [left, right] — asymmetry is what sells wink/smug. */
  eyes: [EyeSpec, EyeSpec];
  mouth: MouthKind;
  /** Mouth width multiplier vs the base mouth (o/whistle shrink it). */
  mouthScale?: number;
  /** Fixed gaze offset as a fraction of head size (thinking/bored look away). */
  lookX?: number;
  lookY?: number;
  /** Float a tiny cyan notelet beside the mouth (whistle only). */
  note?: boolean;
  /** Blink cadence for this face. `none` for arc/closed eyes. */
  blink: "normal" | "slow" | "none";
}

const EYE_NEUTRAL: EyeSpec = { h: 1, top: 0.603, tilt: 0 };

export const FACES: Record<Expression, FaceSpec> = {
  neutral: { eyes: [EYE_NEUTRAL, EYE_NEUTRAL], mouth: "flat", blink: "normal" },
  positive: {
    eyes: [
      { h: 0.58, top: 0.603, tilt: 0 },
      { h: 0.58, top: 0.603, tilt: 0 },
    ],
    mouth: "smile",
    blink: "normal",
  },
  negative: {
    eyes: [
      { h: 0.9, top: 0.620, tilt: 8 },
      { h: 0.9, top: 0.620, tilt: 8 },
    ],
    mouth: "frown",
    blink: "normal",
  },
  happy: {
    eyes: [
      { h: 0.5, top: 0.598, tilt: 0, arc: true },
      { h: 0.5, top: 0.598, tilt: 0, arc: true },
    ],
    mouth: "open",
    blink: "none",
  },
  delight: {
    eyes: [
      { h: 1.25, top: 0.596, tilt: 0 },
      { h: 1.25, top: 0.596, tilt: 0 },
    ],
    mouth: "open",
    blink: "normal",
  },
  smug: {
    eyes: [
      { h: 0.52, top: 0.608, tilt: -6 },
      { h: 0.95, top: 0.598, tilt: 0 },
    ],
    mouth: "smirk",
    blink: "normal",
  },
  wink: {
    eyes: [
      { h: 1, top: 0.603, tilt: 0 },
      { h: 0.5, top: 0.603, tilt: 0, arc: true },
    ],
    mouth: "smile",
    blink: "none",
  },
  surprised: {
    eyes: [
      { h: 1.35, top: 0.596, tilt: 0 },
      { h: 1.35, top: 0.596, tilt: 0 },
    ],
    mouth: "o",
    mouthScale: 0.72,
    blink: "none",
  },
  thinking: {
    eyes: [
      { h: 0.92, top: 0.590, tilt: 0 },
      { h: 0.92, top: 0.590, tilt: 0 },
    ],
    mouth: "flat",
    mouthScale: 0.7,
    lookX: 0.022,
    lookY: -0.018,
    blink: "slow",
  },
  sad: {
    eyes: [
      { h: 0.78, top: 0.628, tilt: 14 },
      { h: 0.78, top: 0.628, tilt: 14 },
    ],
    mouth: "frown",
    blink: "slow",
  },
  bored: {
    eyes: [
      { h: 0.48, top: 0.613, tilt: 0 },
      { h: 0.48, top: 0.613, tilt: 0 },
    ],
    mouth: "flat",
    mouthScale: 0.8,
    lookX: -0.024,
    blink: "slow",
  },
  whistle: {
    eyes: [
      { h: 0.62, top: 0.600, tilt: 0 },
      { h: 0.62, top: 0.600, tilt: 0 },
    ],
    mouth: "o",
    mouthScale: 0.55,
    lookX: 0.014,
    lookY: -0.012,
    note: true,
    blink: "normal",
  },
  sleepy: {
    eyes: [
      { h: 0.32, top: 0.618, tilt: 4 },
      { h: 0.32, top: 0.618, tilt: 4 },
    ],
    mouth: "flat",
    mouthScale: 0.6,
    blink: "slow",
  },
};

/**
 * Per-expression reaction hold (ms) before the face reverts. Stronger moments
 * linger a beat longer than the 1.5s default; a wink is quick by nature.
 */
export const REACTION_HOLD_MS: Partial<Record<Expression, number>> = {
  sad: 2400,
  delight: 1900,
  smug: 2000,
  happy: 1700,
  surprised: 1400,
  wink: 1100,
};

// ── Idle policy (평소 딴청) — pure so the cadence is testable ─────────────────
//
// Blinking is continuous (the renderer owns it). ON TOP of that, a quiet head
// occasionally does something small: mostly nothing, sometimes a whistle,
// sometimes a bored look-away; after a long stretch, sleepy. Frequencies stay
// low on purpose — the head is a companion presence, not a circus (information-
// density rule: it must never compete with the screen's one message).

export interface IdleAction {
  expr: Extract<Expression, "whistle" | "bored" | "sleepy"> | null;
  holdMs: number;
}

/** Time until the NEXT idle roll (14–28s). */
export function nextIdleDelayMs(rand: () => number = Math.random): number {
  return 14_000 + Math.floor(rand() * 14_000);
}

/** After this much total quiet, the roll may come up sleepy instead of bored. */
export const SLEEPY_AFTER_MS = 90_000;

/**
 * One idle roll: 50% nothing, 25% whistle (~2.4s), 25% bored (~3.2s); once the
 * head has been quiet past SLEEPY_AFTER_MS the bored slot deepens to sleepy.
 */
export function pickIdleAction(rand: () => number = Math.random, quietMs = 0): IdleAction {
  const r = rand();
  if (r < 0.5) return { expr: null, holdMs: 0 };
  if (r < 0.75) return { expr: "whistle", holdMs: 2400 };
  if (quietMs >= SLEEPY_AFTER_MS) return { expr: "sleepy", holdMs: 4200 };
  return { expr: "bored", holdMs: 3200 };
}
