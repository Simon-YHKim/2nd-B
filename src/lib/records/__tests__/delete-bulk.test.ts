// Audit HIGH (deleteAllUserData incomplete erasure): asserts the content wipe
// now also clears the client-deletable derived tables (self_contexts, owned
// clipper_templates) on top of records/sources/wiki/chat, and that terminal
// account deletion routes through the delete-account Edge Function (the only
// path that reaches RLS-protected tables + the public.users cascade).

jest.mock("../../supabase/client", () => {
  const tablesDeleted: string[] = [];
  const invoke = jest.fn().mockResolvedValue({ data: { deleted: true }, error: null });
  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {
      delete: () => {
        tablesDeleted.push(table);
        return chain;
      },
      update: () => chain,
      eq: () => chain,
      // thenable so `await from(t).delete().eq(...)` resolves
      then: (resolve: (v: { count: number; error: null }) => unknown) =>
        resolve({ count: 0, error: null }),
    };
    return chain;
  });
  const mock = { from, functions: { invoke } };
  return {
    getSupabaseClient: () => mock,
    __tablesDeleted: tablesDeleted,
    __invoke: invoke,
    __reset: () => {
      tablesDeleted.length = 0;
      invoke.mockClear();
    },
  };
});

import { deleteAllUserData, requestAccountDeletion } from "../delete-bulk";

const clientMock = require("../../supabase/client") as {
  __tablesDeleted: string[];
  __invoke: jest.Mock;
  __reset: () => void;
};

describe("deleteAllUserData (content wipe)", () => {
  beforeEach(() => clientMock.__reset());

  test("clears records, sources, wiki, chat AND the client-deletable derived tables", async () => {
    const result = await deleteAllUserData("u1");
    // The four originally-covered tables plus the two derived tables the audit
    // flagged as residual PII after a 'full wipe'.
    expect(clientMock.__tablesDeleted).toEqual(
      expect.arrayContaining([
        "wiki_pages",
        "sources",
        "records",
        "chat_usage",
        "self_contexts",
        "clipper_templates",
      ]),
    );
    expect(result).toHaveProperty("selfContexts");
    expect(result).toHaveProperty("clipperTemplates");
  });
});

describe("requestAccountDeletion (terminal erasure)", () => {
  beforeEach(() => clientMock.__reset());

  test("invokes the delete-account Edge Function and resolves on { deleted: true }", async () => {
    await expect(requestAccountDeletion()).resolves.toBeUndefined();
    expect(clientMock.__invoke).toHaveBeenCalledWith("delete-account", { body: {} });
  });

  test("throws when the function reports failure", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(requestAccountDeletion()).rejects.toBeDefined();
  });
});
