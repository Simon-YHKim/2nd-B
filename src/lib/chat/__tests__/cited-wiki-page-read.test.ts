import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { ReactElement } from "react";
import { hookHarness } from "../../nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { formatSourceCitationLabel } from "../sources";

let mockHarness: ReturnType<typeof hookHarness>;
let mockFocused = true;
const mockReply = jest.fn();
const mockReads: Array<{ table: string; filters: Record<string, string> }> = [];
jest.mock("expo-router", () => ({ useFocusEffect: (effect: () => void | (() => void)) =>
  mockHarness.hooks.useEffect(() => mockFocused ? effect() : undefined, [effect, mockFocused]) }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from: (table: string) => {
  const filters: Record<string, string> = {};
  const query = { select: () => query, eq: (name: string, value: string) => { filters[name] = value; return query; },
    maybeSingle: () => { mockReads.push({ table, filters }); return mockReply(); } };
  return query; // No write/RPC/storage methods: a retry reaching one must fail.
} }) }));

type Product = typeof import("../use-cited-wiki-page");
type Read = ReturnType<Product["useCitedWikiPage"]>;
let product: Product;
let owner: string | null;
let pathname: string;
let persona: string;
let params: { fromNode?: string; mode?: string; panel?: string };
let conversation: { current: number };
const router = { push: jest.fn() };
const spies: jest.SpyInstance[] = [];
beforeAll(() => {
  const react = jest.requireActual<typeof import("react")>("react");
  for (const name of ["useState", "useRef", "useMemo", "useCallback", "useEffect", "useSyncExternalStore"] as const) {
    spies.push(jest.spyOn(react, name).mockImplementation(((...args: unknown[]) =>
      (mockHarness.hooks[name] as (...args: unknown[]) => unknown)(...args)) as never));
  }
  product = jest.requireActual<Product>("../use-cited-wiki-page");
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); });
beforeEach(() => {
  jest.useFakeTimers(); mockReply.mockReset(); router.push.mockReset(); mockReads.length = 0;
  __resetAccountEpochForTests(); noteResolvedOwner("owner-a");
  owner = "owner-a"; pathname = "/secondb"; persona = "secondb"; params = {}; conversation = { current: 0 };
  mockFocused = true; mockHarness = hookHarness(); mockReply.mockResolvedValue({ data: { id: "page-77" }, error: null });
});
afterEach(() => { mockHarness.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });

// Execute the screen's real hook inputs, navigation callback, handler, and drawer JSX.
const source = readFileSync(join(__dirname, "../../../app/secondb.tsx"), "utf8");
const ast = ts.createSourceFile("secondb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(match: (n: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if (!found && match(n)) found = n; else if (!found) n.forEachChild(visit); };
  visit(ast); if (!found) throw new Error("Missing product node"); return found;
}
function evaluate<T>(code: string, bindings: Record<string, unknown>): T {
  const js = ts.transpileModule(`const result = ${code};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn result;`)(...Object.values(bindings)) as T;
}
const declaration = (name: string) => (find((n) => ts.isVariableDeclaration(n) && n.name.getText(ast) === name) as ts.VariableDeclaration).initializer!.getText(ast);
const screenHook = declaration("citedWiki");
const screenTap = declaration("openCitedPage");
const drawerJsx = find((n) => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === "ScreenModal" && n.openingElement.getText(ast).includes("refDrawer")).getText(ast);
const render = () => mockHarness.render(() => evaluate<Read>(screenHook, {
  useCitedWikiPage: product.useCitedWikiPage, userId: owner, conversationId: conversation,
  rev2Persona: persona, chatMode: "convergent", pathname, params, router,
}));
async function settle() { let read = render(); for (let i = 0; i < 14; i++) { await Promise.resolve(); read = render(); } return read; }
const sourceChip = find((n) => ts.isArrowFunction(n) && n.body.getText(ast) === "citedWiki.openDrawer(turn.chips ?? [])").getText(ast);
async function open(slugs = ["walks-in-may"]) {
  evaluate<() => void>(sourceChip, { citedWiki: render(), turn: { chips: slugs } })(); return settle();
}
const tap = (read: Read, slug = "walks-in-may") => evaluate<(s: string) => void>(screenTap, { citedWiki: read })(slug);
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
type Node = ReactElement<{ children?: unknown; accessibilityLabel?: string; onPress?: () => void; onRequestClose?: () => void; visible?: boolean }>;
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object" || !("props" in value)) return []; const n = value as Node; return [n, ...nodes(n.props.children)]; }
function drawer(read: Read) {
  return evaluate<Node>(drawerJsx, {
    React: jest.requireActual("react"), citedWiki: read, refDrawer: evaluate(declaration("refDrawer"), { citedWiki: read }), openCitedPage: (slug: string) => tap(read, slug),
    ScreenModal: "ScreenModal", Pressable: "Pressable", View: "View", Text: "Text", ScrollView: "ScrollView", PixelScrim: "PixelScrim",
    StyleSheet: { absoluteFill: {} }, ds: {}, t: (key: string) => key, formatSourceCitationLabel,
  });
}
const text = (read: Read) => nodes(drawer(read)).filter((n) => n.type === "Text").map((n) => n.props.children);
const retryButton = (read: Read) => nodes(drawer(read)).find((n) => n.props.accessibilityLabel === "common:actions.retry");

