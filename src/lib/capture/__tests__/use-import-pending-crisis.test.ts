// Exercise the actual hook decision path without a React renderer or network.
// The pending queue is legacy device data; a successful sign-in alone must not
// create a record, even when profile and onboarding are ready.
const mockAuth = jest.fn();
const mockLoad = jest.fn();
const mockImport = jest.fn();
const mockCreateRecord = jest.fn();
const mockGetSession = jest.fn();
const mockRelease = jest.fn();
const mockFirstRunGate = jest.fn();
const mockOwner = { current: true };
const mockLanguage = { current: "ko" };
const mockHookCursor = { current: 0 };
const mockSlots: Array<{ current: unknown }> = [];
const mockEffects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();

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
  useCallback: (callback: unknown) => { mockHookCursor.current++; return callback; },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: mockLanguage.current } }),
}));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth() }));
jest.mock("@/lib/auth/account-epoch", () => ({
  captureAccountOwnerLease: () => mockOwner.current ? { isCurrent: () => mockOwner.current } : null,
}));
jest.mock("@/lib/auth/account-session-lease", () => ({
  beginAccountSessionLease: (userId: string) => ({
    authenticate: async () => ({
      userId,
      assertCurrent: () => { if (!mockOwner.current) throw new Error("owner changed"); },
    }),
    release: mockRelease,
  }),
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
    mockOwner.current = true;
    mockLanguage.current = "ko";
    mockAuth.mockReturnValue({ sessionId: "s1", userId: "u1", hasProfile: true, isMinor: true, loading: false, profileProbeFailed: false });
    mockFirstRunGate.mockReturnValue("home");
    mockLoad.mockResolvedValue([pending]);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1", email: "owner@example.com" } } }, error: null });
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
    expect(view.prompt).toMatchObject({ count: 1, email: null });
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
