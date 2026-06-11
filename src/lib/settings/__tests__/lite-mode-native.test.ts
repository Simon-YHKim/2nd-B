// Native-path tests for the lite-mode store: NO localStorage shim here - the
// module must fall through to the (mocked) AsyncStorage, with the runtime
// faked as React Native. Pins the pre-hydration no-clobber guard (review #5):
// a user toggle made while the cold-start read is still in flight must win
// over the stale stored value when it finally resolves.

let resolveGet: ((value: string | null) => void) | null = null;
const getItem = jest.fn(
  (_key: string) =>
    new Promise<string | null>((resolve) => {
      resolveGet = resolve;
    }),
);
const setItem = jest.fn((_key: string, _value: string) => Promise.resolve());

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
  },
}));

import {
  __resetLiteModeForTests,
  ensureLiteModeHydration,
  isLiteModeEnabled,
  setLiteMode,
} from "../lite-mode";

const originalNavigator = globalThis.navigator;

beforeAll(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: { product: "ReactNative" },
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  __resetLiteModeForTests();
  resolveGet = null;
  jest.clearAllMocks();
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("lite mode native hydration", () => {
  test("cold-start hydration applies the stored value to the sync getter", async () => {
    ensureLiteModeHydration();
    expect(getItem).toHaveBeenCalledWith("appearance.liteMode.v1");
    expect(isLiteModeEnabled()).toBe(false); // default until the read lands
    resolveGet?.("on");
    await flushMicrotasks();
    expect(isLiteModeEnabled()).toBe(true);
  });

  test("a toggle made while hydration is in flight is NOT clobbered by the stale read", async () => {
    ensureLiteModeHydration();
    setLiteMode(true); // user flips lite on before the cold-start read lands
    resolveGet?.("off"); // stale stored value finally arrives
    await flushMicrotasks();
    expect(isLiteModeEnabled()).toBe(true);
    expect(setItem).toHaveBeenCalledWith("appearance.liteMode.v1", "on");
  });

  test("hydration kickoff is idempotent", () => {
    ensureLiteModeHydration();
    ensureLiteModeHydration();
    expect(getItem).toHaveBeenCalledTimes(1);
  });
});
