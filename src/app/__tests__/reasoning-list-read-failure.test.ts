// Execute the actual screen with hook lifetimes. Native views and service
// boundaries are controlled; no model, server mutation or recovery RPC runs.
// T43: the usage numbers come from the actual strict loader over a fake Supabase
// transport (usage_counters + credit_summary_self). The list and the usage are two
// reads now, so a list failure no longer hides confirmed usage, and a usage failure
// shows "..." + its own retry instead of 0 or a fake remaining count.
import type { ReactElement } from "react";
import { hookHarness } from "../../lib/nav/__tests__/hook-harness";
import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { weekBucket } from "../../lib/entitlements/usage";

let mockHarness: ReturnType<typeof hookHarness>;
let mockAuth = { userId: "owner-a" as string | null, loading: false, isMinor: false, hasProfile: true, profileProbeFailed: false, refresh: jest.fn() };
const mockRecords = jest.fn();
const mockSources = jest.fn();
const mockUsage = jest.fn();
const mockCounter = jest.fn();
const mockLedger = jest.fn();
const mockDispatches: string[] = [];
let mockFocused = true;
const mockRecover = jest.fn();
const mockPending = jest.fn();
const mockModel = jest.fn();
const mockRun = jest.fn();
const mockPush = jest.fn();
const mockTranslate = (key: string, values?: Record<string, unknown>) => key + (values ? JSON.stringify(values) : "");
const mockI18n = { language: "ko", resolvedLanguage: "ko", getFixedT: () => mockTranslate, t: mockTranslate };
const record = (id: string) => ({ id, kind: "note", topic: id, body: "saved body", tags: [], created_at: "2026-10-15T00:00:00Z" });
const usage = { used: 1, rewardCredits: 0, rewardEarned: 0 };

