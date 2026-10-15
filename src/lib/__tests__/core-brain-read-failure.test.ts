// Actual shipped screen + primary hook + evidence/snapshot/role/quota/QA-claim
// functions. Only native views, transport and explicit generation are replaced.
import type { ReactElement } from "react";
import { hookHarness } from "../nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../auth/account-epoch";
import { CORE_EVIDENCE_READ_TIMEOUT_MS } from "../persona/use-core-evidence-read";
import { CORE_ROLE_READ_TIMEOUT_MS } from "../persona/use-core-role-reads";
import { claimQaPolarisAuto, proposeRoleCards, type RoleCard } from "../persona/role-cards";
import { m3, m3BrightnessBand } from "../theme/m3";

type Reply = { data: unknown; error?: unknown };
type Query = { table: string; columns: string; owner: string | null; limit?: number; tags?: string[] };
let mockHarness: ReturnType<typeof hookHarness>;
let mockAuth = { userId: "" as string | null, loading: false, hasProfile: true as boolean | null, isMinor: false as boolean | null };
let mockFocused = true;
let mockLanguage: "ko" | "en" = "ko";
let mockEligible = false;
let mockOverride: (query: Query) => Reply | Promise<Reply> | undefined;
let mockStatus: () => Reply | Promise<Reply>;
const mockQueries: Query[] = [];
const mockPush = jest.fn();
const mockStatusCalls = jest.fn();
const mockWrites = jest.fn((..._args: unknown[]) => { throw new Error("Read attempted a server mutation"); });
const legacyLevels = { northStarBrightness: 0.6, starLevels: {
  profile: 1, infancy: 1, school: 1, twenties: 1, later: 1, work: 1, now: 1,
} };
const mockLevels = jest.fn(async (..._args: unknown[]) => legacyLevels);
const mockStorage = new Map<string, string>();
const mockStoreWrite = jest.fn((key: string, value: string) => { mockStorage.set(key, value); });
const record = (owner: string) => ({ id: `${owner}-record`, kind: "journal", topic: `${owner}-record`, created_at: "2026-10-15T00:00:00Z", tags: [] });
function defaultReply(query: Query): Reply {
  if (query.table === "users" && query.columns.includes("profile_details")) return { data: { id: query.owner, display_name: null, birth_date: null, profile_details: {} } };
  if (query.table === "users") return { data: { id: query.owner, subscription_tier: "brain", subscription_expires_at: null } };
  if (query.table === "personas") return { data: { version: 1, traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 }, patterns: {}, values: [], markdown_export: "" } };
  return { data: query.table === "records" && query.columns.includes("id, kind, topic") ? [record(query.owner!)] : [] };
}
jest.mock("../supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: mockAuth.userId, email: mockEligible ? "qa.ai.b18807@example.com" : "ordinary@example.com" } } }) },
  rpc: (name: string, ...args: unknown[]) => name === "polaris_generation_status" ? (mockStatusCalls(), Promise.resolve(mockStatus())) : mockWrites(name, ...args),
  from: (table: string) => {
    const query: Query = { table, columns: "", owner: null };
    const chain = {
      select(columns: string) { query.columns = columns; return chain; },
      eq(key: string, value: unknown) { if (key === "user_id" || key === "id") query.owner = String(value); return chain; },
      contains(key: string, value: string[]) { if (key === "tags") query.tags = value; return chain; }, order() { return chain; }, limit(count: number) { query.limit = count; return chain; }, maybeSingle() { return chain; },
      insert: mockWrites, update: mockWrites, upsert: mockWrites, delete: mockWrites,
      then(resolve: (reply: Reply) => unknown, reject: (error: unknown) => unknown) {
        mockQueries.push({ ...query }); return Promise.resolve(mockOverride(query) ?? defaultReply(query)).then(resolve, reject);
      },
    }; return chain;
  },
}) }));
jest.mock("../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live" }) }));
jest.mock("../persona/load-seven-levels", () => ({
  ...jest.requireActual("../persona/load-seven-levels"), loadSevenLevels: (owner: string) => mockLevels(owner),
}));
jest.mock("../persona/role-cards", () => {
  const actual = jest.requireActual<typeof import("../persona/role-cards")>("../persona/role-cards");
  return { ...actual, claimQaPolarisAuto: jest.fn(actual.claimQaPolarisAuto), proposeRoleCards: jest.fn(async () => []), ratifyRoleCard: (...args: unknown[]) => mockWrites(...args) };
});
jest.mock("react-native", () => ({ Platform: { OS: "web" }, StyleSheet: { create: (value: unknown) => value, absoluteFill: {} } }));
jest.mock("react-native-svg", () => ({ Svg: "Svg", Rect: "Rect" }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: mockLanguage }, t: (key: string, values?: Record<string, unknown>) => key + (values ? JSON.stringify(values) : "") }) }));
jest.mock("expo-router", () => ({ Redirect: "Redirect", useFocusEffect: (callback: () => void | (() => void)) => {
  jest.requireActual<typeof import("react")>("react").useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]);
} }));
jest.mock("@/lib/nav/phone-embed", () => ({ useAppRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/lib/settings/readable-font", () => ({ subscribeFontStyle: () => () => {} }));
jest.mock("@/components/phone/PhoneUIKit", () => ({ PhoneView: "View", PhoneScrollView: "ScrollView", PhonePressable: "Pressable", PhoneTouchableOpacity: "TouchableOpacity" }));
jest.mock("@/components/ui/Text", () => ({ Text: "Text" }));
jest.mock("@/components/ui/ScreenModal", () => ({ ScreenModal: "ScreenModal" }));
jest.mock("@/components/ui/Button", () => ({ Button: "Button" }));
jest.mock("@/components/premium", () => ({ PremiumLoadingState: "PremiumLoadingState" }));
jest.mock("@/components/pixel/PixelDither", () => ({ PixelScrim: "PixelScrim" }));
jest.mock("@/components/pixel/PixelStarSvg", () => ({ PixelStarSvg: "PixelStarSvg" }));
jest.mock("@/components/deep-space/PolarisCardOverlay", () => ({ PolarisCardOverlay: "PolarisCardOverlay", PolarisCardSurface: "PolarisCardSurface" }));
jest.mock("@/components/deep-space/PolarisDeck", () => ({ PolarisDeck: "PolarisDeck" }));
jest.mock("@/components/deep-space/PolarisCategorySlots", () => ({ PolarisCategorySlots: "PolarisCategorySlots" }));
jest.mock("@/components/m3", () => ({ MdButton: "MdButton", m3TextStyle: () => ({}) }));
jest.mock("@/components/art/CompanionSprite", () => ({ useCompanionMoment: () => ({ fire: jest.fn() }) }));
jest.mock("@/components/art/IslandArt", () => ({ IslandArt: "IslandArt" }));

let Screen: () => ReactElement;
let ownerNumber = 0;
const spies: jest.SpyInstance[] = [];
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const oldDev = Object.getOwnPropertyDescriptor(globalThis, "__DEV__");
beforeAll(() => {
  const React = jest.requireActual<typeof import("react")>("react");
  spies.push(jest.spyOn(React, "useState").mockImplementation(((initial: unknown) => mockHarness.hooks.useState(initial)) as typeof React.useState));
  spies.push(jest.spyOn(React, "useRef").mockImplementation(((initial: unknown) => mockHarness.hooks.useRef(initial)) as typeof React.useRef));
  spies.push(jest.spyOn(React, "useMemo").mockImplementation(((fn: () => unknown, deps: readonly unknown[]) => mockHarness.hooks.useMemo(fn, deps)) as typeof React.useMemo));
  spies.push(jest.spyOn(React, "useCallback").mockImplementation(((fn: unknown, deps: readonly unknown[]) => mockHarness.hooks.useCallback(fn, deps)) as typeof React.useCallback));
  spies.push(jest.spyOn(React, "useEffect").mockImplementation(((fn: () => void | (() => void), deps: readonly unknown[]) => mockHarness.hooks.useEffect(fn, deps)) as typeof React.useEffect));
  spies.push(jest.spyOn(React, "useSyncExternalStore").mockImplementation(((subscribe, snapshot) => mockHarness.hooks.useSyncExternalStore(subscribe, snapshot)) as typeof React.useSyncExternalStore));
  const Route = jest.requireActual<typeof import("../../app/core-brain")>("../../app/core-brain").default;
  Screen = Route().type as () => ReactElement;
  Object.defineProperty(globalThis, "__DEV__", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => mockStorage.get(key) ?? null, setItem: mockStoreWrite } } });
});
afterAll(() => {
  spies.forEach((spy) => spy.mockRestore());
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
  if (oldDev) Object.defineProperty(globalThis, "__DEV__", oldDev); else Reflect.deleteProperty(globalThis, "__DEV__");
});
beforeEach(() => {
  jest.useFakeTimers(); __resetAccountEpochForTests(); mockHarness = hookHarness();
  mockAuth = { userId: `read-owner-${++ownerNumber}`, loading: false, hasProfile: true, isMinor: false };
  noteResolvedOwner(mockAuth.userId); mockFocused = true; mockEligible = false; mockLanguage = "ko";
  mockQueries.length = 0; mockOverride = () => undefined; mockStatus = () => ({ data: { available: true, intro_remaining: 2, tier: "brain" } });
  mockLevels.mockReset().mockResolvedValue(legacyLevels); mockWrites.mockClear(); mockPush.mockClear(); mockStatusCalls.mockClear();
  mockStorage.clear(); mockStoreWrite.mockClear(); jest.mocked(claimQaPolarisAuto).mockClear(); jest.mocked(proposeRoleCards).mockReset().mockResolvedValue([]);
});
afterEach(() => { mockHarness.unmount(); jest.clearAllTimers(); jest.useRealTimers(); expect(mockWrites).not.toHaveBeenCalled(); });

