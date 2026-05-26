// languageDetector reads localStorage first (manual override) and falls
// back to expo-localization device detection. Tests cover the three
// branches: saved override, no override + Korean device, no override +
// other device.

jest.mock("expo-localization", () => ({
  __esModule: true,
  getLocales: jest.fn(),
}));

import * as Localization from "expo-localization";

import { detectLanguage, saveLanguagePreference } from "../languageDetector";

const STORAGE_KEY = "2nd-brain:locale";

function setLocalStorage(value: string | null): void {
  const store = new Map<string, string>();
  if (value !== null) store.set(STORAGE_KEY, value);
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

function unsetLocalStorage(): void {
  delete (globalThis as { localStorage?: Storage }).localStorage;
}

afterEach(() => {
  unsetLocalStorage();
  jest.clearAllMocks();
});

describe("detectLanguage", () => {
  test("returns saved 'ko' when localStorage has it", () => {
    setLocalStorage("ko");
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: "en" }]);
    expect(detectLanguage()).toBe("ko");
  });

  test("returns saved 'en' when localStorage has it (overrides Korean device)", () => {
    setLocalStorage("en");
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: "ko" }]);
    expect(detectLanguage()).toBe("en");
  });

  test("ignores unrecognized saved values", () => {
    setLocalStorage("ja");
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: "ko" }]);
    expect(detectLanguage()).toBe("ko"); // falls through to device
  });

  test("falls back to device detection (ko)", () => {
    unsetLocalStorage();
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: "ko" }]);
    expect(detectLanguage()).toBe("ko");
  });

  test("falls back to device detection (other → en)", () => {
    unsetLocalStorage();
    (Localization.getLocales as jest.Mock).mockReturnValue([{ languageCode: "ja" }]);
    expect(detectLanguage()).toBe("en");
  });

  test("returns 'en' when expo-localization throws", () => {
    unsetLocalStorage();
    (Localization.getLocales as jest.Mock).mockImplementation(() => {
      throw new Error("no native module");
    });
    expect(detectLanguage()).toBe("en");
  });

  test("returns 'en' when getLocales returns empty array", () => {
    unsetLocalStorage();
    (Localization.getLocales as jest.Mock).mockReturnValue([]);
    expect(detectLanguage()).toBe("en");
  });
});

describe("saveLanguagePreference", () => {
  test("writes to localStorage", () => {
    setLocalStorage(null);
    saveLanguagePreference("ko");
    expect((globalThis as { localStorage: Storage }).localStorage.getItem(STORAGE_KEY)).toBe("ko");
  });

  test("no-op when localStorage absent (native runtime)", () => {
    unsetLocalStorage();
    expect(() => saveLanguagePreference("ko")).not.toThrow();
  });
});