jest.mock("react-native", () => ({
  Platform: { OS: "web", select: (values: Record<string, unknown>) => values.web ?? values.default }, StyleSheet: { create: (value: unknown) => value },
  Animated: { Value: class { setValue() {} interpolate() { return 0; } }, loop: () => ({ start() {}, stop() {} }), timing: jest.fn() },
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: mockTranslate, i18n: mockI18n }) }));
jest.mock("expo-router", () => ({
  Redirect: "Redirect",
  useFocusEffect: (callback: () => void | (() => void)) => {
    jest.requireActual<typeof import("react")>("react").useEffect(() => (mockFocused ? callback() : undefined), [callback, mockFocused]);
  },
}));
jest.mock("@/components/phone/PhoneUIKit", () => ({ PhoneAnimatedView: "AnimatedView", PhoneFlatList: "FlatList", PhonePressable: "Pressable", PhoneView: "View" }));
jest.mock("@/components/ui/PlainText", () => ({ PlainText: "RNText" }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: "PixelGlyph" }));
jest.mock("@/components/deep-space/DeepSpaceScreen", () => ({ DeepSpaceScreen: "DeepSpaceScreen" }));
jest.mock("@/components/deepspace/SecondbHead", () => ({ SecondbHead: "SecondbHead" }));
jest.mock("@/components/deepspace/LoadingPolaris", () => ({ LoadingPolaris: "LoadingPolaris" }));
jest.mock("@/components/safety/CrisisRouter", () => ({ CrisisRouter: "CrisisRouter" }));
jest.mock("@/components/m3", () => ({ MdButton: "MdButton" }));
jest.mock("@/components/ui/InlineLoader", () => ({ InlineLoader: "InlineLoader" }));
jest.mock("@/components/deep-space/ProfileProbeRetry", () => ({ ProfileProbeRetryScreen: "ProfileProbeRetryScreen" }));
jest.mock("@/components/deep-space/AutoReasoningIntroSheet", () => ({ AutoReasoningIntroSheet: "AutoReasoningIntroSheet" }));
jest.mock("@/components/deep-space/ReasoningLimitSheet", () => ({ ReasoningLimitSheet: "ReasoningLimitSheet" }));
jest.mock("@/lib/motion/pixel-physical", () => ({ pixelStepsFor: jest.fn() }));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/lib/nav/phone-embed", () => ({ useAppRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("@/lib/progression/useProgression", () => ({ useProgression: () => ({ tier: "free" }) }));
jest.mock("@/lib/ads/policy", () => ({ rewardedAdsConfigured: () => false }));
jest.mock("@/lib/entitlements/usage", () => ({ ...jest.requireActual("@/lib/entitlements/usage"), getReasoningUsage: (...args: unknown[]) => mockUsage(...args) }));
jest.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => mockClient() }));
jest.mock("@/lib/llm/boundary", () => ({ callLlm: (...args: unknown[]) => mockModel(...args) }));
jest.mock("@/lib/analytics", () => ({ captureEvent: jest.fn(), proposalDecided: jest.fn() }));
jest.mock("@/lib/reasoning/auto-pref", () => ({ getAutoIntroSeen: () => Promise.resolve(true), getAutoReasoningEnabled: () => Promise.resolve(false), setAutoIntroSeen: jest.fn(), setAutoReasoningEnabled: jest.fn() }));
jest.mock("@/lib/reasoning/runs", () => ({
  recoverStaleRuns: (...args: unknown[]) => mockRecover(...args),
  listPendingProposals: (...args: unknown[]) => mockPending(...args),
  reserveRun: (...args: unknown[]) => mockRun(...args),
}));
jest.mock("@/lib/persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("@/lib/records/detect-domain", () => ({ detectDomain: jest.fn() }));
jest.mock("@/lib/records/create", () => ({ listRecentRecords: (...args: unknown[]) => mockRecords(...args) }));
jest.mock("@/lib/records/source-pieces", () => ({ listSourcePieces: (...args: unknown[]) => mockSources(...args) }));
jest.mock("@/lib/wiki/phase2", () => ({ generateSourcePage: jest.fn() }));
jest.mock("@/lib/wiki/queries", () => ({}));
jest.mock("@/lib/wiki/storage", () => ({}));
jest.mock("@/lib/tasks/store", () => ({ useTaskStatus: () => ({ phase: "idle" }), dismissTask: jest.fn(), sendToBackground: jest.fn(), startTask: jest.fn() }));

type Reply = { data?: unknown; error?: { message: string } | null };
type Then = (ok: (reply: Reply) => unknown, no?: (error: unknown) => unknown) => Promise<unknown>;
function mockClient() {
  const chain: { owner?: string; select: () => typeof chain; eq: (col: string, value: string) => typeof chain; then: Then } = {
    select: () => chain,
    eq: (col, value) => { if (col === "user_id") chain.owner = value; return chain; },
    then: (ok, no) => { mockDispatches.push("counter"); return Promise.resolve(mockCounter(chain.owner)).then(ok, no); },
  };
  return { from: () => chain, rpc: () => ({ then: ((ok, no) => { mockDispatches.push("ledger"); return Promise.resolve(mockLedger()).then(ok, no); }) as Then }) };
}
const counterRow = (owner: string, used: number) => ({ data: [{ user_id: owner, month_bucket: weekBucket(), reasoning_used: used }], error: null });
const ledgerOf = (available: unknown, earned: unknown = 0) => ({ data: { available, ad_earned_this_month: earned }, error: null });
let usedFor: Record<string, number> = {};

let Screen: () => ReactElement;
let timeoutMs: number;
const spies: jest.SpyInstance[] = [];
beforeAll(() => {
  const React = jest.requireActual<typeof import("react")>("react");
  spies.push(jest.spyOn(React, "useState").mockImplementation(((initial: unknown) => mockHarness.hooks.useState(initial)) as typeof React.useState));
  spies.push(jest.spyOn(React, "useRef").mockImplementation(((initial: unknown) => mockHarness.hooks.useRef(initial)) as typeof React.useRef));
  spies.push(jest.spyOn(React, "useMemo").mockImplementation(((fn: () => unknown, deps: readonly unknown[]) => mockHarness.hooks.useMemo(fn, deps)) as typeof React.useMemo));
  spies.push(jest.spyOn(React, "useCallback").mockImplementation(((fn: unknown, deps: readonly unknown[]) => mockHarness.hooks.useCallback(fn, deps)) as typeof React.useCallback));
  spies.push(jest.spyOn(React, "useEffect").mockImplementation(((fn: () => void | (() => void), deps: readonly unknown[]) => mockHarness.hooks.useEffect(fn, deps)) as typeof React.useEffect));
  (globalThis as { React?: unknown }).React = React;
  const module = jest.requireActual<typeof import("../reasoning")>("../reasoning");
  Screen = module.default; timeoutMs = module.REASONING_LIST_READ_TIMEOUT_MS;
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); delete (globalThis as { React?: unknown }).React; });
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  mockHarness = hookHarness(); mockAuth = { ...mockAuth, userId: "owner-a", loading: false };
  mockI18n.language = "ko"; mockI18n.resolvedLanguage = "ko";
  mockRecords.mockImplementation((owner: string) => Promise.resolve([record(`${owner}-record`)]));
  mockSources.mockResolvedValue([]); mockUsage.mockResolvedValue(usage);
  mockRecover.mockResolvedValue(0); mockPending.mockResolvedValue([]);
  mockFocused = true; mockDispatches.length = 0; usedFor = {};
  mockCounter.mockImplementation((owner: string) => Promise.resolve(counterRow(owner, usedFor[owner] ?? 1)));
  mockLedger.mockImplementation(() => Promise.resolve(ledgerOf(0)));
});
afterEach(() => {
  mockHarness?.unmount(); jest.clearAllTimers(); jest.useRealTimers();
  expect(mockModel).not.toHaveBeenCalled(); expect(mockRun).not.toHaveBeenCalled();
  // The screen never reads the fail-open legacy getter (only automatic runs keep it).
  expect(mockUsage).not.toHaveBeenCalled();
});

