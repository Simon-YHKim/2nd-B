const platform = { OS: "android" as "android" | "ios" | "web" };
jest.mock("react-native", () => ({ Platform: platform }));

const mockReloadAsync = jest.fn<Promise<void>, []>();
jest.mock("expo-updates", () => ({
  reloadAsync: () => mockReloadAsync(),
}));

import {
  ACCOUNT_RESTART_GRACE_MS,
  ACCOUNT_RESTART_WEB_SETTLE_MS,
  __resetAccountRestartForTests,
  accountRestartPending,
} from "../account-restart";

type WindowHolder = { window?: { location?: { reload?: () => void } } };
const holder = globalThis as unknown as WindowHolder;

/** A promise that never settles: the app is still restarting. */
const never = () => new Promise<void>(() => undefined);

beforeEach(() => {
  jest.useFakeTimers();
  __resetAccountRestartForTests();
  mockReloadAsync.mockReset();
  platform.OS = "android";
  delete holder.window;
});

afterEach(() => {
  __resetAccountRestartForTests();
  jest.useRealTimers();
  delete holder.window;
});

describe("restart for a new account owner: phone", () => {
  test("asks the platform once and reports the restart as on its way", () => {
    mockReloadAsync.mockImplementation(never);
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(true);
    expect(accountRestartPending(listener)).toBe(true);
    expect(accountRestartPending(listener)).toBe(true);

    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  test("a build that refuses the reload falls back: the caller is told once and later calls say no", async () => {
    mockReloadAsync.mockRejectedValue(new Error("ERR_UPDATES_DISABLED"));
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
    expect(accountRestartPending(listener)).toBe(false);
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a reload call that throws at once answers no in the same call", () => {
    mockReloadAsync.mockImplementation(() => {
      throw new Error("native module missing");
    });
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
  });

  test("a restart that never comes ends the wait after the grace time", () => {
    mockReloadAsync.mockResolvedValue(undefined);
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(true);
    jest.advanceTimersByTime(ACCOUNT_RESTART_GRACE_MS - 1);
    expect(listener).not.toHaveBeenCalled();
    expect(accountRestartPending(listener)).toBe(true);

    jest.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
  });

  test("the latest caller is the one told, and only once", async () => {
    mockReloadAsync.mockRejectedValue(new Error("no"));
    const first = jest.fn();
    const second = jest.fn();

    accountRestartPending(first);
    accountRestartPending(second);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(ACCOUNT_RESTART_GRACE_MS * 2);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("a caller that throws while being told does not break the fallback", async () => {
    mockReloadAsync.mockRejectedValue(new Error("no"));
    const listener = jest.fn(() => {
      throw new Error("render failed");
    });

    accountRestartPending(listener);
    await Promise.resolve();
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
  });
});

describe("restart for a new account owner: web", () => {
  beforeEach(() => {
    platform.OS = "web";
  });

  test("reloads the page after the address has had time to settle, and never touches the phone reload", () => {
    const reload = jest.fn();
    holder.window = { location: { reload } };
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    jest.advanceTimersByTime(ACCOUNT_RESTART_WEB_SETTLE_MS - 1);
    expect(reload).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  test("no page to reload answers no at once", () => {
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    holder.window = { location: {} };
    __resetAccountRestartForTests();
    expect(accountRestartPending(listener)).toBe(false);
  });

  test("a reload that throws falls back", () => {
    holder.window = {
      location: {
        reload: () => {
          throw new Error("blocked");
        },
      },
    };
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(true);
    jest.advanceTimersByTime(ACCOUNT_RESTART_WEB_SETTLE_MS);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
  });

  test("a page still open after the grace time falls back", () => {
    const reload = jest.fn();
    holder.window = { location: { reload } };
    const listener = jest.fn();

    accountRestartPending(listener);
    jest.advanceTimersByTime(ACCOUNT_RESTART_GRACE_MS);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
  });
});
