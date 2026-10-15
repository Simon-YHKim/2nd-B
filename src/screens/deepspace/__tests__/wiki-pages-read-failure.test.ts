// Actual screen + actual wiki query wrappers + actual account lease/deadline.
// Replace native views and Supabase transport; no server or model call runs.
import type { ReactElement } from "react";
import { hookHarness } from "../../../lib/nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../../lib/auth/account-epoch";

type Reply = { data: unknown; error: unknown };
type Query = { table: string; owner: string; id?: string; columns?: string; limit?: number; order?: [string, unknown] };
let mockHarness: ReturnType<typeof hookHarness>;
let mockAuth = { userId: "owner-a" as string | null, loading: false };
let mockParams: { focusPageId?: string } = {};
let mockRouteFocused = true;
let mockOverride: (query: Query) => Reply | Promise<Reply> | undefined;
const mockQueries: Query[] = [];
const pageRow = (id: string, owner = "owner-a", tags: string[] = []) => ({ id, user_id: owner, slug: id, title: id, body_md: `body ${id}`, kind: "note", tags, created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z" });

jest.mock("../../../lib/supabase/client", () => ({ getSupabaseClient: () => ({ from: (table: string) => {
  const query: Query = { table, owner: "" };
  const chain = {
    select(columns: string) { query.columns = columns; return chain; },
    eq(key: string, value: string) { if (key === "user_id") query.owner = value; if (key === "id") query.id = value; return chain; },
    order(key: string, options: unknown) { query.order = [key, options]; return chain; },
    limit(value: number) { query.limit = value; return chain; },
    maybeSingle() { return chain; },
    then(resolve: (value: Reply) => unknown, reject: (error: unknown) => unknown) {
      mockQueries.push({ ...query });
      const data = table === "wiki_pages" ? query.id ? pageRow(query.id, query.owner) : [pageRow(`${query.owner}-page`, query.owner)] : [];
      return Promise.resolve(mockOverride(query) ?? { data, error: null }).then(resolve, reject);
    },
  };
  return chain;
} }) }));
jest.mock("react-native", () => ({ Platform: { OS: "web" }, StyleSheet: { create: (value: unknown) => value } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "ko" }, t: (key: string, values?: Record<string, unknown>) => key + (values ? JSON.stringify(values) : "") }) }));
jest.mock("expo-router", () => ({ Redirect: "Redirect", useFocusEffect: (callback: () => void | (() => void)) => mockHarness.hooks.useEffect(() => mockRouteFocused ? callback() : undefined, [callback, mockRouteFocused]) }));
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
jest.mock("@/lib/nav/phone-embed", () => ({ useAppRouter: () => ({ push: jest.fn() }), useHardwareBack: jest.fn(), usePhoneEmbed: () => null, useScreenParams: () => mockParams }));
jest.mock("@/lib/persona/role-cards", () => ({}));
jest.mock("@/lib/records/create", () => ({}));

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
  spies.push(jest.spyOn(React, "useSyncExternalStore").mockImplementation(((...args: Parameters<typeof React.useSyncExternalStore>) => mockHarness.hooks.useSyncExternalStore(args[0], args[1])) as typeof React.useSyncExternalStore));
  (globalThis as { React?: unknown }).React = React;
  const module = jest.requireActual<typeof import("../dds-wiki-records-screens")>("../dds-wiki-records-screens");
  Screen = module.DeepSpaceWikiScreen; timeoutMs = module.WIKI_PAGES_READ_TIMEOUT_MS;
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); delete (globalThis as { React?: unknown }).React; });
beforeEach(() => {
  jest.useFakeTimers(); __resetAccountEpochForTests(); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  mockHarness = hookHarness(); mockAuth = { userId: "owner-a", loading: false }; mockParams = {}; mockRouteFocused = true; mockQueries.length = 0; mockOverride = () => undefined;
});
afterEach(() => { mockHarness?.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });

