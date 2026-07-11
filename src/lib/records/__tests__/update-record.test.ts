// updateRecord patches a record's editable content columns (body/topic/conclusion),
// scoped to the owner (user_id + id). Owner UPDATE is allowed by records_owner_all
// (0009), and the explicit user_id keeps the index-friendly WHERE first. Only the
// columns in the patch are written — the domain: tag and structured payload are
// never touched by an edit (that is Move's job / the machine payload's own path).

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

import { updateRecord } from "../create";

const clientMock = require("../../supabase/client") as {
  __calls: { table?: string; update?: unknown; eqs: [string, unknown][] };
  __setError: (e: { message: string } | null) => void;
  __setEmpty: () => void;
  __reset: () => void;
};

describe("updateRecord", () => {
  beforeEach(() => clientMock.__reset());

  test("patches only the given columns on records, scoped to user_id + id", async () => {
    await updateRecord("u1", "rec-1", { body: "edited body" });
    expect(clientMock.__calls.table).toBe("records");
    expect(clientMock.__calls.update).toEqual({ body: "edited body" });
    expect(clientMock.__calls.eqs).toEqual(
      expect.arrayContaining([
        ["user_id", "u1"],
        ["id", "rec-1"],
      ]),
    );
  });

  test("does not send tags or structured — an edit never re-files or rewrites the payload", async () => {
    await updateRecord("u1", "rec-1", { body: "b", topic: "t" });
    const patch = clientMock.__calls.update as Record<string, unknown>;
    expect(patch).toEqual({ body: "b", topic: "t" });
    expect(patch).not.toHaveProperty("tags");
    expect(patch).not.toHaveProperty("structured");
  });

  test("throws when the update returns an error (e.g. RLS denies)", async () => {
    clientMock.__setError({ message: "rls denied" });
    await expect(updateRecord("u1", "rec-1", { body: "x" })).rejects.toBeDefined();
  });

  test("throws on a 0-row no-op (stale/unauthorized id returns success + no rows)", async () => {
    clientMock.__setEmpty();
    await expect(updateRecord("u1", "gone", { body: "x" })).rejects.toBeDefined();
  });
});
