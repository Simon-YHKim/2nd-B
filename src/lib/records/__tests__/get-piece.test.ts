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
// The legacy record-detail screen got this RIGHT -- e0b274d0:src/app/record/[id].tsx:54 has
// a correct `origin === "source"` branch. It never ran: line 268 there is
// `if (isDeepSpaceUI()) return <DeepSpaceRecordDetailScreen />`, and deep-space was the
// default. Correct code, unreachable. (Pinned to that commit: the half left the route with
// the EXPO_PUBLIC_UI lever on 2026-10-05 and is the revive source legacy/screens/record-detail.tsx.) That is why the bug survived a screen that visibly
// handles the case.
//
// I asserted the opposite in #984 -- "the other 11 /record/[id] call sites are FINE, they
// push record ids" -- having checked the call sites and not the RECEIVER. The ids are fine.
// The lookup was not.

import { getPieceById, isSourcePieceId, SOURCE_ID_PREFIX } from "../get-piece";
import { downloadRawClipping } from "../../wiki/storage";
import { fetchProfileImportedContext } from "../../supabase/profile-context-import";

const from = jest.fn();
const getRecordById = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: (...args: unknown[]) => from(...args) }),
}));
jest.mock("../create", () => ({
  getRecordById: (...args: unknown[]) => getRecordById(...args),
}));
jest.mock("../../wiki/storage", () => ({ downloadRawClipping: jest.fn() }));
jest.mock("../../supabase/profile-context-import", () => ({ fetchProfileImportedContext: jest.fn() }));

beforeEach(() => {
  jest.mocked(downloadRawClipping).mockReset().mockRejectedValue(new Error("storage unavailable"));
  jest.mocked(fetchProfileImportedContext).mockReset();
});

function mockSource(result: { data: unknown; error: unknown }): void {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => result);
  from.mockReturnValue(chain);
}

afterEach(() => jest.clearAllMocks());

// Row ids are uuids in both tables. Since W-07 (QA 261004) getPieceById refuses any
// other shape before reading, so the routing cases below use real-shaped ids.
const R1 = "11111111-1111-4111-8111-111111111111";
const ABC = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

describe("the id says which table it lives in", () => {
  test("a source piece id is recognised by its prefix", () => {
    expect(isSourcePieceId("src-abc")).toBe(true);
    expect(isSourcePieceId("abc")).toBe(false);
    expect(SOURCE_ID_PREFIX).toBe("src-");
  });
});

