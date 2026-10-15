import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { ScrollView, ScrollViewProps } from "react-native";
import type { ScrollRevealRequest, useScrollMemory } from "../scroll-memory";
import * as account from "../../auth/account-epoch";
import * as viewMemory from "../view-memory";
import { hookHarness } from "./hook-harness";
const { readViewMemory, writeViewMemory } = viewMemory;
const { __resetAccountEpochForTests, noteResolvedOwner, beginAccountOwnerTransition } = account;
const key = "scroll:phone:ops:list";
let frames: Map<number, FrameRequestCallback>, allFrames: FrameRequestCallback[], frameId: number;
beforeEach(() => {
  jest.useFakeTimers(); frames = new Map(); allFrames = []; frameId = 0;
  __resetAccountEpochForTests(); readViewMemory(key); noteResolvedOwner("qa-scroll"); readViewMemory(key);
  global.requestAnimationFrame = fn => { frames.set(++frameId, fn); allFrames.push(fn); return frameId; };
  global.cancelAnimationFrame = id => { if (id != null) frames.delete(id); };
});
afterEach(() => jest.useRealTimers());
const layoutEvent = () => ({ nativeEvent: { layout: { width: 320, height: 500 } } }) as Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0];
const scrollEvent = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } }) as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0];
function ScrollHarness(initial?: ScrollRevealRequest, focused = true, scoped = true) {
  const scope = { id: "phone:ops", slots: { next: 0 }, focused };
  const h = hookHarness(scoped ? scope : null);
  const modules: Record<string, unknown> = { react: h.hooks, "../auth/account-epoch": account, "./view-memory": viewMemory };
  const code = ts.transpileModule(readFileSync(join(__dirname, "../scroll-memory.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {} as { useScrollMemory: typeof useScrollMemory };
  new Function("require", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected hook import: ${name}`);
    return modules[name];
  }, exports);
  const scrollTo = jest.fn(), originalScroll = jest.fn(), originalDrag = jest.fn(), forwarded = jest.fn();
  let node = { scrollTo } as unknown as ScrollView;
  let request = initial;
  let hook!: ReturnType<typeof useScrollMemory<ScrollView>>;
  const render = (next = request) => {
    request = next;
    hook = h.render(() => exports.useScrollMemory<ScrollView>({ testID: "list", onScroll: originalScroll,
      onScrollBeginDrag: originalDrag }, forwarded, false, request));
    hook.ref(node);
    return hook;
  };
  render(); hook.onLayout(layoutEvent());
  const flushFrames = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); };
  const flush = () => { flushFrames(); jest.runOnlyPendingTimers(); };
  return { get hook() { return hook; }, scope, scrollTo, originalScroll, originalDrag, forwarded, render, flushFrames, flush,
    scroll: (y: number) => hook.onScroll(scrollEvent(y)), cleanups: [h.unmount],
    replaceHost: () => { hook.ref(null); node = { scrollTo: jest.fn() } as unknown as ScrollView; hook.ref(node); render(); return node; },
    remove: () => { request = undefined; render(); },
  };
}
function request(ready = true, isCurrent = () => true): ScrollRevealRequest & { onRevealed: jest.Mock } {
  return { token: {}, target: { x: 0, y: 0 }, ready, isCurrent, onRevealed: jest.fn() };
}
test("the current host detaches its forwarded callback after layout cleanup", () => {
  const m = ScrollHarness();
  m.cleanups.forEach(cleanup => cleanup());
  m.hook.ref(null);
  expect(m.forwarded).toHaveBeenLastCalledWith(null);
});
test("back waits through the loading skeleton, then restores the saved offset and continues recording", () => {
  writeViewMemory(key, { x: 0, y: 640 });
  const m = ScrollHarness(); m.hook.onContentSizeChange(320, 200); m.flush(); m.scroll(0);
  expect(readViewMemory(key)).toEqual({ x: 0, y: 640 });
  m.hook.onContentSizeChange(320, 1600); m.flush();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 640, animated: false });
  m.scroll(900); expect(readViewMemory(key)).toEqual({ x: 0, y: 900 });
  expect(m.originalScroll).toHaveBeenCalledTimes(2); expect(m.forwarded).toHaveBeenCalled();
  m.cleanups.forEach((cleanup) => cleanup?.()); m.scroll(0);
  expect(readViewMemory(key)).toEqual({ x: 0, y: 900 });
});
test("a user drag cancels restoration and an account transition rejects late scroll events", () => {
  writeViewMemory(key, { x: 0, y: 640 }); const m = ScrollHarness();
  m.hook.onScrollBeginDrag({} as Parameters<NonNullable<ScrollViewProps["onScrollBeginDrag"]>>[0]);
  m.scroll(80); expect(readViewMemory(key)).toEqual({ x: 0, y: 80 });
  beginAccountOwnerTransition("other"); m.scroll(420);
  expect(readViewMemory(key)).toBeUndefined();
});


test("web event getters cannot reset the saved position when the old DOM is removed", () => {
  const m = ScrollHarness(); let liveTop = 687;
  m.hook.onContentSizeChange(320, 1600); m.flush();
  m.hook.onScroll({ nativeEvent: { contentOffset: { x: 0, get y() { return liveTop; } } } } as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]);
  liveTop = 0;
  expect(readViewMemory(key)).toEqual({ x: 0, y: 687 });
});


test.each(["frame", "settle"])("priority reveal survives the previously pending %s restoration (R1)", stage => {
  writeViewMemory(key, { x: 0, y: 640 }); const m = ScrollHarness();
  m.hook.onContentSizeChange(320, 1600);
  const stale = allFrames.slice();
  if (stage === "settle") m.flushFrames();
  const r = request(); m.render(r);
  stale.forEach(fn => fn(0)); m.flush();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 0, animated: false });
  expect(m.scrollTo.mock.calls.filter(([v]) => v.y === 0)).toHaveLength(1);
  expect(r.onRevealed).toHaveBeenCalledTimes(1);
  expect(readViewMemory(key)).toEqual({ x: 0, y: 0 });
});

test.each(["ready-first", "focus-first"])("hidden acceptance waits for visible layout and ready: %s", order => {
  writeViewMemory(key, { x: 0, y: 640 }); const r = request(false); const m = ScrollHarness(r, false);
  m.hook.onContentSizeChange(320, 1600); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled(); expect(r.onRevealed).not.toHaveBeenCalled();
  if (order === "ready-first") m.render({ ...r, ready: true });
  m.scope.focused = true; m.render(); m.hook.onLayout(layoutEvent()); m.hook.onContentSizeChange(320, 1600);
  if (order === "focus-first") {
    expect(r.onRevealed).not.toHaveBeenCalled();
    m.render({ ...r, ready: true });
  }
  m.flush(); expect(m.scrollTo.mock.calls).toEqual([[{ x: 0, y: 0, animated: false }]]);
  expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test("reveal consumes once; size changes and ordinary ready rerenders cannot rearm restoration", () => {
  writeViewMemory(key, { x: 0, y: 640 }); const r = request(); const m = ScrollHarness(r);
  m.hook.onContentSizeChange(320, 1600); m.flush();
  m.render({ ...r }); m.hook.onLayout(layoutEvent()); m.hook.onContentSizeChange(320, 2400); m.flush();
  expect(m.scrollTo).toHaveBeenCalledTimes(1); expect(r.onRevealed).toHaveBeenCalledTimes(1);
  m.scroll(900); expect(readViewMemory(key)).toEqual({ x: 0, y: 900 });
  m.scope.focused = false; m.render(); m.scope.focused = true; m.render(); m.flush();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 900, animated: false });
  expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test("ready=false blocks synthetic events and content changes without a guessed timeout", () => {
  writeViewMemory(key, { x: 0, y: 640 }); const r = request(false); const m = ScrollHarness(r);
  m.hook.onContentSizeChange(320, 1600); m.scroll(0); jest.advanceTimersByTime(10000); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled(); expect(r.onRevealed).not.toHaveBeenCalled();
  expect(readViewMemory(key)).toEqual({ x: 0, y: 640 });
  m.render({ ...r, ready: true }); expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test.each(["owner", "hold", "ABA", "instance", "unmount"])("a pending reveal loses its authority on %s", change => {
  writeViewMemory(key, { x: 0, y: 640 });
  const originalOwner = account.captureAccountOwnerLease("qa-scroll")!;
  let valid = true; const r = request(false, () => valid && originalOwner.isCurrent()); const m = ScrollHarness(r);
  m.hook.onContentSizeChange(320, 1600); const old = m.hook;
  if (change === "owner") { noteResolvedOwner("B"); account.clearAccountTransition(account.currentAccountEpoch()); }
  if (change === "hold") beginAccountOwnerTransition("B");
  if (change === "ABA") { noteResolvedOwner(null); noteResolvedOwner("qa-scroll"); }
  if (change === "instance") valid = false;
  if (change === "unmount") m.cleanups.forEach(fn => fn());
  else m.render({ ...r, ready: true });
  old.onLayout(layoutEvent()); old.onContentSizeChange(320, 1600); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalledWith({ x: 0, y: 0, animated: false });
  expect(r.onRevealed).not.toHaveBeenCalled();
});

test("removed/replaced tokens and old callbacks cannot reveal or acknowledge the old delivery", () => {
  let valid = true; const a = request(false, () => valid); const b = request(); const m = ScrollHarness(a);
  m.hook.onContentSizeChange(320, 1600); const old = m.hook;
  valid = false; m.render(b); old.onLayout(layoutEvent()); old.onContentSizeChange(320, 1800); m.flush();
  expect(a.onRevealed).not.toHaveBeenCalled(); expect(b.onRevealed).toHaveBeenCalledTimes(1);
  expect(m.scrollTo.mock.calls.filter(([v]) => v.y === 0)).toHaveLength(1);
  m.remove(); m.flush(); expect(b.onRevealed).toHaveBeenCalledTimes(1);
});

test("dismissed pending reveal resumes normal saved-position restoration", () => {
  writeViewMemory(key, { x: 0, y: 640 }); const r = request(false); const m = ScrollHarness(r);
  m.hook.onContentSizeChange(320, 1600); m.remove(); m.flush();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 640, animated: false });
  expect(r.onRevealed).not.toHaveBeenCalled();
});

test("a real drag cancels pending reveal without success; later focus respects the user", () => {
  const r = request(false); const m = ScrollHarness(r); m.hook.onContentSizeChange(320, 1600);
  m.hook.onScrollBeginDrag(scrollEvent(30)); m.scroll(900); m.render({ ...r, ready: true }); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled(); expect(r.onRevealed).not.toHaveBeenCalled();
  expect(m.originalDrag).toHaveBeenCalledTimes(1);
  m.scope.focused = false; m.render(); m.scope.focused = true; m.render(); m.flush();
  expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 900, animated: false });
  expect(r.onRevealed).not.toHaveBeenCalled();
});

test("replacement host waits for its own layout and ignores the old host's handlers", () => {
  const r = request(false); const m = ScrollHarness(r); m.hook.onContentSizeChange(320, 1600); const old = m.hook;
  const host = m.replaceHost(); m.render({ ...r, ready: true });
  old.onLayout(layoutEvent()); old.onContentSizeChange(320, 1600); m.flush();
  expect(host.scrollTo).not.toHaveBeenCalled();
  m.hook.onLayout(layoutEvent()); m.hook.onContentSizeChange(320, 1600); m.flush();
  expect(host.scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: false });
  expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test("entry change rejects stale layout/ref/frame work and requires the new entry's layout", () => {
  writeViewMemory(key, { x: 0, y: 640 }); const m = ScrollHarness(); m.hook.onContentSizeChange(320, 1600);
  const stale = allFrames.slice(), old = m.hook; m.scope.id = "phone:new"; const r = request(); m.render(r);
  m.scrollTo.mockClear(); m.forwarded.mockClear(); old.ref(null); old.onLayout(layoutEvent());
  old.onContentSizeChange(320, 1800); stale.forEach(fn => fn(0)); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled(); expect(m.forwarded).not.toHaveBeenCalled();
  m.hook.onLayout(layoutEvent()); m.hook.onContentSizeChange(320, 1600);
  expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test("reentrant or throwing acknowledgment cannot repeat the native command", () => {
  const r = request(); const m = ScrollHarness(r);
  r.onRevealed.mockImplementation(() => { m.hook.onContentSizeChange(320, 2000); throw new Error("recipient"); });
  m.hook.onContentSizeChange(320, 1600); m.flush(); m.render({ ...r });
  expect(m.scrollTo).toHaveBeenCalledTimes(1); expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test("native failure is unacknowledged and only a later layout retries", () => {
  const r = request(); const m = ScrollHarness(r); m.scrollTo.mockImplementationOnce(() => { throw new Error("native"); });
  m.hook.onContentSizeChange(320, 1600); m.flush();
  expect(m.scrollTo).toHaveBeenCalledTimes(1); expect(r.onRevealed).not.toHaveBeenCalled();
  m.hook.onLayout(layoutEvent()); expect(m.scrollTo).toHaveBeenCalledTimes(2); expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test("owner changes inside native command prevent memory write and acknowledgment", () => {
  const r = request(); const m = ScrollHarness(r);
  m.scrollTo.mockImplementation(() => beginAccountOwnerTransition("B"));
  m.hook.onContentSizeChange(320, 1600); expect(r.onRevealed).not.toHaveBeenCalled();
  expect(readViewMemory(key)).toBeUndefined();
});

test("a focus change during the native command leaves the reveal pending until visible again", () => {
  const r = request(); const m = ScrollHarness(r);
  m.scrollTo.mockImplementationOnce(() => { m.scope.focused = false; m.render(); });
  m.hook.onContentSizeChange(320, 1600); m.flush();
  expect(r.onRevealed).not.toHaveBeenCalled();
  m.scope.focused = true; m.render(); m.flush();
  expect(m.scrollTo).toHaveBeenCalledTimes(2); expect(r.onRevealed).toHaveBeenCalledTimes(1);
});

test("a user drag during the native command cancels its pending acknowledgment and retry", () => {
  const r = request(); const m = ScrollHarness(r);
  m.scrollTo.mockImplementationOnce(() => m.hook.onScrollBeginDrag(scrollEvent(30)));
  m.hook.onContentSizeChange(320, 1600); m.flush(); m.render({ ...r });
  expect(m.scrollTo).toHaveBeenCalledTimes(1); expect(r.onRevealed).not.toHaveBeenCalled();
  expect(m.originalDrag).toHaveBeenCalledTimes(1);
});

test.each([NaN, Infinity, -1])("invalid target %s cannot become a successful reveal", x => {
  const r = { ...request(), target: { x, y: 0 } }; const m = ScrollHarness(r); m.hook.onContentSizeChange(320, 1600); m.flush();
  expect(r.onRevealed).not.toHaveBeenCalled();
});

test("throwing predicate and absent scope cannot acknowledge visibility", () => {
  const bad = request(true, () => { throw new Error("stale"); }); const m = ScrollHarness(bad);
  m.hook.onContentSizeChange(320, 1600); m.flush(); expect(bad.onRevealed).not.toHaveBeenCalled();
  const r = request(); const noScope = ScrollHarness(r, true, false); noScope.hook.onContentSizeChange(320, 1600); noScope.flush();
  expect(noScope.scrollTo).not.toHaveBeenCalled(); expect(r.onRevealed).not.toHaveBeenCalled();
});


test("hidden host measurements permit the first focus reveal without a new size event", () => {
  writeViewMemory(key, { x: 0, y: 640 }); const r = request(); const m = ScrollHarness(r, false);
  m.hook.onContentSizeChange(320, 1600); m.flush();
  expect(m.scrollTo).not.toHaveBeenCalled(); expect(r.onRevealed).not.toHaveBeenCalled();
  m.scope.focused = true; m.render(); m.flush();
  expect(m.scrollTo.mock.calls).toEqual([[{ x: 0, y: 0, animated: false }]]);
  expect(r.onRevealed).toHaveBeenCalledTimes(1);
});


test("cancelled frame and settle closures cannot revive an old target after a new focus restoration", () => {
  const timers = jest.spyOn(global, "setTimeout");
  try {
    writeViewMemory(key, { x: 0, y: 640 }); const m = ScrollHarness(); m.hook.onContentSizeChange(320, 1600);
    const staleFrames = allFrames.slice(); m.flushFrames();
    const staleSettles = timers.mock.calls.filter(call => call[1] === 180).map(call => call[0] as () => void);
    expect(staleSettles).toHaveLength(1);
    const r = request(); m.render(r); m.scroll(900); m.scope.focused = false; m.render();
    m.scope.focused = true; m.render(); m.scrollTo.mockClear();
    staleFrames.forEach(fn => fn(0)); staleSettles.forEach(fn => fn()); m.flush();
    expect(m.scrollTo.mock.calls.some(([value]) => value.y === 640)).toBe(false);
    expect(m.scrollTo).toHaveBeenLastCalledWith({ x: 0, y: 900, animated: false });
    expect(r.onRevealed).toHaveBeenCalledTimes(1);
  } finally { timers.mockRestore(); }
});

test("one token cannot silently change its requested target", () => {
  writeViewMemory(key, { x: 0, y: 640 }); const r = request(false); const m = ScrollHarness(r);
  m.hook.onContentSizeChange(320, 1600); m.render({ ...r, ready: true, target: { x: 0, y: 900 } }); m.flush();
  expect(r.onRevealed).not.toHaveBeenCalled(); expect(m.scrollTo).not.toHaveBeenCalledWith({ x: 0, y: 900, animated: false });
});