type Item = { key: string };
type Element = ReactElement<{ children?: unknown; label?: string; title?: string; disabled?: boolean; onPress?: () => void; data?: Item[]; ListHeaderComponent?: unknown; ListEmptyComponent?: unknown; renderItem?: (input: { item: Item }) => Element }>;
const children = (node: Element) => [node.props.children, node.props.ListHeaderComponent, node.props.data?.length === 0 ? node.props.ListEmptyComponent : null];
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...children(node).flatMap(nodes)];
}
function drawn(value: unknown): string {
  if (Array.isArray(value)) return value.map(drawn).join(" ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  const node = value as Element;
  return [node.props.label, node.props.title, ...children(node).map(drawn)].filter(Boolean).join(" ");
}
const render = () => mockHarness.render(Screen);
async function settle() { let tree = render(); for (let i = 0; i < 20; i++) { await Promise.resolve(); tree = render(); } return tree; }
const list = (tree: unknown) => nodes(tree).find((node) => node.type === "FlatList")!;
const keys = (tree: unknown) => list(tree).props.data?.map((item) => item.key);
const retry = (tree: unknown) => nodes(tree).find((node) => node.props.label === "common:actions.retry" && (node.props as { testID?: string }).testID !== "reasoning-usage-retry");
const usageRetry = (tree: unknown) => nodes(tree).find((node) => (node.props as { testID?: string }).testID === "reasoning-usage-retry");
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function expectFailed(tree: unknown, timeout = false, unknownCounts = true) {
  expect(drawn(tree)).toContain(timeout ? "common:errors.network" : "ds.reasoningScreen.loadFailed");
  expect(drawn(tree)).not.toContain("ds.reasoningScreen.emptyItems");
  expect(drawn(tree)).not.toContain("ds.reasoningScreen.captureFirst");
  if (unknownCounts) expect(drawn(tree)).toContain("...");
  expect(retry(tree)).toBeDefined();
}

test.each(["records", "sources"])("%s rejection shows failure and retry instead of empty data", async (kind) => {
  const read = kind === "records" ? mockRecords : mockSources;
  read.mockRejectedValueOnce(new Error("read failed"));
  const failed = await settle(); expectFailed(failed); expect(keys(failed)).toEqual([]);
  retry(failed)!.props.onPress!();
  const ready = await settle(); expect(keys(ready)).toEqual(["record:owner-a-record"]); expect(retry(ready)).toBeUndefined();
  expect(mockRecover).toHaveBeenCalledTimes(1); expect(mockPending).toHaveBeenCalledTimes(1);
});

test.each(["records", "sources"])("%s stall reaches the whole-list deadline; a late reply cannot replace retry", async (kind) => {
  const stalled = deferred<unknown>();
  const read = kind === "records" ? mockRecords : mockSources;
  read.mockReturnValueOnce(stalled.promise);
  let tree = await settle(); expect(drawn(tree)).toContain("ds.reasoningScreen.loadingItems");
  jest.advanceTimersByTime(timeoutMs - 1); tree = await settle(); expect(retry(tree)).toBeUndefined();
  jest.advanceTimersByTime(1); tree = await settle(); expectFailed(tree, true);
  retry(tree)!.props.onPress!(); tree = await settle(); expect(keys(tree)).toEqual(["record:owner-a-record"]);
  stalled.resolve([]);
  tree = await settle(); expect(keys(tree)).toEqual(["record:owner-a-record"]); expect(retry(tree)).toBeUndefined();
});

test("one rejected read does not wait for a different stalled read", async () => {
  mockRecords.mockRejectedValue(new Error("records unavailable")); mockSources.mockReturnValue(new Promise(() => {}));
  expectFailed(await settle());
});

test("only successfully read empty data offers the first capture", async () => {
  mockRecords.mockResolvedValue([]); const tree = await settle();
  expect(drawn(tree)).toContain("ds.reasoningScreen.emptyItems");
  expect(drawn(tree)).toContain("ds.reasoningScreen.captureFirst"); expect(retry(tree)).toBeUndefined();
});

test("the successful list keeps query scope, source identity, filtering and date order", async () => {
  mockRecords.mockResolvedValue([record("ordinary"), { ...record("already-applied"), tags: ["reasoning:ratified"] }]);
  mockSources.mockResolvedValue([{ id: "src-link-a", title: "saved source", tags: [], created_at: "2026-10-15T12:00:00Z" }]);
  const tree = await settle();
  expect(mockRecords).toHaveBeenCalledWith("owner-a", 60);
  expect(mockSources).toHaveBeenCalledWith("owner-a", { excludeProfileImports: true });
  expect(keys(tree)).toEqual(["source:link-a", "record:ordinary"]);
  expect(list(tree).props.data?.[0]).toMatchObject({ refKind: "source", refId: "link-a" });
});

test("selection survives a language refresh failure and retry without triggering a run", async () => {
  let tree = await settle(); const row = list(tree).props.data![0]; list(tree).props.renderItem!({ item: row }).props.onPress!();
  mockRecords.mockRejectedValueOnce(new Error("refresh failed")); mockI18n.language = "en"; mockI18n.resolvedLanguage = "en";
  tree = await settle(); expectFailed(tree); expect(drawn(tree)).toContain('ds.reasoningScreen.selectedTitle{"n":1}');
  const runButton = nodes(tree).find((node) => node.props.label === 'ds.reasoningScreen.reasonN{"n":1}')!;
  expect(runButton.props.disabled).toBe(true);
  runButton.props.onPress!(); // Even a stale native press cannot start a run.
  retry(tree)!.props.onPress!(); tree = await settle();
  expect(drawn(tree)).toContain('ds.reasoningScreen.reasonN{"n":1}');
  expect(mockRecover).toHaveBeenCalledTimes(1);
});

test("a pending review remains present and selected across list failure and retry", async () => {
  mockPending.mockResolvedValue([{ runId: "run-a", ordinal: 0, kind: "domain_link", status: "proposed", payload: { key: "record:review-a", refKind: "record", refId: "review-a", domain: "career", title: "review title" } }]);
  mockRecords.mockRejectedValueOnce(new Error("read failed"));
  let tree = await settle(); expectFailed(tree, false, false); expect(keys(tree)).toEqual(["record:review-a"]);
  expect(drawn(tree)).toContain('ds.reasoningScreen.applySelected{"n":1}');
  retry(tree)!.props.onPress!(); tree = await settle(); expect(keys(tree)).toEqual(["record:review-a"]);
  expect(drawn(tree)).toContain('ds.reasoningScreen.applySelected{"n":1}'); expect(mockPending).toHaveBeenCalledTimes(1);
});

test("owner change hides old items before a new read settles and ignores old success", async () => {
  await settle(); const old = deferred<unknown>(); mockI18n.language = "en"; mockI18n.resolvedLanguage = "en"; mockRecords.mockReturnValueOnce(old.promise); await settle();
  noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch()); mockAuth.userId = "owner-b";
  expect(keys(render())).toEqual([]); expect(keys(await settle())).toEqual(["record:owner-b-record"]);
  old.resolve([record("old-a")]); expect(keys(await settle())).toEqual(["record:owner-b-record"]);
});

