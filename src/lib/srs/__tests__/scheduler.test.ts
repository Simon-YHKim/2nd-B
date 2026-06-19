// Pure scheduler tests (ts-fsrs wrapper, no Supabase). Confirms each rating
// advances the card per ts-fsrs and that row<->card is a faithful round-trip.

import {
  reviewCard,
  rowToFsrsCard,
  fsrsCardToRow,
  localReviewDay,
  type SrsCardState,
} from "../scheduler";

const NOW = new Date("2026-06-19T09:00:00.000Z");

function newCardState(): SrsCardState {
  return {
    due: NOW.toISOString(),
    stability: null,
    difficulty: null,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0, // New
    last_review: null,
  };
}

describe("reviewCard (each rating advances due/state per ts-fsrs)", () => {
  test("a New card graded Good moves out of New and bumps reps", () => {
    const { card, log } = reviewCard(newCardState(), 3, NOW);
    expect(card.reps).toBe(1);
    expect(card.state).not.toBe(0); // left New
    expect(card.last_review).toBe(NOW.toISOString());
    expect(new Date(card.due).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    expect(log).toEqual({ rating: 3, reviewed_on: localReviewDay(NOW) });
  });

  test("Easy schedules the card no sooner than Good (later or equal due)", () => {
    const good = reviewCard(newCardState(), 3, NOW).card;
    const easy = reviewCard(newCardState(), 4, NOW).card;
    expect(new Date(easy.due).getTime()).toBeGreaterThanOrEqual(new Date(good.due).getTime());
  });

  test("Again on a New card keeps reps counted and stays in early state", () => {
    const { card } = reviewCard(newCardState(), 1, NOW);
    expect(card.reps).toBe(1);
    // Again never promotes to Review (state 2) from New.
    expect(card.state).not.toBe(2);
  });

  test("all four ratings produce a strictly-later-or-equal due than now", () => {
    for (const rating of [1, 2, 3, 4] as const) {
      const { card } = reviewCard(newCardState(), rating, NOW);
      expect(new Date(card.due).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    }
  });

  test("the review log records the local calendar day", () => {
    const { log } = reviewCard(newCardState(), 2, NOW);
    expect(log.reviewed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log.reviewed_on).toBe(localReviewDay(NOW));
  });
});

describe("row <-> fsrs card round-trip is faithful", () => {
  test("a graded (non-New) card survives row -> fsrs -> row unchanged", () => {
    const reviewed = reviewCard(newCardState(), 3, NOW).card;
    const back = fsrsCardToRow(rowToFsrsCard(reviewed, NOW));
    expect(back.due).toBe(reviewed.due);
    expect(back.stability).toBe(reviewed.stability);
    expect(back.difficulty).toBe(reviewed.difficulty);
    expect(back.reps).toBe(reviewed.reps);
    expect(back.lapses).toBe(reviewed.lapses);
    expect(back.state).toBe(reviewed.state);
    expect(back.last_review).toBe(reviewed.last_review);
  });

  test("grading the round-tripped card matches grading the original", () => {
    const reviewed = reviewCard(newCardState(), 3, NOW).card;
    const later = new Date("2026-06-25T09:00:00.000Z");
    const direct = reviewCard(reviewed, 3, later).card;
    const viaRoundTrip = reviewCard(fsrsCardToRow(rowToFsrsCard(reviewed, later)), 3, later).card;
    expect(viaRoundTrip.due).toBe(direct.due);
    expect(viaRoundTrip.state).toBe(direct.state);
    expect(viaRoundTrip.reps).toBe(direct.reps);
  });
});
