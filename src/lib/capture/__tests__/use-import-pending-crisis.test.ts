// Node tests have no React renderer. Drive the real hook's effect with minimal
// React doubles, while replacing the storage/record boundaries with controlled
// captures. The route-to-modal binding is guarded in preauth-pending.test.ts.

const mockAuth = jest.fn();
const mockImport = jest.fn();
const mockCreateRecord = jest.fn();
const mockSetCrisis = jest.fn();
const mockLanguage = { current: "ko" };
const mockEffects: Array<() => void> = [];
const mockRefs: Array<{ current: unknown }> = [];
const mockRenderCursor = { current: 0 };
const mockOnboardingComplete = jest.fn();
const mockAutoTriggerTTFV = jest.fn();

jest.mock("react", () => ({
  useEffect: (effect: () => void) => { mockEffects.push(effect); effect(); },
  useRef: (initial: unknown) => {
    const slot = mockRenderCursor.current++;
    return mockRefs[slot] ?? (mockRefs[slot] = { current: initial });
  },
  useState: (initial: unknown) => [initial, mockSetCrisis],
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: mockLanguage.current } }),
}));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth() }));
jest.mock("@/lib/onboarding/state", () => ({ useOnboardingComplete: () => mockOnboardingComplete() }));
jest.mock("@/lib/onboarding/ttfv-gate", () => ({ useAutoTriggerTTFV: () => mockAutoTriggerTTFV() }));
jest.mock("../import-pending", () => ({ importPendingCaptures: (...args: unknown[]) => mockImport(...args) }));
jest.mock("../../records/create", () => ({ createRecord: (...args: unknown[]) => mockCreateRecord(...args) }));

import { useImportPendingCaptures } from "../use-import-pending";

describe("pre-account first-person note crisis hand-off", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEffects.length = 0;
    mockRefs.length = 0;
    mockRenderCursor.current = 0;
    mockLanguage.current = "ko";
    mockAuth.mockReturnValue({
      userId: "u1", hasProfile: true, isMinor: true, loading: false, profileProbeFailed: false,
    });
    mockOnboardingComplete.mockReturnValue(true);
    mockAutoTriggerTTFV.mockReturnValue(false);
  });

  test("an unresolved age uses the youth route, and two red notes show one modal", async () => {
    mockAuth.mockReturnValue({
      userId: "u1", hasProfile: true, isMinor: null, loading: false, profileProbeFailed: false,
    });
    mockCreateRecord.mockResolvedValue({ id: "r1", tags: [], followup: { zone: "red" } });
    mockImport.mockImplementation(async (ctx, createOne) => {
      await createOne({ text: "first" }, ctx, "preauth:first");
      await createOne({ text: "second" }, ctx, "preauth:second");
      return { total: 2, imported: 2, failed: 0 };
    });

    useImportPendingCaptures();
    await mockImport.mock.results[0].value;

    expect(mockImport.mock.calls[0][0]).toEqual({ userId: "u1", locale: "ko", minor: true });
    expect(mockCreateRecord).toHaveBeenCalledTimes(2);
    expect(mockCreateRecord.mock.calls[0][0]).toMatchObject({ kind: "note", minor: true, withFollowup: false });
    expect(mockSetCrisis).toHaveBeenCalledTimes(1);
    expect(mockSetCrisis).toHaveBeenCalledWith({ visible: true, hotline: "KR_1388" });
  });

  test("adult red note selects 109; non-red notes do not show a modal", async () => {
    mockAuth.mockReturnValue({
      userId: "u1", hasProfile: true, isMinor: false, loading: false, profileProbeFailed: false,
    });
    mockCreateRecord
      .mockResolvedValueOnce({ id: "r1", tags: [] })
      .mockResolvedValueOnce({ id: "r2", tags: [], followup: { zone: "red" } });
    mockImport.mockImplementation(async (ctx, createOne) => {
      await createOne({ text: "ordinary" }, ctx);
      await createOne({ text: "red" }, ctx);
      return { total: 2, imported: 2, failed: 0 };
    });

    useImportPendingCaptures();
    await mockImport.mock.results[0].value;

    expect(mockImport.mock.calls[0][0].minor).toBe(false);
    expect(mockSetCrisis).toHaveBeenCalledTimes(1);
    expect(mockSetCrisis).toHaveBeenCalledWith({ visible: true, hotline: "KR_109" });
  });

  test("no import starts before the profile gate settles", () => {
    mockAuth.mockReturnValue({
      userId: "u1", hasProfile: false, isMinor: null, loading: false, profileProbeFailed: false,
    });

    useImportPendingCaptures();

    expect(mockImport).not.toHaveBeenCalled();
    expect(mockSetCrisis).not.toHaveBeenCalled();
  });

  test("waits through onboarding and TTFV redirects, then hands off red once on the stable home", async () => {
    mockCreateRecord.mockResolvedValue({ id: "r1", tags: [], followup: { zone: "red" } });
    mockImport.mockImplementation(async (ctx, createOne) => {
      await createOne({ text: "saved before sign-up" }, ctx);
      return { total: 1, imported: 1, failed: 0 };
    });

    mockOnboardingComplete.mockReturnValue(false);
    useImportPendingCaptures();
    expect(mockImport).not.toHaveBeenCalled();

    mockRenderCursor.current = 0;
    mockOnboardingComplete.mockReturnValue(true);
    mockAutoTriggerTTFV.mockReturnValue(true);
    useImportPendingCaptures();
    expect(mockImport).not.toHaveBeenCalled();

    mockRenderCursor.current = 0;
    mockAutoTriggerTTFV.mockReturnValue(false);
    useImportPendingCaptures();
    await mockImport.mock.results[0].value;

    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockSetCrisis).toHaveBeenCalledTimes(1);
    expect(mockSetCrisis).toHaveBeenCalledWith({ visible: true, hotline: "KR_1388" });
  });

  test.each([
    ["auth loading", { loading: true }, true, false],
    ["failed profile probe", { profileProbeFailed: true }, true, false],
    ["onboarding hydration", {}, null, false],
    ["TTFV hydration", {}, true, null],
  ])("does not import during %s", (_name, authPatch, onboarding, ttfv) => {
    mockAuth.mockReturnValue({
      userId: "u1", hasProfile: true, isMinor: true, loading: false,
      profileProbeFailed: false, ...authPatch,
    });
    mockOnboardingComplete.mockReturnValue(onboarding);
    mockAutoTriggerTTFV.mockReturnValue(ttfv);

    useImportPendingCaptures();

    expect(mockImport).not.toHaveBeenCalled();
    expect(mockSetCrisis).not.toHaveBeenCalled();
  });

  test("a storage failure settles without an unhandled rejection and permits a later retry", async () => {
    mockImport
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce({ total: 0, imported: 0, failed: 0 });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      useImportPendingCaptures();
      await mockImport.mock.results[0].value.catch(() => undefined);
      expect(warn).toHaveBeenCalledWith("[capture] pending import failed; retry on next home mount");

      // React runs the same effect again after a dependency change; a remount
      // gets a fresh ref and also retries. Neither path loses the local queue.
      mockEffects[0]();
      await mockImport.mock.results[1].value;
      expect(mockImport).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
