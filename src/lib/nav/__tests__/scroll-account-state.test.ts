import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { ScrollView, ScrollViewProps } from "react-native";
import type { useScrollMemory } from "../scroll-memory";
import * as account from "../../auth/account-epoch";
import * as memory from "../view-memory";
import { hookHarness } from "./hook-harness";

const key = "scroll:phone:ops:list";
const scrollEvent = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } }) as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0];
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
function switchOwner(owner: string | null) {
  account.noteResolvedOwner(owner); account.clearAccountTransition(account.currentAccountEpoch());
}
beforeEach(() => {
  jest.useFakeTimers(); frames = new Map(); nextFrame = 0;
  global.requestAnimationFrame = fn => { frames.set(++nextFrame, fn); return nextFrame; };
  global.cancelAnimationFrame = id => { if (typeof id === "number") frames.delete(id); };
  account.__resetAccountEpochForTests(); memory.readViewMemory(key); switchOwner("a"); memory.readViewMemory(key);
});
afterEach(() => jest.useRealTimers());

type NativeHost = { type: string; key?: number; props: ReturnType<typeof useScrollMemory<ScrollView>> };
const components = [
  ["navigation/RememberedScroll.tsx", "RememberedScrollView", "ScrollView"],
  ["navigation/RememberedScroll.tsx", "RememberedFlatList", "FlatList"],
  ["phone/PhoneUIKit.tsx", "PhoneScrollView", "ScrollView"],
  ["phone/PhoneUIKit.tsx", "PhoneFlatList", "FlatList"],
] as const;

// Execute the actual wrapper declarations and hook, without an RN renderer or
// importing unrelated phone styling modules. Capture the native element's key.
function componentContract(file: string, name: string, hook: typeof useScrollMemory, phone: boolean) {
  const source = ts.createSourceFile(file, readFileSync(join(__dirname, "../../../components", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = source.statements.filter(statement =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === `${name}Inner`
    || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === name));
  const code = ts.transpileModule(declarations.map(statement => statement.getText(source)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const bindings = {
    forwardRef: (fn: unknown) => fn, useScrollMemory: hook, usePhoneDesign: () => phone, mapped: (style: unknown) => style,
    ScrollView: "ScrollView", FlatList: "FlatList",
    React: { createElement: (type: string, props: NativeHost["props"] & { key?: number }) => ({ type, props, key: props.key }) },
  };
  const exports: Record<string, (props: ScrollViewProps, ref: null) => NativeHost> = {};
  new Function("exports", ...Object.keys(bindings), code)(exports, ...Object.values(bindings));
  return exports[name];
}

function mount(list = false, horizontal = false, component?: readonly [string, string], phone = false) {
  const scope = { id: "phone:ops", slots: { next: 0 }, focused: true };
  const h = hookHarness(scope);
  const writes: Array<{ owner: string | null; key: string; value: memory.ScrollPosition }> = [];
  const modules: Record<string, unknown> = {
    react: h.hooks, "../auth/account-epoch": account,
    "./view-memory": { ...memory, writeViewMemory: (name: string, value: memory.ScrollPosition) => {
      writes.push({ owner: account.currentAccountOwner(), key: name, value: { ...value } });
      memory.writeViewMemory(name, value);
    } },
  };
  const code = ts.transpileModule(readFileSync(join(__dirname, "../scroll-memory.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {} as { useScrollMemory: typeof useScrollMemory };
  new Function("require", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  }, exports);
  const wrapper = component && componentContract(component[0], component[1], exports.useScrollMemory, phone);
  const scrollTo = jest.fn(); const scrollToOffset = jest.fn();
  const host = { scrollTo, scrollToOffset } as unknown as ScrollView;
  let element: NativeHost | undefined;
  let hook: ReturnType<typeof useScrollMemory<ScrollView>>;
  const render = () => {
    const props = { testID: "list", horizontal };
    if (wrapper) { element = h.render(() => wrapper(props, null)); hook = element.props; }
    else hook = h.render(() => exports.useScrollMemory<ScrollView>(props, null, list));
    hook.ref(host);
    return hook;
  };
  render();
  const viewLayout = () => hook.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } } as Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]);
  viewLayout();
  const flush = () => {
    const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); jest.runOnlyPendingTimers();
  };
  const layout = () => { viewLayout(); hook.onContentSizeChange(1600, 2000); flush(); };
  return { render, scope, writes, scrollTo, scrollToOffset, flush, layout, viewLayout,
    get element() { return element; },
    get hook() { return hook; }, get dirty() { return h.dirty; }, unmount: h.unmount };
}

test.each([false, true])("G5-02: mounted A -> B (signed-out gap: %s) resets offset and never writes A for B", gap => {
  memory.writeViewMemory(key, { x: 0, y: 640 }); const m = mount(); m.layout();
  m.hook.onScroll(scrollEvent(900)); const old = m.hook;
  if (gap) { switchOwner(null); m.render(); }
  switchOwner("b"); m.render();
  // A retained native host can report its old offset before the zero restoration.
  m.hook.onScroll(scrollEvent(900)); old.onScroll(scrollEvent(901));
  m.layout();
  const displayedY = (m.scrollTo.mock.calls.at(-1)![0] as memory.ScrollPosition).y;
  m.hook.onScroll(scrollEvent(displayedY)); m.hook.onScroll(scrollEvent(80));
  expect(m.writes.filter(write => write.owner === "b").map(write => write.value.y)).toEqual([0, 80]);
  expect(m.hook.contentOffset).toEqual({ x: 0, y: 0 });
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: false });
  expect(m.writes.filter(write => write.owner === null)).toEqual([]);
  expect(memory.readViewMemory(key)).toEqual({ x: 0, y: 80 });
});

