const mockAddListener = jest.fn();
const mockRead = jest.fn();
const mockRemove = jest.fn();
jest.mock("react-native", () => ({ AccessibilityInfo: {
  addEventListener: mockAddListener,
  isReduceMotionEnabled: mockRead,
} }));

let resolveRead: (value: boolean) => void;
let onOSChange: (value: boolean) => void;
beforeEach(() => {
  jest.resetModules();
  mockRemove.mockClear();
  mockAddListener.mockReset().mockImplementation((_event, callback) => {
    onOSChange = callback;
    return { remove: mockRemove };
  });
  mockRead.mockReset().mockImplementation(() => new Promise<boolean>((resolve) => { resolveRead = resolve; }));
});

test("native motion is initially suppressed, shared OS listener updates all consumers", async () => {
  const store = await import("../system-reduced-motion.native");
  expect(store.getSystemReducedMotion()).toBe(true);
  const first = jest.fn();
  const second = jest.fn();
  const stopFirst = store.subscribeSystemReducedMotion(first);
  const stopSecond = store.subscribeSystemReducedMotion(second);
  expect(mockAddListener).toHaveBeenCalledTimes(1);
  resolveRead(false);
  await Promise.resolve();
  expect(store.getSystemReducedMotion()).toBe(false);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  onOSChange(true);
  expect(store.getSystemReducedMotion()).toBe(true);
  stopFirst();
  expect(mockRemove).not.toHaveBeenCalled();
  stopSecond();
  expect(mockRemove).toHaveBeenCalledTimes(1);
});

test("a late initial OS read cannot undo a newer reduce-motion event", async () => {
  const store = await import("../system-reduced-motion.native");
  const stop = store.subscribeSystemReducedMotion(jest.fn());
  onOSChange(true);
  resolveRead(false);
  await Promise.resolve();
  expect(store.getSystemReducedMotion()).toBe(true);
  stop();
});

test("unmount invalidates a pending OS read and releases the native listener", async () => {
  const store = await import("../system-reduced-motion.native");
  const listener = jest.fn();
  store.subscribeSystemReducedMotion(listener)();
  resolveRead(false);
  await Promise.resolve();
  expect(listener).not.toHaveBeenCalled();
  expect(store.getSystemReducedMotion()).toBe(true);
  expect(mockRemove).toHaveBeenCalledTimes(1);
});
