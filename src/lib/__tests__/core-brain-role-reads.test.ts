// Actual shipped screen + primary hook + evidence/snapshot/role/quota/QA-claim
// functions. Only native views, transport and explicit generation are replaced.
import type { ReactElement } from "react";
import { hookHarness } from "../nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../auth/account-epoch";
import { CORE_ROLE_READ_TIMEOUT_MS } from "../persona/use-core-role-reads";
import { claimQaPolarisAuto, proposeRoleCards, type RoleCard } from "../persona/role-cards";

type Reply = { data: unknown; error?: unknown };
type Query = { table: string; columns: string; owner: string | null; limit?: number; tags?: string[] };
let mockHarness: ReturnType<typeof hookHarness>;
let mockAuth = { userId: "" as string | null, loading: false, hasProfile: true as boolean | null, isMinor: false as boolean | null };
let mockFocused = true;
let mockEligible = false;
let mockOverride: (query: Query) => Reply | Promise<Reply> | undefined;
let mockStatus: () => Reply | Promise<Reply>;
const mockQueries: Query[] = [];
const mockPush = jest.fn();
const mockRatify = jest.fn();
const mockCue = jest.fn();
const mockStatusCalls = jest.fn();
const mockWrites = jest.fn((..._args: unknown[]) => { throw new Error("Read attempted a server mutation"); });
const mockLevels = jest.fn(async (..._args: unknown[]) => ({ northStarBrightness: 0.6,
  starLevels: { profile: 1, infancy: 1, school: 1, twenties: 1, later: 1, work: 1, now: 1 } }));
const mockStorage = new Map<string, string>();
const mockStoreWrite = jest.fn((key: string, value: string) => { mockStorage.set(key, value); });
const record = (owner: string) => ({ id: `${owner}-record`, kind: "journal", topic: `${owner}-record`, created_at: "2026-10-15T00:00:00Z", tags: [] });
function defaultReply(query: Query): Reply {
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
jest.mock("../persona/load-seven-levels-strict", () => ({ loadSevenLevelsStrict: (...args: unknown[]) => mockLevels(...args) }));
jest.mock("../persona/role-cards", () => {
  const actual = jest.requireActual<typeof import("../persona/role-cards")>("../persona/role-cards");
  return { ...actual, claimQaPolarisAuto: jest.fn(actual.claimQaPolarisAuto), proposeRoleCards: jest.fn(async () => []), ratifyRoleCard: (...args: unknown[]) => mockRatify(...args) };
});
jest.mock("react-native", () => ({ Platform: { OS: "web" }, StyleSheet: { create: (value: unknown) => value, absoluteFill: {} } }));
jest.mock("react-native-svg", () => ({ Svg: "Svg", Rect: "Rect" }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "ko" }, t: (key: string, values?: Record<string, unknown>) => key + (values ? JSON.stringify(values) : "") }) }));
jest.mock("expo-router", () => ({ Redirect: "Redirect", useFocusEffect: (callback: () => void | (() => void)) => {
  jest.requireActual<typeof import("react")>("react").useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]);
} }));
jest.mock("@/lib/audio/global-cues", () => ({ requestGlobalCue: (cue: string) => mockCue(cue) }));
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
  noteResolvedOwner(mockAuth.userId); mockFocused = true; mockEligible = false;
  mockQueries.length = 0; mockOverride = () => undefined; mockStatus = () => ({ data: { available: true, intro_remaining: 2, tier: "brain" } });
  mockLevels.mockClear(); mockWrites.mockClear(); mockPush.mockClear();
  mockCue.mockClear(); mockRatify.mockReset().mockResolvedValue([]); mockStatusCalls.mockClear(); jest.mocked(proposeRoleCards).mockReset().mockResolvedValue([]);
  mockStorage.clear(); mockStoreWrite.mockClear(); jest.mocked(claimQaPolarisAuto).mockClear(); jest.mocked(proposeRoleCards).mockClear();
});
afterEach(() => { mockHarness.unmount(); jest.clearAllTimers(); jest.useRealTimers(); expect(mockWrites).not.toHaveBeenCalled(); });