type Element = ReactElement<{ children?: unknown; pages?: { key: string; body: unknown }[]; label?: string; accessibilityLabel?: string; visible?: boolean; disabled?: boolean; testID?: string; onPress?: () => void }>;
const children = (node: Element) => [node.props.children, node.props.pages?.map((page) => page.body)];
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  return [value as Element, ...children(value as Element).flatMap(nodes)];
}
function drawn(value: unknown): string {
  if (Array.isArray(value)) return value.map(drawn).join(" ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  return children(value as Element).map(drawn).join(" ");
}
const render = () => mockHarness.render(Screen);
async function settle() { let tree = render(); for (let i = 0; i < 45; i++) { await Promise.resolve(); tree = render(); } return tree; }
async function flush() { for (let i = 0; i < 45; i++) await Promise.resolve(); }
const retry = (tree: unknown) => nodes(tree).find((node) => node.props.label === "tryAgain");
const companionRetry = (tree: unknown, slot: "portrait" | "strengths") => nodes(tree).find(node => node.props.testID === `core-${slot}-retry`);
const portraitFields = (tree: unknown) => nodes(tree).filter(node => node.props.accessibilityLabel?.startsWith("portrait.label."));
const isRecords = (query: Query) => query.table === "records" && query.columns.includes("id, kind, topic");
const isSnapshot = (query: Query) => query.table === "personas" && query.columns.includes("version, traits");
function failed(tree: unknown) { expect(drawn(tree)).toContain("loadError"); expect(retry(tree)).toBeDefined(); expect(drawn(tree)).not.toContain("sevenStars"); }
function pending(tree: unknown) { expect(nodes(tree).some((node) => node.type === "PremiumLoadingState")).toBe(true); expect(retry(tree)).toBeUndefined(); }
function deferred() { let resolve!: (reply: Reply) => void; let reject!: (reason: unknown) => void; const promise = new Promise<Reply>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function owner(next: string | null) { noteResolvedOwner(next); clearAccountTransition(currentAccountEpoch()); mockAuth.userId = next; }
const noAuto = () => { expect(claimQaPolarisAuto).not.toHaveBeenCalled(); expect(mockStoreWrite).not.toHaveBeenCalled(); expect(proposeRoleCards).not.toHaveBeenCalled(); };

const brightnessQuery = (q: Query): string | null => q.table === "interview_coverage" ? "coverage"
  : q.table === "users" && q.columns === "id, display_name, birth_date, profile_details" ? "profile"
  : q.table === "records" && q.columns === "id" ? "goals"
  : q.table === "peer_invitations" ? "peers" : q.table === "star_tier_history" ? "ratified" : null;
const brightnessRetry = (tree: unknown) => nodes(tree).find(n => n.props.testID === "core-brightness-retry");
const brightnessGraphic = (tree: unknown) => nodes(tree).find(n => n.props.testID === "polaris-synthesis-graphic");
const emptyStars = (tree: unknown) => nodes(tree).find(n => n.props.testID === "core-empty-stars");
const starProps = (tree: unknown) => nodes(tree).filter(n => n.type === "PixelStarSvg")
  .map(n => n.props as unknown as { cx: number; cy: number; r: number; fill: string });

describe("actual strict brightness as an independent owned slot", () => {
  it.each(["coverage", "profile", "goals", "peers", "ratified"])("%s returned error/rejection/malformed rows never produce a measured picture", async input => {
    for (const mode of ["error", "reject", "malformed"] as const) {
      mockOverride = q => brightnessQuery(q) === input
        ? mode === "error" ? { data: null, error: new Error("offline") }
          : mode === "reject" ? Promise.reject(new Error("offline")) : { data: null }
        : undefined;
      // Retry the failed slot between variants; initial setup remains the real screen.
      const old = render(); brightnessRetry(old)?.props.onPress!();
      const tree = await settle();
      expect(brightnessRetry(tree)).toBeDefined(); expect(brightnessGraphic(tree)).toBeUndefined();
      expect(starProps(tree)).toEqual([]); expect(drawn(tree)).not.toContain("currentBrightness");
      expect(drawn(tree)).toContain(`${mockAuth.userId}-record`); expect(drawn(tree)).toContain("savedResult.body");
      expect(mockLevels).not.toHaveBeenCalled();
    }
  });

  it("known coverage failure appears immediately while the peer input hangs", async () => {
    mockOverride = q => brightnessQuery(q) === "coverage" ? { data: null, error: new Error("coverage offline") }
      : brightnessQuery(q) === "peers" ? new Promise(() => {}) : undefined;
    const tree = await settle(); expect(brightnessRetry(tree)).toBeDefined(); expect(brightnessGraphic(tree)).toBeUndefined();
    expect(drawn(tree)).toContain(`${mockAuth.userId}-record`); expect(drawn(tree)).toContain("roleEmpty");
  });

  it.each([false, true])("unconfirmed brightness stays unknown at 9999ms and times out at 10000ms; empty=%p", async empty => {
    mockOverride = q => brightnessQuery(q) === "peers" ? new Promise(() => {})
      : empty && (isRecords(q) || q.table === "sources") ? { data: [] } : undefined;
    let tree = await settle(); expect(brightnessGraphic(tree)).toBeUndefined(); expect(emptyStars(tree)).toBeUndefined();
    expect(brightnessRetry(tree)).toBeUndefined();
    expect(drawn(tree)).toContain(empty ? "sevenStars" : `${mockAuth.userId}-record`);
    await jest.advanceTimersByTimeAsync(CORE_ROLE_READ_TIMEOUT_MS - 1); tree = await settle();
    expect(brightnessRetry(tree)).toBeUndefined(); expect(starProps(tree)).toEqual([]);
    await jest.advanceTimersByTimeAsync(1); tree = await settle();
    expect(brightnessRetry(tree)).toBeDefined(); expect(brightnessGraphic(tree)).toBeUndefined(); expect(emptyStars(tree)).toBeUndefined();
    mockOverride = q => empty && (isRecords(q) || q.table === "sources") ? { data: [] } : undefined;
    brightnessRetry(tree)!.props.onPress!(); tree = await settle();
    expect(brightnessRetry(tree)).toBeUndefined();
    expect(Boolean(emptyStars(tree))).toBe(empty); expect(Boolean(brightnessGraphic(tree))).toBe(!empty);
  });

  it("confirmed empty inputs use the unchanged seven points and real L1/0.2 calculation", async () => {
    const tree = await settle(); expect(brightnessGraphic(tree)).toBeDefined();
    const stars = starProps(tree); expect(stars).toHaveLength(10);
    expect(stars.slice(0, 7).map(s => [s.cx, s.cy]).sort((a, b) => a[0] - b[0] || a[1] - b[1]))
      .toEqual([[38, 120], [56, 92], [78, 86], [106, 80], [120, 96], [154, 56], [154, 82]]);
    expect(stars.slice(0, 7).every(s => s.r === 3 && s.fill === m3.starLadder.rest[0])).toBe(true);
    expect(stars.slice(7).map(s => [s.cx, s.cy, s.r])).toEqual([[100, 24, 22], [100, 24, 14], [100, 24, 6]]);
    expect(stars[8].fill).toBe(m3.starLadder.polarisMid[m3BrightnessBand(0.2) - 1]);
    expect(mockQueries.filter(q => brightnessQuery(q))).toHaveLength(5); expect(mockLevels).not.toHaveBeenCalled();
  });

  it("actual latest ratification lifts the existing geometry and six-star formula without snapshot relabeling", async () => {
    mockOverride = q => brightnessQuery(q) === "ratified" ? { data: [
      { star_id: "seven:now", level: 5 }, { star_id: "seven:now", level: 2 },
    ] } : undefined;
    const tree = await settle(), stars = starProps(tree);
    expect(stars.find(s => s.cx === 154 && s.cy === 56)).toMatchObject({ r: 7, fill: m3.starLadder.rest[4] });
    expect(stars[8].fill).toBe(m3.starLadder.polarisMid[m3BrightnessBand((5 + 5) / 30) - 1]);
    expect(drawn(tree)).toContain("savedResult.body"); expect(drawn(tree)).not.toContain("portraitSourceValidated");
  });

  it("retry reads exactly five brightness inputs and synchronously invalidates a pending actual QA claim", async () => {
    mockEligible = true; const quota = deferred(); mockStatus = () => quota.promise;
    mockOverride = q => brightnessQuery(q) === "peers" ? { data: null, error: new Error("offline") } : undefined;
    const tree = await settle(); expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1); expect(brightnessRetry(tree)).toBeDefined();
    const count = mockQueries.length, statuses = mockStatusCalls.mock.calls.length;
    mockOverride = () => undefined; const held = brightnessRetry(tree)!.props.onPress!; held();
    // Resolve before any React render. The slot's retry must already revoke QA.
    quota.resolve({ data: { available: true, intro_remaining: 2, tier: "brain" } });
    await flush(); const next = await settle(); expect(brightnessGraphic(next)).toBeDefined(); noProposal();
    expect(mockQueries.slice(count).map(brightnessQuery).sort()).toEqual(["coverage", "goals", "peers", "profile", "ratified"]);
    expect(mockStatusCalls).toHaveBeenCalledTimes(statuses); expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1);
    const after = mockQueries.length; held(); await settle(); expect(mockQueries).toHaveLength(after);
  });

  it("optional brightness failure preserves the explicitly authorized initial QA proposal", async () => {
    mockEligible = true; mockOverride = q => brightnessQuery(q) === "profile" ? { data: null } : undefined;
    const tree = await settle(); expect(brightnessRetry(tree)).toBeDefined();
    expect(mockStoreWrite).toHaveBeenCalledTimes(1); expect(proposeRoleCards).toHaveBeenCalledTimes(1);
  });

  it.each(["resolve", "reject"])("late %s after timeout cannot replace the successful brightness retry", async completion => {
    const old = deferred(); mockOverride = q => brightnessQuery(q) === "ratified" ? old.promise : undefined;
    await settle(); await jest.advanceTimersByTimeAsync(CORE_ROLE_READ_TIMEOUT_MS);
    const error = await settle(); mockOverride = () => undefined; brightnessRetry(error)!.props.onPress!();
    const ready = starProps(await settle()); expect(ready).toHaveLength(10);
    if (completion === "resolve") old.resolve({ data: [{ star_id: "seven:now", level: 5 }] }); else old.reject(new Error("late"));
    expect(starProps(await settle())).toEqual(ready); expect(brightnessRetry(await settle())).toBeUndefined();
  });

  it.each(["owner", "ABA", "hold", "blur", "unmount", "locale"])("late brightness cannot publish after %s changes its original scope", async change => {
    const old = deferred(); mockOverride = q => brightnessQuery(q) === "ratified" ? old.promise : undefined;
    await settle(); const originalOwner = mockAuth.userId;
    mockOverride = q => brightnessQuery(q) === "ratified" ? new Promise(() => {}) : undefined;
    if (change === "owner") owner("next-owner");
    if (change === "ABA") { owner(null); owner(originalOwner); }
    if (change === "hold") beginAccountOwnerTransition("other");
    if (change === "blur") mockFocused = false;
    if (change === "locale") mockLanguage = "en";
    if (change === "unmount") mockHarness.unmount(); else render();
    const calls = mockQueries.length; old.resolve({ data: [{ star_id: "seven:now", level: 5 }] }); await flush();
    if (change === "hold" || change === "blur" || change === "unmount") {
      expect(mockQueries).toHaveLength(calls); if (change !== "unmount") expect(brightnessGraphic(render())).toBeUndefined();
    } else {
      // The mounted screen's fresh scope has its own still-pending SELECT.
      const tree = await settle(); expect(brightnessGraphic(tree)).toBeUndefined(); expect(starProps(tree)).toEqual([]);
      expect(mockQueries.filter(q => brightnessQuery(q) === "ratified")).toHaveLength(2);
    }
  });

  it("a held retry and a queued strict dispatch after owner hold issue no brightness SELECT", async () => {
    mockOverride = q => brightnessQuery(q) === "profile" ? { data: null } : undefined;
    const tree = await settle(), held = brightnessRetry(tree)!.props.onPress!, count = mockQueries.length;
    beginAccountOwnerTransition("other"); held(); await flush(); expect(mockQueries).toHaveLength(count);
    owner("fresh-owner"); mockOverride = () => undefined; render(); beginAccountOwnerTransition("next"); await flush();
    expect(mockQueries).toHaveLength(count);
  });

  it("actual strict dispatch guards stop the four queued peers after the first SELECT observes owner hold", async () => {
    mockOverride = q => {
      if (brightnessQuery(q) === "coverage") { beginAccountOwnerTransition("other"); return { data: [] }; }
      return undefined;
    };
    await settle(); expect(mockQueries.filter(q => brightnessQuery(q)).map(brightnessQuery)).toEqual(["coverage"]);
    expect(brightnessGraphic(render())).toBeUndefined(); noAuto();
  });

  it("refocus gets a fresh brightness attempt and late pre-blur success cannot replace it", async () => {
    const old = deferred(); mockOverride = q => brightnessQuery(q) === "ratified" ? old.promise : undefined;
    await settle(); const snapshotCount = mockQueries.filter(isSnapshot).length;
    mockFocused = false; render(); mockOverride = () => undefined; mockFocused = true;
    const ready = starProps(await settle()); expect(ready).toHaveLength(10);
    old.resolve({ data: [{ star_id: "seven:now", level: 5 }] }); expect(starProps(await settle())).toEqual(ready);
    expect(mockQueries.filter(isSnapshot)).toHaveLength(snapshotCount);
    expect(mockQueries.filter(q => brightnessQuery(q) === "ratified")).toHaveLength(2);
  });

  it("the primary actual snapshot has no injected measured brightness or legacy loader dependency", async () => {
    const { useCoreEvidenceRead } = jest.requireActual<typeof import("../persona/use-core-evidence-read")>("../persona/use-core-evidence-read");
    let primary!: ReturnType<typeof useCoreEvidenceRead>;
    for (let i = 0; i < 45; i++) {
      primary = mockHarness.render(() => useCoreEvidenceRead(mockAuth.userId, true, "ko", 0, 0, () => {}, () => {}));
      await Promise.resolve();
    }
    expect(primary.status).toBe("ready"); expect(primary.data?.persona?.traitsSource).toBe("heuristic");
    expect(primary.data?.persona).not.toHaveProperty("soulCoreBrightness"); expect(primary.data).not.toHaveProperty("sevenLevels");
    expect(mockLevels).not.toHaveBeenCalled(); expect(mockQueries.some(q => brightnessQuery(q))).toBe(false);
  });

  it("an existing legacy profile L1 cache cannot hide strict failure or prevent fresh ratified recovery", async () => {
    const legacy = jest.requireActual<typeof import("../persona/load-profile-star")>("../persona/load-profile-star");
    expect(await legacy.loadProfileStarLevel(mockAuth.userId!)).toBe(1);
    mockOverride = q => brightnessQuery(q) === "profile" ? { data: null, error: new Error("profile offline") } : undefined;
    const error = await settle(); expect(brightnessRetry(error)).toBeDefined(); expect(brightnessGraphic(error)).toBeUndefined();
    const count = mockQueries.length;
    mockOverride = q => brightnessQuery(q) === "ratified" ? { data: [{ star_id: "seven:profile", level: 5 }] } : undefined;
    brightnessRetry(error)!.props.onPress!(); const tree = await settle();
    expect(mockQueries.slice(count).map(brightnessQuery).sort()).toEqual(["coverage", "goals", "peers", "profile", "ratified"]);
    expect(starProps(tree).find(s => s.cx === 38 && s.cy === 120)).toMatchObject({ r: 7 });
    expect(await legacy.loadProfileStarLevel(mockAuth.userId!)).toBe(1);
    legacy.invalidateProfileStarLevel(mockAuth.userId!);
  });
});

