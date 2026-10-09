import type { ScrollView, ScrollViewProps } from "react-native";
const mockScope = { id: "phone:ops", slots: { next: 0 }, focused: true };
let mockEffects: Array<() => (() => void) | void> = [];
jest.mock("react", () => ({
  createContext: () => ({}), useContext: () => mockScope,
  useState: (fn: () => unknown) => [fn()], useRef: (value: unknown) => ({ current: value }),
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => (() => void) | void) => { mockEffects.push(fn); },
}));
import { useScrollMemory } from "../scroll-memory";
import { readViewMemory, writeViewMemory } from "../view-memory";
import { __resetAccountEpochForTests, noteResolvedOwner, beginAccountOwnerTransition } from "../../auth/account-epoch";
const key = "scroll:phone:ops:list";
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  __resetAccountEpochForTests(); noteResolvedOwner("qa-scroll"); mockEffects = []; frames = [];
  global.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  global.cancelAnimationFrame = () => undefined;
});
afterEach(() => jest.useRealTimers());
function ScrollHarness() {
  const scrollTo = jest.fn(); const originalScroll = jest.fn(); const forwarded = jest.fn();
  const hook = useScrollMemory<ScrollView>({ testID: "list", onScroll: originalScroll }, forwarded);
  hook.ref({ scrollTo } as unknown as ScrollView);
  const cleanups = mockEffects.map((effect) => effect());
  const flush = () => { const pending = frames; frames = []; pending.forEach((fn) => fn(0)); jest.runOnlyPendingTimers(); };
  const scroll = (y: number) => hook.onScroll({ nativeEvent: { contentOffset: { x: 0, y } } } as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]);
  hook.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } } as Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]);
  return { hook, scrollTo, forwarded, originalScroll, flush, scroll, cleanups };
}
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
  m.hook.onScroll({ nativeEvent: { contentOffset: { x: 0, get y() { return liveTop; } } } } as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]);
  liveTop = 0;
  expect(readViewMemory(key)).toEqual({ x: 0, y: 687 });
});
