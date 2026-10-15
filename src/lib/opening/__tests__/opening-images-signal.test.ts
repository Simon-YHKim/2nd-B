// One-shot "the opening's images are in" signal that the web font loader waits on.
import { markOpeningImagesSettled, resetOpeningImagesSignal, whenOpeningImagesSettled } from "../opening-images-signal";

beforeEach(() => { resetOpeningImagesSignal(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test("waits for the signal, then runs once", () => {
  const cb = jest.fn();
  whenOpeningImagesSettled(cb, 6000);
  jest.advanceTimersByTime(5999);
  expect(cb).not.toHaveBeenCalled();
  markOpeningImagesSettled(); markOpeningImagesSettled();
  jest.advanceTimersByTime(10000);
  expect(cb).toHaveBeenCalledTimes(1);
});

test("the fallback runs it when no opening ever signals", () => {
  const cb = jest.fn();
  whenOpeningImagesSettled(cb, 6000);
  jest.advanceTimersByTime(6000);
  expect(cb).toHaveBeenCalledTimes(1);
  markOpeningImagesSettled();
  expect(cb).toHaveBeenCalledTimes(1);
});

test("after the signal, new waiters run at once", () => {
  markOpeningImagesSettled();
  const cb = jest.fn();
  whenOpeningImagesSettled(cb, 6000);
  expect(cb).toHaveBeenCalledTimes(1);
});

test("cancel drops a waiter for good", () => {
  const cb = jest.fn();
  const cancel = whenOpeningImagesSettled(cb, 6000);
  cancel();
  markOpeningImagesSettled();
  jest.advanceTimersByTime(10000);
  expect(cb).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
