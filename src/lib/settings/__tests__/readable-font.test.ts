import {
  DEFAULT_FONT_STYLE,
  FONT_STYLE_KEY,
  FONT_STYLE_ORDER,
  __resetFontStyleForTests,
  parseFontStyle,
  setFontStyle,
} from "../readable-font";

describe("readable-font preference (P2-10)", () => {
  afterEach(() => {
    __resetFontStyleForTests();
    if (typeof localStorage !== "undefined") localStorage.removeItem(FONT_STYLE_KEY);
  });

  test("defaults to the pixel village identity", () => {
    expect(DEFAULT_FONT_STYLE).toBe("pixel");
    expect(FONT_STYLE_ORDER).toEqual(["pixel", "readable"]);
  });

  test("parses only known font styles", () => {
    expect(parseFontStyle("pixel")).toBe("pixel");
    expect(parseFontStyle("readable")).toBe("readable");
    expect(parseFontStyle("comic-sans")).toBeNull();
    expect(parseFontStyle(null)).toBeNull();
    expect(parseFontStyle(undefined)).toBeNull();
    expect(parseFontStyle("")).toBeNull();
  });

  test("persists the choice under the appearance key", () => {
    if (typeof localStorage === "undefined") return;
    setFontStyle("readable");
    expect(localStorage.getItem(FONT_STYLE_KEY)).toBe("readable");
    setFontStyle("pixel");
    expect(localStorage.getItem(FONT_STYLE_KEY)).toBe("pixel");
  });

  test("flips the html data-font attribute for the web base CSS", () => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    setFontStyle("readable");
    expect(doc.documentElement.getAttribute("data-font")).toBe("readable");
    setFontStyle("pixel");
    expect(doc.documentElement.getAttribute("data-font")).toBe("pixel");
  });
});