test("pre-publication hold prevents a new list read for the old owner and same-owner return rejects its old reply", async () => {
  const old = deferred<unknown>(); mockRecords.mockReturnValueOnce(old.promise); await settle();
  beginAccountOwnerTransition("owner-b"); await settle(); expect(mockRecords).toHaveBeenCalledTimes(1);
  old.resolve([record("old-a")]); await settle(); expect(mockHarness.dirty).toBe(false);
  beginAccountOwnerTransition("owner-a"); const tree = await settle(); expect(keys(tree)).toEqual(["record:owner-a-record"]);
});

test("unmount rejects a late success without state writes", async () => {
  const old = deferred<unknown>(); mockRecords.mockReturnValueOnce(old.promise); await settle(); mockHarness.unmount();
  old.resolve([record("too-late")]); for (let i = 0; i < 20; i++) await Promise.resolve(); expect(mockHarness.dirty).toBe(false);
});

test("an earlier language read's late rejection cannot erase the new successful list", async () => {
  const old = deferred<unknown>(); mockRecords.mockReturnValueOnce(old.promise); await settle();
  mockI18n.language = "en"; mockI18n.resolvedLanguage = "en"; expect(keys(await settle())).toEqual(["record:owner-a-record"]);
  old.reject(new Error("late failure")); const tree = await settle();
  expect(keys(tree)).toEqual(["record:owner-a-record"]); expect(retry(tree)).toBeUndefined();
});

