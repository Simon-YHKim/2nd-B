// Data access for the notices tables (src/lib/notices/remote.ts).
//
// This layer had no tests at all, and it is the one place where a perfectly
// reasonable-looking edit breaks the feature invisibly:
//
//   * `.insert()` -> `.upsert()` is the obvious idiom for "record it once", but
//     PostgREST upsert needs the UPDATE privilege, which 0113 deliberately
//     withholds from `authenticated`. Every call would 42501, markSeen's catch
//     would swallow it, the UI would look right, and the same major notice
//     would re-interrupt on every cold start.
//   * dropping min_app_version from the select list makes the version gate fail
//     open for every notice, silently.
//   * both reads fail SOFT by design; a change to throwing would take down the
//     home shell rather than lose an announcement.
//
// None of that is visible in the pure-logic suites, so it is pinned here.

jest.mock("../../supabase/client", () => ({ getSupabaseClient: jest.fn() }));

import { getSupabaseClient } from "../../supabase/client";
import { NOTICE_FETCH_LIMIT, fetchNotices, fetchReadNoticeIds, markNoticeRead } from "../remote";

const mockGetClient = getSupabaseClient as jest.Mock;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "major",
    title_ko: "제목",
    title_en: "Title",
    body_ko: "본문",
    body_en: "Body",
    published_at: "2026-08-09T00:00:00.000Z",
    min_app_version: null,
    ...overrides,
  };
}

function readClient(result: { data: unknown; error: unknown }) {
  const limit = jest.fn().mockResolvedValue(result);
  const order = jest.fn().mockReturnValue({ limit });
  const select = jest.fn().mockReturnValue({ order });
  const from = jest.fn().mockReturnValue({ select });
  return { client: { from }, from, select, order, limit };
}

function readIdsClient(result: { data: unknown; error: unknown }) {
  const eq = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return { client: { from }, from, select, eq };
}

function writeClient(result: { error: unknown }) {
  const insert = jest.fn().mockResolvedValue(result);
  const upsert = jest.fn().mockResolvedValue(result);
  const from = jest.fn().mockReturnValue({ insert, upsert });
  return { client: { from }, from, insert, upsert };
}

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  jest.clearAllMocks();
});

describe("fetchNotices", () => {
  test("asks for every column the client needs, newest first, capped", () => {
    const { client, from, select, order, limit } = readClient({ data: [], error: null });
    mockGetClient.mockReturnValue(client);

    return fetchNotices().then(() => {
      expect(from).toHaveBeenCalledWith("notices");
      const columns = select.mock.calls[0][0] as string;
      for (const column of [
        "id",
        "kind",
        "title_ko",
        "title_en",
        "body_ko",
        "body_en",
        "published_at",
        // Losing this one silently disables the whole min_app_version gate:
        // meetsMinAppVersion(version, undefined) returns true for every row.
        "min_app_version",
      ]) {
        expect(columns).toContain(column);
      }
      expect(order).toHaveBeenCalledWith("published_at", { ascending: false });
      expect(limit).toHaveBeenCalledWith(NOTICE_FETCH_LIMIT);
    });
  });

  test("does not select withdrawn_at, so builds predating 0114 keep working", async () => {
    // 0114 gates withdrawal in the READ POLICY precisely so shipped binaries
    // honour it without an app release. Naming the column here would make this
    // build 42703 against any environment without 0114 - and the read fails
    // soft, so the user would see an EMPTY notice list, not a missing column.
    const { client, select } = readClient({ data: [], error: null });
    mockGetClient.mockReturnValue(client);
    await fetchNotices();
    expect(select.mock.calls[0][0] as string).not.toContain("withdrawn_at");
  });

  test("camel-cases the row and preserves a null min_app_version", async () => {
    const { client } = readClient({ data: [row({ min_app_version: "1.2.0" }), row({ id: "b" })], error: null });
    mockGetClient.mockReturnValue(client);

    const notices = await fetchNotices();

    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({
      kind: "major",
      titleKo: "제목",
      titleEn: "Title",
      bodyKo: "본문",
      bodyEn: "Body",
      publishedAt: "2026-08-09T00:00:00.000Z",
      minAppVersion: "1.2.0",
    });
    expect(notices[1].minAppVersion).toBeNull();
  });

  test("a kind outside the enum is DROPPED, not defaulted", async () => {
    // Defaulting to major would let bad data interrupt users; defaulting to
    // minor would silently mute a real announcement. Dropping is the only
    // choice that does neither.
    const { client } = readClient({
      data: [row({ id: "good" }), row({ id: "weird", kind: "critical" })],
      error: null,
    });
    mockGetClient.mockReturnValue(client);

    const notices = await fetchNotices();
    expect(notices.map((n) => n.id)).toEqual(["good"]);
  });

  test("fails soft: an error yields an empty list and a warning, never a throw", async () => {
    const { client } = readClient({ data: null, error: { message: "boom" } });
    mockGetClient.mockReturnValue(client);

    await expect(fetchNotices()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  test("fails soft when the client itself blows up", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("no env");
    });
    await expect(fetchNotices()).resolves.toEqual([]);
  });
});