type Element = ReactElement<{ children?: unknown; label?: string; accessibilityLabel?: string; accessibilityState?: { expanded?: boolean }; onPress?: () => void; onSelect?: (key: string) => void; onOpenPage?: (id: string) => void; pages?: { id: string }[]; edges?: unknown[] }>;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function drawn(value: unknown): string {
  if (Array.isArray(value)) return value.map(drawn).join(" ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  const node = value as Element; return [node.props.label, drawn(node.props.children)].filter(Boolean).join(" ");
}
const render = () => mockHarness.render(Screen);
async function settle() { let tree = render(); for (let i = 0; i < 25; i++) { await Promise.resolve(); tree = render(); } return tree; }
const retry = (tree: unknown) => nodes(tree).find((node) => node.props.onPress && drawn(node).trim() === "common:actions.retry");
function deferred() { let resolve!: (value: Reply) => void; let reject!: (error: unknown) => void; const promise = new Promise<Reply>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function expectFailed(tree: unknown, timeout = false) {
  expect(drawn(tree)).toContain(timeout ? "common:errors.network" : "common:errors.unknown");
  expect(drawn(tree)).not.toContain("wiki.emptyAll"); expect(drawn(tree)).not.toContain("wiki.emptyTag"); expect(drawn(tree)).not.toContain("wiki.addPiece");
  expect(drawn(tree).match(/\.\.\./g)).toHaveLength(2); expect(retry(tree)).toBeDefined();
  expect(nodes(tree).some((node) => node.type === "WikiGraph")).toBe(false);
}

test.each(["wiki_pages", "wiki_links"])("%s failure is unknown and retryable, never an empty library or zero links", async (table) => {
  mockOverride = (query) => query.table === table ? { data: null, error: { message: "failed" } } : undefined;
  const failed = await settle(); expectFailed(failed);
  mockOverride = () => undefined; retry(failed)!.props.onPress!(); const ready = await settle();
  expect(drawn(ready)).toContain("owner-a-page"); expect(retry(ready)).toBeUndefined(); expect(drawn(ready)).not.toContain("...");
});

test.each(["wiki_pages", "wiki_links"])("%s stall reaches 10 seconds and its late success cannot replace a retry", async (table) => {
  const slow = deferred(); mockOverride = (query) => query.table === table ? slow.promise : undefined;
  let tree = await settle(); expect(drawn(tree)).not.toContain("wiki.emptyAll"); expect(drawn(tree).match(/\.\.\./g)).toHaveLength(2);
  jest.advanceTimersByTime(timeoutMs - 1); tree = await settle(); expect(retry(tree)).toBeUndefined();
  jest.advanceTimersByTime(1); tree = await settle(); expectFailed(tree, true);
  mockOverride = () => undefined; retry(tree)!.props.onPress!(); tree = await settle(); expect(drawn(tree)).toContain("owner-a-page");
  slow.resolve({ data: [], error: null }); tree = await settle(); expect(drawn(tree)).toContain("owner-a-page"); expect(retry(tree)).toBeUndefined();
});

test("one failed read does not wait for the other to time out", async () => {
  mockOverride = (query) => query.table === "wiki_pages" ? { data: null, error: { message: "failed" } } : new Promise(() => {});
  expectFailed(await settle());
});

test("two successful empty reads display zero and the existing capture entry", async () => {
  mockOverride = () => ({ data: [], error: null }); const tree = await settle();
  expect(drawn(tree)).toContain("wiki.emptyAll"); expect(drawn(tree)).toContain("wiki.addPiece"); expect(drawn(tree)).not.toContain("..."); expect(retry(tree)).toBeUndefined();
});

test("query scopes, list pin and graph edges are preserved on successful reads", async () => {
  mockParams = { focusPageId: "second-page" };
  mockOverride = (query) => ({ data: query.table === "wiki_pages" ? [pageRow("first-page"), pageRow("second-page")] : [{ from_page: "first-page", to_page: "second-page" }], error: null });
  let tree = await settle();
  expect(mockQueries).toEqual([
    { table: "wiki_pages", owner: "owner-a", columns: "*", limit: 200, order: ["updated_at", { ascending: false }] },
    { table: "wiki_links", owner: "owner-a", columns: "from_page, to_page", limit: 4000 },
  ]);
  expect(nodes(tree).find((node) => node.props.accessibilityLabel === "second-page")?.props.accessibilityState?.expanded).toBe(true);
  nodes(tree).find((node) => node.type === "SegBtn")!.props.onSelect!("graph"); tree = await settle();
  const graph = nodes(tree).find((node) => node.type === "WikiGraph")!;
  expect(graph.props.pages?.map((page) => page.id)).toEqual(["first-page", "second-page"]);
  expect(graph.props.edges).toEqual([{ from_page: "first-page", to_page: "second-page" }]);
  graph.props.onOpenPage!("first-page"); tree = await settle();
  expect(nodes(tree).find((node) => node.props.accessibilityLabel === "first-page")?.props.accessibilityState?.expanded).toBe(true);
});

test("the graph view retains failure and retry instead of drawing partial pages", async () => {
  mockOverride = (query) => query.table === "wiki_links" ? { data: null, error: { message: "links failed" } } : undefined;
  let tree = await settle(); nodes(tree).find((node) => node.type === "SegBtn")!.props.onSelect!("graph"); tree = await settle(); expectFailed(tree);
});

test("a failed list does not mistake a citation for a page absent from a successful window", async () => {
  mockParams = { focusPageId: "out-of-window" };
  mockOverride = (query) => !query.id && query.table === "wiki_pages" ? { data: null, error: { message: "failed" } } : undefined;
  const tree = await settle(); expectFailed(tree); expect(mockQueries.some((query) => query.id)).toBe(false);
  mockOverride = () => undefined; retry(tree)!.props.onPress!(); const ready = await settle();
  expect(mockQueries.filter((query) => query.id)).toEqual([{ table: "wiki_pages", owner: "owner-a", columns: "*", id: "out-of-window" }]);
  expect(drawn(ready)).toContain("body out-of-window");
});

test("owner change hides old rows before the next answer and ignores an old failure", async () => {
  const old = deferred(); mockOverride = (query) => query.owner === "owner-a" ? old.promise : undefined; await settle();
  noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch()); mockAuth.userId = "owner-b";
  expect(drawn(render())).not.toContain("owner-a-page"); expect(drawn(await settle())).toContain("owner-b-page");
  old.reject(new Error("late A failure")); const tree = await settle(); expect(drawn(tree)).toContain("owner-b-page"); expect(retry(tree)).toBeUndefined();
});

test("a previously ready owner's rows disappear while the next owner is still loading", async () => {
  expect(drawn(await settle())).toContain("owner-a-page"); mockOverride = () => new Promise(() => {});
  noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch()); mockAuth.userId = "owner-b";
  const tree = render(); expect(drawn(tree)).not.toContain("owner-a-page"); expect(drawn(tree).match(/\.\.\./g)).toHaveLength(2);
});

