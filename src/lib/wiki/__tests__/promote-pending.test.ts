// promotePendingUploads — recovers capture-time Storage failures: re-uploads
// frontmatter._body_fallback to the canonical path and clears the pending
// flags. Every step is best-effort; a still-broken bucket keeps the fallback.
//
// R30 (JA-1839-1): the flags are cleared through clearStoragePending
// (wiki/source-erasure.ts) - a write conditional on the row still existing,
// still pointing at the uploaded path, and not being claimed by an erasure -
// instead of an unconditional UPDATE that read 0 rows as success. What that
// write keeps and drops in the frontmatter (the flags go, everything else
// stays) is exercised against a stateful fake in
// src/lib/records/__tests__/delete-bulk-raw-clippings.test.ts; here the
// orchestration is: re-read before upload, upload, clear, take back on failure.

const mockList = jest.fn();
const mockGetSource = jest.fn();
const mockUpload = jest.fn();
const mockClear = jest.fn();
const mockTakeBack = jest.fn();

jest.mock("../queries", () => ({
  listStoragePendingSources: (...args: unknown[]) => mockList(...args),
  getSource: (...args: unknown[]) => mockGetSource(...args),
}));

jest.mock("../storage", () => ({
  rawClippingPath: (userId: string, slug: string) => `${userId}/${slug}.md`,
  uploadRawClipping: (...args: unknown[]) => mockUpload(...args),
}));

jest.mock("../source-erasure", () => ({
  clearStoragePending: (...args: unknown[]) => mockClear(...args),
  removeRawClippingUnlessHeld: (...args: unknown[]) => mockTakeBack(...args),
  isSourceBeingErased: (frontmatter: Record<string, unknown> | null | undefined) =>
    Boolean(frontmatter && frontmatter._erasing),
}));

import { promotePendingUploads } from "../promote-pending";

function pendingRow(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    user_id: "u1",
    storage_path: "u1/my-piece.md",
    frontmatter: { _storage_pending: true, _body_fallback: "# Body", keep: "me" },
    ...over,
  };
}

