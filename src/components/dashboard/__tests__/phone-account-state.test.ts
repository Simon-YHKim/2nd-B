import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import * as account from "@/lib/auth/account-epoch";
import * as memory from "@/lib/nav/view-memory";
import { hookHarness } from "@/lib/nav/__tests__/hook-harness";

type Position = { tab: string; boardPage: number; phoneApp: string | null; selectedNoticeId: string | null; screenStack: string[] };
type Probe = Position & { setTab: (value: string) => void; setBoardPage: (value: number) => void;
  setPhoneApp: (value: string | null) => void; setSelectedNoticeId: (value: string | null) => void; setScreenStack: (value: string[]) => void };
const initial: Position = { tab: "dashboard", boardPage: 1, phoneApp: null, selectedNoticeId: null, screenStack: [] };
const aPosition: Position = { tab: "tools", boardPage: 2, phoneApp: "notifications", selectedNoticeId: "a-notice", screenStack: ["/settings", "/account"] };
const bPosition: Position = { tab: "dashboard", boardPage: 2, phoneApp: null, selectedNoticeId: null, screenStack: ["/reading"] };
const key = "phone-position";

function switchOwner(owner: string | null) {
  account.noteResolvedOwner(owner);
  account.clearAccountTransition(account.currentAccountEpoch());
}