it("preserves the 24+24 read sample and source-origin detail navigation", async () => {
  mockOverride = (query) => query.table === "sources" ? { data: [{ id: "source-id", kind: "clip", title: "source title", captured_at: "2026-10-15T01:00:00Z", tags: [] }] } : undefined;
  const ready = await settle();
  expect(mockQueries.filter((q) => isRecords(q) || q.table === "sources").map((q) => [q.table, q.owner, q.limit])).toEqual([["records", mockAuth.userId, 24], ["sources", mockAuth.userId, 24]]);
  const link = nodes(ready).find((node) => node.props.accessibilityLabel?.includes('"title":"source title"'))!;
  link.props.onPress!(); expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[id]", params: { id: "source-id", origin: "source" } });
});

it.each(["records", "sources"])("%s failure is not an empty center, even while the other read hangs", async (stage) => {
  mockOverride = (q) => (stage === "records" ? isRecords(q) : q.table === "sources") ? { data: null, error: { message: "offline" } }
    : (stage === "records" ? q.table === "sources" : isRecords(q)) ? new Promise(() => {}) : undefined;
  failed(await settle()); expect(mockQueries.filter(isSnapshot)).toHaveLength(0);
});

it("successful empty sources and records keep the existing empty center without snapshot I/O", async () => {
  mockOverride = (q) => isRecords(q) || q.table === "sources" ? { data: [] } : undefined;
  const empty = await settle(); expect(drawn(empty)).toContain("sevenStars"); expect(retry(empty)).toBeUndefined(); expect(mockQueries.filter(isSnapshot)).toHaveLength(0);
});

