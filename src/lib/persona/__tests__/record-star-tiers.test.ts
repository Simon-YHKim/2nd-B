// D9 tier writer. Mocks supabase (.insert capture + a configurable prior-level
// select chain) and ../analytics (captureEvent capture) to assert the funnel
// events delta-fire correctly.

const inserts: { table: string; payload: unknown }[] = [];
// Prior star_tier_history rows the select chain returns (newest-first).
let priorRows: { star_id: string; level: number; recorded_at: string }[] = [];

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        inserts.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      },
      // select(...).eq(...).order(...).limit(...) resolves to the prior rows.
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: priorRows, error: null }),
        };
        return chain;
      },
    }),
  }),
}));

const captureEvent = jest.fn();
jest.mock("../../analytics", () => ({
  captureEvent: (...args: unknown[]) => captureEvent(...args),
  starLit: (props: unknown) => ({ name: "star_lit", props }),
  activationMilestone: (props: unknown) => ({ name: "activation_milestone", props }),
}));

import { recordStarTiers } from "../record-star-tiers";
import type { StarId } from "../stars";
import type { LadderLevel } from "../brightness";

function reset() {
  inserts.length = 0;
  priorRows = [];
  captureEvent.mockClear();
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

function eventsNamed(name: string): { name: string; props: Record<string, unknown> }[] {
  return captureEvent.mock.calls
    .map((c) => c[0] as { name: string; props: Record<string, unknown> })
    .filter((e) => e.name === name);
}

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
    expect(captureEvent).not.toHaveBeenCalled();
  });

  test("fires star_lit once per star that climbed above its prior level", async () => {
    // Prior: now at L3, values at L3 (no change for values, +1 for now).
    priorRows = [
      { star_id: "now", level: 3, recorded_at: "2026-06-05T00:00:00Z" },
      { star_id: "values", level: 3, recorded_at: "2026-06-05T00:00:00Z" },
    ];
    // recall 2 (>default L1 -> climbed), relational 4 (>L1 -> climbed),
    // now 4 (>3 -> climbed), values 3 (==3 -> no), seen/rhythm/possible stay L1.
    await recordStarTiers("u1", ALL);
    const lit = eventsNamed("star_lit");
    const litStars = lit.map((e) => e.props.star_id).sort();
    expect(litStars).toEqual(["now", "recall", "relational"].sort());
    expect(lit.find((e) => e.props.star_id === "now")?.props.ladder_level).toBe(4);
  });

  test("fires nothing for star_lit when prior === new for every star", async () => {
    priorRows = (Object.entries(ALL) as [StarId, LadderLevel][]).map(([star_id, level]) => ({
      star_id,
      level,
      recorded_at: "2026-06-05T00:00:00Z",
    }));
    await recordStarTiers("u1", ALL);
    expect(eventsNamed("star_lit")).toHaveLength(0);
  });

  test("fires activation_milestone for a full seven-star set when lit-count grows", async () => {
    // No prior history -> all stars start at the implicit default L1 (0 lit).
    // ALL has now/recall/relational/values >= L2 -> 4 lit now.
    await recordStarTiers("u1", ALL);
    const milestones = eventsNamed("activation_milestone");
    expect(milestones).toHaveLength(1);
    expect(milestones[0].props.stars_lit_count).toBe(4);
    expect(typeof milestones[0].props.soul_core_brightness).toBe("number");
  });

  test("does not fire activation_milestone on a single-star (review.tsx) path", async () => {
    await recordStarTiers("u1", { now: 4 });
    expect(eventsNamed("activation_milestone")).toHaveLength(0);
    // The single climbed star still fires star_lit.
    expect(eventsNamed("star_lit")).toHaveLength(1);
  });
});
