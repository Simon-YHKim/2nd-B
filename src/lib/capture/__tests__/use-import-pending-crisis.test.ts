// Exercise the actual hook decision path without a React renderer or network.
// The pending queue is legacy device data; a successful sign-in alone must not
// create a record, even when profile and onboarding are ready.
const mockAuth = jest.fn();
const mockLoad = jest.fn();
const mockImport = jest.fn();
const mockCreateRecord = jest.fn();
const mockGetSession = jest.fn();
const mockRelease = jest.fn();
const mockBeginSessionLease = jest.fn();
const mockFirstRunGate = jest.fn();
const mockOwner = { current: true };
const mockLanguage = { current: "ko" };
const mockHookCursor = { current: 0 };
const mockSlots: Array<{ current: unknown }> = [];
const mockEffects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
const mockCallbacks = new Map<number, { deps: unknown[]; callback: unknown }>();

function mockSession(sessionId: string | null, email = "owner@example.com") {
  return {
    access_token: `h.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url")}.s`,
    user: { id: "u1", email },
  };
}

jest.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = mockHookCursor.current++;
    const slot = mockSlots[index] ?? (mockSlots[index] = { current: initial });
    return [slot.current, (next: unknown) => {
      slot.current = typeof next === "function" ? (next as (value: unknown) => unknown)(slot.current) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = mockHookCursor.current++;
    return mockSlots[index] ?? (mockSlots[index] = { current: initial });
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = mockHookCursor.current++;
    const previous = mockEffects.get(index);
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    previous?.cleanup?.();
    const cleanup = effect();
    mockEffects.set(index, { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined });
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = mockHookCursor.current++;
    const previous = mockCallbacks.get(index);
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return previous.callback;
    mockCallbacks.set(index, { deps, callback });
    return callback;
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: mockLanguage.current } }),
}));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth() }));
jest.mock("@/lib/auth/account-epoch", () => ({
  captureAccountOwnerLease: () => mockOwner.current ? { isCurrent: () => mockOwner.current } : null,
}));
jest.mock("@/lib/auth/account-session-lease", () => ({
  beginAccountSessionLease: (userId: string) => {
    mockBeginSessionLease(userId);
    return {
      authenticate: async () => ({
        userId,
        accessToken: (await mockGetSession()).data.session.access_token,
        assertCurrent: () => { if (!mockOwner.current) throw new Error("owner changed"); },
      }),
      release: mockRelease,
    };
  },
}));
jest.mock("@/lib/onboarding/account-first-run", () => ({
  useFirstRunHomeGate: (...args: unknown[]) => mockFirstRunGate(...args),
}));
jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }),
}));
jest.mock("../preauth-pending", () => ({ loadPendingCaptures: () => mockLoad() }));
jest.mock("../import-pending", () => ({ importPendingCaptures: (...args: unknown[]) => mockImport(...args) }));
jest.mock("../../records/create", () => ({ createRecord: (...args: unknown[]) => mockCreateRecord(...args) }));

import { useImportPendingCaptures } from "../use-import-pending";

