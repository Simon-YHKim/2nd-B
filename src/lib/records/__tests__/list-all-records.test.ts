// The wiki list asked only for the last 90 days of records (it borrowed the streak's read), so
// older records were never listed: 16 of 69 production rows on 2026-10-14. listAllRecords() is
// the list's own read: no window, pages that each start after the last row of the one before.
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Call {
  select: string;
  owner: unknown;
  or: string | null;
  lte: [string, unknown] | null;
  orders: [string, unknown][];
  limit: number | null;
}

const calls: Call[] = [];
let answers: { data: unknown; error: unknown }[] = [];

function builder(select: string) {
  const call: Call = { select, owner: null, or: null, lte: null, orders: [], limit: null };
  const self = {
    eq(column: string, value: unknown) {
      if (column === "user_id") call.owner = value;
      return self;
    },
    or(filters: string) {
      call.or = filters;
      return self;
    },
    lte(column: string, value: unknown) {
      call.lte = [column, value];
      return self;
    },
    order(column: string, options: unknown) {
      call.orders.push([column, options]);
      return self;
    },
    limit(count: number) {
      call.limit = count;
      calls.push(call);
      const next = answers.shift();
      if (!next) throw new Error("the test queued no answer for this page");
      return Promise.resolve(next);
    },
  };
  return self;
}

const mockFrom = jest.fn((table: string) => {
  if (table !== "records") throw new Error(`unexpected table ${table}`);
  return { select: (columns: string) => builder(columns) };
});

jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

import { WIKI_RECORDS_MAX, WIKI_RECORDS_PAGE, afterCursorFilter, listAllRecords } from "../list-all-records";

const row = (n: number) => ({ id: `id-${String(n).padStart(5, "0")}`, created_at: `2026-10-${String(13 - Math.floor(n / 1000)).padStart(2, "0")}T00:00:00.${String(999999 - n).padStart(6, "0")}+00:00` });
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => row(from + i));

beforeEach(() => {
  calls.length = 0;
  answers = [];
  mockFrom.mockClear();
});

