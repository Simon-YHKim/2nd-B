// Per-character self-talk (혼잣말) for the speech bubble shown when a worker is
// tapped on the main graph (2026-06-01 user directive). Each line fits that
// character's personality — see personas.ts — and is SELF-TALK muttered while
// they work the village, not a message addressed to the user. Pure data + a
// tested picker so the lines stay a single source of truth. Project register
// only: no clinical / technical terms (see src/lib/safety/lexicon.ts).

import type { WorkerId } from "@/components/art/WorkerSprite";
import { tLocaleArray } from "@/lib/i18n/text";

const WORKER_IDS: readonly WorkerId[] = ["secondb", "archi", "gadi", "lulu", "momo", "lumi"];

function monologueWorker(id: WorkerId): WorkerId {
  return WORKER_IDS.includes(id) ? id : "secondb";
}

/** Every self-talk line for a worker in the given locale (falls back to 세컨비). */
export function monologuesFor(id: WorkerId, locale: "en" | "ko"): readonly string[] {
  return tLocaleArray(locale, "secondb", `monologues.${monologueWorker(id)}`);
}

/** Pick one self-talk line. `r` is a 0..1 fraction (e.g. Math.random()); pure so
 *  the index math is testable. Returns "" only if a worker had no lines. */
export function pickMonologue(id: WorkerId, locale: "en" | "ko", r: number): string {
  const lines = monologuesFor(id, locale);
  if (lines.length === 0) return "";
  const frac = Number.isFinite(r) ? ((r % 1) + 1) % 1 : 0;
  return lines[Math.min(lines.length - 1, Math.floor(frac * lines.length))];
}
