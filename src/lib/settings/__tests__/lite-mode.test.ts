import {
  DEFAULT_LITE_MODE,
  LITE_MODE_KEY,
  __resetLiteModeForTests,
  isLiteModeEnabled,
  parseLiteMode,
  setLiteMode,
} from "../lite-mode";
import { prefersReducedMotion } from "../../motion/signature";

// Node test env: pin the web path with an in-memory localStorage shim (same
// approach as the capture draft tests).
const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

beforeEach(() => {
  store.clear();
  __resetLiteModeForTests();
});

describe("lite mode preference (O-R2 (3) low-spec support)", () => {
  test("defaults to full effects", () => {
    expect(DEFAULT_LITE_MODE).toBe(false);
    expect(isLiteModeEnabled()).toBe(false);
  });

  test("round-trips through storage with strict parsing", () => {
    setLiteMode(true);
    expect(store.get(LITE_MODE_KEY)).toBe("on");
    expect(isLiteModeEnabled()).toBe(true);
    setLiteMode(false);
    expect(store.get(LITE_MODE_KEY)).toBe("off");
    expect(isLiteModeEnabled()).toBe(false);
  });

  test("garbage stored values fall back to the default instead of throwing", () => {
    store.set(LITE_MODE_KEY, "weird");
    expect(parseLiteMode("weird")).toBeNull();
    expect(isLiteModeEnabled()).toBe(false);
  });

  test("lite mode forces the reduced-motion chokepoint every consumer honors", () => {
    expect(prefersReducedMotion()).toBe(false);
    setLiteMode(true);
    expect(prefersReducedMotion()).toBe(true);
    setLiteMode(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});
