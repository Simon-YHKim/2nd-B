// updateRecordTags writes the full tags array to records.tags, scoped to the
// owner (user_id + id). Owner UPDATE is allowed by records_owner_all (0009), and
// the explicit user_id keeps the index-friendly WHERE first (mirrors getRecordById).

jest.mock("../../supabase/client", () => {
  const calls: { table?: string; update?: unknown; eqs: [string, unknown][] } = { eqs: [] };
  let errorToReturn: { message: string } | null = null;
  let dataToReturn: unknown[] = [{ id: "rec-1" }];
  const chain: Record<string, unknown> = {
    update: (payload: unknown) => {
      calls.update = payload;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      calls.eqs.push([col, val]);
      return chain;
    },
    select: () => chain,
    // thenable so `await from(t).update(...).eq(...).eq(...).select(...)` resolves to { data, error }
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => resolve({ data: dataToReturn, error: errorToReturn }),
  };
  const from = jest.fn((table: string) => {
    calls.table = table;
    return chain;
  });
  return {
    getSupabaseClient: () => ({ from }),
    __calls: calls,
    __setError: (e: { message: string } | null) => {
      errorToReturn = e;
    },
    __setEmpty: () => {
      dataToReturn = [];
    },
    __reset: () => {
      calls.table = undefined;
      calls.update = undefined;
      calls.eqs.length = 0;
      errorToReturn = null;
      dataToReturn = [{ id: "rec-1" }];
    },
  };
});

import { updateRecordTags } from "../create";

const clientMock = require("../../supabase/client") as {
  __calls: { table?: string; update?: unknown; eqs: [string, unknown][] };
  __setError: (e: { message: string } | null) => void;
  __setEmpty: () => void;
  __reset: () => void;
};

describe("updateRecordTags", () => {
  beforeEach(() => clientMock.__reset());

  test("writes the tags array to records, scoped to user_id + id", async () => {
    await updateRecordTags("u1", "rec-1", ["career", "1on1"]);
    expect(clientMock.__calls.table).toBe("records");
    expect(clientMock.__calls.update).toEqual({ tags: ["career", "1on1"] });
    expect(clientMock.__calls.eqs).toEqual(
      expect.arrayContaining([
        ["user_id", "u1"],
        ["id", "rec-1"],
      ]),
    );
  });

  test("throws when the update returns an error (e.g. RLS denies)", async () => {
    clientMock.__setError({ message: "rls denied" });
    await expect(updateRecordTags("u1", "rec-1", ["x"])).rejects.toBeDefined();
  });

  test("throws on a 0-row no-op (stale/unauthorized id returns success + no rows)", async () => {
    clientMock.__setEmpty();
    await expect(updateRecordTags("u1", "gone", ["x"])).rejects.toBeDefined();
  });
});