test("pre-publication hold blocks a new read and a same-owner return uses a fresh epoch", async () => {
  const old = deferred(); mockOverride = () => old.promise; await settle(); expect(mockQueries).toHaveLength(2);
  beginAccountOwnerTransition("owner-b"); await settle(); expect(mockQueries).toHaveLength(2);
  old.resolve({ data: [], error: null }); await settle(); mockOverride = () => undefined;
  beginAccountOwnerTransition("owner-a"); const tree = await settle(); expect(drawn(tree)).toContain("owner-a-page"); expect(mockQueries).toHaveLength(4);
});

test("unmount rejects late results without state writes", async () => {
  const old = deferred(); mockOverride = () => old.promise; await settle(); mockHarness.unmount();
  old.resolve({ data: [], error: null }); for (let i = 0; i < 25; i++) await Promise.resolve(); expect(mockHarness.dirty).toBe(false);
});


// These actual component cases replace the older partial-AST focus tests in
// citation-opens-the-cited-page: the complete hook/query/render path now runs.
const expanded = (tree: unknown, id: string) => nodes(tree).find((node) => node.props.accessibilityLabel === id)?.props.accessibilityState?.expanded === true;

test("out-of-window citation failure is retryable and never opens the unrelated default row", async () => {
  mockParams = { focusPageId: "old-cited" };
  mockOverride = (query) => query.id ? { data: null, error: new Error("citation failed") } : undefined;
  let tree = await settle(); expect(drawn(tree)).toContain("common:errors.unknown"); expect(drawn(tree)).not.toContain("recordDetail:state.missingTitle");
  expect(expanded(tree, "owner-a-page")).toBe(false);
  mockOverride = () => undefined; retry(tree)!.props.onPress!(); tree = await settle();
  expect(drawn(tree)).toContain("body old-cited"); expect(expanded(tree, "old-cited")).toBe(true);
  expect(mockQueries.filter((query) => query.id)).toHaveLength(2);
  expect(mockQueries.filter((query) => !query.id)).toHaveLength(2); // Retry does not repeat the list or any mutation.
});

