// D9 tier writer. Mocks supabase .insert to capture the persisted rows.

const inserts: { table: string; payload: unknown }[] = [];

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        inserts.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

import { recordStarTiers } from "../record-star-tiers";
import type { StarId } from "../stars";
import type { LadderLevel } from "../brightness";

function reset() {
  inserts.length = 0;
}

const ALL: Record<StarId, LadderLevel> = {
  now: 4,
  recall: 2,
  seen: 1,
  rhythm: 1,
  relational: 4,
  possible: 1,
  values: 3,
};

describe("recordStarTiers", () => {
  beforeEach(reset);

  test("inserts one star_tier_history row per star with user_id/star_id/level", async () => {
    await recordStarTiers("u1", ALL);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("star_tier_history");
    const rows = inserts[0].payload as { user_id: string; star_id: string; level: number }[];
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.user_id === "u1")).toBe(true);
    expect(rows).toContainEqual({ user_id: "u1", star_id: "now", level: 4 });
    expect(rows).toContainEqual({ user_id: "u1", star_id: "relational", level: 4 });
  });

  test("no insert when there are no levels", async () => {
    await recordStarTiers("u1", {} as Record<StarId, LadderLevel>);
    expect(inserts).toHaveLength(0);
  });
});