describe("promotePendingUploads", () => {
  beforeEach(() => {
    mockList.mockReset();
    // By default the row is still exactly as listed when promotion re-reads it.
    mockGetSource.mockReset().mockImplementation(async (_userId: string, id: string) => {
      const listed = (await mockList.mock.results[0]?.value) as ReturnType<typeof pendingRow>[] | undefined;
      return listed?.find((row) => row.id === id) ?? null;
    });
    mockUpload.mockReset().mockResolvedValue({ path: "u1/my-piece.md" });
    mockClear.mockReset().mockResolvedValue("cleared");
    mockTakeBack.mockReset().mockResolvedValue(true);
  });

  test("re-uploads the fallback body (idempotent overwrite) and clears the flags", async () => {
    mockList.mockResolvedValueOnce([pendingRow()]);

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 1 });
    // Slug derived from storage_path, not re-slugged from the title.
    expect(mockUpload).toHaveBeenCalledWith("u1", "my-piece", "# Body", { overwrite: true });
    // Flags cleared through the conditional write, against the path the upload assumed; nothing to take back.
    expect(mockClear).toHaveBeenCalledWith("u1", "s1", "u1/my-piece.md", undefined);
    expect(mockTakeBack).not.toHaveBeenCalled();
  });

  test("Hangul storage key heals to an ASCII-safe path and repoints storage_path", async () => {
    // Pre-fix rows carry a key Storage rejects (400 Invalid key) — retrying it
    // verbatim would stay pending forever. Promotion must upload to the safe
    // key and update the row's storage_path in the same pass.
    mockList.mockResolvedValueOnce([pendingRow({ storage_path: "u1/kakaotalk-가져오기-abc123.md" })]);

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 1 });
    expect(mockUpload).toHaveBeenCalledWith("u1", "kakaotalk-abc123", "# Body", { overwrite: true });
    expect(mockClear).toHaveBeenCalledWith("u1", "s1", "u1/kakaotalk-가져오기-abc123.md", "u1/kakaotalk-abc123.md");
  });

  test("storage still down: keeps the fallback, clears nothing", async () => {
    mockList.mockResolvedValueOnce([pendingRow()]);
    mockUpload.mockRejectedValueOnce(new Error("bucket down"));

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 0 });
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockTakeBack).not.toHaveBeenCalled();
  });

  test("row without a usable fallback body is skipped", async () => {
    mockList.mockResolvedValueOnce([
      pendingRow({ frontmatter: { _storage_pending: true } }), // no body
      pendingRow({ id: "s2", frontmatter: { _storage_pending: true, _body_fallback: "" } }),
    ]);

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 2, promoted: 0 });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test("unparseable storage_path is skipped, others still promote", async () => {
    mockList.mockResolvedValueOnce([
      pendingRow({ id: "bad", storage_path: "weird-path-without-slash" }),
      pendingRow({ id: "ok", storage_path: "u1/ok-piece.md" }),
    ]);

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 2, promoted: 1 });
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith("u1", "ok-piece", "# Body", { overwrite: true });
  });

  test("flag-clear failure does not throw and does not count as promoted", async () => {
    mockList.mockResolvedValueOnce([pendingRow()]);
    mockClear.mockRejectedValueOnce(new Error("rls hiccup"));

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 0 });
    // Whether the row still exists is unknown: the take-back is asked, and it keeps
    // the object whenever a row that needs it is still there.
    expect(mockTakeBack).toHaveBeenCalledWith("u1", "u1/my-piece.md");
  });

  test("no pending rows: no-op", async () => {
    mockList.mockResolvedValueOnce([]);
    const r = await promotePendingUploads("u1");
    expect(r).toEqual({ pending: 0, promoted: 0 });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  describe("a deletion between the listing and the upload (R30, JA-1839-1)", () => {
    test.each([
      ["deleted since the listing", null],
      ["claimed by an erasure", pendingRow({ frontmatter: { _storage_pending: true, _body_fallback: "# Body", _erasing: { token: "t", at: "now" } } })],
      ["repointed elsewhere", pendingRow({ storage_path: "u1/other.md" })],
      ["already promoted elsewhere", pendingRow({ frontmatter: { keep: "me" } })],
    ])("row %s: nothing is uploaded", async (_label, current) => {
      mockList.mockResolvedValueOnce([pendingRow()]);
      mockGetSource.mockReset().mockResolvedValue(current);

      const r = await promotePendingUploads("u1");

      expect(r).toEqual({ pending: 1, promoted: 0 });
      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockClear).not.toHaveBeenCalled();
    });

    test("the re-read failing is not a reason to upload blind", async () => {
      mockList.mockResolvedValueOnce([pendingRow()]);
      mockGetSource.mockReset().mockRejectedValue(new Error("offline"));

      await expect(promotePendingUploads("u1")).resolves.toEqual({ pending: 1, promoted: 0 });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    test.each(["gone", "erasing", "moved"])("clear answers %s: the upload is taken back and not counted", async (outcome) => {
      mockList.mockResolvedValueOnce([pendingRow()]);
      mockClear.mockResolvedValueOnce(outcome);

      const r = await promotePendingUploads("u1");

      expect(r).toEqual({ pending: 1, promoted: 0 });
      expect(mockTakeBack).toHaveBeenCalledWith("u1", "u1/my-piece.md");
    });

    test("a healed upload that did not clear is taken back at the healed path", async () => {
      mockList.mockResolvedValueOnce([pendingRow({ storage_path: "u1/kakaotalk-가져오기-abc123.md" })]);
      mockClear.mockResolvedValueOnce("gone");

      await promotePendingUploads("u1");

      expect(mockTakeBack).toHaveBeenCalledWith("u1", "u1/kakaotalk-abc123.md");
    });

    test("a failing take-back does not throw", async () => {
      mockList.mockResolvedValueOnce([pendingRow()]);
      mockClear.mockResolvedValueOnce("gone");
      mockTakeBack.mockRejectedValueOnce(new Error("offline"));

      await expect(promotePendingUploads("u1")).resolves.toEqual({ pending: 1, promoted: 0 });
    });
  });
});