test("a real drawer tap resolves the owned slug and closes only on exact-page navigation", async () => {
  const waiting = deferred<unknown>(); mockReply.mockReturnValueOnce(waiting.promise);
  let read = await open(); const tree = drawer(read);
  nodes(tree).find((n) => n.props.accessibilityLabel === "Walks In May")!.props.onPress!(); read = await settle();
  expect(drawer(read).props.visible).toBe(true); expect(text(read)).toContain("..."); expect(router.push).not.toHaveBeenCalled();
  expect(mockReads).toEqual([{ table: "wiki_pages", filters: { user_id: "owner-a", slug: "walks-in-may" } }]);
  waiting.resolve({ data: { id: "page-77" }, error: null }); read = await settle();
  expect(read.slugs).toBeNull(); expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({ pathname: "/wiki", params: { focusPageId: "page-77" } });
  expect(jest.getTimerCount()).toBe(0);
});

test("query error stays in the drawer and the shipping retry repeats only that read", async () => {
  mockReply.mockResolvedValueOnce({ data: null, error: new Error("server unavailable") });
  tap(await open()); let read = await settle();
  expect(read.status).toBe("error"); expect(text(read)).toContain("common:errors.unknown");
  expect(drawer(read).props.visible).toBe(true); expect(router.push).not.toHaveBeenCalled();
  retryButton(read)!.props.onPress!(); read = await settle();
  expect(read.slugs).toBeNull(); expect(mockReads).toHaveLength(2); expect(mockReads[1]).toEqual(mockReads[0]);
  expect(router.push).toHaveBeenCalledTimes(1);
});

test("successful missing is explicit and never a query error or generic list redirect", async () => {
  mockReply.mockResolvedValue({ data: null, error: null }); tap(await open()); const read = await settle();
  expect(read.status).toBe("missing"); expect(text(read)).toContain("recordDetail:state.missingTitle");
  expect(retryButton(read)).toBeUndefined(); expect(router.push).not.toHaveBeenCalled(); expect(read.slugs).toEqual(["walks-in-may"]);
});

