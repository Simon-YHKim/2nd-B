// F8 guard: a deterministic rebuild must never regress a user-ratified star.
// deriveStarLevels lifts each star to max(deterministic, standing-ratified), so a
// ratified L5 survives a rebuild (keeping it lit + preventing a phantom "down" nudge).

import { deriveStarLevels } from "../star-levels";
import type { PersonaCard } from "../build";
import type { StarId } from "../stars";
import type { LadderLevel } from "../brightness";

// Minimal card: no trait confidence, no attachment, no values, no patterns ->
// every star derives to its floor (now=1, values=1, relational=1, ...).
function bareCard(overrides: Partial<PersonaCard> = {}): PersonaCard {
  return {
    traitConfidence: undefined,
    attachment: null,
    values: [],
    patterns: {},
    ...overrides,
  } as unknown as PersonaCard;
}

describe("F8: deriveStarLevels honors standing ratified tiers", () => {
  test("with no ratification, deterministic floors apply (baseline)", () => {
    const lv = deriveStarLevels(bareCard(), 0);
    expect(lv.now).toBe(1);
    expect(lv.values).toBe(1);
  });

  test("a ratified L5 lifts a deterministic-L1 star to 5 (the durable-L5 path)", () => {
    const ratified: Partial<Record<StarId, LadderLevel>> = { now: 5 };
    const lv = deriveStarLevels(bareCard(), 0, ratified);
    expect(lv.now).toBe(5); // was 1 deterministically -> lifted, not regressed
    expect(lv.values).toBe(1); // untouched stars stay at their derived level
  });

  test("a ratified tier BELOW the deterministic one never lowers it (max, not overwrite)", () => {
    // 3+ engaged value frameworks -> deterministic values L3.
    const card = bareCard({ values: ["a", "b", "c"] as unknown as PersonaCard["values"] });
    const lv = deriveStarLevels(card, 0, { values: 2 });
    expect(lv.values).toBe(3);
  });

  test("lifts multiple stars independently", () => {
    const lv = deriveStarLevels(bareCard(), 0, { now: 5, recall: 4 });
    expect(lv.now).toBe(5);
    expect(lv.recall).toBe(4);
    expect(lv.relational).toBe(1);
  });
});