test.each(components)("AS-01: %s %s keys the %s host by epoch", (file, name, type) => {
  for (const phone of [false, true]) {
    const m = mount(type === "FlatList", false, [file, name], phone); m.layout();
    m.hook.onScroll(scrollEvent(900));
    const initialKey = m.element!.key;
    expect(initialKey).toBe(account.currentAccountEpoch()); expect(m.element!.type).toBe(type);
    m.render(); expect(m.element!.key).toBe(initialKey);
    m.scope.focused = false; m.render(); m.scope.focused = true; m.render();
    expect(m.element!.key).toBe(initialKey);
    account.beginAccountOwnerTransition("a"); m.render(); expect(m.element!.key).toBe(initialKey);
    // Publishing B advances the epoch; releasing its hold only changes pending.
    account.noteResolvedOwner("next"); m.render();
    expect(m.element!.key).not.toBe(initialKey); expect(m.element!.key).toBe(account.currentAccountEpoch());
    const nextKey = m.element!.key;
    account.clearAccountTransition(account.currentAccountEpoch()); m.render();
    expect(m.element!.key).toBe(nextKey);
    expect(m.hook.contentOffset).toEqual({ x: 0, y: 0 });
    m.hook.onScrollBeginDrag(scrollEvent(900)); m.hook.onScroll(scrollEvent(900));
    expect(m.writes.filter(write => write.owner === "next")).toEqual([]);
    m.layout(); m.hook.onScrollBeginDrag(scrollEvent(0)); m.hook.onScroll(scrollEvent(80));
    expect(m.writes.filter(write => write.owner === "next").map(write => write.value.y)).toEqual([80]);
    m.unmount();
    const reopened = mount(type === "FlatList", false, [file, name], phone);
    expect(reopened.element!.key).toBe(nextKey); expect(reopened.hook.contentOffset).toEqual({ x: 0, y: 80 });
    switchOwner(null); switchOwner("next"); reopened.render();
    expect(reopened.element!.key).not.toBe(nextKey);
    reopened.unmount(); switchOwner("a");
  }
});

test("AS-01: B must measure its own host before restoration or drag, even after A's late layout", () => {
  const m = mount(); m.layout(); const old = m.hook;
  switchOwner("b"); m.render(); m.scrollTo.mockClear();
  old.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } } as Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]);
  m.hook.onContentSizeChange(1600, 2000); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled();
  m.hook.onScrollBeginDrag(scrollEvent(900)); m.hook.onScroll(scrollEvent(900));
  expect(m.writes.filter(write => write.owner === "b")).toEqual([]);
  m.layout();
  m.hook.onScrollBeginDrag(scrollEvent(0)); m.hook.onScroll(scrollEvent(80));
  expect(memory.readViewMemory(key)).toEqual({ x: 0, y: 80 });
});

test.each([false, true])("AS-01: same-owner dragging during restoration still cancels it (list: %s)", list => {
  memory.writeViewMemory(key, { x: 0, y: 640 }); const m = mount(list);
  m.hook.onContentSizeChange(1600, 2000);
  m.hook.onScrollBeginDrag(scrollEvent(20)); m.hook.onScroll(scrollEvent(80)); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled(); expect(m.scrollToOffset).not.toHaveBeenCalled();
  expect(memory.readViewMemory(key)).toEqual({ x: 0, y: 80 });
});

