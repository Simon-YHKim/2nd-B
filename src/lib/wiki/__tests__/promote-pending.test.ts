// promotePendingUploads — recovers capture-time Storage failures: re-uploads
// frontmatter._body_fallback to the canonical path and clears the pending
// flags. Every step is best-effort; a still-broken bucket keeps the fallback.

const mockList = jest.fn();
const mockUpdateFm = jest.fn();
const mockUpload = jest.fn();

jest.mock("../queries", () => ({
  listStoragePendingSources: (...args: unknown[]) => mockList(...args),
  updateSourceFrontmatter: (...args: unknown[]) => mockUpdateFm(...args),
}));

jest.mock("../storage", () => ({
  rawClippingPath: (userId: string, slug: string) => `${userId}/${slug}.md`,
  uploadRawClipping: (...args: unknown[]) => mockUpload(...args),
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
    mockUpdateFm.mockReset().mockResolvedValue(undefined);
    mockUpload.mockReset().mockResolvedValue({ path: "u1/my-piece.md" });
  });

  test("re-uploads the fallback body (idempotent overwrite) and clears the flags", async () => {
    mockList.mockResolvedValueOnce([pendingRow()]);

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 1 });
    // Slug derived from storage_path, not re-slugged from the title.
    expect(mockUpload).toHaveBeenCalledWith("u1", "my-piece", "# Body", { overwrite: true });
    // Flags removed; unrelated frontmatter preserved.
    expect(mockUpdateFm).toHaveBeenCalledWith("u1", "s1", { keep: "me" });
  });

  test("Hangul storage key heals to an ASCII-safe path and repoints storage_path", async () => {
    // Pre-fix rows carry a key Storage rejects (400 Invalid key) — retrying it
    // verbatim would stay pending forever. Promotion must upload to the safe
    // key and update the row's storage_path in the same pass.
    mockList.mockResolvedValueOnce([pendingRow({ storage_path: "u1/kakaotalk-가져오기-abc123.md" })]);

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 1 });
    expect(mockUpload).toHaveBeenCalledWith("u1", "kakaotalk-abc123", "# Body", { overwrite: true });
    expect(mockUpdateFm).toHaveBeenCalledWith("u1", "s1", { keep: "me" }, "u1/kakaotalk-abc123.md");
  });

  test("storage still down: keeps the fallback, clears nothing", async () => {
    mockList.mockResolvedValueOnce([pendingRow()]);
    mockUpload.mockRejectedValueOnce(new Error("bucket down"));

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 0 });
    expect(mockUpdateFm).not.toHaveBeenCalled();
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
    mockUpdateFm.mockRejectedValueOnce(new Error("rls hiccup"));

    const r = await promotePendingUploads("u1");

    expect(r).toEqual({ pending: 1, promoted: 0 });
  });

  test("no pending rows: no-op", async () => {
    mockList.mockResolvedValueOnce([]);
    const r = await promotePendingUploads("u1");
    expect(r).toEqual({ pending: 0, promoted: 0 });
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