test.each(["resolve", "reject"] as const)("10s timeout can retry and ignores the old late %s", async (completion) => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open());
  expect((await settle()).status).toBe("loading"); jest.advanceTimersByTime(9_999); expect((await settle()).status).toBe("loading");
  jest.advanceTimersByTime(1); let read = await settle(); expect(read.status).toBe("timeout"); expect(text(read)).toContain("common:errors.network");
  expect(router.push).not.toHaveBeenCalled(); retryButton(read)!.props.onPress!(); await settle();
  if (completion === "resolve") old.resolve({ data: { id: "late-page" }, error: null }); else old.reject(new Error("late"));
  read = await settle(); expect(read.slugs).toBeNull(); expect(router.push.mock.calls).toEqual([[{ pathname: "/wiki", params: { focusPageId: "page-77" } }]]);
  expect(jest.getTimerCount()).toBe(0);
});

test("new target wins, including an A→B→A slug sequence", async () => {
  const oldA = deferred<unknown>(); const b = deferred<unknown>();
  mockReply.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(b.promise);
  tap(await open(["walks-in-may", "other"])); tap(await settle(), "other"); tap(await settle()); await settle();
  b.resolve({ data: { id: "page-b" }, error: null }); oldA.resolve({ data: { id: "old-a" }, error: null }); await settle();
  expect(mockReads).toHaveLength(3); expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({ pathname: "/wiki", params: { focusPageId: "page-77" } });
});

test("held retry cannot replace a newer attempt, even for the same slug", async () => {
  mockReply.mockRejectedValueOnce(new Error("offline")); tap(await open()); const failed = await settle();
  const next = deferred<unknown>(); mockReply.mockReturnValueOnce(next.promise); failed.retry(); let read = await settle();
  failed.retry(); read = await settle(); expect(mockReads).toHaveLength(2); expect(read.status).toBe("loading");
  next.resolve({ data: null, error: null }); expect((await settle()).status).toBe("missing");
});

test.each(["onRequestClose", "closeButton", "backdrop"])("%s cancels synchronously and a reopened drawer does not inherit the old request", async (kind) => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  const tree = drawer(waiting);
  if (kind === "onRequestClose") tree.props.onRequestClose!();
  else nodes(tree).find((n) => n.props.accessibilityLabel === (kind === "closeButton" ? "closeChip" : "closeReferenced"))!.props.onPress!();
  waiting.retry(); old.resolve({ data: { id: "old" }, error: null });
  expect((await settle()).slugs).toBeNull(); expect(router.push).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  const reopened = await open(); tap(waiting); await settle(); expect(mockReads).toHaveLength(1);
  tap(reopened); await settle(); expect(router.push).toHaveBeenCalledTimes(1);
});

test("opening another answer invalidates the old target even when both cite the same slug", async () => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  waiting.openDrawer(["walks-in-may"]); old.resolve({ data: { id: "old" }, error: null }); const next = await settle();
  expect(next.status).toBe("idle"); expect(router.push).not.toHaveBeenCalled(); tap(next); await settle(); expect(router.push).toHaveBeenCalledTimes(1);
});

test.each(["owner-b", null])("an owner transition to %s blocks results and held callbacks before publication", async (nextOwner) => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  beginAccountOwnerTransition(nextOwner); tap(waiting); waiting.openDrawer(["other"]); waiting.retry();
  old.resolve({ data: { id: "private-a" }, error: null }); expect((await settle()).slugs).toBeNull(); expect(router.push).not.toHaveBeenCalled();
  expect(mockReads).toHaveLength(1); expect(jest.getTimerCount()).toBe(0);
  owner = nextOwner; noteResolvedOwner(nextOwner); clearAccountTransition(currentAccountEpoch()); await settle();
  expect(render().slugs).toBeNull();
});

test("account ABA never revives an old drawer or held retry", async () => {
  mockReply.mockRejectedValueOnce(new Error("offline")); tap(await open()); const failed = await settle();
  beginAccountOwnerTransition(null); noteResolvedOwner(null); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  await settle(); failed.retry(); failed.openDrawer(["walks-in-may"]); expect((await settle()).slugs).toBeNull(); expect(mockReads).toHaveLength(1);
  tap(await open()); await settle(); expect(router.push).toHaveBeenCalledTimes(1);
});