it.each(["sources", "snapshot"])("a hanging %s stage ends after the one total ten-second deadline", async (stage) => {
  mockOverride = (q) => stage === "sources" && q.table === "sources" || stage === "snapshot" && isSnapshot(q) ? new Promise(() => {}) : undefined;
  pending(await settle()); await jest.advanceTimersByTimeAsync(CORE_EVIDENCE_READ_TIMEOUT_MS - 1); pending(await settle());
  await jest.advanceTimersByTimeAsync(1); failed(await settle());
});

it("snapshot shares the evidence deadline and a late first stage cannot start it", async () => {
  const evidence = deferred(); mockOverride = (q) => q.table === "sources" ? evidence.promise : undefined;
  await settle(); await jest.advanceTimersByTimeAsync(CORE_EVIDENCE_READ_TIMEOUT_MS); failed(await settle());
  evidence.resolve({ data: [] }); await settle(); expect(mockQueries.filter(isSnapshot)).toHaveLength(0);
});

it("starting snapshot at nine seconds does not give it a new ten seconds", async () => {
  const evidence = deferred(); mockOverride = (q) => q.table === "sources" ? evidence.promise : isSnapshot(q) ? new Promise(() => {}) : undefined;
  await settle(); await jest.advanceTimersByTimeAsync(9000); evidence.resolve({ data: [] }); pending(await settle()); expect(mockQueries.filter(isSnapshot)).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(1000); failed(await settle());
});

