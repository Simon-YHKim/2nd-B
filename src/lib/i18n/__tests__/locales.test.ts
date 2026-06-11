import {
  AVAILABLE_UI_LOCALES,
  UI_LOCALES,
  UI_LOCALE_META,
  isAvailableUiLocale,
  matchDeviceLocale,
  systemLocaleFor,
} from "../locales";

describe("locale registry (O-R2 language-pack infra)", () => {
  test("registry holds the 12 confirmed UI locales exactly once, EN/KO included", () => {
    expect(UI_LOCALES).toHaveLength(12);
    expect(new Set(UI_LOCALES).size).toBe(12);
    expect(UI_LOCALES).toEqual(expect.arrayContaining(["en", "ko", "zh-Hans", "es", "hi", "ar", "pt", "ru", "ja", "fr", "de", "id"]));
  });

  test("every UI locale has complete meta; AR is the only RTL; EN/KO are not beta", () => {
    for (const code of UI_LOCALES) {
      const meta = UI_LOCALE_META[code];
      expect(meta.nativeName.length).toBeGreaterThan(0);
      expect(meta.rtl).toBe(code === "ar");
    }
    expect(UI_LOCALE_META.en.beta).toBe(false);
    expect(UI_LOCALE_META.ko.beta).toBe(false);
  });

  test("available locales are a subset of the registry and include the shipped pair", () => {
    for (const code of AVAILABLE_UI_LOCALES) {
      expect(UI_LOCALES).toContain(code);
    }
    expect(AVAILABLE_UI_LOCALES).toContain("en");
    expect(AVAILABLE_UI_LOCALES).toContain("ko");
  });

  test("systemLocaleFor collapses everything onto the en/ko safety pair", () => {
    expect(systemLocaleFor("ko")).toBe("ko");
    expect(systemLocaleFor("ko-KR")).toBe("ko");
    expect(systemLocaleFor("en")).toBe("en");
    expect(systemLocaleFor("ja")).toBe("en");
    expect(systemLocaleFor("zh-Hans")).toBe("en");
    expect(systemLocaleFor("korean")).toBe("en");
    expect(systemLocaleFor("")).toBe("en");
    expect(systemLocaleFor(null)).toBe("en");
    expect(systemLocaleFor(undefined)).toBe("en");
  });

  test("device matching returns only SHIPPED locales and walks past the rest", () => {
    expect(matchDeviceLocale("ko")).toBe("ko");
    expect(matchDeviceLocale("en")).toBe("en");
    expect(matchDeviceLocale("es")).toBe("es");
    expect(matchDeviceLocale("pt")).toBe("pt");
    expect(matchDeviceLocale("id")).toBe("id");
    // Confirmed for the registry but not shipped yet - caller must keep
    // walking. Update these expectations in the SAME PR that ships a pack
    // (the null here is the shipped-set pin, not the mapping rule).
    expect(matchDeviceLocale("ja")).toBeNull();
    expect(matchDeviceLocale("zh", "Hans")).toBeNull();
    expect(matchDeviceLocale("de")).toBeNull();
    expect(matchDeviceLocale(null)).toBeNull();
    expect(matchDeviceLocale(undefined)).toBeNull();
    expect(matchDeviceLocale("")).toBeNull();
  });

  test("isAvailableUiLocale guards storage round-trips", () => {
    expect(isAvailableUiLocale("en")).toBe(true);
    expect(isAvailableUiLocale("ko")).toBe(true);
    expect(isAvailableUiLocale("es")).toBe(true);
    expect(isAvailableUiLocale("pt")).toBe(true);
    expect(isAvailableUiLocale("id")).toBe(true);
    expect(isAvailableUiLocale("ja")).toBe(false);
    expect(isAvailableUiLocale("zh-Hans")).toBe(false);
    expect(isAvailableUiLocale(42)).toBe(false);
    expect(isAvailableUiLocale(null)).toBe(false);
  });
});
