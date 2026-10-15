// Native-path tests for the sound effects store (Q-261005-02): no localStorage shim,
// so the module falls through to the mocked AsyncStorage with the runtime faked as
// React Native. The stored "off" must reach the players' switch on cold start, and a
// toggle made while the read is in flight must win over the stale stored value.

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

import { areSoundEffectsOn } from "../../audio/ui-sound-player";
import {
  __resetSoundEffectsForTests,
  ensureSoundEffectsHydration,
  isSoundEffectsEnabled,
  setSoundEffects,
} from "../sound-effects";

const originalNavigator = globalThis.navigator;

beforeAll(() => {
  Object.defineProperty(globalThis, "navigator", { value: { product: "ReactNative" }, configurable: true, writable: true });
});
afterAll(() => {
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
});
beforeEach(() => {
  __resetSoundEffectsForTests();
  resolveGet = null;
  jest.clearAllMocks();
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("sound effects native hydration", () => {
  test("a stored 'off' reaches the getter and the players' switch on cold start", async () => {
    ensureSoundEffectsHydration();
    expect(getItem).toHaveBeenCalledWith("audio.soundEffects.v1");
    expect(isSoundEffectsEnabled()).toBe(true); // default until the read lands
    expect(areSoundEffectsOn()).toBe(true);
    resolveGet?.("off");
    await flushMicrotasks();
    expect(isSoundEffectsEnabled()).toBe(false);
    expect(areSoundEffectsOn()).toBe(false);
  });

  test("a toggle made while hydration is in flight is not clobbered by the stale read", async () => {
    ensureSoundEffectsHydration();
    setSoundEffects(false);
    resolveGet?.("on");
    await flushMicrotasks();
    expect(isSoundEffectsEnabled()).toBe(false);
    expect(areSoundEffectsOn()).toBe(false);
    expect(setItem).toHaveBeenCalledWith("audio.soundEffects.v1", "off");
  });

  test("hydration kickoff is idempotent", () => {
    ensureSoundEffectsHydration();
    ensureSoundEffectsHydration();
    expect(getItem).toHaveBeenCalledTimes(1);
  });
});
