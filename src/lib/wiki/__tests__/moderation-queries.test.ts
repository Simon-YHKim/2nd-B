// Supabase mocking for the moderation wrappers (migration 0097): the
// capture-the-call harness from template-queries.test.ts, with the
// fixture-driven terminal from delete-wiki-page.test.ts bolted on so the error
// paths matter here (a duplicate report is a success; anything else is not).

interface Captured {
  table: string;
  operation: "select" | "insert" | "delete";
  filters: Record<string, unknown>;
  payload?: unknown;
}

interface Result {
  data: unknown;
  error: { code?: string; message: string } | null;
}

const captured: Captured[] = [];
const results: Record<string, Result> = {};

function makeChain(table: string, op: Captured["operation"], payload?: unknown) {
  const entry: Captured = { table, operation: op, filters: {}, payload };
  captured.push(entry);
  const promise = Promise.resolve(results[`${table}:${op}`] ?? { data: [], error: null });
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select() {
      return chain;
    },
    eq(col: string, val: unknown) {
      entry.filters[col] = val;
      return chain;
    },
    then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
    catch: (...args: unknown[]) => promise.catch(...(args as Parameters<typeof promise.catch>)),
    finally: (...args: unknown[]) => promise.finally(...(args as Parameters<typeof promise.finally>)),
  });
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      return {
        select: () => makeChain(table, "select"),
        insert: (p: unknown) => makeChain(table, "insert", p),
        delete: () => makeChain(table, "delete"),
      };
    },
  }),
}));

import {
  reportTemplate,
  blockOwner,
  unblockOwner,
  unblockAllOwners,
  listBlockedOwnerIds,
} from "../moderation-queries";
import { COMMUNITY_REPORT_HIDE_THRESHOLD, REPORT_REASONS, isReportReason } from "../moderation";

function reset() {
  captured.length = 0;
  for (const k of Object.keys(results)) delete results[k];
}

beforeEach(reset);

describe("moderation constants", () => {
  test("the reason list is closed and free of free text", () => {
    expect([...REPORT_REASONS]).toEqual(["spam", "off_topic", "offensive", "impersonation", "other"]);
  });

  test("isReportReason rejects anything off the list", () => {
    expect(isReportReason("spam")).toBe(true);
    expect(isReportReason("other")).toBe(true);
    expect(isReportReason("harassment")).toBe(false);
    expect(isReportReason("")).toBe(false);
  });

  test("the hide threshold takes more than one reporter", () => {
    // A single user must not be able to hide a format from everyone else.
    expect(COMMUNITY_REPORT_HIDE_THRESHOLD).toBeGreaterThan(1);
  });
});

describe("reportTemplate", () => {
  test("writes the caller's own id as the reporter", async () => {
    await reportTemplate("u1", "t1", "spam");
    const ins = captured.find((c) => c.operation === "insert")!;
    expect(ins.table).toBe("content_reports");
    expect(ins.payload).toMatchObject({ template_id: "t1", reporter_id: "u1", reason: "spam" });
  });

  test("carries no free-text field", async () => {
    await reportTemplate("u1", "t1", "other");
    const ins = captured.find((c) => c.operation === "insert")!;
    expect(Object.keys(ins.payload as object).sort()).toEqual(["reason", "reporter_id", "template_id"]);
  });

  test("a duplicate report is a success, not an error", async () => {
    results["content_reports:insert"] = {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    };
    await expect(reportTemplate("u1", "t1", "spam")).resolves.toBeUndefined();
  });

  test("any other failure propagates", async () => {
    results["content_reports:insert"] = { data: null, error: { code: "42501", message: "denied" } };
    await expect(reportTemplate("u1", "t1", "spam")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("blockOwner", () => {
  test("writes the caller as the blocker", async () => {
    await blockOwner("u1", "owner9");
    const ins = captured.find((c) => c.operation === "insert")!;
    expect(ins.table).toBe("template_blocks");
    expect(ins.payload).toMatchObject({ blocker_id: "u1", blocked_owner_id: "owner9" });
  });

  test("blocking twice is a no-op", async () => {
    results["template_blocks:insert"] = { data: null, error: { code: "23505", message: "duplicate" } };
    await expect(blockOwner("u1", "owner9")).resolves.toBeUndefined();
  });

  test("a real failure propagates", async () => {
    results["template_blocks:insert"] = { data: null, error: { message: "network" } };
    await expect(blockOwner("u1", "owner9")).rejects.toMatchObject({ message: "network" });
  });
});

describe("unblockOwner / unblockAllOwners", () => {
  test("unblockOwner narrows to the one pair", async () => {
    await unblockOwner("u1", "owner9");
    const del = captured.find((c) => c.operation === "delete")!;
    expect(del.table).toBe("template_blocks");
    expect(del.filters).toEqual({ blocker_id: "u1", blocked_owner_id: "owner9" });
  });

  test("unblockAllOwners is scoped to the caller and nothing else", async () => {
    await unblockAllOwners("u1");
    const del = captured.find((c) => c.operation === "delete")!;
    expect(del.table).toBe("template_blocks");
    expect(del.filters).toEqual({ blocker_id: "u1" });
  });

  test("a failed unblock propagates rather than reporting success", async () => {
    results["template_blocks:delete"] = { data: null, error: { message: "offline" } };
    await expect(unblockAllOwners("u1")).rejects.toMatchObject({ message: "offline" });
  });
});

describe("listBlockedOwnerIds", () => {
  test("returns the blocked author ids for the caller", async () => {
    results["template_blocks:select"] = {
      data: [{ blocked_owner_id: "a" }, { blocked_owner_id: "b" }],
      error: null,
    };
    await expect(listBlockedOwnerIds("u1")).resolves.toEqual(["a", "b"]);
    const sel = captured.find((c) => c.operation === "select")!;
    expect(sel.filters).toEqual({ blocker_id: "u1" });
  });

  test("drops malformed rows instead of leaking undefined into the set", async () => {
    results["template_blocks:select"] = {
      data: [{ blocked_owner_id: "a" }, {}, { blocked_owner_id: 7 }, { blocked_owner_id: "" }],
      error: null,
    };
    await expect(listBlockedOwnerIds("u1")).resolves.toEqual(["a"]);
  });

  test("propagates a load failure so the caller can decide", async () => {
    results["template_blocks:select"] = { data: null, error: { message: "boom" } };
    await expect(listBlockedOwnerIds("u1")).rejects.toMatchObject({ message: "boom" });
  });
});