type Element = ReactElement<{ children?: unknown; pages?: { body: unknown }[]; label?: string; accessibilityLabel?: string; visible?: boolean; disabled?: boolean; testID?: string; cards?: unknown[]; onPress?: () => void }>;
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
function deferred() { let resolve!: (reply: Reply) => void; let reject!: (reason: unknown) => void; const promise = new Promise<Reply>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function owner(next: string | null) { noteResolvedOwner(next); clearAccountTransition(currentAccountEpoch()); mockAuth.userId = next; }
const noAuto = () => { expect(claimQaPolarisAuto).not.toHaveBeenCalled(); expect(mockStoreWrite).not.toHaveBeenCalled(); expect(proposeRoleCards).not.toHaveBeenCalled(); };

const roleQuery = (q: Query) => q.table === "personas" && q.columns === "patterns";
const rolesReply = (label = "Known role") => ({ data: { patterns: { role_cards_v1: JSON.stringify([role(label)]) } } });
function role(label: string, status: "proposed" | "ratified" = "proposed"): RoleCard {
  return { id: label, label, summary: `${label} summary`, strengths: [], advice: "", status, evidenceRefs: ["record:00000000-0000-4000-8000-000000000001"], evidence: { domains: ["now"], constructs: [] }, claimStrength: 2 };
}
const action = (tree: unknown, label: string) => nodes(tree).find(node => node.props.label === label)!;
const retrySlot = (tree: unknown, slot: "roles" | "quota") => nodes(tree).find(node => node.props.testID === `core-${slot}-retry`)!;
const categories = (tree: unknown) => nodes(tree).filter(node => node.type === "PolarisCategorySlots");
const noClaimWrites = () => { expect(mockStoreWrite).not.toHaveBeenCalled(); expect(proposeRoleCards).not.toHaveBeenCalled(); expect(mockWrites).not.toHaveBeenCalled(); };

it.each(["returned", "reject"])("role %s failure is separate from successful empty and quota", async mode => {
  mockOverride = q => roleQuery(q) ? mode === "returned" ? { data: null, error: new Error("offline") } : Promise.reject(new Error("offline")) : undefined;
  const tree = await settle();
  expect(drawn(tree)).toContain("roleLoadError"); expect(drawn(tree)).not.toContain("roleEmpty");
  expect(categories(tree)).toHaveLength(0); expect(retrySlot(tree, "roles")).toBeDefined();
  expect(action(tree,"roleSuggest").props.disabled).toBe(false); expect(drawn(tree)).toContain("generationAllowance");
});

it("only a successful current empty role read displays empty categories", async()=>{
  const tree=await settle();expect(drawn(tree)).toContain("roleEmpty");
  expect(categories(tree)).toHaveLength(1);expect(categories(tree)[0].props.cards).toEqual([]);
});

it.each([
  ["bad JSON", { patterns: { role_cards_v1: "{" } }],
  ["non-array JSON", { patterns: { role_cards_v1: "{}" } }],
  ["invalid card shape", { patterns: { role_cards_v1: '[{"id":"broken"}]' } }],
  ["array patterns", { patterns: [] }],
  ["non-string role value", { patterns: { role_cards_v1: [] } }],
])("malformed %s remains unread and cannot authorize eligible QA", async (_name, data) => {
  mockEligible = true; mockOverride = q => roleQuery(q) ? { data } : undefined;
  const tree = await settle();
  expect(drawn(tree)).not.toContain("roleEmpty"); expect(categories(tree)).toHaveLength(0);
  expect(drawn(tree)).toContain("roleLoadError"); expect(retrySlot(tree, "roles")).toBeDefined();
  expect(drawn(tree)).toContain("generationAllowance"); noAuto();
});

it.each([null, { patterns: null }, { patterns: {} }, { patterns: { role_cards_v1: "[]" } }])(
  "confirmed absent or empty roles still permit the first eligible QA proposal %#", async data => {
    mockEligible = true; mockOverride = q => roleQuery(q) ? { data } : undefined;
    await settle();
    expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1);
    expect(mockStoreWrite).toHaveBeenCalledTimes(1); expect(proposeRoleCards).toHaveBeenCalledTimes(1);
  },
);