const pending = { localId: "p_1782000000000_abc", text: "private note", capturedAt: "2026-06-21T00:00:00Z" };
function TestHarness() {
  mockHookCursor.current = 0;
  return useImportPendingCaptures();
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("pre-account pending import owner confirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSlots.length = 0;
    mockEffects.clear();
    mockCallbacks.clear();
    mockOwner.current = true;
    mockLanguage.current = "ko";
    mockAuth.mockReturnValue({ sessionId: "s1", userId: "u1", hasProfile: true, isMinor: true, loading: false, profileProbeFailed: false });
    mockFirstRunGate.mockReturnValue("home");
    mockLoad.mockResolvedValue([pending]);
    mockGetSession.mockResolvedValue({ data: { session: mockSession("s1") }, error: null });
    mockImport.mockResolvedValue({ total: 1, imported: 1, failed: 0 });
    mockCreateRecord.mockResolvedValue({ id: "r1", tags: [] });
  });

  test("existing-account sign-in presents count and exact email, without automatic server import", async () => {
    TestHarness();
    await settle();
    const view = TestHarness();
    // It reads the home's decision for this owner and never drives it (no claim from here).
    expect(mockFirstRunGate).toHaveBeenLastCalledWith("u1", true, "s1");
    expect(view.prompt).toMatchObject({ count: 1, email: "owner@example.com" });
    expect(mockImport).not.toHaveBeenCalled();
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  test("defer keeps the queue and never writes", async () => {
    TestHarness(); await settle();
    TestHarness().deferImport();
    expect(TestHarness().prompt).toBeNull();
    expect(mockImport).not.toHaveBeenCalled();
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  test("a mismatched session cannot enable import", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u2", email: "other@example.com" } } }, error: null });
    TestHarness(); await settle();
    const view = TestHarness();
    expect(view.prompt).toBeNull();
    view.confirmImport();
    await settle();
    expect(mockImport).not.toHaveBeenCalled();
  });

  test("owner change before confirmation hides the prompt and prevents import", async () => {
    TestHarness(); await settle();
    const oldView = TestHarness();
    mockOwner.current = false;
    expect(TestHarness().prompt).toBeNull();
    oldView.confirmImport();
    await settle();
    expect(mockImport).not.toHaveBeenCalled();
  });

  test.each(["wait", "home"])("same UID s1 to s2 without focus hides and rejects s1 offer while gate is %s", async (firstRun) => {
    TestHarness(); await settle();
    expect(TestHarness().prompt?.email).toBe("owner@example.com");
    mockAuth.mockReturnValue({ ...mockAuth(), sessionId: "s2" });
    mockFirstRunGate.mockReturnValue(firstRun);
    mockGetSession.mockResolvedValue({ data: { session: mockSession("s2", "new@example.com") }, error: null });
    const changing = TestHarness(); // old state is still captured during this render
    expect(changing.prompt).toBeNull();
    changing.confirmImport();
    expect(mockBeginSessionLease).not.toHaveBeenCalled();
    await settle();
    expect(mockImport).not.toHaveBeenCalled();
    if (firstRun === "wait") {
      expect(TestHarness().prompt).toBeNull();
      mockFirstRunGate.mockReturnValue("home");
      expect(TestHarness().prompt).toBeNull();
      await settle();
    }
    const current = TestHarness();
    expect(current.prompt?.email).toBe("new@example.com");
    current.confirmImport();
    await settle();
    expect(mockImport).toHaveBeenCalledTimes(1);
  });

  test.each(["wait", "/onboarding", "/ttfv"])("an existing offer cannot show or confirm when firstRun changes to %s", async (firstRun) => {
    TestHarness(); await settle();
    expect(TestHarness().prompt).not.toBeNull();
    mockFirstRunGate.mockReturnValue(firstRun);
    const view = TestHarness();
    expect(view.prompt).toBeNull();
    view.confirmImport();
    await settle();
    expect(mockImport).not.toHaveBeenCalled();
  });

  test.each(["s2", null])("an offer is not published from a token for %s while s1 is published", async (actualSession) => {
    mockGetSession.mockResolvedValue({ data: { session: mockSession(actualSession) }, error: null });
    TestHarness(); await settle();
    const view = TestHarness();
    expect(view.prompt).toBeNull();
    view.confirmImport();
    await settle();
    expect(mockImport).not.toHaveBeenCalled();
  });

  test("a previous login's async offer cannot be published after same UID session change", async () => {
    let resolveOld!: (value: unknown) => void;
    mockGetSession.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    TestHarness(); await settle();
    mockAuth.mockReturnValue({ ...mockAuth(), sessionId: "s2" });
    mockGetSession.mockResolvedValue({ data: { session: mockSession("s2", "new@example.com") }, error: null });
    TestHarness(); await settle();
    expect(TestHarness().prompt?.email).toBe("new@example.com");
    resolveOld({ data: { session: mockSession("s1") }, error: null });
    await settle();
    expect(TestHarness().prompt?.email).toBe("new@example.com");
  });

  test("a new login clears an old offer's error and busy state without focus", async () => {
    mockImport.mockRejectedValueOnce(new Error("failed"));
    TestHarness(); await settle();
    TestHarness().confirmImport(); await settle();
    expect(TestHarness().prompt?.error).toBe(true);
    mockAuth.mockReturnValue({ ...mockAuth(), sessionId: "s2" });
    mockGetSession.mockResolvedValue({ data: { session: mockSession("s2") }, error: null });
    TestHarness(); await settle();
    expect(TestHarness().prompt).toMatchObject({ error: false, importing: false });
  });

  test("confirmation cannot acquire the next login's session before auth publishes it", async () => {
    TestHarness(); await settle();
    mockGetSession.mockResolvedValue({ data: { session: mockSession("s2") }, error: null });
    TestHarness().confirmImport(); await settle();
    expect(mockImport).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test.each(["success", "failed", "reject"])("s2 waits for an s1 import finishing with %s before making a fresh offer", async (outcome) => {
    let finishOld!: () => void;
    mockImport.mockImplementationOnce(() => new Promise((resolve, reject) => {
      finishOld = () => outcome === "reject" ? reject(new Error("old import failed"))
        : resolve({ total: 1, imported: outcome === "success" ? 1 : 0, failed: outcome === "failed" ? 1 : 0 });
    }));
    TestHarness(); await settle();
    const oldView = TestHarness();
    oldView.confirmImport(); await settle();
    mockAuth.mockReturnValue({ ...mockAuth(), sessionId: "s2" });
    mockGetSession.mockResolvedValue({ data: { session: mockSession("s2", "new@example.com") }, error: null });
    TestHarness(); await settle();
    const waiting = TestHarness();
    expect(waiting.prompt).toBeNull();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    waiting.confirmImport();
    oldView.confirmImport();
    expect(mockBeginSessionLease).toHaveBeenCalledTimes(1);
    finishOld(); await settle();
    const fresh = TestHarness();
    expect(mockLoad).toHaveBeenCalledTimes(2); // the old summary must not reread the new login's queue
    expect(fresh.prompt).toMatchObject({ email: "new@example.com", importing: false, error: false });
    fresh.confirmImport(); await settle();
    expect(mockImport).toHaveBeenCalledTimes(2);
    expect(fresh.crisis.visible).toBe(false);
  });

  test("s1 record followup completing in s2 cannot restore its old crisis UI", async () => {
    let finishRecord!: (value: unknown) => void;
    mockCreateRecord.mockReturnValueOnce(new Promise((resolve) => { finishRecord = resolve; }));
    mockImport.mockImplementationOnce(async (ctx, createOne) => {
      await createOne(pending, ctx, "preauth:old");
      return { total: 1, imported: 1, failed: 0 };
    });
    TestHarness(); await settle();
    TestHarness().confirmImport(); await settle();
    expect(mockCreateRecord).toHaveBeenCalledTimes(1);
    mockAuth.mockReturnValue({ ...mockAuth(), sessionId: "s2" });
    mockGetSession.mockResolvedValue({ data: { session: mockSession("s2", "new@example.com") }, error: null });
    TestHarness(); await settle();
    expect(TestHarness().prompt).toBeNull();
    finishRecord({ id: "r1", followup: { zone: "red" } });
    await settle();
    const view = TestHarness();
    expect(view.crisis.visible).toBe(false);
    expect(view.prompt).toMatchObject({ email: "new@example.com", importing: false, error: false });
  });

  test("confirmation passes the approved snapshot and one account lease, then surfaces red once", async () => {
    mockCreateRecord.mockResolvedValue({ id: "r1", tags: [], followup: { zone: "red" } });
    mockImport.mockImplementation(async (ctx, createOne, _hash, approval) => {
      expect(approval.userId).toBe("u1");
      expect(approval.items).toEqual([pending]);
      await createOne(pending, ctx, "preauth:one");
      await createOne(pending, ctx, "preauth:two");
      return { total: 1, imported: 1, failed: 0 };
    });
    TestHarness(); await settle();
    TestHarness().confirmImport();
    await settle();
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockCreateRecord).toHaveBeenCalledTimes(2);
    expect(mockCreateRecord.mock.calls[0][0]).toMatchObject({
      userId: "u1", kind: "note", minor: true, withFollowup: false,
    });
    expect(TestHarness().crisis).toEqual({ visible: true, hotline: "KR_1388" });
    expect(TestHarness().prompt).toBeNull();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["auth loading", { loading: true }, "home"],
    ["failed profile probe", { profileProbeFailed: true }, "home"],
    ["the first-run decision", {}, "wait"],
    ["the welcome redirect", {}, "/onboarding"],
    ["TTFV redirect", {}, "/ttfv"],
  ])("does not offer import during %s", async (_name, authPatch, firstRun) => {
    mockAuth.mockReturnValue({ sessionId: "s1", userId: "u1", hasProfile: true, isMinor: true, loading: false, profileProbeFailed: false, ...authPatch });
    mockFirstRunGate.mockReturnValue(firstRun);
    TestHarness(); await settle();
    expect(TestHarness().prompt).toBeNull();
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockImport).not.toHaveBeenCalled();
  });
});
