// Execute the real screen, paged records reader and sources reader. Only native
// views, unrelated role-card reads and the Supabase transport are replaced.
import type { ReactElement } from "react";
import { hookHarness } from "../../../lib/nav/__tests__/hook-harness";
import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../../lib/auth/account-epoch";
import { WIKI_RECORDS_PAGE } from "../../../lib/records/list-all-records";

type Reply = { data: unknown[] | null; error: unknown };
type Query = { table: string; owner: string; after: string | null; signal?: AbortSignal };
let mockHarness: ReturnType<typeof hookHarness>;
let mockAuth = { userId: "owner-a" as string | null, loading: false };
let mockFocused = true;
let mockParams: { period?: string; tags?: string } = {};
let mockOverride: (query: Query) => Reply | Promise<Reply> | undefined;
const mockQueries: Query[] = [];
const mockPush = jest.fn();
const row = (id: string) => ({ id, kind: "note", body: null, summary: id, topic: id, tags: [], created_at: "2026-10-14T00:00:00Z", audit_period: "infancy" });

jest.mock("../../../lib/supabase/client", () => ({ getSupabaseClient: () => ({
  from: (table: string) => {
    const query: Query = { table, owner: "", after: null };
    const chain = {
      select() { return chain; }, order() { return chain; }, limit() { return chain; }, or() { return chain; },
      eq(key: string, value: string) { if (key === "user_id") query.owner = value; return chain; },
      lte(_key: string, value: string) { query.after = value; return chain; },
      abortSignal(signal: AbortSignal) { query.signal = signal; return chain; },
      then(resolve: (reply: Reply) => unknown, reject: (error: unknown) => unknown) {
        mockQueries.push({ ...query });
        // Deliberately ignore cancellation at this boundary: even a late server
        // response must not publish or trigger another pagination request.
        const reply = mockOverride(query) ?? { data: table === "records" ? [row(`${query.owner}-record`)] : [], error: null };
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
jest.mock("@/lib/persona/role-cards", () => ({ loadRoleCards: () => Promise.resolve([]), roleEvidenceIds: () => [] }));
jest.mock("@/lib/records/create", () => ({ listRecordsByIds: () => Promise.resolve([]) }));
jest.mock("@/lib/wiki/queries", () => ({}));

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
  spies.push(jest.spyOn(React, "useSyncExternalStore").mockImplementation(((subscribe, snapshot) => mockHarness.hooks.useSyncExternalStore(subscribe, snapshot)) as typeof React.useSyncExternalStore));
  (globalThis as { React?: unknown }).React = React;
  const module = jest.requireActual<typeof import("../dds-wiki-records-screens")>("../dds-wiki-records-screens");
  Screen = module.DeepSpaceRecordsScreen; timeoutMs = module.WIKI_LIST_READ_TIMEOUT_MS;
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); delete (globalThis as { React?: unknown }).React; });
beforeEach(() => {
  jest.useFakeTimers();
  noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  mockHarness = hookHarness(); mockAuth = { userId: "owner-a", loading: false };
  mockFocused = true; mockParams = {}; mockQueries.length = 0; mockPush.mockClear(); mockOverride = () => undefined;
});
afterEach(() => { mockHarness?.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });

type Element = ReactElement<{ children?: unknown; accessibilityLabel?: string; onPress?: (...args: unknown[]) => void; data?: Array<{ id: string; origin?: string; sourceId?: string }>; ListHeaderComponent?: unknown; ListEmptyComponent?: unknown; renderItem?: (input: { item: unknown }) => Element }>;
function children(node: Element): unknown[] {
  return [node.props.children, node.props.ListHeaderComponent, node.props.data?.length === 0 ? node.props.ListEmptyComponent : null];
}
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
async function settle(list = true) {
  let tree = render();
  if (list) nodes(tree).find((node) => node.props.accessibilityLabel === "records.viewList")?.props.onPress?.();
  for (let i = 0; i < 30; i++) { await Promise.resolve(); tree = render(); }
  return tree;
}
const listNode = (tree: unknown) => nodes(tree).find((node) => node.type === "FlatList");
const ids = (tree: unknown) => listNode(tree)?.props.data?.map((item) => item.id);
const retry = (tree: unknown) => nodes(tree).find((node) => node.props.onPress && drawn(node).trim() === "records.retry");
function deferred() {
  let resolve!: (reply: Reply) => void;
  const promise = new Promise<Reply>((done) => { resolve = done; });
  return { promise, resolve };
}
function expectFailed(tree: unknown) {
  expect(drawn(tree)).toContain("records.loadError");
  expect(drawn(tree)).toContain('"count":"..."');
  expect(drawn(tree)).not.toContain("records.emptyAll");
  expect(drawn(tree)).not.toContain("records.emptyKind");
  expect(ids(tree)).toEqual([]);
  expect(retry(tree)).toBeDefined();
}

test.each(["records", "sources"])("%s failure is retryable, never a complete or empty list", async (table) => {
  mockOverride = (query) => query.table === table ? { data: null, error: { message: "read failed" } } : undefined;
  const failed = await settle(); expectFailed(failed);
  mockOverride = () => undefined;
  retry(failed)!.props.onPress!();
  const ready = await settle();
  expect(ids(ready)).toEqual(["owner-a-record"]);
  expect(retry(ready)).toBeUndefined();
});

test("a records failure is shown immediately even if sources never answer", async () => {
  mockOverride = (query) => query.table === "records" ? { data: null, error: { message: "read failed" } } : new Promise(() => {});
  expectFailed(await settle());
});

test("source-only success stays visible and preserves source-detail navigation", async () => {
  mockOverride = (query) => ({ data: query.table === "records" ? [] : [{ id: "source-a", title: "saved link", captured_at: "2026-10-15T00:00:00Z", tags: ["link"] }], error: null });
  const ready = await settle();
  expect(ids(ready)).toEqual(["src-source-a"]);
  const list = listNode(ready)!;
  const source = list.props.data![0];
  expect(source).toMatchObject({ origin: "source", sourceId: "source-a" });
  list.props.renderItem!({ item: source }).props.onPress!(source);
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/record/[id]", params: { id: "source-a", origin: "source" } });
});

test("two successful empty reads show the existing empty state, without a retry", async () => {
  mockOverride = () => ({ data: [], error: null });
  const empty = await settle();
  expect(drawn(empty)).toContain("records.emptyAll");
  expect(drawn(empty)).not.toContain('"count":"..."');
  expect(retry(empty)).toBeUndefined();
});

test.each(["records", "sources"])("a stalled %s read times out; late success cannot overwrite retry", async (table) => {
  const late = deferred();
  mockOverride = (query) => query.table === table ? late.promise : undefined;
  const loading = await settle();
  expect(drawn(loading)).toContain('"count":"..."');
  expect(drawn(loading)).not.toContain("records.emptyAll");
  await jest.advanceTimersByTimeAsync(timeoutMs);
  const failed = await settle(); expectFailed(failed);
  expect(mockQueries.find((q) => q.table === "records")!.signal?.aborted).toBe(true);
  mockOverride = () => undefined; retry(failed)!.props.onPress!();
  expect(ids(await settle())).toEqual(["owner-a-record"]);
  late.resolve({ data: [row("late-record")], error: null });
  expect(ids(await settle())).toEqual(["owner-a-record"]);
});

test("one total deadline covers later pages and cancellation prevents a late next page", async () => {
  const first = deferred(); const second = deferred();
  mockOverride = (query) => query.table !== "records" ? undefined : query.after ? second.promise : first.promise;
  await settle();
  await jest.advanceTimersByTimeAsync(timeoutMs - 1000);
  first.resolve({ data: Array.from({ length: WIKI_RECORDS_PAGE }, (_, i) => row(`first-${i}`)), error: null });
  await settle();
  expect(mockQueries.filter((q) => q.table === "records")).toHaveLength(2);
  await jest.advanceTimersByTimeAsync(1000);
  expectFailed(await settle());
  second.resolve({ data: Array.from({ length: WIKI_RECORDS_PAGE }, (_, i) => row(`late-${i}`)), error: null });
  expectFailed(await settle());
  expect(mockQueries.filter((q) => q.table === "records")).toHaveLength(2);
});

test("an account change hides ready old rows before the new read completes", async () => {
  expect(ids(await settle())).toEqual(["owner-a-record"]);
  mockAuth = { userId: "owner-b", loading: false };
  noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch());
  mockOverride = () => new Promise(() => {});
  expect(ids(render())).toEqual([]);
  expect(drawn(render())).toContain('"count":"..."');
});

test("a pre-publication epoch change cancels old pages even before userId changes", async () => {
  const old = deferred();
  mockOverride = (query) => query.table === "records" ? old.promise : undefined;
  await settle();
  beginAccountOwnerTransition("owner-b");
  expect(mockQueries.find((q) => q.table === "records")!.signal?.aborted).toBe(true);
  // The owner returns to A before publication: the id is the same, the epoch is not.
  beginAccountOwnerTransition("owner-a"); clearAccountTransition(currentAccountEpoch());
  mockOverride = () => undefined;
  expect(ids(await settle())).toEqual(["owner-a-record"]);
  old.resolve({ data: Array.from({ length: WIKI_RECORDS_PAGE }, (_, i) => row(`old-${i}`)), error: null });
  expect(ids(await settle())).toEqual(["owner-a-record"]);
  expect(mockQueries.filter((q) => q.table === "records")).toHaveLength(2);
});

test("unmount cancels a pending page and ignores a transport that resolves afterward", async () => {
  const old = deferred();
  mockOverride = (query) => query.table === "records" ? old.promise : undefined;
  await settle(); mockHarness.unmount();
  old.resolve({ data: Array.from({ length: WIKI_RECORDS_PAGE }, (_, i) => row(`old-${i}`)), error: null });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(mockHarness.dirty).toBe(false);
  expect(mockQueries.filter((q) => q.table === "records")).toHaveLength(1);
});

test("focus re-entry reloads without a duplicate initial read", async () => {
  await settle();
  expect(mockQueries.filter((q) => q.table === "records")).toHaveLength(1);
  mockFocused = false; render();
  mockOverride = (query) => query.table === "records" ? { data: [row("after-return")], error: null } : undefined;
  mockFocused = true;
  expect(ids(await settle())).toEqual(["after-return"]);
  expect(mockQueries.filter((q) => q.table === "records")).toHaveLength(2);
});

test("a previous focus request's late failure cannot erase the fresh list", async () => {
  const old = deferred();
  mockOverride = (query) => query.table === "records" ? old.promise : undefined;
  await settle();
  mockFocused = false; render();
  mockOverride = () => undefined; mockFocused = true;
  expect(ids(await settle())).toEqual(["owner-a-record"]);
  old.resolve({ data: null, error: { message: "late failure" } });
  const current = await settle();
  expect(ids(current)).toEqual(["owner-a-record"]);
  expect(retry(current)).toBeUndefined();
});