it("recovering malformed storage retries only roles without restoring QA eligibility", async () => {
  mockEligible = true;
  mockOverride = q => roleQuery(q) ? { data: { patterns: { role_cards_v1: "{" } } } : undefined;
  const failed = await settle(); noAuto();
  const reads = mockQueries.length, statuses = mockStatusCalls.mock.calls.length;
  mockOverride = q => roleQuery(q) ? { data: { patterns: { role_cards_v1: "[]" } } } : undefined;
  retrySlot(failed, "roles").props.onPress!(); const recovered = await settle();
  expect(drawn(recovered)).toContain("roleEmpty"); expect(categories(recovered)[0].props.cards).toEqual([]);
  expect(retrySlot(recovered, "roles")).toBeUndefined();
  expect(mockQueries.slice(reads)).toHaveLength(1); expect(mockQueries.slice(reads).every(roleQuery)).toBe(true);
  expect(mockStatusCalls).toHaveBeenCalledTimes(statuses); noAuto();
});

it.each(["error","pending","empty","cards"])("the evidence-empty deck keeps role status %s",async mode=>{
  mockOverride=q=>q.table==="sources" || q.table==="records" ? {data:[]}
    :roleQuery(q)? mode==="error"?{data:null,error:new Error("offline")}:mode==="pending"?new Promise(()=>{}):mode==="cards"?rolesReply():{data:null}:undefined;
  const tree=await settle(); expect(drawn(tree)).toContain("sevenStars");
  if(mode==="error" || mode==="pending")expect(categories(tree)).toHaveLength(0);
  else expect(categories(tree)[0].props.cards).toHaveLength(mode==="cards"?1:0);
  if(mode==="error")expect(retrySlot(tree,"roles")).toBeDefined();
});

it.each(["roles","quota"] as const)("%s has its own ten second deadline and leaves the other slot usable",async slot=>{
  expect(CORE_ROLE_READ_TIMEOUT_MS).toBe(10_000);
  if(slot==="roles")mockOverride=q=>roleQuery(q)?new Promise(()=>{}):undefined;
  else mockStatus=()=>new Promise(()=>{});
  let tree=await settle();expect(retrySlot(tree,slot)).toBeUndefined();
  expect(drawn(tree)).not.toContain("generationUnavailable");
  await jest.advanceTimersByTimeAsync(CORE_ROLE_READ_TIMEOUT_MS-1);tree=await settle();expect(retrySlot(tree,slot)).toBeUndefined();
  await jest.advanceTimersByTimeAsync(1);tree=await settle();expect(retrySlot(tree,slot)).toBeDefined();
  expect(drawn(tree)).toContain(slot==="roles"?"generationAllowance":"roleEmpty");
  expect(action(tree,"roleSuggest").props.disabled).toBe(slot==="quota");
});

it.each(["returned","reject","malformed"])("quota %s is unread, not confirmed disabled",async mode=>{
  mockStatus=()=>mode==="returned"?{data:null,error:new Error("offline")}:mode==="reject"?Promise.reject(new Error("offline")):{data:{available:true,intro_remaining:"2",tier:"brain"}};
  const tree=await settle();expect(drawn(tree)).not.toContain("generationUnavailable");
  expect(drawn(tree)).not.toContain("generationAllowance");expect(retrySlot(tree,"quota")).toBeDefined();
  expect(action(tree,"roleSuggest").props.disabled).toBe(true);expect(drawn(tree)).toContain("roleEmpty");
});

it("confirmed false is ready disabled without a retry",async()=>{
  mockStatus=()=>({data:{available:false,intro_remaining:2,tier:"free"}});
  const tree=await settle();expect(drawn(tree)).toContain("generationUnavailable");expect(retrySlot(tree,"quota")).toBeUndefined();
  expect(action(tree,"roleSuggest").props.disabled).toBe(true);
});

it.each(["roles","quota"] as const)("%s retry reads only that slot and cannot activate eligible QA",async slot=>{
  mockEligible=true;
  if(slot==="roles")mockOverride=q=>roleQuery(q)?{data:null,error:new Error("offline")}:undefined;
  else mockStatus=()=>({data:null,error:new Error("offline")});
  const failed=await settle();const claimed=jest.mocked(claimQaPolarisAuto).mock.calls.length;
  const before=mockQueries.length;const status=mockStatusCalls.mock.calls.length;
  mockOverride=()=>undefined;mockStatus=()=>({data:{available:true,intro_remaining:2,tier:"brain"}});
  const held=retrySlot(failed,slot).props.onPress!;held();await settle();
  expect(jest.mocked(claimQaPolarisAuto)).toHaveBeenCalledTimes(claimed);noClaimWrites();
  const reads=mockQueries.slice(before);
  if(slot==="roles"){expect(reads).toHaveLength(1);expect(reads.every(roleQuery)).toBe(true);expect(mockStatusCalls).toHaveBeenCalledTimes(status);}
  else {expect(reads).toHaveLength(0);expect(mockStatusCalls).toHaveBeenCalledTimes(status+1);}
  const finalCount=mockQueries.length;const finalStatus=mockStatusCalls.mock.calls.length;held();await settle();
  expect(mockQueries).toHaveLength(finalCount);expect(mockStatusCalls).toHaveBeenCalledTimes(finalStatus);noClaimWrites();
});

