import {
  DEFAULT_WIKI_AUTO_PROMOTE,
  getWikiAutoPromote,
  setWikiAutoPromote,
  maybeAutoPromoteSource,
  __resetWikiAutoPromoteForTests,
} from "../auto-promote";

const USER = "user-1";

// Server shape: users.reasoning_prefs jsonb. The mock lets a test choose between
// "row readable", "key absent" and "read blew up", which are three genuinely
// different fallbacks in the module.
let serverPrefs: Record<string, unknown> | null = {};
let serverReadError: Error | null = null;
let serverWriteError: Error | null = null;
let lastUpdate: Record<string, unknown> | null = null;

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            serverReadError
              ? { data: null, error: serverReadError }
              : { data: { reasoning_prefs: serverPrefs }, error: null },
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        lastUpdate = patch;
        return { eq: async () => ({ error: serverWriteError }) };
      },
    }),
  }),
}));

const generateSourcePage = jest.fn();
jest.mock("../phase2", () => ({
  generateSourcePage: (...args: unknown[]) => generateSourcePage(...args),
}));

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  });
});

beforeEach(() => {
  serverPrefs = {};
  serverReadError = null;
  serverWriteError = null;
  lastUpdate = null;
  generateSourcePage.mockReset();
  localStorage.clear();
  __resetWikiAutoPromoteForTests(true);
});

describe("wiki auto-promote preference", () => {
  it("defaults to MANUAL", async () => {
    // The whole point of the setting: promotion embeds the page, one paid call
    // per capture, so it must not happen unless the user asked for it.
    expect(DEFAULT_WIKI_AUTO_PROMOTE).toBe(false);
    await expect(getWikiAutoPromote(USER)).resolves.toBe(false);
  });

  it("uses the server value when the key is set", async () => {
    serverPrefs = { wikiAuto: true };
    await expect(getWikiAutoPromote(USER)).resolves.toBe(true);
  });

  it("falls back to the local mirror when the server read fails", async () => {
    await setWikiAutoPromote(USER, true);
    __resetWikiAutoPromoteForTests(); // drop the cache, keep the mirror
    serverReadError = new Error("offline");
    await expect(getWikiAutoPromote(USER)).resolves.toBe(true);
  });

  it("falls back to MANUAL when neither the server nor a mirror has an answer", async () => {
    serverReadError = new Error("offline");
    await expect(getWikiAutoPromote(USER)).resolves.toBe(false);
  });

  it("keeps the neighbouring auto-reasoning key when writing", async () => {
    // reasoning_prefs is shared with reasoning/auto-pref.ts. A blind overwrite
    // would silently switch off automatic reasoning from the settings screen.
    serverPrefs = { auto: true };
    await setWikiAutoPromote(USER, true);
    expect(lastUpdate).toEqual({ reasoning_prefs: { auto: true, wikiAuto: true } });
  });

  it("never throws when the server write fails, and keeps the local value", async () => {
    serverWriteError = new Error("nope");
    await expect(setWikiAutoPromote(USER, true)).resolves.toBeUndefined();
    __resetWikiAutoPromoteForTests();
    serverReadError = new Error("offline");
    await expect(getWikiAutoPromote(USER)).resolves.toBe(true);
  });
});

describe("maybeAutoPromoteSource", () => {
  it("does nothing while the pref is off", async () => {
    serverPrefs = { wikiAuto: false };
    await maybeAutoPromoteSource(USER, "src-1");
    expect(generateSourcePage).not.toHaveBeenCalled();
  });

  it("promotes when the pref is on", async () => {
    serverPrefs = { wikiAuto: true };
    await maybeAutoPromoteSource(USER, "src-1");
    expect(generateSourcePage).toHaveBeenCalledWith(USER, "src-1");
  });

  it("swallows a promotion failure so a capture is never lost to it", async () => {
    serverPrefs = { wikiAuto: true };
    generateSourcePage.mockRejectedValueOnce(new Error("storage pending"));
    await expect(maybeAutoPromoteSource(USER, "src-1")).resolves.toBeUndefined();
  });
});
