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