// ---- T43 usage: the baseline defects of the 10-16 plan, now fixed, plus the lifetime edges ----
const quota = (tree: unknown, left: number) => `ds.reasoningScreen.weeklyLeft{"cap":2,"left":${left}}`;
function expectUsageUnknown(tree: unknown, timeout = false) {
  const text = drawn(tree);
  expect(text).toContain(timeout ? "common:errors.network" : "ds.reasoningScreen.loadFailed");
  expect(text).not.toContain("ds.reasoningScreen.weeklyLeft");
  expect(text).not.toContain("ds.reasoningScreen.depletedTitle");
  expect(text).not.toContain("ds.reasoningScreen.weeklyLimitReached");
  expect(text).toContain("...");
  expect(usageRetry(tree)).toBeDefined();
}
const limitSheet = (tree: unknown) => nodes(tree).find((node) => node.type === "ReasoningLimitSheet") as unknown as { props: { onChanged: () => void } };
function selectFirst(tree: unknown) { const row = list(tree).props.data![0]; list(tree).props.renderItem!({ item: row }).props.onPress!(); }
const runButtonOf = (tree: unknown) => nodes(tree).find((node) => node.props.label === 'ds.reasoningScreen.reasonN{"n":1}');

test("1 a counter error shows unknown usage and a usage retry, never a remaining count", async () => {
  mockCounter.mockImplementationOnce(() => Promise.resolve({ error: { message: "boom" } }));
  let tree = await settle(); expectUsageUnknown(tree); expect(keys(tree)).toEqual(["record:owner-a-record"]);
  selectFirst(tree); tree = await settle();
  const run = runButtonOf(tree)!; expect(run.props.disabled).toBe(true); run.props.onPress!();
  const before = { records: mockRecords.mock.calls.length, dispatches: mockDispatches.length };
  usageRetry(tree)!.props.onPress!(); tree = await settle();
  expect(drawn(tree)).toContain(quota(tree, 1));
  expect(mockDispatches.slice(before.dispatches)).toEqual(["counter", "ledger"]);
  expect(mockRecords.mock.calls.length).toBe(before.records); expect(mockRecover).toHaveBeenCalledTimes(1);
});

test("2 a ledger error with two runs used is unknown, not depleted", async () => {
  usedFor["owner-a"] = 2; mockLedger.mockImplementationOnce(() => Promise.resolve({ error: { message: "42501" } }));
  expectUsageUnknown(await settle());
});

test("3 a malformed ledger number is unknown, not depleted", async () => {
  usedFor["owner-a"] = 2; mockLedger.mockImplementationOnce(() => Promise.resolve(ledgerOf("bad")));
  expectUsageUnknown(await settle());
});

test("4 an immediate counter error shows at once while the ledger hangs", async () => {
  mockCounter.mockImplementationOnce(() => Promise.resolve({ error: { message: "boom" } }));
  mockLedger.mockImplementationOnce(() => new Promise(() => undefined));
  expectUsageUnknown(await settle());
});

test("5 a refresh that fails after a confirmed number never paints a fake higher number", async () => {
  let tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 1));
  mockCounter.mockImplementationOnce(() => Promise.resolve({ error: { message: "boom" } }));
  limitSheet(tree).props.onChanged(); tree = await settle();
  expectUsageUnknown(tree); expect(drawn(tree)).not.toContain(quota(tree, 2));
});