it.each(["timeout", "hold", "blur", "unmount"])("a delayed real personas row starts no dependent SELECT after %s", async (change) => {
  const old = deferred(); mockOverride = (q) => isSnapshot(q) ? old.promise : undefined;
  await settle(); expect(mockQueries.filter(isSnapshot)).toHaveLength(1);
  const reads = mockQueries.length;
  if (change === "timeout") await jest.advanceTimersByTimeAsync(CORE_EVIDENCE_READ_TIMEOUT_MS);
  else if (change === "hold") beginAccountOwnerTransition("other");
  else if (change === "blur") { mockFocused = false; render(); }
  else mockHarness.unmount();
  old.resolve(defaultReply({ table: "personas", columns: "version, traits", owner: mockAuth.userId }));
  await flush(); expect(mockQueries).toHaveLength(reads); noAuto();
});

it.each(["resolve", "reject"])("a late snapshot %s cannot replace a successful retry", async (completion) => {
  const old = deferred(); mockOverride = (q) => isSnapshot(q) ? old.promise : undefined;
  await settle(); await jest.advanceTimersByTimeAsync(CORE_EVIDENCE_READ_TIMEOUT_MS); const error = await settle();
  mockOverride = () => undefined; retry(error)!.props.onPress!(); expect(drawn(await settle())).toContain(`${mockAuth.userId}-record`);
  if (completion === "resolve") old.resolve(defaultReply({ table: "personas", columns: "version, traits", owner: mockAuth.userId })); else old.reject(new Error("late"));
  expect(drawn(await settle())).toContain(`${mockAuth.userId}-record`); expect(retry(await settle())).toBeUndefined();
});

it.each(["failure", "timeout"])("real eligible QA retry after %s performs zero claim, attempt-storage or proposal calls", async (mode) => {
  mockEligible = true; mockOverride = (q) => q.table === "sources" ? mode === "timeout" ? new Promise(() => {}) : { data: null, error: { message: "offline" } } : undefined;
  await settle(); if (mode === "timeout") await jest.advanceTimersByTimeAsync(CORE_EVIDENCE_READ_TIMEOUT_MS);
  const error = await settle(); failed(error); noAuto();
  mockOverride = () => undefined; const held = retry(error)!.props.onPress!; held(); await settle(); noAuto();
  const count = mockQueries.length; held(); await settle(); expect(mockQueries).toHaveLength(count); noAuto();
});

it("an explicit proposal remains available after a read-only retry", async () => {
  mockEligible = true; mockOverride = (q) => q.table === "sources" ? { data: null, error: { message: "offline" } } : undefined;
  const error = await settle(); mockOverride = () => undefined; retry(error)!.props.onPress!(); const ready = await settle(); noAuto();
  const suggest = nodes(ready).find((node) => node.props.label === "roleSuggest")!;
  expect(suggest.props.disabled).toBe(false); suggest.props.onPress!(); await settle();
  expect(proposeRoleCards).toHaveBeenCalledTimes(1); expect(proposeRoleCards).toHaveBeenCalledWith(mockAuth.userId, "ko", false);
  expect(claimQaPolarisAuto).not.toHaveBeenCalled(); expect(mockStoreWrite).not.toHaveBeenCalled();
});

it("an eligible initial mount still claims once and dispatches the authorized proposal", async () => {
  mockEligible = true; await settle();
  expect(mockStoreWrite).toHaveBeenCalledTimes(1); expect(proposeRoleCards).toHaveBeenCalledTimes(1);
  expect(mockStoreWrite).toHaveBeenCalledWith(`polaris.qa-auto.v2:${mockAuth.userId}`, "attempted");
});

it("ordinary users never dispatch a proposal on mount or refocus", async () => {
  await settle(); expect(proposeRoleCards).not.toHaveBeenCalled(); const claimCount = jest.mocked(claimQaPolarisAuto).mock.calls.length;
  mockFocused = false; render(); mockFocused = true; await settle();
  expect(claimQaPolarisAuto).toHaveBeenCalledTimes(claimCount); expect(mockStoreWrite).not.toHaveBeenCalled(); expect(proposeRoleCards).not.toHaveBeenCalled();
});

it("refocus while an initial snapshot is pending can recover reads without activating QA auto", async () => {
  mockEligible = true; const old = deferred(); mockOverride = (q) => isSnapshot(q) ? old.promise : undefined;
  await settle(); mockFocused = false; render(); mockOverride = () => undefined; mockFocused = true; await settle(); noAuto();
  old.resolve({ data: null }); await settle(); noAuto();
});

it.each(["blur", "owner", "epoch ABA", "unmount"])("an in-flight real QA quota claim cannot stamp storage after %s", async (change) => {
  mockEligible = true; const quota = deferred(); mockStatus = () => quota.promise;
  await settle(); expect(claimQaPolarisAuto).toHaveBeenCalled();
  if (change === "blur") { mockFocused = false; render(); }
  else if (change === "owner") owner("another-owner");
  else if (change === "epoch ABA") { const first = mockAuth.userId!; beginAccountOwnerTransition("other"); noteResolvedOwner("other"); beginAccountOwnerTransition(first); noteResolvedOwner(first); clearAccountTransition(currentAccountEpoch()); }
  else mockHarness.unmount();
  quota.resolve({ data: { available: true, intro_remaining: 2, tier: "brain" } }); await flush();
  expect(mockStoreWrite).not.toHaveBeenCalled(); expect(proposeRoleCards).not.toHaveBeenCalled();
});

it("a publication hold before queued primary work blocks the query", async () => {
  render(); beginAccountOwnerTransition("other"); await flush(); expect(mockQueries.filter((q) => isRecords(q) || q.table === "sources" || isSnapshot(q))).toHaveLength(0);
});

it("a hold between evidence and snapshot prevents the dependent read without rerender", async () => {
  const evidence = deferred(); mockOverride = (q) => q.table === "sources" ? evidence.promise : undefined;
  await settle(); beginAccountOwnerTransition("other"); evidence.resolve({ data: [] }); await flush(); expect(mockQueries.filter(isSnapshot)).toHaveLength(0);
});

it("owner changes and same-owner epoch ABA do not expose prior primary rows", async () => {
  const first = mockAuth.userId!; expect(drawn(await settle())).toContain(first + "-record");
  owner("owner-other"); mockOverride = (q) => q.table === "sources" ? new Promise(() => {}) : undefined;
  expect(drawn(render())).not.toContain(first + "-record"); pending(await settle());
  owner(first); mockOverride = () => undefined; expect(drawn(render())).not.toContain(first + "-record"); await settle();
  beginAccountOwnerTransition("next"); beginAccountOwnerTransition(first); pending(render());
});

