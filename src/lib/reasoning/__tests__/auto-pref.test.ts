// Server-persisted automatic-reasoning preference (0093, PR-B 화면 A).
// Contract under test: server value wins → local mirror fallback → default OFF;
// writes merge over stored keys and NEVER throw on server failure.

import { readFileSync } from "node:fs";
import path from "node:path";

const state: {
  selectResult: { data: unknown; error: { message: string } | null } | "throw";
  updateResult: { error: { message: string } | null } | "throw";
  selectCalls: number;
  updateArgs: unknown[];
} = {
  selectResult: { data: null, error: null },
  updateResult: { error: null },
  selectCalls: 0,
  updateArgs: [],
};

jest.mock("../../supabase/client", () => {
  const maybeSingle = async () => {
    state.selectCalls += 1;
    if (state.selectResult === "throw") throw new Error("network down");
    return state.selectResult;
  };
  const selectChain = { eq: () => ({ maybeSingle }) };
  const updateChain = (payload: unknown) => ({
    eq: async () => {
      state.updateArgs.push(payload);
      if (state.updateResult === "throw") throw new Error("network down");
      return state.updateResult;
    },
  });
  return {
    getSupabaseClient: () => ({
      from: () => ({
        select: () => selectChain,
        update: (payload: unknown) => updateChain(payload),
      }),
    }),
  };
});

import {
  __resetAutoPrefCacheForTests,
  getAutoReasoningEnabled,
  setAutoReasoningEnabled,
} from "../auto-pref";

const UID = "user-auto-pref-test";

beforeEach(() => {
  __resetAutoPrefCacheForTests(true);
  state.selectResult = { data: null, error: null };
  state.updateResult = { error: null };
  state.selectCalls = 0;
  state.updateArgs = [];
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

describe("getAutoReasoningEnabled", () => {
  test("server value wins and is cached (one read per TTL window)", async () => {
    state.selectResult = { data: { reasoning_prefs: { auto: true } }, error: null };
    await expect(getAutoReasoningEnabled(UID)).resolves.toBe(true);
    await expect(getAutoReasoningEnabled(UID)).resolves.toBe(true);
    expect(state.selectCalls).toBe(1);
  });

  test("defaults OFF when the server has no value and no mirror exists", async () => {
    state.selectResult = { data: { reasoning_prefs: {} }, error: null };
    await expect(getAutoReasoningEnabled(UID)).resolves.toBe(false);
  });

  test("fail-soft: server error falls back to the local mirror (pre-0093 behavior)", async () => {
    // Seed the mirror through a set whose server write also fails.
    state.updateResult = "throw";
    state.selectResult = "throw";
    await expect(setAutoReasoningEnabled(UID, true)).resolves.toBeUndefined();
    __resetAutoPrefCacheForTests(); // drop the read cache, keep the mirror
    await expect(getAutoReasoningEnabled(UID)).resolves.toBe(true);
  });
});

describe("setAutoReasoningEnabled", () => {
  test("merges over stored reasoning_prefs keys instead of clobbering them", async () => {
    state.selectResult = { data: { reasoning_prefs: { future_key: 7 } }, error: null };
    await setAutoReasoningEnabled(UID, true);
    expect(state.updateArgs).toHaveLength(1);
    expect(state.updateArgs[0]).toEqual({ reasoning_prefs: { future_key: 7, auto: true } });
  });

  test("never throws on server failure and keeps the toggle readable locally", async () => {
    state.selectResult = "throw";
    state.updateResult = "throw";
    await expect(setAutoReasoningEnabled(UID, true)).resolves.toBeUndefined();
    await expect(getAutoReasoningEnabled(UID)).resolves.toBe(true); // read cache
  });
});

describe("0093 structural pins", () => {
  const root = path.resolve(__dirname, "../../../..");

  test("the migration adds users.reasoning_prefs exactly as the client reads it", () => {
    const sql = readFileSync(path.join(root, "db/migrations/0093_reasoning_prefs.sql"), "utf8");
    expect(sql).toContain(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS reasoning_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;",
    );
    const client = readFileSync(path.join(root, "src/lib/reasoning/auto-pref.ts"), "utf8");
    expect(client).toContain('from("users")');
    expect(client).toContain('select("reasoning_prefs")');
  });

  test("the app imports the pref from the lib module, not the route file", () => {
    for (const file of ["src/app/reasoning.tsx", "src/components/deep-space/ConstellationHome.tsx"]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).toContain('from "@/lib/reasoning/auto-pref"');
    }
  });
});