describe("the wiki list's own read", () => {
  it("asks for the owner's rows, newest first, with no date window", async () => {
    answers = [{ data: page(0, 3), error: null }];
    const rows = await listAllRecords("owner-1");
    expect(rows).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].owner).toBe("owner-1");
    expect(calls[0].or).toBeNull();
    expect(calls[0].lte).toBeNull();
    expect(calls[0].orders).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(calls[0].limit).toBe(WIKI_RECORDS_PAGE);
    expect(calls[0].select).toContain("audit_period");
    expect(calls[0].select).toContain("system_tags");
    // The streak's window is exactly what this read must not carry.
    expect(calls[0].select).not.toContain("embedding");
  });

  it("starts each next page after the last row of the one before", async () => {
    answers = [{ data: page(0, WIKI_RECORDS_PAGE), error: null }, { data: page(WIKI_RECORDS_PAGE, 7), error: null }];
    const rows = await listAllRecords("owner-1");
    expect(rows).toHaveLength(WIKI_RECORDS_PAGE + 7);
    expect(rows.map((r) => r.id)).toEqual(page(0, WIKI_RECORDS_PAGE + 7).map((r) => r.id));
    expect(calls).toHaveLength(2);
    const last = row(WIKI_RECORDS_PAGE - 1);
    expect(calls[1].or).toBe(afterCursorFilter({ createdAt: last.created_at, id: last.id }));
    expect(calls[1].lte).toEqual(["created_at", last.created_at]);
    expect(calls[1].owner).toBe("owner-1");
  });

  it("carries the last row's instant as the server wrote it, microseconds and all", async () => {
    // Two rows inside one millisecond sit on the page edge. Cut to milliseconds (a Date round
    // trip) the cursor would name both, and the second would be skipped or read twice.
    const edge = "2026-07-01T09:30:56.123456+00:00";
    const first = [...page(0, WIKI_RECORDS_PAGE - 1), { id: "id-edge-b", created_at: edge }];
    answers = [{ data: first, error: null }, { data: [{ id: "id-edge-a", created_at: "2026-07-01T09:30:56.123111+00:00" }], error: null }];
    const rows = await listAllRecords("owner-1");
    expect(rows.map((r) => r.id).slice(-2)).toEqual(["id-edge-b", "id-edge-a"]);
    expect(calls[1].lte).toEqual(["created_at", edge]);
    expect(calls[1].or).toBe(`created_at.lt."${edge}",and(created_at.eq."${edge}",id.lt."id-edge-b")`);
    expect(calls[1].or).not.toContain(new Date(edge).toISOString());
  });

  it("stops on an empty page when the count was an exact multiple", async () => {
    answers = [{ data: page(0, WIKI_RECORDS_PAGE), error: null }, { data: [], error: null }];
    expect(await listAllRecords("owner-1")).toHaveLength(WIKI_RECORDS_PAGE);
    expect(calls).toHaveLength(2);
  });

  it("throws when a later page fails: half a list would look like the whole", async () => {
    answers = [{ data: page(0, WIKI_RECORDS_PAGE), error: null }, { data: null, error: { message: "no answer" } }];
    await expect(listAllRecords("owner-1")).rejects.toEqual({ message: "no answer" });
  });

  it("does not ask without an owner", async () => {
    expect(await listAllRecords("")).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("has a stop for a walk that would not end", async () => {
    const pages = WIKI_RECORDS_MAX / WIKI_RECORDS_PAGE;
    answers = Array.from({ length: pages + 3 }, (_, i) => ({ data: page(i * WIKI_RECORDS_PAGE, WIKI_RECORDS_PAGE), error: null }));
    expect(await listAllRecords("owner-1")).toHaveLength(WIKI_RECORDS_MAX);
    expect(calls).toHaveLength(pages);
  });

  it("asks once more without system_tags on a database that has no such column", async () => {
    answers = [
      { data: null, error: { code: "42703", message: "column records.system_tags does not exist" } },
      { data: page(0, 2), error: null },
    ];
    expect(await listAllRecords("owner-1")).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].select).toContain("system_tags");
    expect(calls[1].select).not.toContain("system_tags");
    expect(calls[1].select).toContain("audit_period");
  });
});

describe("after this row, newest first", () => {
  it("is older, or the same instant with a smaller id, with both values quoted", () => {
    expect(afterCursorFilter({ createdAt: "2026-07-01T09:30:00.123456+00:00", id: "11111111-1111-4111-8111-111111111111" })).toBe(
      'created_at.lt."2026-07-01T09:30:00.123456+00:00",and(created_at.eq."2026-07-01T09:30:00.123456+00:00",id.lt."11111111-1111-4111-8111-111111111111")',
    );
  });

  it("a value of another shape cannot close its quote and add a condition", () => {
    const filter = afterCursorFilter({ createdAt: 'x",id.gt."0', id: "a\\b" });
    expect(filter).toBe('created_at.lt."x\\",id.gt.\\"0",and(created_at.eq."x\\",id.gt.\\"0",id.lt."a\\\\b")');
  });
});

describe("the wiki list uses it", () => {
  const ROOT = join(__dirname, "..", "..", "..", "..");
  const screen = readFileSync(join(ROOT, "src/screens/deepspace/dds-wiki-records-screens.tsx"), "utf8");

  it("reads every record, and no longer borrows the streak's 90-day read", () => {
    expect(screen).toContain('import { listAllRecords } from "@/lib/records/list-all-records";');
    expect(screen).toContain("recs = (await listAllRecords(userId)) as RecordsTimelineRecord[];");
    expect(screen).not.toMatch(/listRecentRecords\(/);
  });

  it("the streak's read keeps its window", () => {
    const create = readFileSync(join(ROOT, "src/lib/records/create.ts"), "utf8");
    expect(create).toContain("const STREAK_WINDOW_DAYS = 90;");
    expect(create).toContain('.gte("created_at", sinceIso)');
  });
});