it("a held retry cannot survive owner, focus or attempt replacement", async () => {
  mockOverride = (q) => q.table === "sources" ? { data: null, error: { message: "offline" } } : undefined;
  const held = retry(await settle())!.props.onPress!;
  mockFocused = false; render(); const count = mockQueries.length; held(); await flush(); expect(mockQueries).toHaveLength(count);
  mockFocused = true; owner("different-owner"); mockOverride = () => undefined; await settle(); const after = mockQueries.length;
  held(); await settle(); expect(mockQueries).toHaveLength(after);
});

it("refocus preserves the saved snapshot and refreshes the evidence sample once", async () => {
  await settle(); const snapshots = mockQueries.filter(isSnapshot).length; const sources = mockQueries.filter((q) => q.table === "sources").length;
  mockFocused = false; render(); mockFocused = true; await settle();
  expect(mockQueries.filter(isSnapshot)).toHaveLength(snapshots); expect(mockQueries.filter((q) => q.table === "sources")).toHaveLength(sources + 1);
});

it("a failed cheap refresh can recover on the next focus without rereading the saved snapshot", async () => {
  await settle(); const snapshots = mockQueries.filter(isSnapshot).length;
  mockFocused = false; render(); mockOverride = (q) => q.table === "sources" ? { data: null, error: { message: "offline" } } : undefined;
  mockFocused = true; failed(await settle());
  mockFocused = false; render(); mockOverride = () => undefined; mockFocused = true;
  const recovered = await settle(); expect(retry(recovered)).toBeUndefined(); expect(drawn(recovered)).toContain(`${mockAuth.userId}-record`);
  expect(mockQueries.filter(isSnapshot)).toHaveLength(snapshots); expect(proposeRoleCards).not.toHaveBeenCalled();
});

it("a role read from a replaced initial attempt cannot activate the eligible QA claim", async () => {
  mockEligible = true; const roles = deferred();
  mockOverride = (q) => q.table === "personas" && q.columns === "patterns" ? roles.promise : undefined;
  await settle(); noAuto(); mockFocused = false; render(); mockFocused = true; await settle();
  roles.resolve({ data: [] }); await settle(); noAuto();
});

it("strengths and strict brightness failures stay separate from the saved primary result", async () => {
  mockOverride = (q) => q.table === "records" && q.tags?.includes("strengths") || q.table === "peer_invitations"
    ? { data: null, error: { message: "offline" } } : undefined;
  mockLevels.mockRejectedValue(new Error("levels failed"));
  const ready = await settle(); expect(companionRetry(ready, "strengths")).toBeDefined(); expect(drawn(ready)).toContain(`${mockAuth.userId}-record`);
  expect(nodes(ready).some(node => node.props.testID === "core-brightness-retry")).toBe(true);
  expect(nodes(ready).some(node => node.props.testID === "polaris-synthesis-graphic")).toBe(false);
  expect(mockLevels).not.toHaveBeenCalled();
});

it("a failed initial snapshot stays failed on refocus until explicit full retry", async () => {
  mockOverride = (q) => isSnapshot(q) ? { data: null, error: { message: "snapshot failed" } } : undefined;
  failed(await settle()); const count = mockQueries.filter(isSnapshot).length;
  mockOverride = () => undefined; mockFocused = false; render(); mockFocused = true; failed(await settle()); expect(mockQueries.filter(isSnapshot)).toHaveLength(count);
  retry(await settle())!.props.onPress!(); expect(retry(await settle())).toBeUndefined();
});

it("primary scope replacement closes the evidence drawer", async () => {
  const ready = await settle(); nodes(ready).find((node) => node.props.label?.startsWith("seePieces"))!.props.onPress!();
  expect(nodes(await settle()).find((node) => node.type === "ScreenModal")?.props.visible).toBe(true);
  mockFocused = false; render(); mockFocused = true; await settle();
  expect(nodes(await settle()).find((node) => node.type === "ScreenModal")?.props.visible).toBe(false);
});

it("auth/profile/minor gates block primary and auto reads until resolved", async () => {
  mockAuth.hasProfile = null; await settle(); expect(mockQueries).toHaveLength(0); noAuto();
  mockAuth.hasProfile = true; mockAuth.isMinor = null; await settle(); expect(mockQueries).toHaveLength(0); noAuto();
  mockAuth.isMinor = true; await settle(); expect(mockQueries.filter(isRecords)).toHaveLength(1); expect(proposeRoleCards).not.toHaveBeenCalled();
});

it("unmount cancels waiting and ignores a late first-stage result", async () => {
  const old = deferred(); mockOverride = (q) => q.table === "sources" ? old.promise : undefined;
  await settle(); mockHarness.unmount(); await flush(); expect(jest.getTimerCount()).toBe(0);
  old.resolve({ data: [] }); await flush(); expect(mockQueries.filter(isSnapshot)).toHaveLength(0);
});

// R1 found that the shared compatibility helper has its own awaited continuation.
it.each(["timeout", "hold", "blur", "unmount", "peer failure", "epoch ABA"])("a missing-column continuation starts no query after %s", async (change) => {
  const first = deferred();
  mockOverride = (q) => isRecords(q) && q.columns.includes("system_tags") ? first.promise
    : change === "peer failure" && q.table === "sources" ? { data: null, error: { message: "sources unavailable" } } : undefined;
  await settle(); expect(mockQueries.filter(isRecords)).toHaveLength(1);
  if (change === "timeout") await jest.advanceTimersByTimeAsync(CORE_EVIDENCE_READ_TIMEOUT_MS);
  else if (change === "hold") beginAccountOwnerTransition("other");
  else if (change === "blur") { mockFocused = false; render(); }
  else if (change === "unmount") mockHarness.unmount();
  else if (change === "epoch ABA") { const firstOwner = mockAuth.userId!; beginAccountOwnerTransition("other"); beginAccountOwnerTransition(firstOwner); }
  first.resolve({ data: null, error: { code: "42703", message: "column records.system_tags does not exist" } });
  await flush(); expect(mockQueries.filter(isRecords)).toHaveLength(1); noAuto();
});

it("a late missing-column response cannot append a query to a successful retry", async () => {
  const first = deferred();
  mockOverride = (q) => isRecords(q) && q.columns.includes("system_tags") ? first.promise : undefined;
  await settle(); await jest.advanceTimersByTimeAsync(CORE_EVIDENCE_READ_TIMEOUT_MS); const error = await settle();
  mockOverride = () => undefined; retry(error)!.props.onPress!(); expect(retry(await settle())).toBeUndefined();
  const reads = mockQueries.filter(isRecords).length;
  first.resolve({ data: null, error: { code: "42703", message: "column records.system_tags does not exist" } });
  await settle(); expect(mockQueries.filter(isRecords)).toHaveLength(reads); noAuto();
});

it("a current missing-column response still performs the approved legacy SELECT", async () => {
  mockOverride = (q) => isRecords(q) && q.columns.includes("system_tags")
    ? { data: null, error: { code: "42703", message: "column records.system_tags does not exist" } } : undefined;
  expect(drawn(await settle())).toContain(mockAuth.userId + "-record");
  expect(mockQueries.filter(isRecords).map((q) => [q.columns.includes("system_tags"), q.owner, q.limit]))
    .toEqual([[true, mockAuth.userId, 24], [false, mockAuth.userId, 24]]);
});

