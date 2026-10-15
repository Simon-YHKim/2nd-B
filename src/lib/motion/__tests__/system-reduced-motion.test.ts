import { getSystemReducedMotion, subscribeSystemReducedMotion } from "../system-reduced-motion";

const original = globalThis.matchMedia;
afterEach(() => { globalThis.matchMedia = original; });

test("web OS changes notify subscribers and unsubscribe removes the listener", () => {
  const addEventListener = jest.fn();
  const removeEventListener = jest.fn();
  const media = { matches: false, addEventListener, removeEventListener };
  globalThis.matchMedia = jest.fn(() => media as unknown as MediaQueryList);
  const onChange = jest.fn();
  const stop = subscribeSystemReducedMotion(onChange);
  expect(getSystemReducedMotion()).toBe(false);
  media.matches = true;
  addEventListener.mock.calls[0][1]();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(getSystemReducedMotion()).toBe(true);
  stop();
  expect(removeEventListener).toHaveBeenCalledWith("change", onChange);
});

test("older browser subscription is cleaned up; unavailable media APIs are safe", () => {
  const addListener = jest.fn();
  const removeListener = jest.fn();
  globalThis.matchMedia = jest.fn(() => ({ matches: true, addListener, removeListener }) as unknown as MediaQueryList);
  const listener = jest.fn();
  subscribeSystemReducedMotion(listener)();
  expect(addListener).toHaveBeenCalledWith(listener);
  expect(removeListener).toHaveBeenCalledWith(listener);
  globalThis.matchMedia = jest.fn(() => { throw new Error("unavailable"); });
  expect(getSystemReducedMotion()).toBe(false);
  expect(() => subscribeSystemReducedMotion(listener)()).not.toThrow();
});
