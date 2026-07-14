// EVERY link, clip and import in /records was a dead tap.
//
// The list merges two tables. Source pieces (link / clip / import) carry a `src-` prefixed
// id so they cannot collide with record ids in the merged list. Tapping any row pushes
// /record/[id].
//
// The LIVE detail screen (DeepSpaceRecordDetailScreen) called getRecordById(), which
// queries `records`. So it looked for `src-<uuid>` in the records table, found nothing, and
// showed "찾을 수 없어요".
//
// The legacy record-detail screen gets this RIGHT -- src/app/record/[id].tsx:65 has a
// correct `origin === "source"` branch. It just never runs: line 263 is
// `if (isDeepSpaceUI()) return <DeepSpaceRecordDetailScreen />`, and deep-space is the
// default. Correct code, unreachable. That is why the bug survived a screen that visibly
// handles the case.
//
// I asserted the opposite in #984 -- "the other 11 /record/[id] call sites are FINE, they
// push record ids" -- having checked the call sites and not the RECEIVER. The ids are fine.
// The lookup was not.

import { getPieceById, isSourcePieceId, SOURCE_ID_PREFIX } from "../get-piece";

const from = jest.fn();
const getRecordById = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: (...args: unknown[]) => from(...args) }),
}));
jest.mock("../create", () => ({
  getRecordById: (...args: unknown[]) => getRecordById(...args),
}));

function mockSource(result: { data: unknown; error: unknown }): void {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => result);
  from.mockReturnValue(chain);
}

afterEach(() => jest.clearAllMocks());

describe("the id says which table it lives in", () => {
  test("a source piece id is recognised by its prefix", () => {
    expect(isSourcePieceId("src-abc")).toBe(true);
    expect(isSourcePieceId("abc")).toBe(false);
    expect(SOURCE_ID_PREFIX).toBe("src-");
  });
});

describe("getPieceById", () => {
  test("a plain id goes to the records table", async () => {
    getRecordById.mockResolvedValue({ id: "r1", kind: "note", topic: "t", body: "b", tags: [], created_at: "x" });
    const piece = await getPieceById("u1", "r1");
    expect(getRecordById).toHaveBeenCalledWith("u1", "r1");
    expect(from).not.toHaveBeenCalled();
    expect(piece?.origin).toBe("record");
  });

  test("a src- id goes to the sources table, with the prefix stripped for the query", async () => {
    mockSource({
      data: { id: "abc", kind: "link", title: "A clipped article", captured_at: "2026-07-10T09:00:00Z", tags: ["link"] },
      error: null,
    });
    const piece = await getPieceById("u1", "src-abc");
    expect(getRecordById).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("sources");
    expect(piece).toMatchObject({
      // The prefixed id is kept: it is what the route carries.
      id: "src-abc",
      topic: "A clipped article",
      created_at: "2026-07-10T09:00:00Z",
      origin: "source",
      // `sources` has no body column -- a clip is its title plus its tags.
      body: null,
    });
  });

  test("a genuinely missing source returns null", async () => {
    mockSource({ data: null, error: null });
    await expect(getPieceById("u1", "src-gone")).resolves.toBeNull();
  });

  test("a read failure throws -- 'we could not look' is not 'it was deleted'", async () => {
    mockSource({ data: null, error: { message: "network error" } });
    await expect(getPieceById("u1", "src-abc")).rejects.toMatchObject({ message: "network error" });
  });

  test("an explicit origin=source works on a RAW uuid, with no prefix", async () => {
    // /core-brain does not prefix. Its evidence shards keep the raw uuid and carry `origin`
    // as a separate field, so the caller has to pass it. Supporting both conventions is not
    // indulgence: a caller that forgets the origin is exactly how this bug worked.
    mockSource({ data: { id: "abc", kind: "link", title: "t", captured_at: "x", tags: [] }, error: null });
    const piece = await getPieceById("u1", "abc", "source");
    expect(getRecordById).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("sources");
    expect(piece?.origin).toBe("source");
  });
});

const read = (rel: string): string =>
  (require("fs").readFileSync(require("path").resolve(__dirname, "../../../", rel), "utf8") as string).replace(
    /\r\n/g,
    "\n",
  );

describe("the live detail screen resolves both kinds", () => {
  const src = read("screens/deepspace/dds-wiki-records-screens.tsx");

  test("it fetches through getPieceById, not getRecordById", () => {
    expect(src).toMatch(/getPieceById\(userId, recordId, origin\)/);
    // The old call is what made every source piece a dead tap.
    expect(src).not.toMatch(/getRecordById\(userId, recordId\)/);
  });

  test("it reads the origin param", () => {
    expect(src).toMatch(/params\.origin/);
  });
});

describe("/core-brain carries the origin it already knew", () => {
  const src = read("app/core-brain.tsx");

  test("the evidence link passes origin", () => {
    expect(src).toMatch(/params: \{ id: ev\.id, origin: ev\.origin \}/);
  });

  test("the shard type keeps origin instead of widening it away", () => {
    // mergeEvidence returns OriginShard[] (origin + at + domain). Declaring the loader as
    // EvidenceShard[] threw `origin` away AT THE TYPE LEVEL, even though the runtime object
    // had it all along. That is how the link lost it.
    expect(src).toMatch(/Promise<OriginShard\[\]>/);
    expect(src).toMatch(/useState<OriginShard\[\]>\(\[\]\)/);
  });
});
