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

function mount(list = false, horizontal = false) {
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
  const scrollTo = jest.fn(); const scrollToOffset = jest.fn();
  const host = { scrollTo, scrollToOffset } as unknown as ScrollView;
  let hook: ReturnType<typeof useScrollMemory<ScrollView>>;
  const render = () => {
    hook = h.render(() => exports.useScrollMemory<ScrollView>({ testID: "list", horizontal }, null, list));
    hook.ref(host);
    return hook;
  };
  render();
  hook!.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } } as Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]);
  const flush = () => {
    const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); jest.runOnlyPendingTimers();
  };
  const layout = () => { hook.onContentSizeChange(1600, 2000); flush(); };
  return { render, scope, writes, scrollTo, scrollToOffset, flush, layout,
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