test("6 a stalled refresh shows ... at once and times out into retry; the old number is not current", async () => {
  let tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 1));
  const stalled = deferred<unknown>(); mockCounter.mockImplementationOnce(() => stalled.promise);
  limitSheet(tree).props.onChanged(); tree = await settle();
  expect(drawn(tree)).not.toContain("ds.reasoningScreen.weeklyLeft"); expect(drawn(tree)).toContain("...");
  jest.advanceTimersByTime(9_999); tree = await settle(); expect(usageRetry(tree)).toBeUndefined();
  jest.advanceTimersByTime(1); tree = await settle(); expectUsageUnknown(tree, true);
  stalled.resolve(counterRow("owner-a", 0)); tree = await settle(); expectUsageUnknown(tree, true);
});

test("7 owner A's late refresh cannot overwrite owner B's number", async () => {
  let tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 1));
  const late = deferred<unknown>(); mockCounter.mockImplementationOnce(() => late.promise);
  limitSheet(tree).props.onChanged(); await settle();
  usedFor["owner-b"] = 2; noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch()); mockAuth.userId = "owner-b";
  tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 0));
  late.resolve(counterRow("owner-a", 0)); tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 0));
});

test("8 a successfully read empty counter and zero ledger really is two left", async () => {
  mockCounter.mockImplementationOnce(() => Promise.resolve({ data: [], error: null }));
  const tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 2)); expect(usageRetry(tree)).toBeUndefined();
});

test("refresh and retry never re-run the recovery sweep or the review restore", async () => {
  let tree = await settle();
  for (let i = 0; i < 3; i++) { limitSheet(tree).props.onChanged(); tree = await settle(); }
  mockCounter.mockImplementationOnce(() => Promise.resolve({ error: { message: "boom" } }));
  limitSheet(tree).props.onChanged(); tree = await settle(); usageRetry(tree)!.props.onPress!(); tree = await settle();
  expect(mockRecover).toHaveBeenCalledTimes(1); expect(mockPending).toHaveBeenCalledTimes(1);
});

test("a result that arrives while blurred is dropped without a state write, and refocus reads again", async () => {
  let tree = await settle(); const late = deferred<unknown>(); mockCounter.mockImplementationOnce(() => late.promise);
  limitSheet(tree).props.onChanged(); await settle(); // the refresh read is in flight
  mockFocused = false; await settle(); // blur cleanup
  late.resolve(counterRow("owner-a", 0));
  for (let i = 0; i < 100; i++) await Promise.resolve();
  expect(mockHarness.dirty).toBe(false);
  const dispatches = mockDispatches.length; mockFocused = true; tree = await settle();
  expect(mockDispatches.length).toBe(dispatches + 2); expect(drawn(tree)).toContain(quota(tree, 1));
});

test("a pre-publication hold hides the number and starts no new usage read", async () => {
  let tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 1));
  const dispatches = mockDispatches.length; beginAccountOwnerTransition("owner-b"); tree = await settle();
  expect(drawn(tree)).not.toContain("ds.reasoningScreen.weeklyLeft"); limitSheet(tree).props.onChanged(); await settle();
  expect(mockDispatches.length).toBe(dispatches); expect(mockRecover).toHaveBeenCalledTimes(1);
  beginAccountOwnerTransition("owner-a"); tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 1));
  expect(mockRecover.mock.calls.length).toBeLessThanOrEqual(2);
});

test("unmount rejects a late usage result without state writes", async () => {
  const late = deferred<unknown>(); mockCounter.mockImplementationOnce(() => late.promise); await settle();
  expect(mockCounter).toHaveBeenCalledTimes(1);
  mockHarness.unmount(); late.resolve(counterRow("owner-a", 0));
  for (let i = 0; i < 100; i++) await Promise.resolve(); expect(mockHarness.dirty).toBe(false);
});

test("an account transition cancels an in-flight usage read before React renders again", async () => {
  let tree = await settle(); const late = deferred<unknown>(); mockCounter.mockImplementationOnce(() => late.promise);
  limitSheet(tree).props.onChanged(); tree = await settle();
  beginAccountOwnerTransition("owner-b"); // no render between the hold and the late reply
  late.resolve(counterRow("owner-a", 0));
  for (let i = 0; i < 100; i++) await Promise.resolve();
  expect(mockCounter).toHaveBeenCalledTimes(2); expect(mockHarness.dirty).toBe(false);
  beginAccountOwnerTransition("owner-a");
});

