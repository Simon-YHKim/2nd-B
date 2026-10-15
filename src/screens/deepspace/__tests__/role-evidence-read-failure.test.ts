// Execute the shipped screen, role parser/query, evidence query, archive reader and
// graph builder. Native views/navigation and Supabase I/O are test boundaries.
// Generation/ratification are sentinels, never read retries.
import type { ReactElement } from "react";
import { hookHarness } from "../../../lib/nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../../lib/auth/account-epoch";
import { ROLE_EVIDENCE_READ_TIMEOUT_MS } from "../../../lib/persona/use-role-evidence-read";
import { proposeRoleCards, ratifyRoleCard, claimQaPolarisAuto } from "../../../lib/persona/role-cards";

type Reply = { data: unknown; error: unknown };
type Query = { table: string; owner: string; after: string | null; ids: readonly string[] | null; version?: number; signal?: AbortSignal };
let mockHarness: ReturnType<typeof hookHarness>;
let mockAuth = { userId: "owner-a" as string | null, loading: false };
let mockFocused = true;
let mockParams: { period?: string; tags?: string } = {};
let mockOverride: (query: Query) => Reply | Promise<Reply> | undefined;
const mockQueries: Query[] = [];
const mockPush = jest.fn();
const ARCHIVE_ID = "11111111-1111-4111-8111-111111111111";
const EVIDENCE_ID = "22222222-2222-4222-8222-222222222222";
const mockWrites = jest.fn((..._args: unknown[]) => { throw new Error("Read retry attempted a mutation"); });
const row = (id: string) => ({ id, kind: "note", body: null, summary: id, topic: id, tags: [], created_at: "2026-10-14T00:00:00Z", audit_period: "infancy" });

const cards = (owner = "owner-a", refs = [EVIDENCE_ID], status: "ratified" | "proposed" = "ratified") => [{
  id: "builder", label: `${owner}-role`, summary: "approved role", status,
  evidenceRefs: refs.map((id) => `record:${id}`), evidence: { domains: ["work"], constructs: [] }, claimStrength: 2,
}];
const roleReply = (owner = "owner-a", refs = [EVIDENCE_ID], status: "ratified" | "proposed" = "ratified"): Reply => ({
  data: { patterns: { role_cards_v1: JSON.stringify(cards(owner, refs, status)) } }, error: null,
});
const evidenceRow = () => ({ ...row(EVIDENCE_ID), topic: "historical evidence", created_at: "1990-01-01T00:00:00Z", tags: ["work"] });
jest.mock("../../../lib/supabase/client", () => ({ getSupabaseClient: () => ({
  rpc: (...args: unknown[]) => mockWrites(...args),
  from: (table: string) => {
    const query: Query = { table, owner: "", after: null, ids: null };
    const chain = {
      select() { return chain; }, maybeSingle() { return chain; },
      in(_key: string, value: readonly string[]) { query.ids = value; return chain; },
      update: (...args: unknown[]) => mockWrites(...args), insert: (...args: unknown[]) => mockWrites(...args),
      upsert: (...args: unknown[]) => mockWrites(...args), delete: (...args: unknown[]) => mockWrites(...args), order() { return chain; }, limit() { return chain; }, or() { return chain; },
      eq(key: string, value: string | number) { if (key === "user_id") query.owner = String(value); if (key === "version") query.version = Number(value); return chain; },
      lte(_key: string, value: string) { query.after = value; return chain; },
      abortSignal(signal: AbortSignal) { query.signal = signal; return chain; },
      then(resolve: (reply: Reply) => unknown, reject: (error: unknown) => unknown) {
        mockQueries.push({ ...query });
        // Deliberately ignore cancellation at this boundary: even a late server
        // response must not publish or trigger another pagination request.
        const reply = mockOverride(query) ?? (table === "personas" ? roleReply(query.owner) : { data: table === "records" ? query.ids ? [evidenceRow()] : [row(ARCHIVE_ID)] : [], error: null });
        return Promise.resolve(reply).then(resolve, reject);
      },
    };
    return chain;
  },
}) }));
jest.mock("react-native", () => ({ Platform: { OS: "web" }, StyleSheet: { create: (value: unknown) => value } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "ko" }, t: (key: string, values?: Record<string, unknown>) => key + (values ? JSON.stringify(values) : "") }) }));
jest.mock("expo-router", () => ({
  Redirect: "Redirect",
  useFocusEffect: (callback: () => void | (() => void)) => {
    jest.requireActual<typeof import("react")>("react").useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]);
  },
}));
jest.mock("@/components/phone/PhoneUIKit", () => ({ PhoneFlatList: "FlatList", PhonePressable: "Pressable", PhoneScrollView: "ScrollView", PhoneView: "View" }));
jest.mock("@/components/motion/SceneTransition", () => ({ SceneTransition: "SceneTransition" }));
jest.mock("@/components/ui/PlainText", () => ({ PlainText: "RNText" }));
jest.mock("@/components/ui/Text", () => ({ Text: "Text" }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: "PixelGlyph" }));
jest.mock("@/components/pixel/PixelPressable", () => ({ PixelPressable: "PixelPressable" }));
jest.mock("@/components/pixel/PixelSurface", () => ({ PixelSurface: "PixelSurface" }));
jest.mock("@/components/deepspace", () => ({ DeepSpaceLoader: "DeepSpaceLoader" }));
jest.mock("@/components/deep-space/DeepSpaceScreen", () => ({ DeepSpaceScreen: "DeepSpaceScreen" }));
jest.mock("@/components/deep-space/WikiGraph", () => ({ WikiGraph: "WikiGraph" }));
jest.mock("@/components/deep-space/RecordsGraph", () => ({ RecordsGraph: "RecordsGraph" }));
jest.mock("@/components/m3", () => ({ SegBtn: "SegBtn" }));
jest.mock("../dds-styles", () => ({ ddsStyles: {} }));
jest.mock("../dds-record-detail-screen", () => ({ DeepSpaceRecordDetailScreen: "DeepSpaceRecordDetailScreen" }));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/lib/nav/phone-embed", () => ({ useAppRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }), useHardwareBack: jest.fn(), usePhoneEmbed: () => null, useScreenParams: () => mockParams }));
jest.mock("@/lib/persona/role-cards", () => ({
  ...jest.requireActual<typeof import("../../../lib/persona/role-cards")>("../../../lib/persona/role-cards"),
  proposeRoleCards: jest.fn(() => { throw new Error("Unexpected synthesis"); }),
  ratifyRoleCard: jest.fn(() => { throw new Error("Unexpected ratification"); }),
  claimQaPolarisAuto: jest.fn(() => { throw new Error("Unexpected automatic generation"); }),
}));
jest.mock("@/lib/wiki/queries", () => ({}));