it("quota retry invalidates a real pending QA claim before it can stamp attempt storage",async()=>{
  mockEligible=true;const claim=deferred();let call=0;
  mockStatus=()=>++call===1?{data:null,error:new Error("offline")}:claim.promise;
  const tree=await settle();expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1);noClaimWrites();
  mockStatus=()=>({data:{available:true,intro_remaining:2,tier:"brain"}});
  retrySlot(tree,"quota").props.onPress!();claim.resolve({data:{available:true,intro_remaining:2,tier:"brain"}});await settle();
  expect(claimQaPolarisAuto).toHaveBeenCalledTimes(1);noClaimWrites();
});

it.each(["roles","quota"] as const)("a late timed-out %s cannot overwrite its successful retry",async slot=>{
  const old=deferred();
  if(slot==="roles")mockOverride=q=>roleQuery(q)?old.promise:undefined;else mockStatus=()=>old.promise;
  await settle();await jest.advanceTimersByTimeAsync(CORE_ROLE_READ_TIMEOUT_MS);const tree=await settle();
  mockOverride=q=>roleQuery(q)?rolesReply("Fresh role"):undefined;mockStatus=()=>({data:{available:true,intro_remaining:1,tier:"brain"}});
  retrySlot(tree,slot).props.onPress!();await settle();
  old.resolve(slot==="roles"?rolesReply("Old role"):{data:{available:false,intro_remaining:0,tier:"free"}});
  const ready=await settle();expect(drawn(ready)).not.toContain("Old role");expect(drawn(ready)).not.toContain("generationUnavailable");
  if(slot==="roles")expect(drawn(ready)).toContain("Fresh role");else expect(drawn(ready)).toContain('"n":1');
});

it.each(["blur","owner","ABA","unmount"])("late role/quota results cannot publish after %s",async mode=>{
  const roles=deferred(),quota=deferred();mockOverride=q=>roleQuery(q)?roles.promise:undefined;mockStatus=()=>quota.promise;
  await settle();
  if(mode==="blur"){mockFocused=false;render();}else if(mode==="owner")owner("new-owner");
  else if(mode==="ABA"){const first=mockAuth.userId!;beginAccountOwnerTransition("other");noteResolvedOwner("other");beginAccountOwnerTransition(first);noteResolvedOwner(first);clearAccountTransition(currentAccountEpoch());}
  else mockHarness.unmount();
  roles.resolve(rolesReply("Stale role"));quota.resolve({data:{available:false,intro_remaining:0,tier:"free"}});await flush();
  if(mode!=="unmount"){const tree=render();expect(drawn(tree)).not.toContain("Stale role");expect(drawn(tree)).not.toContain("generationUnavailable");}
  noAuto();
});

it.each(["roles","quota"] as const)("held %s retry cannot survive focus or owner replacement",async slot=>{
  mockOverride=q=>roleQuery(q)?{data:null,error:new Error("offline")}:undefined;mockStatus=()=>({data:null,error:new Error("offline")});
  const tree=await settle(),held=retrySlot(tree,slot).props.onPress!;
  mockFocused=false;render();const count=mockQueries.length,status=mockStatusCalls.mock.calls.length;held();await flush();
  expect(mockQueries).toHaveLength(count);expect(mockStatusCalls).toHaveBeenCalledTimes(status);
  owner("other-owner");mockFocused=true;await settle();const after=mockQueries.length,afterStatus=mockStatusCalls.mock.calls.length;held();await flush();
  expect(mockQueries).toHaveLength(after);expect(mockStatusCalls).toHaveBeenCalledTimes(afterStatus);
});

