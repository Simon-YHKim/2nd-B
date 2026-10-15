import type { HustleKExpressionId } from "@/lib/assets/hustlek";

export type HustleKMouthPose = "small" | "open";
export type HustleKLifeFrame = { expression: HustleKExpressionId; durationMs: number };

// Deliberately uneven, with closed-mouth beats between short syllable groups.
const SPEECH_BEATS: readonly { mouth: HustleKMouthPose | null; durationMs: number }[] = [
  { mouth: "small", durationMs: 110 },
  { mouth: null, durationMs: 85 },
  { mouth: "open", durationMs: 130 },
  { mouth: "small", durationMs: 95 },
  { mouth: null, durationMs: 160 },
  { mouth: "small", durationMs: 120 },
  { mouth: "open", durationMs: 105 },
  { mouth: null, durationMs: 140 },
];

export function hustlekSpeechBeat(index: number) {
  return SPEECH_BEATS[Math.max(0, Math.floor(index)) % SPEECH_BEATS.length];
}

/** Missing text supports callers without a typewriter; empty text has not spoken yet. */
export function hustlekSpeechGap(text?: string): boolean {
  return text !== undefined && (text.length === 0 || /[\s.,!?，。！？…:;]$/u.test(text));
}

export function hustlekIdleDelay(random: () => number = Math.random): number {
  return 14_000 + Math.floor(Math.max(0, Math.min(1, random())) * 10_000);
}

/** Small, intentional idle vocabulary. A newly opened home never looks tired. */
export function hustlekIdleSequence(quietMs: number, random: () => number = Math.random): readonly HustleKLifeFrame[] {
  const roll = Math.max(0, Math.min(1, random()));
  if (quietMs >= 60_000 && roll >= 0.55) {
    return [
      { expression: "D11", durationMs: 1500 },
      { expression: "D10", durationMs: 2200 },
    ];
  }
  return [{ expression: roll < 0.5 ? "A02" : "A03", durationMs: 2000 + Math.round(roll * 800) }];
}

/** Live embellishment must not smile over a meaningful worried/thoughtful face. */
export function hustlekAllowsLife(expression: HustleKExpressionId): boolean {
  return expression === "A01" || expression === "A02";
}