test("a ready run press captured before a refresh, a blur or an account change starts nothing", async () => {
  const startTask = jest.requireMock("@/lib/tasks/store").startTask as jest.Mock;
  let tree = await settle(); selectFirst(tree); tree = await settle();
  const beforeRefresh = runButtonOf(tree)!; expect(beforeRefresh.props.disabled).toBe(false);
  const late = deferred<unknown>(); mockCounter.mockImplementationOnce(() => late.promise);
  limitSheet(tree).props.onChanged(); beforeRefresh.props.onPress!(); // no render in between
  expect(startTask).not.toHaveBeenCalled();
  late.resolve(counterRow("owner-a", 1)); tree = await settle();
  const beforeBlur = runButtonOf(tree)!; expect(beforeBlur.props.disabled).toBe(false);
  mockFocused = false; await settle(); beforeBlur.props.onPress!();
  expect(startTask).not.toHaveBeenCalled();
  mockFocused = true; tree = await settle();
  const beforeSwitch = runButtonOf(tree)!; expect(beforeSwitch.props.disabled).toBe(false);
  beginAccountOwnerTransition("owner-b"); beforeSwitch.props.onPress!(); // no render in between
  expect(startTask).not.toHaveBeenCalled();
  beginAccountOwnerTransition("owner-a"); await settle();
});

test("A -> B -> A with no render in between refuses the old generation's refresh", async () => {
  let tree = await settle(); expect(drawn(tree)).toContain(quota(tree, 1));
  const oldRefresh = limitSheet(tree).props.onChanged; const dispatches = mockDispatches.length;
  beginAccountOwnerTransition("owner-b"); beginAccountOwnerTransition("owner-a"); // hold, then same-owner return
  oldRefresh(); // must not count as a request in the new generation
  tree = await settle();
  // The new confirmed generation reads once on its own (two dispatches); an accepted old
  // refresh would have added a second read.
  expect(mockDispatches.length).toBe(dispatches + 2);
  expect(limitSheet(tree).props.onChanged).not.toBe(oldRefresh);
  expect(drawn(tree)).toContain(quota(tree, 1));
  // Called again once the new generation has settled, the old callback changes nothing:
  // no read, and the confirmed number stays (it must not leave the screen stuck on "...").
  const settled = mockDispatches.length; oldRefresh(); tree = await settle();
  expect(mockDispatches.length).toBe(settled); expect(drawn(tree)).toContain(quota(tree, 1));
});

test("a run press captured at 1/2 stays refused after a later ready (refresh to 2/2, refocus, A -> B -> A)", async () => {
  const startTask = jest.requireMock("@/lib/tasks/store").startTask as jest.Mock;
  let tree = await settle(); selectFirst(tree); tree = await settle();
  const atOneOfTwo = runButtonOf(tree)!; expect(atOneOfTwo.props.disabled).toBe(false);
  usedFor["owner-a"] = 2; limitSheet(tree).props.onChanged(); tree = await settle();
  expect(drawn(tree)).toContain("ds.reasoningScreen.depletedTitle"); // the refresh confirmed 2/2
  atOneOfTwo.props.onPress!(); expect(startTask).not.toHaveBeenCalled();
  usedFor["owner-a"] = 1; limitSheet(tree).props.onChanged(); tree = await settle();
  const beforeBlur = runButtonOf(tree)!; expect(beforeBlur.props.disabled).toBe(false);
  mockFocused = false; await settle(); mockFocused = true; tree = await settle();
  expect(drawn(tree)).toContain(quota(tree, 1)); // refocus published a new ready
  beforeBlur.props.onPress!(); expect(startTask).not.toHaveBeenCalled();
  const beforeSwitch = runButtonOf(tree)!; expect(beforeSwitch.props.disabled).toBe(false);
  beginAccountOwnerTransition("owner-b"); beginAccountOwnerTransition("owner-a"); tree = await settle();
  expect(drawn(tree)).toContain(quota(tree, 1)); // the A -> B -> A return published a new ready
  beforeSwitch.props.onPress!(); expect(startTask).not.toHaveBeenCalled();
});