describe("getPieceById", () => {
  test("a profile import returns the typed ledger context and never exposes internal raw content", async () => {
    const context: Awaited<ReturnType<typeof fetchProfileImportedContext>> = {
      document: {
        format: "polascope.user-context", version: "1.0-draft",
        origin: { service: "unknown", model: null, exported_at: null },
        coverage: { accessed: [], unavailable: [], omissions: [], more_items: "unknown", account_completeness: "unknown" },
        sources: [], items: [{ id: "i1", category: "preference", statement: "I prefer mornings.", reported_basis: "user_statement",
          evidence_ids: [], valid_time: { from: null, to: null, description: null }, conflicts_with: [] }],
      }, confirmedIds: ["i1"],
    };
    jest.mocked(fetchProfileImportedContext).mockResolvedValue(context);
    mockSource({ data: {
      id: ABC, kind: "self_knowledge", title: "My story", captured_at: "2026-10-09T00:00:00Z", tags: [], storage_path: "internal.md",
      frontmatter: { profile_context_import_id: "batch-1", _body_fallback: "Internal provenance JSON" },
    }, error: null });
    await expect(getPieceById("u1", `src-${ABC}`)).resolves.toMatchObject({
      body: null, origin: "source", profileImportManaged: true, profileImportContext: context,
    });
    expect(fetchProfileImportedContext).toHaveBeenCalledWith("u1", ABC);
    expect(downloadRawClipping).not.toHaveBeenCalled();
  });

  test("a managed source read failure cannot fall back to raw storage, inline text or a record", async () => {
    mockSource({ data: {
      id: ABC, kind: "self_knowledge", title: "My story", captured_at: "2026-10-09T00:00:00Z", tags: [], storage_path: "internal.md",
      frontmatter: { profile_context_import_id: "batch-1", _body_fallback: "Internal provenance JSON" },
    }, error: null });
    const error = new Error("ledger unavailable");
    jest.mocked(fetchProfileImportedContext).mockRejectedValue(error);
    await expect(getPieceById("u1", `src-${ABC}`)).rejects.toBe(error);
    expect(downloadRawClipping).not.toHaveBeenCalled();
    expect(getRecordById).not.toHaveBeenCalled();
  });

  test("ordinary sources still read Storage and fall back to their inline body on failure", async () => {
    mockSource({ data: {
      id: ABC, kind: "article", title: "Article", captured_at: "2026-10-09T00:00:00Z", tags: [], storage_path: "u1/article.md",
      frontmatter: { _body_fallback: "Saved fallback." },
    }, error: null });
    await expect(getPieceById("u1", `src-${ABC}`)).resolves.toMatchObject({ body: "Saved fallback.", profileImportManaged: false });
    expect(downloadRawClipping).toHaveBeenCalledWith("u1/article.md");
    expect(fetchProfileImportedContext).not.toHaveBeenCalled();
    jest.mocked(downloadRawClipping).mockResolvedValueOnce("Stored article.");
    await expect(getPieceById("u1", `src-${ABC}`)).resolves.toMatchObject({ body: "Stored article." });
  });

  test("a plain id goes to the records table", async () => {
    getRecordById.mockResolvedValue({ id: R1, kind: "note", topic: "t", body: "b", tags: [], created_at: "x" });
    const piece = await getPieceById("u1", R1);
    expect(getRecordById).toHaveBeenCalledWith("u1", R1);
    expect(from).not.toHaveBeenCalled();
    expect(piece?.origin).toBe("record");
  });

  test("a src- id goes to the sources table, with the prefix stripped for the query", async () => {
    mockSource({
      data: { id: ABC, kind: "link", title: "A clipped article", captured_at: "2026-07-10T09:00:00Z", tags: ["link"] },
      error: null,
    });
    const piece = await getPieceById("u1", `src-${ABC}`);
    expect(getRecordById).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("sources");
    expect(piece).toMatchObject({
      // The prefixed id is kept: it is what the route carries.
      id: `src-${ABC}`,
      topic: "A clipped article",
      created_at: "2026-07-10T09:00:00Z",
      origin: "source",
      // `sources` has no body column -- a clip is its title plus its tags.
      body: null,
    });
  });

  test("a genuinely missing source returns null", async () => {
    mockSource({ data: null, error: null });
    await expect(getPieceById("u1", `src-${GONE}`)).resolves.toBeNull();
    expect(from).toHaveBeenCalledWith("sources");
  });

  test("a read failure throws -- 'we could not look' is not 'it was deleted'", async () => {
    mockSource({ data: null, error: { message: "network error" } });
    await expect(getPieceById("u1", `src-${ABC}`)).rejects.toMatchObject({ message: "network error" });
  });

  test("an explicit origin=source works on a RAW uuid, with no prefix", async () => {
    // /core-brain does not prefix. Its evidence shards keep the raw uuid and carry `origin`
    // as a separate field, so the caller has to pass it. Supporting both conventions is not
    // indulgence: a caller that forgets the origin is exactly how this bug worked.
    mockSource({ data: { id: ABC, kind: "link", title: "t", captured_at: "x", tags: [] }, error: null });
    const piece = await getPieceById("u1", ABC, "source");
    expect(getRecordById).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("sources");
    expect(piece?.origin).toBe("source");
  });

  // W-07 (QA 261004): /record/sample sent `.eq("id","sample")` to a uuid column. PostgREST
  // answered 400, the throw reached the screen as "couldn't load, retry", and every retry
  // got the same 400. A malformed id is "no such piece", decided before any read.
  test.each([
    ["a plain non-uuid id", "sample", undefined],
    ["a src- id whose tail is not a uuid", "src-sample", undefined],
    ["an explicit origin=source with a non-uuid", "sample", "source" as const],
    ["an empty src- id", "src-", undefined],
    ["a uuid with trailing junk", `${R1}x`, undefined],
  ])("%s returns null without touching the database", async (_label, id, origin) => {
    mockSource({ data: null, error: { message: "invalid input syntax for type uuid" } });
    getRecordById.mockRejectedValue({ message: "invalid input syntax for type uuid" });
    await expect(getPieceById("u1", id, origin)).resolves.toBeNull();
    expect(getRecordById).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

const read = (rel: string): string =>
  (require("fs").readFileSync(require("path").resolve(__dirname, "../../../", rel), "utf8") as string).replace(
    /\r\n/g,
    "\n",
  );

describe("the live detail screen resolves both kinds", () => {
  const src = read("screens/deepspace/dds-record-detail-screen.tsx");

  test("it fetches through getPieceById, not getRecordById", () => {
    expect(src).toMatch(/getPieceById\(userId, recordId, requestedOrigin\)/);
    // The old call is what made every source piece a dead tap.
    expect(src).not.toMatch(/getRecordById\(userId, recordId\)/);
  });

  test("it reads the origin param", () => {
    expect(src).toMatch(/originValue = Array\.isArray\(params\.origin\)/);
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