test("an owner hold before the queued read starts issues no query", async () => {
  tap(await open()); beginAccountOwnerTransition(null); await settle(); expect(mockReads).toHaveLength(0); expect(router.push).not.toHaveBeenCalled();
});

test.each(["conversation", "mode", "pathname", "fromNode", "panel", "routeMode"])("%s replacement invalidates the drawer and old navigation", async (change) => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  if (change === "conversation") conversation.current += 1;
  if (change === "mode") persona = "twi";
  if (change === "pathname") pathname = "/settings";
  if (change === "fromNode") params = { fromNode: "career" };
  if (change === "panel") params = { panel: "dashboard" };
  if (change === "routeMode") params = { mode: "divergent" };
  expect(render().slugs).toBeNull(); tap(waiting); old.resolve({ data: { id: "old" }, error: null }); await settle();
  expect(router.push).not.toHaveBeenCalled(); expect(mockReads).toHaveLength(1); expect(jest.getTimerCount()).toBe(0);
});

test("the shipping clear handler cancels before its actual conversation identity changes", async () => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  const clear = find((n) => ts.isArrowFunction(n) && n.body.getText(ast).includes("conversationId.current += 1")).getText(ast);
  const stop = jest.fn(); evaluate<() => void>(clear, {
    sending: false, keeping: null, keepInFlight: { current: false }, chatPlans: { busy: false }, autosaveSessionRef: { current: { stop } },
    sendLock: { current: { busy: () => false } }, liveTurnRef: { current: null },
    conversationId: conversation, citedWiki: waiting, setTurns: jest.fn(), setKeptIdx: jest.fn(), setKeepNotice: jest.fn(), setCopyNotice: jest.fn(),
  })();
  expect(conversation.current).toBe(1); old.resolve({ data: { id: "old" }, error: null }); await settle(); expect(router.push).not.toHaveBeenCalled();
});

test("a real conversation clear fences completion before React publishes another render", async () => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); await settle();
  conversation.current += 1;
  old.resolve({ data: { id: "old" }, error: null });
  for (let i = 0; i < 14; i++) await Promise.resolve();
  expect(router.push).not.toHaveBeenCalled(); expect((await settle()).slugs).toBeNull();
});

test("the shipping mode selector cancels before committing its mode state", async () => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  const select = find((n) => ts.isFunctionDeclaration(n) && n.name?.text === "selectRev2Persona").getText(ast);
  evaluate<(id: string) => void>(`(${select})`, { citedWiki: waiting, setRev2Persona: (id: string) => { persona = id; }, setChatMode: jest.fn(), rev2PersonaMode: () => "divergent" })("twi");
  old.resolve({ data: { id: "old" }, error: null }); await settle(); expect(router.push).not.toHaveBeenCalled();
});

test("blur cancels while mounted; returning does not resume the navigation", async () => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  mockFocused = false; render(); old.resolve({ data: { id: "old" }, error: null }); await settle(); tap(waiting);
  mockFocused = true; expect((await settle()).slugs).toBeNull(); expect(router.push).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  tap(await open()); await settle(); expect(router.push).toHaveBeenCalledTimes(1);
});

test("phone route unmount cancels timers and blocks late success and held controls", async () => {
  const old = deferred<unknown>(); mockReply.mockReturnValueOnce(old.promise); tap(await open()); const waiting = await settle();
  mockHarness.unmount(); tap(waiting); waiting.retry(); waiting.openDrawer(["other"]); old.resolve({ data: { id: "old" }, error: null });
  for (let i = 0; i < 14; i++) await Promise.resolve();
  expect(mockHarness.dirty).toBe(false); expect(mockReads).toHaveLength(1); expect(router.push).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});

test("signed-out controls never look up or navigate", async () => {
  noteResolvedOwner(null); owner = null; render().openDrawer(["walks-in-may"]); tap(await settle());
  expect(mockReads).toHaveLength(0); expect(router.push).not.toHaveBeenCalled();
});
