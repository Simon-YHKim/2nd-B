// A "piece" the user captured lands in one of two tables, decided entirely by HOW it was
// captured -- nothing the user would ever think about:
//
//   records   typed notes, journal, 4W1H, todos, voice transcripts
//   sources   links, clips, imports (the source-origin captures)
//
// /records showed both. /insights counted only `records`. So a user who captures links and
// clips saw their pieces sitting in the list, then read on /insights that this was their
// "first week". The app reported LESS than they put in -- the one thing the constellation
// is not allowed to do (docs/CONSTELLATION-DESIGN.md: 별빛 = 내가 얼마나 넣었나).
//
// The two screens each merged by hand, which is how they drifted apart. Now the sources
// half lives in one place and both call it.

import { listSourcePieces } from "../source-pieces";

const from = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: (...args: unknown[]) => from(...args) }),
}));

function mockQuery(result: { data: unknown; error: unknown }): void {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) chain[m] = jest.fn(() => chain);
  chain.limit = jest.fn(async () => result);
  from.mockReturnValue(chain);
}

afterEach(() => jest.clearAllMocks());

describe("listSourcePieces", () => {
  test("maps a source row onto the shape a record row has", () => {
    mockQuery({
      data: [{ id: "abc", title: "A link I clipped", captured_at: "2026-07-10T09:00:00Z", tags: ["link"] }],
      error: null,
    });
    return expect(listSourcePieces("u1")).resolves.toEqual([
      {
        // Prefixed so it can never collide with a records id in a merged list.
        id: "src-abc",
        title: "A link I clipped",
        // Renamed from captured_at so it merges with record rows unchanged.
        created_at: "2026-07-10T09:00:00Z",
        tags: ["link"],
      },
    ]);
  });

  test("a read failure throws -- it is not 'you captured nothing'", async () => {
    mockQuery({ data: null, error: { message: "network error" } });
    await expect(listSourcePieces("u1")).rejects.toMatchObject({ message: "network error" });
  });

  test("a genuinely empty read returns []", async () => {
    mockQuery({ data: [], error: null });
    await expect(listSourcePieces("u1")).resolves.toEqual([]);
  });
});

// Both screens must count the same thing. There is no RN renderer in this jest setup, so
// assert the source shape -- CRLF-normalized, because a scanner that reads the wrong text
// still reports PASS.
describe("/insights and /records count the same pieces", () => {
  const read = (rel: string): string =>
    (require("fs").readFileSync(require("path").resolve(__dirname, "../../../", rel), "utf8") as string).replace(
      /\r\n/g,
      "\n",
    );

  const insights = read("screens/deepspace/DeepSpaceDesignScreens.tsx");
  const records = read("screens/deepspace/dds-wiki-records-screens.tsx");

  test("/insights reads sources, not just records", () => {
    expect(insights).toMatch(/listSourcePieces/);
    expect(insights).toMatch(/Promise\.all\(\[listRecentRecords\(userId\), listSourcePieces\(userId\)\]\)/);
  });

  test("/records reads sources through the shared function, not its own inline query", () => {
    expect(records).toMatch(/listSourcePieces\(userId\)/);
    // The inline `.from("sources")` it used to carry is gone: two hand-rolled merges are
    // what let the screens disagree in the first place.
    expect(records).not.toMatch(/\.from\("sources"\)/);
  });
});