let Screen: () => ReactElement;
const spies: jest.SpyInstance[] = [];
beforeAll(() => {
  const React = jest.requireActual<typeof import("react")>("react");
  spies.push(jest.spyOn(React, "useState").mockImplementation(((initial: unknown) => mockHarness.hooks.useState(initial)) as typeof React.useState));
  spies.push(jest.spyOn(React, "useRef").mockImplementation(((initial: unknown) => mockHarness.hooks.useRef(initial)) as typeof React.useRef));
  spies.push(jest.spyOn(React, "useMemo").mockImplementation(((fn: () => unknown, deps: readonly unknown[]) => mockHarness.hooks.useMemo(fn, deps)) as typeof React.useMemo));
  spies.push(jest.spyOn(React, "useCallback").mockImplementation(((fn: unknown, deps: readonly unknown[]) => mockHarness.hooks.useCallback(fn, deps)) as typeof React.useCallback));
  spies.push(jest.spyOn(React, "useEffect").mockImplementation(((fn: () => void | (() => void), deps: readonly unknown[]) => mockHarness.hooks.useEffect(fn, deps)) as typeof React.useEffect));
  spies.push(jest.spyOn(React, "useSyncExternalStore").mockImplementation(((subscribe, snapshot) => mockHarness.hooks.useSyncExternalStore(subscribe, snapshot)) as typeof React.useSyncExternalStore));
  (globalThis as { React?: unknown }).React = React;
  Screen = jest.requireActual<typeof import("../dds-wiki-records-screens")>("../dds-wiki-records-screens").DeepSpaceRecordsScreen;
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); delete (globalThis as { React?: unknown }).React; });
beforeEach(() => {
  jest.useFakeTimers();
  __resetAccountEpochForTests(); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  mockHarness = hookHarness(); mockAuth = { userId: "owner-a", loading: false };
  mockFocused = true; mockParams = {}; mockQueries.length = 0; mockPush.mockClear(); mockOverride = () => undefined;
  mockWrites.mockClear(); jest.mocked(proposeRoleCards).mockClear(); jest.mocked(ratifyRoleCard).mockClear(); jest.mocked(claimQaPolarisAuto).mockClear();
});
afterEach(() => {
  mockHarness.unmount(); jest.clearAllTimers(); jest.useRealTimers();
  expect(mockWrites).not.toHaveBeenCalled();
  expect(proposeRoleCards).not.toHaveBeenCalled(); expect(ratifyRoleCard).not.toHaveBeenCalled(); expect(claimQaPolarisAuto).not.toHaveBeenCalled();
});

