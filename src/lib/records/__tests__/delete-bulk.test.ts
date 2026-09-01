// Audit HIGH (deleteAllUserData incomplete erasure): asserts the content wipe
// now also clears the client-deletable derived tables (self_contexts, owned
// clipper_templates) on top of records/sources/wiki/chat, and that terminal
// account deletion routes through the delete-account Edge Function (the only
// path that reaches RLS-protected tables + the public.users cascade).

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

describe("account deletion UI routing", () => {
  const account = readFileSync(join(process.cwd(), "src/app/account.tsx"), "utf8");
  const deepSpace = readFileSync(
    join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
    "utf8",
  );

  test("full account deletion never runs the non-atomic client content wipe first", () => {
    expect(account).not.toContain("deleteAllUserData");
    expect(deepSpace).not.toContain("deleteAllUserData");
    expect(account).toContain("await requestAccountDeletion()");
    expect(deepSpace).toContain("await requestAccountDeletion()");
  });

  test("both deletion surfaces synchronously fence duplicate terminal calls", () => {
    expect(account).toContain("deleteConfirmUserRef.current !== userId");
    expect(account).toContain("deleteInFlightRef.current = true");
    expect(deepSpace).toContain("deleteConfirmUserRef.current !== userId");
    expect(deepSpace).toContain("deleteInFlightRef.current = true");
  });

  test("deep-space confirms twice and blocks route removal while erasure is in flight", () => {
    expect(account).toContain('navigation.addListener("beforeRemove"');
    expect(deepSpace).toContain('navigation.addListener("beforeRemove"');
    expect(deepSpace).toContain("event.preventDefault()");
    expect(deepSpace).toContain("setDeleteConfirmOpen(true)");
    expect(deepSpace).toContain("onPress={requestDeleteAccountConfirm}");
    expect(deepSpace).not.toContain("onPress={() => void runDeleteAccount()}");
  });

  test("a late deletion result cannot sign out a newly active user", () => {
    expect(account).toContain("activeUserRef.current !== targetUserId");
    expect(deepSpace).toContain("activeUserRef.current !== targetUserId");
  });

  test("a final confirmation is bound to the user who opened it", () => {
    for (const source of [account, deepSpace]) {
      expect(source).toContain("deleteConfirmUserRef.current = userId");
      expect(source).toContain("deleteConfirmUserRef.current !== userId");
      expect(source).toContain("deleteConfirmUserRef.current = null");
    }
  });

  test("local sign-out failure is not treated as a retryable deletion failure", () => {
    for (const source of [account, deepSpace]) {
      const terminalCall = source.indexOf("await requestAccountDeletion()");
      const localSignOutWarning = source.indexOf("local sign-out after deletion failed");
      const redirect = source.indexOf('router.replace("/sign-in")', localSignOutWarning);
      expect(terminalCall).toBeGreaterThan(-1);
      expect(localSignOutWarning).toBeGreaterThan(terminalCall);
      expect(redirect).toBeGreaterThan(localSignOutWarning);
    }
  });
});