describe("fetchReadNoticeIds", () => {
  test("scopes the query to the caller and returns a set of ids", async () => {
    const { client, from, eq } = readIdsClient({
      data: [{ notice_id: "a" }, { notice_id: "b" }],
      error: null,
    });
    mockGetClient.mockReturnValue(client);

    const ids = await fetchReadNoticeIds("user-1");

    expect(from).toHaveBeenCalledWith("user_notice_reads");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  test("fails soft to an EMPTY set, which reads as everything unread", async () => {
    // The safe direction for a badge: showing an unread dot that should not be
    // there beats hiding an incident notice.
    const { client } = readIdsClient({ data: null, error: { message: "offline" } });
    mockGetClient.mockReturnValue(client);

    await expect(fetchReadNoticeIds("user-1")).resolves.toEqual(new Set());
    expect(warn).toHaveBeenCalled();
  });
});

describe("markNoticeRead", () => {
  test("is a plain INSERT, never an upsert", async () => {
    // user_notice_reads has SELECT + INSERT for authenticated and nothing else
    // (0113). PostgREST upsert requires UPDATE, so switching idioms would make
    // every write 42501 while the optimistic UI kept looking correct.
    const { client, from, insert, upsert } = writeClient({ error: null });
    mockGetClient.mockReturnValue(client);

    await markNoticeRead("user-1", "notice-1");

    expect(from).toHaveBeenCalledWith("user_notice_reads");
    expect(insert).toHaveBeenCalledWith({ user_id: "user-1", notice_id: "notice-1" });
    expect(upsert).not.toHaveBeenCalled();
  });

  test("a duplicate read is success, not an error", async () => {
    // Two devices, or a double tap on 확인. The end state the caller asked for
    // already holds.
    const { client } = writeClient({ error: { code: "23505", message: "duplicate key" } });
    mockGetClient.mockReturnValue(client);

    await expect(markNoticeRead("user-1", "notice-1")).resolves.toBeUndefined();
  });

  test("any other failure THROWS, so the caller can log and fall back locally", async () => {
    // A swallowed rejection here is what let an offline 확인 disappear and the
    // popup replay on every launch.
    const { client } = writeClient({ error: { code: "42501", message: "denied" } });
    mockGetClient.mockReturnValue(client);

    await expect(markNoticeRead("user-1", "notice-1")).rejects.toMatchObject({ code: "42501" });
  });

  test("a network failure with no code still throws", async () => {
    const { client } = writeClient({ error: { message: "Network request failed" } });
    mockGetClient.mockReturnValue(client);

    await expect(markNoticeRead("user-1", "notice-1")).rejects.toBeDefined();
  });
});
