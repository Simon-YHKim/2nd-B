import { useLayoutEffect } from "react";
import {
  crisisLockPrioritySnapshot,
  subscribeCrisisLockPriority,
  useCrisisLockPriority,
} from "@/lib/auth/device-lock-context";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useLayoutEffect: jest.fn(),
}));

const cleanups: (() => void)[] = [];
beforeEach(() => {
  jest.mocked(useLayoutEffect).mockImplementation(effect => {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  });
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  jest.clearAllMocks();
  expect(crisisLockPrioritySnapshot()).toBe(false);
});

test("closing one of two crisis dialogs keeps native authentication paused", () => {
  const listener = jest.fn();
  const unsubscribe = subscribeCrisisLockPriority(listener);
  expect(crisisLockPrioritySnapshot()).toBe(false);
  useCrisisLockPriority(true);
  useCrisisLockPriority(true);
  expect(crisisLockPrioritySnapshot()).toBe(true);
  cleanups.pop()?.();
  expect(crisisLockPrioritySnapshot()).toBe(true);
  cleanups.pop()?.();
  expect(crisisLockPrioritySnapshot()).toBe(false);
  expect(listener).toHaveBeenCalledTimes(4);
  unsubscribe();
});

test("a hidden crisis dialog has no priority ownership or notification", () => {
  const listener = jest.fn();
  const unsubscribe = subscribeCrisisLockPriority(listener);
  useCrisisLockPriority(false);
  expect(crisisLockPrioritySnapshot()).toBe(false);
  expect(listener).not.toHaveBeenCalled();
  expect(cleanups).toHaveLength(0);
  unsubscribe();
});

test("effect cleanup and remount cannot remove another dialog's ownership", () => {
  useCrisisLockPriority(true);
  const oldCleanup = cleanups.pop()!;
  oldCleanup();
  useCrisisLockPriority(true);
  oldCleanup();
  expect(crisisLockPrioritySnapshot()).toBe(true);
});

test("an unmounted root subscriber receives no future modal notifications", () => {
  const listener = jest.fn();
  const unsubscribe = subscribeCrisisLockPriority(listener);
  unsubscribe();
  useCrisisLockPriority(true);
  cleanups.pop()?.();
  expect(listener).not.toHaveBeenCalled();
});