test("an out-of-window citation hang reaches 10 seconds and late completion cannot replace retry", async () => {
  const slow = deferred(); mockParams = { focusPageId: "old-cited" }; mockOverride = (query) => query.id ? slow.promise : undefined;
  let tree = await settle(); expect(drawn(tree)).toContain("..."); expect(expanded(tree, "owner-a-page")).toBe(false);
  jest.advanceTimersByTime(9_999); expect(retry(await settle())).toBeUndefined();
  jest.advanceTimersByTime(1); tree = await settle(); expect(drawn(tree)).toContain("common:errors.network");
  mockOverride = () => undefined; retry(tree)!.props.onPress!(); tree = await settle(); expect(drawn(tree)).toContain("body old-cited");
  slow.resolve({ data: pageRow("stale-cited"), error: null }); tree = await settle(); expect(drawn(tree)).not.toContain("stale-cited"); expect(expanded(tree, "old-cited")).toBe(true);
});

test("a successful missing citation is distinct from failure and does not open another record", async () => {
  mockParams = { focusPageId: "missing" }; mockOverride = (query) => query.id ? { data: null, error: null } : undefined;
  const tree = await settle(); expect(drawn(tree)).toContain("recordDetail:state.missingTitle"); expect(drawn(tree)).not.toContain("common:errors.unknown");
  expect(retry(tree)).toBeUndefined(); expect(expanded(tree, "owner-a-page")).toBe(false);
});

test("an empty successful list cannot disguise the failed citation as an empty-library prompt", async () => {
  mockParams = { focusPageId: "old-cited" }; mockOverride = (query) => query.id ? { data: null, error: new Error("failed") } : { data: [], error: null };
  const tree = await settle(); expect(drawn(tree)).toContain("common:errors.unknown"); expect(drawn(tree)).not.toContain("wiki.emptyAll"); expect(drawn(tree)).not.toContain("wiki.addPiece");
});

test("each successful sequential citation is pinned, while ordinary rerenders preserve a manual row choice", async () => {
  mockParams = { focusPageId: "first-cited" }; let tree = await settle(); expect(expanded(tree, "first-cited")).toBe(true);
  nodes(tree).find((node) => node.props.accessibilityLabel === "owner-a-page")!.props.onPress!(); tree = await settle(); expect(expanded(tree, "owner-a-page")).toBe(true);
  mockParams = { focusPageId: "second-cited" }; expect(expanded(render(), "owner-a-page")).toBe(false);
  tree = await settle(); expect(expanded(tree, "second-cited")).toBe(true); expect(drawn(tree)).not.toContain("first-cited");
  expect(mockQueries.filter((query) => query.id).map((query) => query.id)).toEqual(["first-cited", "second-cited"]);
});