// Execute the real boundary and position hooks, as in phone-back-focus.test.ts.
// Native hosts and data-loading hooks are inert; no renderer, login or network.
function mount() {
  const source = ts.createSourceFile("DashboardPhone.tsx", readFileSync(join(__dirname, "../DashboardPhone.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = source.statements.filter(ts.isFunctionDeclaration);
  const outer = functions.find(fn => fn.name?.text === "DashboardPhone")!;
  const inner = functions.find(fn => fn.body?.getText(source).includes("const [resume]"))!;
  const prefix = inner.body!.statements.filter(statement => statement.pos < inner.body!.statements.find(statement => statement.getText(source).startsWith("const [recordQuery,"))!.pos);
  const returnProbe = "return {tab,boardPage,phoneApp,selectedNoticeId,screenStack,setTab,setBoardPage,setPhoneApp,setSelectedNoticeId,setScreenStack};";
  const body = prefix.map(statement => statement.getText(source)).join("\n");
  const childName = inner.name!.text;
  const code = ts.transpileModule(`function ${childName}({ownerId,isMinor}) { ${body}\n${returnProbe} }\n${inner === outer ? "" : outer.getText(source).replace(/^export /, "")}\nreturn {DashboardPhone, child: ${childName}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const parent = hookHarness();
  let child = hookHarness(); let active = child; let childKey: unknown = Symbol("unmounted");
  let noticeState = { hydrated: true, notices: [{ id: "a-notice" }] };
  let params: { app?: string; panel?: string } = {};
  const writes: Array<{ owner: string | null; value: Position }> = [];
  const bindings = {
    ...account,
    ...Object.fromEntries(Object.keys(parent.hooks).map(name => [name, (...args: unknown[]) => {
      const fn = active.hooks[name as keyof typeof active.hooks] as (...values: unknown[]) => unknown;
      return fn(...args);
    }])),
    React: { createElement: (_type: unknown, props: { key?: unknown; ownerId: string }) => props },
    useTranslation: () => ({ t: (value: string) => value, i18n: { language: "en" } }),
    useClockWeather: () => ({}), useLocalSearchParams: () => params,
    router: { canGoBack: () => false }, useNoticeCenter: () => noticeState,
    readViewMemory: memory.readViewMemory,
    writeViewMemory: (name: string, value: Position) => {
      writes.push({ owner: account.currentAccountOwner(), value: structuredClone(value) });
      memory.writeViewMemory(name, value);
    },
  };
  const compiled = new Function(...Object.keys(bindings), code)(...Object.values(bindings)) as {
    DashboardPhone: (props: { ownerId: string | null; isMinor: boolean }) => Probe | { key?: unknown; ownerId: string } | null;
    child: (props: { ownerId: string; isMinor: boolean }) => Probe;
  };
  const render = (ownerId: string | null): Probe | null => {
    active = parent;
    const result = parent.render(() => compiled.DashboardPhone({ ownerId, isMinor: false }));
    if (inner === outer) return result as Probe;
    if (!result) { child.unmount(); childKey = Symbol("unmounted"); return null; }
    const props = result as { key?: unknown; ownerId: string };
    if (props.key !== childKey) { child.unmount(); child = hookHarness(); childKey = props.key; }
    active = child;
    return child.render(() => compiled.child({ ownerId: props.ownerId, isMinor: false }));
  };
  return { render, writes, notices: (hydrated: boolean, ids: string[]) => { noticeState = { hydrated, notices: ids.map(id => ({ id })) }; },
    params: (value: typeof params) => { params = value; },
    unmount: () => { parent.unmount(); child.unmount(); } };
}

beforeEach(() => { account.__resetAccountEpochForTests(); memory.readViewMemory(key); switchOwner("a"); memory.readViewMemory(key); });

function navigate(m: ReturnType<typeof mount>) {
  const phone = m.render("a")!;
  phone.setTab(aPosition.tab); phone.setBoardPage(aPosition.boardPage); phone.setPhoneApp(aPosition.phoneApp);
  phone.setSelectedNoticeId(aPosition.selectedNoticeId); phone.setScreenStack(aPosition.screenStack);
  m.render("a");
  expect(memory.readViewMemory(key)).toEqual(aPosition);
}

test.each([false, true])("G5-01: mounted A -> B (signed-out gap: %s) never writes A's position for B", gap => {
  const m = mount(); navigate(m);
  if (gap) { switchOwner(null); expect(m.render(null)).toBeNull(); }
  switchOwner("b"); m.notices(true, ["b-notice"]); m.render("b");
  const bWrites = m.writes.filter(write => write.owner === "b");
  expect(bWrites.length).toBeGreaterThan(0);
  expect(bWrites.every(write => JSON.stringify(write.value) === JSON.stringify(initial))).toBe(true);
  expect(m.writes.filter(write => write.owner === null)).toEqual([]);
  expect(memory.readViewMemory(key)).toEqual(initial);
});

test("a new owner reads its current memory instead of inheriting the mounted phone", () => {
  const m = mount(); navigate(m); switchOwner("b");
  memory.writeViewMemory(key, bPosition); m.render("b");
  expect(m.writes.filter(write => write.owner === "b").map(write => write.value)).toEqual([bPosition]);
});

test("same owner re-renders and lowering/reopening the phone retain the position", () => {
  const m = mount(); navigate(m); m.render("a"); m.unmount();
  const reopened = mount(); reopened.render("a");
  expect(memory.readViewMemory(key)).toEqual(aPosition);
  expect(reopened.writes.map(write => write.value)).toEqual([aPosition]);
});

test("logout and return to A without an intermediate render starts a new session", () => {
  const m = mount(); navigate(m); switchOwner(null); switchOwner("a");
  m.render("a"); expect(memory.readViewMemory(key)).toEqual(initial);
});

test("a held or mismatched owner has no phone subtree and cannot write", () => {
  const m = mount(); navigate(m); const count = m.writes.length;
  account.beginAccountOwnerTransition("b");
  expect(m.render("a")).toBeNull();
  switchOwner("b"); expect(m.render("a")).toBeNull();
  expect(m.writes).toHaveLength(count);
});

test("notice selection waits for the current owner's data and drops a missing notice before persistence", () => {
  const m = mount(); memory.writeViewMemory(key, aPosition); m.notices(false, []);
  m.render("a"); expect(m.writes).toEqual([]);
  m.notices(true, ["different-notice"]); m.render("a");
  expect(m.writes.map(write => write.value.selectedNoticeId)).toEqual([null]);
});

test("a valid restored notice survives hydration; explicit app links still override memory", () => {
  memory.writeViewMemory(key, aPosition); const m = mount(); m.notices(false, []); m.render("a");
  m.notices(true, ["a-notice"]); m.render("a");
  expect(memory.readViewMemory(key)).toEqual(aPosition); m.unmount();
  const linked = mount(); linked.params({ app: "notifications" }); linked.render("a");
  expect(memory.readViewMemory(key)).toEqual({ ...initial, tab: "tools", phoneApp: "notifications" });
});