type Element = ReactElement<{
  children?: unknown; label?: string; accessibilityLabel?: string; onPress?: () => void; onSelect?: (key: string) => void;
  data?: Array<{ id: string }>; ListHeaderComponent?: unknown; ListEmptyComponent?: unknown;
  graph?: { nodes: Array<{ id: string; kind: string; label: string }> }; onOpenRecord?: (id: string) => void;
}>;
function children(node: Element): unknown[] { return [node.props.children, node.props.ListHeaderComponent, node.props.data?.length === 0 ? node.props.ListEmptyComponent : null]; }
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
  return children(value as Element).map(drawn).join(" ");
}
const render = () => mockHarness.render(Screen);
async function settle() { let tree = render(); for (let i = 0; i < 35; i++) { await Promise.resolve(); tree = render(); } return tree; }
async function flush() { for (let i = 0; i < 35; i++) await Promise.resolve(); }
const graph = (tree: unknown) => nodes(tree).find((node) => node.type === "RecordsGraph");
const retry = (tree: unknown) => nodes(tree).find((node) => node.props.accessibilityLabel === "common:actions.retry");
const graphCounts = (tree: unknown) => nodes(tree).find((node) => node.type === "RNText" && node.props.accessibilityLabel?.endsWith("domains.unit"))?.props.accessibilityLabel;
const roleQueries = () => mockQueries.filter((query) => query.table === "personas" || query.ids);
const archiveQueries = () => mockQueries.filter((query) => query.table !== "personas" && !query.ids);
const roleQuery = (query: Query) => query.table === "personas";
const evidenceQuery = (query: Query) => query.ids !== null;
function deferred() {
  let resolve!: (reply: Reply) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<Reply>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function unread(tree: unknown, error?: "unknown" | "network") {
  expect(graph(tree)).toBeUndefined(); expect(graphCounts(tree)).toBe("... domains.unit");
  for (const key of ["core-brain:roleGraphEmpty", "core-brain:roleGraphFiltered", "records.graphEmpty", "wiki.addPiece"]) expect(drawn(tree)).not.toContain(key);
  if (error) { expect(drawn(tree)).toContain(`common:errors.${error}`); expect(retry(tree)).toBeDefined(); }
  else { expect(retry(tree)).toBeUndefined(); expect(nodes(tree).some((node) => typeof node.type === "function" && node.type.name === "GraphLoading")).toBe(true); }
}
async function list(tree: unknown) {
  nodes(tree).find((node) => node.props.accessibilityLabel === "records.viewList")!.props.onPress!();
  return settle();
}
function switchOwner(owner: string | null) {
  noteResolvedOwner(owner); clearAccountTransition(currentAccountEpoch()); mockAuth = { userId: owner, loading: false };
}

it("executes real owned queries, builds the role graph and opens historical evidence", async () => {
  const ready = await settle();
  expect(roleQueries()).toEqual([
    { table: "personas", owner: "owner-a", after: null, ids: null, version: 1 },
    { table: "records", owner: "owner-a", after: null, ids: [EVIDENCE_ID] },
  ]);
  expect(graph(ready)?.props.graph?.nodes.map((node) => node.kind)).toEqual(["polaris", "persona", "record"]);
  expect(graph(ready)?.props.graph?.nodes.find((node) => node.kind === "persona")?.label).toBe("owner-a-role");
  expect(graphCounts(ready)).toBe("1 / 2 domains.unit");
  graph(ready)!.props.onOpenRecord!(EVIDENCE_ID);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[id]", params: { id: EVIDENCE_ID } });
});

it.each(["roles", "evidence"])("%s query failure is an unknown graph, with a read-only retry and usable archive", async (stage) => {
  mockOverride = (query) => (stage === "roles" ? roleQuery(query) : evidenceQuery(query)) ? { data: null, error: { message: "unavailable" } } : undefined;
  const failed = await settle(); unread(failed, "unknown");
  const initialArchive = archiveQueries().length; const initialRoles = roleQueries().length;
  const savedRetry = retry(failed)!.props.onPress!;
  mockOverride = () => undefined; savedRetry();
  unread(render());
  const ready = await settle(); expect(graph(ready)).toBeDefined();
  expect(archiveQueries()).toHaveLength(initialArchive); expect(roleQueries()).toHaveLength(initialRoles + 2);
  savedRetry(); await settle(); expect(roleQueries()).toHaveLength(initialRoles + 2);
  const archive = await list(ready);
  expect(nodes(archive).find((node) => node.type === "FlatList")?.props.data?.map((item) => item.id)).toEqual([ARCHIVE_ID]);
  expect(drawn(archive)).toContain('records.triageTitle{"count":1}');
  expect(mockPush).not.toHaveBeenCalled();
});

it.each(["roles", "evidence"])("a rejected %s transport is visible instead of empty", async (stage) => {
  mockOverride = (query) => (stage === "roles" ? roleQuery(query) : evidenceQuery(query)) ? Promise.reject(new Error("offline")) : undefined;
  unread(await settle(), "unknown");
});

it.each(["missing", "empty", "proposed", "no-ids"])("successful %s roles keep their legitimate empty meaning and skip evidence I/O", async (kind) => {
  mockOverride = (query) => !roleQuery(query) ? undefined : kind === "missing" ? { data: null, error: null }
    : kind === "empty" ? { data: { patterns: { role_cards_v1: "[]" } }, error: null }
    : roleReply("owner-a", kind === "no-ids" ? [] : [EVIDENCE_ID], kind === "proposed" ? "proposed" : "ratified");
  const ready = await settle();
  expect(drawn(ready)).toContain(kind === "no-ids" ? "core-brain:roleGraphFiltered" : "core-brain:roleGraphEmpty");
  expect(graphCounts(ready)).toBe("0 / 1 domains.unit"); expect(retry(ready)).toBeUndefined();
  expect(roleQueries()).toHaveLength(1);
});

it("successful missing/deleted evidence is absence, never fabricated nodes or a transport error", async () => {
  mockOverride = (query) => evidenceQuery(query) ? { data: [], error: null } : undefined;
  const ready = await settle(); expect(drawn(ready)).toContain("core-brain:roleGraphFiltered");
  expect(graph(ready)).toBeUndefined(); expect(retry(ready)).toBeUndefined(); expect(graphCounts(ready)).toBe("0 / 1 domains.unit");
});

it("a truly empty archive and successful empty roles retain the add-piece CTA", async () => {
  mockOverride = (query) => ({ data: roleQuery(query) ? null : [], error: null });
  const ready = await settle(); expect(drawn(ready)).toContain("records.graphEmpty"); expect(drawn(ready)).toContain("wiki.addPiece");
  expect(graphCounts(ready)).toBe("0 domains.unit"); expect(retry(ready)).toBeUndefined();
});

it("does not relabel an empty archive when its overlay could not be read", async () => {
  mockOverride = (query) => ({ data: roleQuery(query) ? null : [], error: roleQuery(query) ? { message: "offline" } : null });
  const failed = await settle(); unread(failed, "unknown");
  const archive = await list(failed); expect(drawn(archive)).toContain("records.emptyAll"); expect(drawn(archive)).toContain('records.triageTitle{"count":0}');
});

it("an overlay failure cannot erase a successful nonempty archive or its triage count", async () => {
  mockOverride = (query) => roleQuery(query) ? { data: null, error: { message: "offline" } } : undefined;
  const archive = await list(await settle());
  expect(nodes(archive).find((node) => node.type === "FlatList")?.props.data?.map((item) => item.id)).toEqual([ARCHIVE_ID]);
  expect(drawn(archive)).toContain('records.triageTitle{"count":1}'); expect(drawn(archive)).not.toContain("records.loadError");
});

it.each(["roles", "evidence"])("a hanging %s stage has one 10-second deadline and ignores late resolution", async (stage) => {
  const late = deferred();
  mockOverride = (query) => (stage === "roles" ? roleQuery(query) : evidenceQuery(query)) ? late.promise : undefined;
  unread(await settle()); await jest.advanceTimersByTimeAsync(ROLE_EVIDENCE_READ_TIMEOUT_MS - 1); unread(await settle());
  await jest.advanceTimersByTimeAsync(1); const failed = await settle(); unread(failed, "network");
  const beforeLate = roleQueries().length;
  late.resolve(stage === "roles" ? roleReply() : { data: [evidenceRow()], error: null });
  unread(await settle(), "network"); expect(roleQueries()).toHaveLength(beforeLate);
  mockOverride = () => undefined; retry(failed)!.props.onPress!(); expect(graph(await settle())).toBeDefined();
});

it("the evidence stage shares the original deadline instead of getting ten more seconds", async () => {
  const roles = deferred(); const evidence = deferred();
  mockOverride = (query) => roleQuery(query) ? roles.promise : evidenceQuery(query) ? evidence.promise : undefined;
  unread(await settle()); await jest.advanceTimersByTimeAsync(9000); roles.resolve(roleReply()); unread(await settle());
  expect(roleQueries()).toHaveLength(2);
  await jest.advanceTimersByTimeAsync(1000); unread(await settle(), "network");
});

it.each(["resolve", "reject"])("a late evidence %s cannot replace a retry result", async (completion) => {
  const late = deferred(); mockOverride = (query) => evidenceQuery(query) ? late.promise : undefined;
  await settle(); await jest.advanceTimersByTimeAsync(ROLE_EVIDENCE_READ_TIMEOUT_MS);
  const failed = await settle(); unread(failed, "network");
  mockOverride = () => undefined; retry(failed)!.props.onPress!(); const ready = await settle(); expect(graph(ready)).toBeDefined();
  if (completion === "resolve") late.resolve({ data: [], error: null }); else late.reject(new Error("late failure"));
  expect(graph(await settle())?.props.graph).toEqual(graph(ready)?.props.graph);
});

it("tags cannot resurrect cited records excluded by the active filter", async () => {
  mockParams = { tags: "unrelated" };
  const ready = await settle(); expect(graph(ready)).toBeUndefined(); expect(drawn(ready)).toContain("records.graphEmpty");
  expect(graphCounts(ready)).toBe("0 domains.unit");
});

it("period-list navigation retains the archive rules", async () => {
  mockParams = { period: "infancy" };
  const archive = await settle();
  expect(nodes(archive).find((node) => node.type === "FlatList")?.props.data?.map((item) => item.id)).toEqual([ARCHIVE_ID]);
  nodes(archive).find((node) => node.type === "SegBtn")!.props.onSelect!("graph");
  expect(graph(await settle())).toBeDefined();
});

it("type filters cannot bring back evidence excluded from the archive selection", async () => {
  const archive = await list(await settle());
  nodes(archive).find((node) => node.props.label === "records.typePhoto")!.props.onPress!();
  const filtered = await settle();
  expect(nodes(filtered).find((node) => node.type === "FlatList")?.props.data).toEqual([]);
  nodes(filtered).find((node) => node.type === "SegBtn")!.props.onSelect!("graph");
  const graphView = await settle(); expect(graph(graphView)).toBeUndefined(); expect(graphCounts(graphView)).toBe("0 domains.unit");
  expect(drawn(graphView)).toContain("records.graphEmpty");
});

it("a held retry cannot start another read during a publication hold", async () => {
  mockOverride = (query) => roleQuery(query) ? { data: null, error: { message: "offline" } } : undefined;
  const held = retry(await settle())!.props.onPress!;
  beginAccountOwnerTransition("owner-b"); held(); await flush();
  expect(roleQueries()).toHaveLength(1);
});

it("invalid stored evidence retains the existing parser contract and does not query invented IDs", async () => {
  mockOverride = (query) => roleQuery(query) ? roleReply("owner-a", ["invalid-id"]) : undefined;
  const ready = await settle(); expect(drawn(ready)).toContain("core-brain:roleGraphEmpty");
  expect(roleQueries()).toHaveLength(1); expect(retry(ready)).toBeUndefined();
});

it("holds block queued role I/O before it starts, without a rerender", async () => {
  render(); beginAccountOwnerTransition("owner-b"); await flush();
  expect(roleQueries()).toHaveLength(0);
});

it("holds between role and evidence reads block the dependent I/O without a rerender", async () => {
  const late = deferred(); mockOverride = (query) => roleQuery(query) ? late.promise : undefined;
  await settle(); beginAccountOwnerTransition("owner-b"); late.resolve(roleReply()); await flush();
  expect(roleQueries()).toHaveLength(1); unread(render());
});

it("owner replacement hides prior graph data before the new role read finishes", async () => {
  expect(graph(await settle())).toBeDefined();
  switchOwner("owner-b"); mockOverride = (query) => roleQuery(query) ? new Promise(() => {}) : undefined;
  unread(render()); unread(await settle());
});

it("a same-owner epoch change drops the old graph and old retry", async () => {
  mockOverride = (query) => roleQuery(query) ? { data: null, error: { message: "offline" } } : undefined;
  const oldRetry = retry(await settle())!.props.onPress!;
  beginAccountOwnerTransition("owner-b"); beginAccountOwnerTransition("owner-a");
  mockOverride = (query) => roleQuery(query) ? new Promise(() => {}) : undefined;
  unread(render()); await settle(); const calls = roleQueries().length;
  oldRetry(); await settle(); expect(roleQueries()).toHaveLength(calls);
});

it("A->B->A does not revive the first A request or its evidence stage", async () => {
  const old = deferred(); mockOverride = (query) => roleQuery(query) ? old.promise : undefined;
  await settle(); switchOwner("owner-b"); mockOverride = () => undefined; await settle();
  switchOwner("owner-a"); const current = await settle(); const count = roleQueries().length;
  old.resolve(roleReply("old-a")); const after = await settle();
  expect(roleQueries()).toHaveLength(count); expect(graph(after)?.props.graph).toEqual(graph(current)?.props.graph);
});

it("auth loading and signed out states never query roles or show prior graph rows", async () => {
  mockAuth.loading = true; await settle(); expect(roleQueries()).toHaveLength(0);
  mockAuth.loading = false; expect(graph(await settle())).toBeDefined();
  switchOwner(null); expect(graph(await settle())).toBeUndefined();
  const count = roleQueries().length; await settle(); expect(roleQueries()).toHaveLength(count);
});

it("blur stops the second stage; refocus reads the graph exactly once", async () => {
  const late = deferred(); mockOverride = (query) => roleQuery(query) ? late.promise : undefined;
  await settle(); mockFocused = false; render(); late.resolve(roleReply()); await flush(); expect(roleQueries()).toHaveLength(1);
  mockOverride = () => undefined; mockFocused = true; expect(graph(await settle())).toBeDefined();
  expect(roleQueries()).toHaveLength(3);
});

it("held retries cannot cross blur/refocus or start I/O while blurred", async () => {
  mockOverride = (query) => roleQuery(query) ? { data: null, error: { message: "offline" } } : undefined;
  const oldRetry = retry(await settle())!.props.onPress!;
  mockFocused = false; render(); oldRetry(); await flush(); expect(roleQueries()).toHaveLength(1);
  mockFocused = true; mockOverride = () => undefined; await settle(); const count = roleQueries().length;
  oldRetry(); await settle(); expect(roleQueries()).toHaveLength(count);
});

it("route parameter ABA does not revive an old held retry", async () => {
  mockOverride = (query) => roleQuery(query) ? { data: null, error: { message: "offline" } } : undefined;
  const oldRetry = retry(await settle())!.props.onPress!;
  mockParams = { tags: "work" }; await settle(); mockParams = {}; await settle();
  const count = roleQueries().length; oldRetry(); await settle(); expect(roleQueries()).toHaveLength(count);
});

it("a route replacement blocks an old role result from starting evidence I/O", async () => {
  const old = deferred(); mockOverride = (query) => roleQuery(query) ? old.promise : undefined;
  await settle(); mockParams = { tags: "work" }; mockOverride = () => undefined; await settle(); const count = roleQueries().length;
  old.resolve(roleReply("old-route")); await settle(); expect(roleQueries()).toHaveLength(count);
});

it.each(["roles", "evidence"])("unmount ignores a pending %s stage and clears local timers", async (stage) => {
  const late = deferred(); mockOverride = (query) => (stage === "roles" ? roleQuery(query) : evidenceQuery(query)) ? late.promise : undefined;
  await settle(); const count = roleQueries().length; mockHarness.unmount(); await flush(); expect(jest.getTimerCount()).toBe(0);
  late.resolve(stage === "roles" ? roleReply() : { data: [evidenceRow()], error: null }); await flush();
  expect(roleQueries()).toHaveLength(count);
});