test.each([false, true])("AS-01: new handler rejects drag then scroll before B layout (list: %s)", list => {
  const m = mount(list); m.layout(); m.hook.onScroll(scrollEvent(900));
  const old = m.hook;
  switchOwner("b"); m.render();
  m.hook.onScrollBeginDrag(scrollEvent(900)); m.hook.onScroll(scrollEvent(900));
  expect(m.writes.filter(write => write.owner === "b")).toEqual([]);
  m.layout();
  old.onScrollBeginDrag(scrollEvent(900)); old.onScroll(scrollEvent(900));
  m.hook.onScrollBeginDrag(scrollEvent(0)); m.hook.onScroll(scrollEvent(80));
  expect(m.writes.filter(write => write.owner === "b").map(write => write.value.y)).toEqual([80]);
});

test("an owner transition notifies the hook even if its props have not changed", () => {
  const m = mount(); expect(m.dirty).toBe(false);
  account.beginAccountOwnerTransition("b"); expect(m.dirty).toBe(true);
});

test("old native events cannot write while the hook is waiting for its account re-render", () => {
  const m = mount(); m.layout(); m.hook.onScroll(scrollEvent(600));
  switchOwner("b"); m.hook.onScroll(scrollEvent(600));
  expect(m.writes.filter(write => write.owner === "b")).toEqual([]);
});

test("logout and return to the same owner refreshes both the lease and saved copy", () => {
  const m = mount(); m.layout(); m.hook.onScroll(scrollEvent(700));
  switchOwner(null); switchOwner("a"); m.render(); m.layout();
  expect(m.hook.contentOffset).toEqual({ x: 0, y: 0 });
  m.hook.onScroll(scrollEvent(40)); expect(memory.readViewMemory(key)).toEqual({ x: 0, y: 40 });
});

test.each(["frame", "settle"])("a stale %s callback cannot restore A after B is published", stage => {
  memory.writeViewMemory(key, { x: 0, y: 640 }); const m = mount();
  m.hook.onContentSizeChange(320, 2000);
  const oldFrameIds = [...frames.keys()];
  const oldFrames = [...frames.values()];
  if (stage === "settle") { frames.clear(); oldFrames.forEach(fn => fn(0)); }
  const old = m.hook;
  switchOwner("b"); m.render(); m.scrollTo.mockClear();
  if (stage === "frame") expect(oldFrameIds.some(id => frames.has(id))).toBe(false);
  if (stage === "settle") expect(jest.getTimerCount()).toBe(0);
  oldFrames.forEach(fn => fn(0)); jest.runOnlyPendingTimers(); old.onScroll(scrollEvent(640));
  expect(m.scrollTo).not.toHaveBeenCalledWith({ x: 0, y: 640, animated: false });
  expect(m.writes.filter(write => write.owner === "b")).toEqual([]);
});

test("a different screen with no memory uses zero, and Back restores this owner's earlier screen", () => {
  const m = mount(); m.layout(); m.hook.onScroll(scrollEvent(800));
  m.scope.id = "phone:reading"; m.render(); m.layout();
  expect(m.hook.contentOffset).toEqual({ x: 0, y: 0 });
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: false });
  m.hook.onScroll(scrollEvent(150)); m.scope.id = "phone:ops"; m.render(); m.layout();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 800, animated: false });
});

test("unfocused account changes do not scroll until return, and missing memory never revives an old copy", () => {
  const m = mount(); m.layout(); m.hook.onScroll(scrollEvent(800));
  m.scope.focused = false; m.render(); switchOwner("b"); m.render(); m.scrollTo.mockClear(); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled();
  m.scope.focused = true; m.render(); m.layout();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: false });
});

test("same-owner hide/show and remount preserve a numeric saved offset", () => {
  const m = mount(); m.layout(); m.hook.onScroll(scrollEvent(813));
  m.scope.focused = false; m.render(); m.scope.focused = true; m.render(); m.layout();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 813, animated: false });
  m.unmount(); const reopened = mount(); reopened.layout();
  expect(reopened.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 813, animated: false });
});

test("an evicted entry restores zero instead of falling back to the hook's old copy", () => {
  const m = mount(); m.layout(); m.hook.onScroll(scrollEvent(813));
  m.scope.focused = false; m.render();
  for (let i = 0; i < 260; i++) memory.writeViewMemory(`other:${i}`, { x: 0, y: 1 });
  expect(memory.readViewMemory(key)).toBeUndefined();
  m.scope.focused = true; m.render(); m.layout();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: false });
});

test("horizontal lists load the new owner's memory and dragging takes control", () => {
  const m = mount(true, true); m.layout(); switchOwner("b");
  memory.writeViewMemory(key, { x: 350, y: 0 }); m.render(); m.layout();
  expect(m.scrollToOffset).toHaveBeenLastCalledWith({ offset: 350, animated: false });
  m.hook.onScrollBeginDrag(scrollEvent(0));
  m.hook.onScroll({ nativeEvent: { contentOffset: { x: 90, y: 0 } } } as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]);
  expect(memory.readViewMemory(key)).toEqual({ x: 90, y: 0 });
});