it("explicit generation supersedes a pending role read and refreshes only quota",async()=>{
  const old=deferred();mockOverride=q=>roleQuery(q)?old.promise:undefined;
  const tree=await settle();expect(action(tree,"roleSuggest").props.disabled).toBe(false);
  jest.mocked(proposeRoleCards).mockResolvedValueOnce([role("Generated")]);
  const queries=mockQueries.length,status=mockStatusCalls.mock.calls.length;
  action(tree,"roleSuggest").props.onPress!();await settle();old.resolve(rolesReply("Old read"));
  const ready=await settle();expect(drawn(ready)).toContain("Generated");expect(drawn(ready)).not.toContain("Old read");
  expect(mockQueries).toHaveLength(queries);expect(mockStatusCalls).toHaveBeenCalledTimes(status+1);
  expect(proposeRoleCards).toHaveBeenCalledTimes(1);expect(mockStoreWrite).not.toHaveBeenCalled();
});

it("successful approval publishes the returned cards and keeps the existing cue",async()=>{
  mockOverride=q=>roleQuery(q)?rolesReply("Proposal"):undefined;mockRatify.mockResolvedValueOnce([role("Approved","ratified")]);
  const tree=await settle();action(tree,"roleApprove").props.onPress!();const ready=await settle();
  expect(drawn(ready)).toContain("Approved");expect(drawn(ready)).not.toContain("Proposal summary");
  expect(mockRatify).toHaveBeenCalledTimes(1);expect(proposeRoleCards).not.toHaveBeenCalled();
  expect(mockCue).toHaveBeenCalledWith("polarisRatified");
});

it("successful role retry does not erase an actionable consent error",async()=>{
  mockOverride=q=>roleQuery(q)?{data:null,error:new Error("offline")}:undefined;
  const tree=await settle();jest.mocked(proposeRoleCards).mockRejectedValueOnce(new Error("consent_required"));
  action(tree,"roleSuggest").props.onPress!();const failed=await settle();expect(drawn(failed)).toContain("serviceControl.consent_required");
  mockOverride=()=>undefined;retrySlot(failed,"roles").props.onPress!();const ready=await settle();
  expect(drawn(ready)).toContain("roleEmpty");expect(drawn(ready)).toContain("serviceControl.consent_required");
});

it.each(["generate","approve"])("a completed explicit %s cannot publish across focus replacement",async mode=>{
  mockOverride=q=>roleQuery(q)?rolesReply("Before"):undefined;
  let resolve!: (cards: ReturnType<typeof role>[])=>void;const pending=new Promise<ReturnType<typeof role>[]>(done=>{resolve=done;});
  if(mode==="generate")jest.mocked(proposeRoleCards).mockReturnValueOnce(pending);else mockRatify.mockReturnValueOnce(pending);
  const tree=await settle();action(tree,mode==="generate"?"roleSuggest":"roleApprove").props.onPress!();await settle();
  mockFocused=false;render();mockOverride=q=>roleQuery(q)?rolesReply("Current"):undefined;mockFocused=true;await settle();
  resolve([role("Stale mutation")]);const ready=await settle();expect(drawn(ready)).toContain("Current");expect(drawn(ready)).not.toContain("Stale mutation");
});


it("generation invalidates a pending role read before the mutation resolves",async()=>{
  const old=deferred();mockOverride=q=>roleQuery(q)?old.promise:undefined;
  let finish!: (cards: ReturnType<typeof role>[])=>void;
  jest.mocked(proposeRoleCards).mockReturnValueOnce(new Promise(done=>{finish=done;}));
  const tree=await settle();action(tree,"roleSuggest").props.onPress!();await settle();
  old.resolve(rolesReply("Outdated while generating"));
  expect(drawn(await settle())).not.toContain("Outdated while generating");
  finish([role("Final generated")]);expect(drawn(await settle())).toContain("Final generated");
});

it("an owner hold before queued role/status retry dispatches neither read",async()=>{
  mockOverride=q=>roleQuery(q)?{data:null,error:new Error("offline")}:undefined;
  mockStatus=()=>({data:null,error:new Error("offline")});
  const tree=await settle();const reads=mockQueries.length,status=mockStatusCalls.mock.calls.length;
  mockOverride=()=>undefined;mockStatus=()=>({data:{available:true,intro_remaining:2,tier:"brain"}});
  retrySlot(tree,"roles").props.onPress!();retrySlot(tree,"quota").props.onPress!();
  beginAccountOwnerTransition("other");await flush();
  expect(mockQueries).toHaveLength(reads);expect(mockStatusCalls).toHaveBeenCalledTimes(status);
  noAuto();
});
