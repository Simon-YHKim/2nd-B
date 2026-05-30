// Signature motion — the three named brand moments of the Cosmic Pixel
// Graph Village (DESIGN.md → Motion → "Signature motion"):
//
//   1) 저장 / Save        "루루 뽁"        — one pop overshoot (+ playPop on web)
//   2) 연결 발견 / Connect "아치 라인 켜짐"  — a line illuminates dim → bright
//   3) 공상 / Imagine     "벨라 핑크 신호"  — a soft pink presence pulse
//
// This module holds the PURE specs (timings, magnitudes, accents) so they
// are a single source of truth, testable without a renderer, and exactly
// match the numbers documented in DESIGN.md. The Animated wiring lives in
// `src/components/motion/useSignatureMotion.ts` and consumes these.
//
// The one sanctioned bounce in the whole product is the "뽁" overshoot
// (cap 1.25x, settle ~400ms). Everything else is ease-out, no spring.

import type { CharacterId } from "../characters";

export interface SaveMotionSpec {
  /** Scale value the pop dips to before the overshoot. */
  startScale: number;
  /** Overshoot cap — never exceed 1.25 (DESIGN.md bounce exception). */
  overshootScale: number;
  /** Attack to the overshoot peak, ms. */
  attackMs: number;
  /** Settle from peak back to 1.0, ms. attack + settle ≈ 400ms total. */
  settleMs: number;
  accent: CharacterId;
}

export interface ConnectionMotionSpec {
  fromOpacity: number;
  toOpacity: number;
  /** Dim → bright illumination, ms. */
  durationMs: number;
  accent: CharacterId;
}

export interface ImagineMotionSpec {
  /** Trough opacity at the start/loop bottom. */
  minOpacity: number;
  /** Peak opacity. */
  peakOpacity: number;
  /** Opacity it rests at between pulses. */
  restOpacity: number;
  /** Scale ceiling — stays subtle, never reads as bounce. */
  maxScale: number;
  /** One full pulse, ms. */
  durationMs: number;
  accent: CharacterId;
}

export const SAVE_MOTION: SaveMotionSpec = {
  startScale: 0.9,
  overshootScale: 1.25,
  attackMs: 140,
  settleMs: 260,
  accent: "lulu",
};

export const CONNECTION_MOTION: ConnectionMotionSpec = {
  fromOpacity: 0.25,
  toOpacity: 1,
  durationMs: 500,
  accent: "archi",
};

export const IMAGINE_MOTION: ImagineMotionSpec = {
  minOpacity: 0.4,
  peakOpacity: 1,
  restOpacity: 0.6,
  maxScale: 1.05,
  durationMs: 600,
  accent: "vela",
};

/** Total wall-clock of the save pop, ms. Documented as ~400ms. */
export function savePopTotalMs(spec: SaveMotionSpec = SAVE_MOTION): number {
  return spec.attackMs + spec.settleMs;
}

/**
 * Whether motion should be suppressed. On web we honour the OS
 * `prefers-reduced-motion` setting; on native (no matchMedia) we always
 * animate. Pure + side-effect-free read, safe to call in render.
 */
export function prefersReducedMotion(): boolean {
  const g = globalThis as unknown as {
    matchMedia?: (q: string) => { matches: boolean };
  };
  if (typeof g.matchMedia !== "function") return false;
  try {
    return g.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
