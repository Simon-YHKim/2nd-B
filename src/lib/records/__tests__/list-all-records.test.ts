// The wiki list asked only for the last 90 days of records (it borrowed the streak's read), so
// older records were never listed: 16 of 69 production rows on 2026-10-14. listAllRecords() is
// the list's own read: no window, pages that each start after the last row of the one before.
//
// The walk is driven here by a stand-in builder that records what it was asked. What the real
// query builder puts on the wire is pinned separately, in list-all-records-request.test.ts.
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

import { buildRecordsTimeline } from "../../../screens/deepspace/records-timeline";
import { WIKI_RECORDS_MAX, WIKI_RECORDS_PAGE, afterCursorFilter, listAllRecords } from "../list-all-records";

const row = (n: number) => ({ id: `id-${String(n).padStart(5, "0")}`, created_at: `2026-10-${String(13 - Math.floor(n / 1000)).padStart(2, "0")}T00:00:00.${String(999999 - n).padStart(6, "0")}+00:00` });
const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => row(from + i));

beforeEach(() => {
  calls.length = 0;
  answers = [];
  mockFrom.mockClear();
});

describe("the wiki list's own read", () => {
  it("asks for the owner's rows, newest first, with no date condition, in one request", async () => {
    answers = [{ data: page(0, 3), error: null }];
    const rows = await listAllRecords("owner-1");
    expect(rows).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].owner).toBe("owner-1");
    // No window: neither the plain bound nor the logical filter rides on the first page.
    expect(calls[0].or).toBeNull();
    expect(calls[0].lte).toBeNull();
    expect(calls[0].orders).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(calls[0].limit).toBe(WIKI_RECORDS_PAGE);
  });

  it("asks only for the columns the list draws, and the one it narrows by", async () => {
    answers = [{ data: [], error: null }];
    await listAllRecords("owner-1");
    // TimelineRecord (records-timeline.ts): what a row, its icon, its title and its time read.
    // audit_period: the star a record was told under, which ?period= narrows the list by.
    expect(calls[0].select.split(",").map((c) => c.trim()).sort()).toEqual(["audit_period", "body", "created_at", "id", "kind", "summary", "system_tags", "tags", "topic"]);
    const timeline = readFileSync(join(__dirname, "..", "..", "..", "screens", "deepspace", "records-timeline.ts"), "utf8").replace(/\r\n?/g, "\n");
    const shape = timeline.slice(timeline.indexOf("export interface TimelineRecord {"), timeline.indexOf("}", timeline.indexOf("export interface TimelineRecord {")));
    const fields = [...shape.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]).sort();
    expect(fields).toEqual(["body", "created_at", "id", "kind", "summary", "system_tags", "tags", "topic"]);
  });

  it("starts each next page after the last row of the one before", async () => {
    answers = [{ data: page(0, WIKI_RECORDS_PAGE), error: null }, { data: page(WIKI_RECORDS_PAGE, 7), error: null }];
    const rows = await listAllRecords("owner-1");
    expect(rows).toHaveLength(WIKI_RECORDS_PAGE + 7);
    expect(calls).toHaveLength(2);
    const last = row(WIKI_RECORDS_PAGE - 1);
    expect(calls[1].or).toBe(afterCursorFilter({ createdAt: last.created_at, id: last.id }));
    expect(calls[1].lte).toEqual(["created_at", last.created_at]);
    expect(calls[1].owner).toBe("owner-1");
    expect(calls[1].limit).toBe(WIKI_RECORDS_PAGE);
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

  it("stops at its limit whatever the server answers (a known limit: the cut is not shown)", async () => {
    const pages = WIKI_RECORDS_MAX / WIKI_RECORDS_PAGE;
    answers = Array.from({ length: pages + 3 }, (_, i) => ({ data: page(i * WIKI_RECORDS_PAGE, WIKI_RECORDS_PAGE), error: null }));
    expect(await listAllRecords("owner-1")).toHaveLength(WIKI_RECORDS_MAX);
    expect(calls).toHaveLength(pages);
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
    expect(screen).toContain("listAllRecords(userId, { signal: controller.signal })");
    expect(screen).not.toMatch(/listRecentRecords\(/);
  });

  it("gives every row its day, however many days the list holds", () => {
    // buildRecordsTimeline labels only its first maxGroups day groups (8 unless told otherwise).
    // The flat list has no group headers, so a row past the eighth day showed no time at all,
    // which is every row this read newly brings in.
    expect(screen).toContain("buildRecordsTimeline(records, { labels: dsTimeLabels(t), labelEveryItem: true, maxGroups: Number.POSITIVE_INFINITY })");
  });

  it("with that, a row on the ninth day and after carries its day; without it, it carried nothing", () => {
    const now = new Date("2026-10-14T03:00:00Z");
    const rows = Array.from({ length: 12 }, (_, day) => ({
      id: `r${day}`,
      kind: "note" as const,
      summary: `day ${day}`,
      created_at: new Date(now.getTime() - (day * 24 + 1) * 3600 * 1000).toISOString(),
    }));
    const labelled = (maxGroups?: number) => {
      const byId = new Map<string, string>();
      buildRecordsTimeline(rows, { now, utcOffsetMs: 0, labelEveryItem: true, ...(maxGroups === undefined ? {} : { maxGroups }) }).forEach((g) =>
        g.items.forEach((it) => byId.set(it.id, it.timeLabel)),
      );
      return rows.map((r) => byId.get(r.id) ?? "");
    };
    // The default stops after eight day groups: the last four rows get no label at all.
    expect(labelled().filter((label) => label !== "")).toHaveLength(8);
    expect(labelled().slice(8)).toEqual(["", "", "", ""]);
    // What the list passes: every row has one.
    expect(labelled(Number.POSITIVE_INFINITY).every((label) => label !== "")).toBe(true);
  });

  it("the streak's read keeps its window", () => {
    const create = readFileSync(join(ROOT, "src/lib/records/create.ts"), "utf8");
    expect(create).toContain("const STREAK_WINDOW_DAYS = 90;");
    expect(create).toContain('.gte("created_at", sinceIso)');
  });
});
