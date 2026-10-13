const platform = { OS: "android" as "android" | "ios" | "web" };
jest.mock("react-native", () => ({ Platform: platform }));

const mockReloadAsync = jest.fn<Promise<void>, []>();
jest.mock("expo-updates", () => ({
  reloadAsync: () => mockReloadAsync(),
}));

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ACCOUNT_RESTART_GRACE_MS,
  WEB_BASE_PATH,
  __resetAccountRestartForTests,
  accountRestartPending,
  webHomeAddress,
} from "../account-restart";

type FakeLocation = { pathname?: string; replace?: (address: string) => void };
type WindowHolder = { window?: { location?: FakeLocation } };
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

describe("the web's home address", () => {
  test("the base path is the one the app is built with", () => {
    const appJson = JSON.parse(readFileSync(path.join(__dirname, "../../../../app.json"), "utf8")) as {
      expo: { experiments: { baseUrl: string } };
    };
    expect(WEB_BASE_PATH).toBe(appJson.expo.experiments.baseUrl);
  });

  test.each([
    ["/2nd-B", "/2nd-B/"],
    ["/2nd-B/", "/2nd-B/"],
    ["/2nd-B/secondb", "/2nd-B/"],
    ["/2nd-B/record/7f3c0d1e-0000-4000-8000-000000000000", "/2nd-B/"],
    ["/2nd-B/sign-in", "/2nd-B/"],
    ["/", "/"],
    ["/secondb", "/"],
    ["/record/1", "/"],
    // A path that only starts with the same letters is not under the base path.
    ["/2nd-Bx/secondb", "/"],
    ["/2nd-Brain", "/"],
    ["", "/"],
  ])("%s -> %s", (pathname, home) => {
    expect(webHomeAddress(pathname)).toBe(home);
  });
});

describe("restart for a new account owner: web", () => {
  beforeEach(() => {
    platform.OS = "web";
  });

  test("goes to the home address in the same call, without waiting for anything, and never touches the phone reload", () => {
    const replace = jest.fn();
    holder.window = { location: { pathname: "/2nd-B/record/7f3c0d1e-0000-4000-8000-000000000000", replace } };
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(true);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/2nd-B/");
    expect(accountRestartPending(listener)).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  test("already at home, it still loads the page again", () => {
    const replace = jest.fn();
    holder.window = { location: { pathname: "/2nd-B/", replace } };

    expect(accountRestartPending(jest.fn())).toBe(true);

    expect(replace).toHaveBeenCalledWith("/2nd-B/");
  });

  test("a site served at the root goes to the root", () => {
    const replace = jest.fn();
    holder.window = { location: { pathname: "/secondb", replace } };

    expect(accountRestartPending(jest.fn())).toBe(true);

    expect(replace).toHaveBeenCalledWith("/");
  });

  test("no page to navigate answers no at once", () => {
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    holder.window = { location: { pathname: "/2nd-B/" } };
    __resetAccountRestartForTests();
    expect(accountRestartPending(listener)).toBe(false);

    holder.window = { location: { replace: jest.fn() } };
    __resetAccountRestartForTests();
    expect(accountRestartPending(listener)).toBe(false);
  });

  test("a navigation that throws falls back in the same call", () => {
    holder.window = {
      location: {
        pathname: "/2nd-B/secondb",
        replace: () => {
          throw new Error("blocked");
        },
      },
    };
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
  });

  test("a page still open after the grace time falls back", () => {
    const replace = jest.fn();
    holder.window = { location: { pathname: "/2nd-B/secondb", replace } };
    const listener = jest.fn();

    expect(accountRestartPending(listener)).toBe(true);
    jest.advanceTimersByTime(ACCOUNT_RESTART_GRACE_MS - 1);
    expect(listener).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(accountRestartPending(listener)).toBe(false);
  });
});
