// gatherRisingInterests used to swallow every read failure into `[]`:
//
//   } catch {
//     return [];   // "so the screen always renders its empty/error states"
//   }
//
// It could not. `[]` IS the empty state. A dropped connection was indistinguishable
// from "you have no rising interests yet", so /discover told the user they had captured
// nothing when in truth we simply could not look. And supabase-js does not throw on a
// query error -- it returns { error } -- so that catch block never even fired for the
// case it was written for.
//
// Now: a read failure throws, and only a real, successful read can return [].

import { gatherRisingInterests } from "../gather";

const from = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: (...args: unknown[]) => from(...args) }),
}));

/** Chainable stub for `.select().eq().gte().order()` resolving to `result`. */
function mockQuery(result: { data: unknown; error: unknown }): void {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte"]) chain[m] = jest.fn(() => chain);
  chain.order = jest.fn(async () => result);
  from.mockReturnValue(chain);
}

const NOW = new Date("2026-07-14T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 864e5).toISOString();

afterEach(() => {
  jest.clearAllMocks();
});

describe("gatherRisingInterests", () => {
  test("a query error throws instead of masquerading as 'nothing rising'", async () => {
    mockQuery({ data: null, error: { message: "network error" } });
    await expect(gatherRisingInterests("u1", NOW)).rejects.toEqual({ message: "network error" });
  });

  test("a successful read with no records returns [] -- genuinely empty", async () => {
    mockQuery({ data: [], error: null });
    await expect(gatherRisingInterests("u1", NOW)).resolves.toEqual([]);
  });

  test("ranks a tag that rose from the prior week to the recent one", async () => {
    mockQuery({
      data: [
        // recent window (0-7d): 커리어 x3
        { tags: ["커리어"], created_at: daysAgo(1) },
        { tags: ["커리어"], created_at: daysAgo(2) },
        { tags: ["커리어"], created_at: daysAgo(3) },
        // prior window (7-14d): 커리어 x1
        { tags: ["커리어"], created_at: daysAgo(9) },
      ],
      error: null,
    });
    const rows = await gatherRisingInterests("u1", NOW);
    const career = rows.find((r) => r.tag === "커리어");
    expect(career).toMatchObject({ recent: 3, prior: 1, delta: 2 });
  });

  test("a null tags column does not blow up the mapping", async () => {
    mockQuery({ data: [{ tags: null, created_at: daysAgo(1) }], error: null });
    await expect(gatherRisingInterests("u1", NOW)).resolves.toEqual([]);
  });
});

// The screen is the other half: it must keep "could not read" and "nothing yet" apart.
// There is no RN renderer in this jest setup, so assert the source shape -- same
// approach the repo's other screen guards use.
describe("/discover renders real data, not fixtures", () => {
  // Normalize CRLF first. The repo checks out with CRLF on Windows, so slicing on a
  // literal "\n}\n" silently found nothing and left `body` two characters long -- a
  // guard that reads the wrong text still reports PASS, which is worse than no guard.
  const src = (
    require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    ) as string
  ).replace(/\r\n/g, "\n");
  const screen = src.slice(src.indexOf("export function DeepSpaceDiscoverScreen"));
  const end = screen.indexOf("\n}\n");
  const body = screen.slice(0, end === -1 ? screen.length : end + 3);

  test("the guard is reading the real function body, not an empty slice", () => {
    expect(body.length).toBeGreaterThan(500);
    expect(body).toContain("DeepSpaceDiscoverScreen");
  });

  test("no hardcoded percentages survive", () => {
    expect(body).not.toMatch(/percent:\s*\d+/);
  });

  test("it reads the user's own rising interests", () => {
    expect(body).toMatch(/gatherRisingInterests\(userId\)/);
  });

  test("a failed read is a distinct state from an empty one", () => {
    // null = read failed, [] = genuinely nothing. Collapsing them is the bug.
    expect(body).toMatch(/\.catch\(\(\) => alive && setRising\(null\)\)/);
    expect(body).toMatch(/discover\.error/);
    expect(body).toMatch(/discover\.empty/);
  });
});

describe("/discover is reachable from BOTH insights states (audit 260904 A3)", () => {
  const src = (
    require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    ) as string
  ).replace(/\r\n/g, "\n");

  // The regression this pins: the only door to /discover used to sit in the
  // filled week-over-week branch, so a user with weeks of history but a quiet
  // recent week (which reads as first-week) had no path to a screen that was
  // fully built on their historical data. Verified live: the QA account (102
  // records, quiet recent week) landed on the first-week state with no door.
  const insights = src.slice(
    src.indexOf("function DeepSpaceInsightsScreen"),
    src.indexOf("function DeepSpaceInsightsScreen") >= 0
      ? src.indexOf("\n}\n", src.indexOf("summary.isFirstWeek")) // through the first-week branch and beyond
      : undefined,
  );

  test("the guard is reading a real slice", () => {
    expect(src).toContain("summary.isFirstWeek");
    expect(src).toContain('router.push("/discover")');
  });

  test("the first-week branch carries a /discover door", () => {
    // Locate the first-week return block and assert the discover push appears
    // inside it — not only in the filled branch further down.
    const fw = src.indexOf("summary.isFirstWeek");
    expect(fw).toBeGreaterThan(-1);
    // The first-week branch ends at its own "  }" closing the `if`. Take a
    // generous window and require the discover door within it.
    const window = src.slice(fw, fw + 1600);
    expect(window).toContain('router.push("/discover")');
    // And the capture CTA stays the primary action in that same branch.
    expect(window).toContain('router.push("/capture")');
  });

  test("the door appears at least twice overall (first-week + filled)", () => {
    const count = (src.match(/router\.push\("\/discover"\)/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
