import type { LadderLevel } from "./brightness";
import { isUnlived, type SevenStarId } from "./seven-stars";

/** Both paths start at the same profile; progress in one never unlocks the other. */
export const STAR_ENTRY_TRACKS = [
  ["profile", "infancy", "school", "twenties", "later"],
  ["profile", "work", "now"],
] as const satisfies readonly (readonly SevenStarId[])[];

const PREVIOUS_STAR: Record<SevenStarId, SevenStarId | null> = {
  profile: null,
  infancy: "profile",
  school: "infancy",
  twenties: "school",
  later: "twenties",
  work: "profile",
  now: "work",
};

export type StarEntryStatus =
  | { kind: "available" }
  | { kind: "unlived" }
  | { kind: "previous"; prerequisite: SevenStarId };

/** L2 means the previous star has its first saved input. Never infer progress from age. */
export function starEntryStatus(
  id: SevenStarId,
  levels: Partial<Record<SevenStarId, LadderLevel>>,
  age: number | null,
): StarEntryStatus {
  if (isUnlived(id, age)) return { kind: "unlived" };
  const prerequisite = PREVIOUS_STAR[id];
  if (prerequisite && (levels[prerequisite] ?? 1) < 2) {
    return { kind: "previous", prerequisite };
  }
  return { kind: "available" };
}