const companionQuery = (query: Query): "portrait" | "strengths" | null => query.table !== "records" ? null
  : query.tags?.includes("strengths") ? "strengths"
  : query.columns === "prompt" || query.tags?.some(tag => tag === "mbti" || tag === "attachment") ? "portrait" : null;
const mbtiReply = (type = "INTJ"): Reply => ({ data: [{ body: JSON.stringify({ type, scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 } }) }] });
const strengthsReply = (strength = "curiosity"): Reply => ({ data: [{ body: JSON.stringify({ scores: [{ strength, score: 90 }], confidence: 0.8 }) }] });
const noProposal = () => { expect(mockStoreWrite).not.toHaveBeenCalled(); expect(proposeRoleCards).not.toHaveBeenCalled(); };
const measured = (query: Query) => query.tags?.includes("mbti") ? mbtiReply() : companionQuery(query) === "strengths" ? strengthsReply() : undefined;

describe("independent portrait and strengths reads", () => {
  it.each(["prompt", "mbti", "attachment"])("a known %s failure is shown while a portrait peer hangs and primary/strengths succeed", async source => {
    mockOverride = query => {
      if (companionQuery(query) === "strengths") return strengthsReply();
      if (companionQuery(query) !== "portrait") return undefined;
      const key = query.columns === "prompt" ? "prompt" : query.tags?.[0];
      return key === source ? { data: null, error: new Error("portrait offline") } : new Promise(() => {});
    };
    const tree = await settle();
    expect(drawn(tree)).toContain(`${mockAuth.userId}-record`); expect(drawn(tree)).toContain("savedResult.body");
    expect(companionRetry(tree, "portrait")).toBeDefined(); expect(portraitFields(tree)).toHaveLength(0);
    expect(drawn(tree)).not.toContain("portrait.hint."); expect(drawn(tree)).toContain("strengthsCheck: 호기심");
    expect(companionRetry(tree, "strengths")).toBeUndefined(); expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1); noProposal();
  });

  it.each(["portrait", "strengths"] as const)("a rejected %s transport is isolated from the successful peer", async slot => {
    mockOverride = query => companionQuery(query) === slot ? Promise.reject(new Error("offline")) : measured(query);
    const tree = await settle(); expect(drawn(tree)).toContain(`${mockAuth.userId}-record`);
    expect(companionRetry(tree, slot)).toBeDefined();
    expect(drawn(tree)).toContain(slot === "portrait" ? "strengthsCheck: 호기심" : "INTJ");
    if (slot === "portrait") expect(portraitFields(tree)).toHaveLength(0);
  });

  it.each(["portrait", "strengths"] as const)("a hanging %s gets its own exact ten-second timeout without hiding primary or the peer", async slot => {
    expect(CORE_ROLE_READ_TIMEOUT_MS).toBe(10_000);
    mockOverride = query => companionQuery(query) === slot ? new Promise(() => {}) : measured(query);
    let tree = await settle(); expect(drawn(tree)).toContain(`${mockAuth.userId}-record`);
    expect(companionRetry(tree, slot)).toBeUndefined();
    await jest.advanceTimersByTimeAsync(CORE_ROLE_READ_TIMEOUT_MS - 1); tree = await settle();
    expect(companionRetry(tree, slot)).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1); tree = await settle(); expect(companionRetry(tree, slot)).toBeDefined();
    expect(drawn(tree)).toContain(`${mockAuth.userId}-record`);
    expect(drawn(tree)).toContain(slot === "portrait" ? "strengthsCheck: 호기심" : "INTJ");
    if (slot === "portrait") expect(portraitFields(tree)).toHaveLength(0);
  });

  it("normal empty measurements preserve collecting routes and omit only the strengths summary", async () => {
    const tree = await settle(); expect(portraitFields(tree)).toHaveLength(5);
    const who = portraitFields(tree).find(node => node.props.accessibilityLabel === "portrait.label.who")!;
    who.props.onPress!(); expect(mockPush).toHaveBeenCalledWith("/attachment");
    expect(drawn(tree)).toContain("portrait.hint.forWhom"); expect(drawn(tree)).toContain("portrait.hint.goal"); expect(drawn(tree)).toContain("portrait.hint.do");
    expect(drawn(tree)).not.toContain("strengthsCheck:"); expect(companionRetry(tree, "portrait")).toBeUndefined(); expect(companionRetry(tree, "strengths")).toBeUndefined();
  });

  it("measured portrait still opens its existing backing records", async () => {
    mockOverride = measured; const tree = await settle();
    portraitFields(tree).find(node => node.props.accessibilityLabel?.includes("INTJ"))!.props.onPress!();
    expect(mockPush).toHaveBeenCalledWith("/records?tags=mbti"); expect(portraitFields(tree)).toHaveLength(5);
  });

  it("unresolved optional panels do not remove the authorized first eligible QA attempt", async () => {
    mockEligible = true; mockOverride = query => companionQuery(query) ? new Promise(() => {}) : undefined;
    const tree = await settle(); expect(drawn(tree)).toContain(`${mockAuth.userId}-record`);
    expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1); expect(mockStoreWrite).toHaveBeenCalledTimes(1);
    expect(proposeRoleCards).toHaveBeenCalledTimes(1);
  });

  it.each(["portrait", "strengths"] as const)("%s retry reads only its slot and cannot repeat the already authorized initial QA proposal", async slot => {
    mockEligible = true;
    mockOverride = query => companionQuery(query) === slot ? { data: null, error: new Error("offline") } : measured(query);
    const tree = await settle(); expect(proposeRoleCards).toHaveBeenCalledTimes(1); expect(mockStoreWrite).toHaveBeenCalledTimes(1);
    const calls = jest.mocked(claimQaPolarisAuto).mock.calls.length, reads = mockQueries.length, statuses = mockStatusCalls.mock.calls.length;
    mockOverride = measured; const held = companionRetry(tree, slot)!.props.onPress!; held(); const ready = await settle();
    expect(companionRetry(ready, slot)).toBeUndefined();
    expect(mockQueries.slice(reads)).toHaveLength(slot === "portrait" ? 3 : 1);
    expect(mockQueries.slice(reads).every(query => companionQuery(query) === slot)).toBe(true);
    expect(mockStatusCalls).toHaveBeenCalledTimes(statuses); expect(claimQaPolarisAuto).toHaveBeenCalledTimes(calls);
    expect(proposeRoleCards).toHaveBeenCalledTimes(1); expect(mockStoreWrite).toHaveBeenCalledTimes(1);
    const after = mockQueries.length; held(); await settle(); expect(mockQueries).toHaveLength(after);
  });

  it.each(["portrait", "strengths"] as const)("%s retry fences a real pending eligible QA claim before storage or proposal", async slot => {
    mockEligible = true; const quota = deferred(); mockStatus = () => quota.promise;
    mockOverride = query => companionQuery(query) === slot ? { data: null, error: new Error("offline") } : measured(query);
    const tree = await settle(); expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1);
    const queries = mockQueries.length, statuses = mockStatusCalls.mock.calls.length;
    mockOverride = measured; companionRetry(tree, slot)!.props.onPress!();
    quota.resolve({ data: { available: true, intro_remaining: 2, tier: "brain" } }); await settle();
    expect(mockStoreWrite).not.toHaveBeenCalled(); expect(proposeRoleCards).not.toHaveBeenCalled();
    expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1); expect(mockStatusCalls).toHaveBeenCalledTimes(statuses);
    expect(mockQueries.slice(queries).every(query => companionQuery(query) === slot)).toBe(true);
  });

  it.each(["portrait", "strengths"] as const)("%s retry preserves an explicit generation result beyond read deadlines", async slot => {
    mockOverride = query => companionQuery(query) === slot ? { data: null, error: new Error("offline") } : measured(query);
    const tree = await settle();
    let finish!: (cards: RoleCard[]) => void;
    jest.mocked(proposeRoleCards).mockReturnValueOnce(new Promise(done => { finish = done; }));
    nodes(tree).find(node => node.props.label === "roleSuggest")!.props.onPress!(); await settle();
    mockOverride = measured; companionRetry(tree, slot)!.props.onPress!(); await settle();
    await jest.advanceTimersByTimeAsync(CORE_ROLE_READ_TIMEOUT_MS + 1);
    finish([{ id: "generated", label: "Generated after retry", summary: "Kept explicit result", status: "proposed", strengths: [], advice: "", claimStrength: 2,
      evidence: { domains: ["now"], constructs: [] }, evidenceRefs: ["record:00000000-0000-4000-8000-000000000001"] }]);
    expect(drawn(await settle())).toContain("Generated after retry");
    expect(proposeRoleCards).toHaveBeenCalledTimes(1); expect(mockStoreWrite).not.toHaveBeenCalled();
  });

  it.each(["portrait", "strengths"] as const)("successful %s retry leaves an actionable consent error intact", async slot => {
    mockOverride = query => companionQuery(query) === slot ? { data: null, error: new Error("offline") } : measured(query);
    const tree = await settle(); jest.mocked(proposeRoleCards).mockRejectedValueOnce(new Error("consent_required"));
    nodes(tree).find(node => node.props.label === "roleSuggest")!.props.onPress!(); const failed = await settle();
    expect(drawn(failed)).toContain("serviceControl.consent_required");
    mockOverride = measured; companionRetry(failed, slot)!.props.onPress!(); const ready = await settle();
    expect(companionRetry(ready, slot)).toBeUndefined(); expect(drawn(ready)).toContain("serviceControl.consent_required");
    expect(proposeRoleCards).toHaveBeenCalledTimes(1); expect(mockStoreWrite).not.toHaveBeenCalled();
  });

  it.each(["portrait", "strengths"] as const)("a held %s retry cannot read after owner hold or focus replacement", async slot => {
    mockOverride = query => companionQuery(query) === slot ? { data: null, error: new Error("offline") } : undefined;
    const held = companionRetry(await settle(), slot)!.props.onPress!;
    const count = mockQueries.length; beginAccountOwnerTransition("other"); held(); await flush(); expect(mockQueries).toHaveLength(count);
    owner("new-owner"); mockOverride = measured; mockFocused = false; render(); mockFocused = true; await settle();
    const fresh = mockQueries.length; held(); await settle(); expect(mockQueries).toHaveLength(fresh); expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1); noProposal();
  });

  it.each(["portrait", "strengths"] as const)("%s retry queued before an owner hold does not issue its SELECT", async slot => {
    mockOverride = query => companionQuery(query) === slot ? { data: null, error: new Error("offline") } : undefined;
    const tree = await settle(), count = mockQueries.length;
    companionRetry(tree, slot)!.props.onPress!(); beginAccountOwnerTransition("other"); await flush();
    expect(mockQueries).toHaveLength(count); expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1); noProposal();
  });

  it.each([
    { slot: "portrait" as const, completion: "resolve" }, { slot: "portrait" as const, completion: "reject" },
    { slot: "strengths" as const, completion: "resolve" }, { slot: "strengths" as const, completion: "reject" },
  ])("late $slot $completion cannot replace the successful retry", async ({ slot, completion }) => {
    const old = deferred(); mockOverride = query => companionQuery(query) === slot ? old.promise : undefined;
    await settle(); await jest.advanceTimersByTimeAsync(CORE_ROLE_READ_TIMEOUT_MS); const timed = await settle();
    mockOverride = query => query.tags?.includes("mbti") ? mbtiReply("ENFP") : companionQuery(query) === "strengths" ? strengthsReply("grit") : undefined;
    companionRetry(timed, slot)!.props.onPress!(); await settle();
    if (completion === "resolve") old.resolve(slot === "portrait" ? mbtiReply("INTJ") : strengthsReply()); else old.reject(new Error("old offline"));
    const tree = await settle(); expect(drawn(tree)).toContain(slot === "portrait" ? "ENFP" : "끈기");
    expect(drawn(tree)).not.toContain(slot === "portrait" ? "INTJ" : "호기심");
    expect(companionRetry(tree, slot)).toBeUndefined();
  });

  it.each(["owner", "epoch ABA", "blur", "unmount"])("late companion results cannot publish or start more work after %s", async change => {
    const old = deferred(); mockOverride = query => companionQuery(query) ? old.promise : undefined;
    await settle(); const reads = mockQueries.length;
    if (change === "owner") owner("next-owner");
    else if (change === "epoch ABA") { const id = mockAuth.userId!; beginAccountOwnerTransition("other"); noteResolvedOwner("other"); beginAccountOwnerTransition(id); noteResolvedOwner(id); clearAccountTransition(currentAccountEpoch()); }
    else if (change === "blur") { mockFocused = false; render(); }
    else mockHarness.unmount();
    old.resolve(mbtiReply()); await flush(); expect(mockQueries).toHaveLength(reads);
    if (change !== "unmount") expect(drawn(render())).not.toContain("INTJ");
    expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1); noProposal();
  });

  it.each(["error", "hang"])("snapshot can finish while MBTI/attachment %s remains optional and is not read twice", async mode => {
    const snapshot = deferred();
    mockOverride = query => isSnapshot(query) ? snapshot.promise : query.tags?.some(tag => tag === "mbti" || tag === "attachment")
      ? mode === "error" ? { data: null, error: new Error("assessment offline") } : new Promise(() => {}) : undefined;
    await settle(); expect(mockQueries.filter(isSnapshot)).toHaveLength(1);
    const measurements = () => mockQueries.filter(query => query.tags?.some(tag => tag === "mbti" || tag === "attachment"));
    expect(measurements()).toHaveLength(2);
    snapshot.resolve(defaultReply({ table: "personas", columns: "version, traits", owner: mockAuth.userId }));
    const tree = await settle(); expect(drawn(tree)).toContain("savedResult.body"); expect(drawn(tree)).toContain(`${mockAuth.userId}-record`);
    expect(measurements()).toHaveLength(2); expect(portraitFields(tree)).toHaveLength(0);
  });
});