test("manual selection while a citation is pending is not overwritten by its late success", async () => {
  const slow = deferred(); mockParams = { focusPageId: "old-cited" }; mockOverride = (query) => query.id ? slow.promise : undefined;
  let tree = await settle(); nodes(tree).find((node) => node.props.accessibilityLabel === "owner-a-page")!.props.onPress!();
  slow.resolve({ data: pageRow("old-cited"), error: null }); tree = await settle(); expect(expanded(tree, "owner-a-page")).toBe(true); expect(expanded(tree, "old-cited")).toBe(false);
});

test("replaced citation target rejects the first target's late result and retry callback", async () => {
  mockParams = { focusPageId: "first-cited" }; mockOverride = (query) => query.id === "first-cited" ? { data: null, error: new Error("failed") } : undefined;
  const first = await settle(); const staleRetry = retry(first)!.props.onPress!;
  const slow = deferred(); mockOverride = (query) => query.id === "second-cited" ? slow.promise : undefined;
  mockParams = { focusPageId: "second-cited" }; await settle(); const calls = mockQueries.length; staleRetry(); await settle(); expect(mockQueries).toHaveLength(calls);
  mockParams = { focusPageId: "third-cited" }; let tree = await settle(); expect(expanded(tree, "third-cited")).toBe(true);
  slow.resolve({ data: pageRow("second-cited"), error: null }); tree = await settle(); expect(drawn(tree)).not.toContain("second-cited"); expect(expanded(tree, "third-cited")).toBe(true);
});

test("fetched citation A disappears before B reads, including when B asks for the same ID", async () => {
  mockParams = { focusPageId: "cited" }; mockOverride = (query) => query.id ? { data: query.owner === "owner-a" ? pageRow("cited", "owner-a", ["private-a-tag"]) : null, error: null } : undefined;
  let tree = await settle(); expect(drawn(tree)).toContain("body cited"); expect(drawn(tree)).toContain("private-a-tag");
  noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch()); mockAuth.userId = "owner-b";
  expect(drawn(render())).not.toContain("body cited"); tree = await settle(); expect(drawn(tree)).not.toContain("private-a-tag"); expect(drawn(tree)).not.toContain("body cited");
  expect(drawn(tree)).toContain("recordDetail:state.missingTitle"); expect(expanded(tree, "owner-b-page")).toBe(false);
  expect(mockQueries.filter((query) => query.id).map((query) => query.owner)).toEqual(["owner-a", "owner-b"]);
});

test("publication hold and same-owner ABA retire the old citation result and retry", async () => {
  mockParams = { focusPageId: "cited" }; mockOverride = (query) => query.id ? { data: null, error: new Error("failed") } : undefined;
  const staleRetry = retry(await settle())!.props.onPress!; beginAccountOwnerTransition(null); await settle(); const calls = mockQueries.length; staleRetry(); await settle(); expect(mockQueries).toHaveLength(calls);
  noteResolvedOwner(null); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch()); mockOverride = () => undefined;
  let tree = await settle(); expect(expanded(tree, "cited")).toBe(true); const freshCalls = mockQueries.length; staleRetry(); tree = await settle(); expect(mockQueries).toHaveLength(freshCalls); expect(expanded(tree, "cited")).toBe(true);
});

test("blur/unmount cancel the focused read wait, and refocus retries a failed citation", async () => {
  const slow = deferred(); mockParams = { focusPageId: "cited" }; mockOverride = (query) => query.id ? slow.promise : undefined;
  await settle(); mockRouteFocused = false; await settle(); expect(jest.getTimerCount()).toBe(0);
  mockOverride = () => undefined; mockRouteFocused = true; let tree = await settle(); expect(expanded(tree, "cited")).toBe(true);
  slow.reject(new Error("old focus failure")); tree = await settle(); expect(retry(tree)).toBeUndefined();
  const last = deferred(); mockParams = { focusPageId: "unmounted" }; mockOverride = (query) => query.id ? last.promise : undefined; await settle(); mockHarness.unmount();
  last.resolve({ data: pageRow("unmounted"), error: null }); for (let i = 0; i < 25; i++) await Promise.resolve(); expect(mockHarness.dirty).toBe(false); expect(jest.getTimerCount()).toBe(0);
});
