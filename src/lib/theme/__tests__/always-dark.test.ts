// Simon 결정 Q-261005-02 (2026-10-05): 다크/라이트 선택을 숨기지 않고 없앴다. 앱은 늘 어둡다.
//
// What this guards, and why each part exists:
//  1. resolvePalette has one input (a PaletteOverride) and otherwise returns the dark
//     `semantic` palette. That is the structural fix for QA R2B-07: with light mode on,
//     <Text color="textMuted"> drew #3C476A on the deep-space #0A0E18 ground (2.11:1)
//     because the text palette followed the toggle and the ground did not.
//  2. Nothing in src reads the retired stored mode, so a device that saved "light"
//     gets the dark app; the one module that names the key only removes it.
//  3. The toggle, the /theme 미드나잇 row and the mode hook are gone from the screens
//     (removed, not hidden), and their locale keys are gone in all five locales.
// The removed originals are in E:/Legacy/2ndB (batch qa261005-notheme) and in git
// history at origin/main 5104a686.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { semantic, semanticLight } from "../tokens";
import { resolvePalette, type Palette } from "../ThemeContext";
import {
  RETIRED_THEME_MODE_KEY,
  clearRetiredThemeMode,
  type RetiredThemeModeStores,
} from "../retired-theme-mode";

const SRC = path.resolve(__dirname, "../../..");
const REPO = path.resolve(SRC, "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const shipped = walk(SRC).map((full) => ({
  rel: path.relative(SRC, full).split(path.sep).join("/"),
  body: readFileSync(full, "utf8"),
}));

describe("the palette has no light branch", () => {
  test("without an override every subtree gets the dark semantic palette", () => {
    expect(resolvePalette(null)).toBe(semantic);
    expect(resolvePalette(null)).not.toBe(semanticLight);
    // The R2B-07 pair, by value: the muted text a deep-space screen gets is the
    // dark palette's, never the light one that measured 2.11:1 on the dark ground.
    expect(resolvePalette(null).textMuted).toBe(semantic.textMuted);
    expect(resolvePalette(null).textMuted).not.toBe(semanticLight.textMuted);
  });

  test("a PaletteOverride still wins (Polaris card ground)", () => {
    const override = { ...semantic, textMuted: semantic.text } as Palette;
    expect(resolvePalette(override)).toBe(override);
  });

  test("useThemePalette reads only the override context", () => {
    const ctx = read("lib/theme/ThemeContext.tsx");
    expect(ctx).toMatch(
      /export function useThemePalette\(\): Palette \{\s*return resolvePalette\(useContext\(PaletteOverrideContext\)\);\s*\}/,
    );
    for (const gone of [
      /\bsemanticLight\b/,
      /\buseState\b/,
      /\bAsyncStorage\b/,
      /\bgetItem\b/,
      /\blocalStorage\b/,
      /export function useTheme\(/,
      /export function ThemeProvider\b/,
      /\bThemeMode\b/,
    ]) {
      expect(ctx).not.toMatch(gone);
    }
  });

  test("no shipped module reads the light palette", () => {
    const readers = shipped
      .filter(({ rel }) => rel !== "lib/theme/tokens.ts")
      .filter(({ body }) => /\bsemanticLight\b/.test(body))
      .map(({ rel }) => rel);
    expect(readers).toEqual([]);
  });
});

describe("the retired stored mode is never read, only removed", () => {
  test("only the cleanup module names the key, and it never reads it", () => {
    const namers = shipped.filter(({ body }) => body.includes(RETIRED_THEME_MODE_KEY)).map(({ rel }) => rel);
    expect(namers).toEqual(["lib/theme/retired-theme-mode.ts"]);
    const mod = read("lib/theme/retired-theme-mode.ts");
    expect(mod).not.toMatch(/getItem|\.getAllKeys|multiGet/);
  });

  test("clears the key from both stores", async () => {
    const removedWeb: string[] = [];
    const removedNative: string[] = [];
    const stores: RetiredThemeModeStores = {
      web: { removeItem: (k) => void removedWeb.push(k) },
      native: { removeItem: async (k) => void removedNative.push(k) },
    };
    await clearRetiredThemeMode(stores);
    expect(removedWeb).toEqual(["2nd-brain:theme-mode"]);
    expect(removedNative).toEqual(["2nd-brain:theme-mode"]);
  });

  test("a store that throws or rejects does not stop the other, and never escapes", async () => {
    const removedNative: string[] = [];
    await expect(
      clearRetiredThemeMode({
        web: {
          removeItem: () => {
            throw new Error("SecurityError");
          },
        },
        native: { removeItem: async (k) => void removedNative.push(k) },
      }),
    ).resolves.toBeUndefined();
    expect(removedNative).toEqual(["2nd-brain:theme-mode"]);

    await expect(
      clearRetiredThemeMode({ web: null, native: { removeItem: () => Promise.reject(new Error("io")) } }),
    ).resolves.toBeUndefined();
    await expect(clearRetiredThemeMode({ web: null, native: null })).resolves.toBeUndefined();
  });

  test("the root layout runs the cleanup once and no longer mounts a theme provider", () => {
    const layout = read("app/_layout.tsx");
    // Mount-only effect (empty deps), shared with the other one-time boot read.
    expect(layout).toMatch(/useEffect\(\(\) => \{[^{}]*\n\s*void clearRetiredThemeMode\(\);\r?\n[^{}]*\}, \[\]\);/);
    expect(layout).not.toContain("<ThemeProvider>");
    expect(layout).not.toMatch(/import \{[^}]*\bThemeProvider\b[^}]*\} from "@\/lib\/theme\/ThemeContext"/);
  });
});

describe("the dark/light controls are removed, not hidden", () => {
  test("nothing imports a theme-mode hook", () => {
    const users = shipped
      .filter(({ body }) => /import \{[^}]*\buseTheme\b[^}]*\} from "@\/lib\/theme\/ThemeContext"/.test(body))
      .map(({ rel }) => rel);
    expect(users).toEqual([]);
  });

  test("settings has no 다크 모드 row", () => {
    const settings = read("app/settings.tsx");
    for (const gone of ['t("darkMode")', 't("deepSpaceTone")', 't("appearance")', "setMode(", "useTheme"]) {
      expect(settings).not.toContain(gone);
    }
  });

  test("/theme keeps font and motion and drops the 딥스페이스 / 미드나잇 section", () => {
    const dds = read("screens/deepspace/DeepSpaceDesignScreens.tsx");
    const start = dds.indexOf("export function DeepSpaceThemeScreen()");
    expect(start).toBeGreaterThan(-1);
    const screen = dds.slice(start, dds.indexOf("\n}\n", start));
    for (const gone of ['t("theme.sectionTheme")', 't("theme.themeDeepspace")', 't("theme.themeMidnight")', 't("theme.midnightNote")', "setMode("]) {
      expect(screen).not.toContain(gone);
    }
    expect(screen).toContain('t("theme.sectionFont")');
    expect(screen).toContain('t("theme.reduceMotion")');
  });

  test("the theme-section keys are gone in all five locales, the screen keys remain", () => {
    for (const lang of ["en", "ko", "es", "pt", "id"]) {
      const theme = JSON.parse(readFileSync(path.join(REPO, "locales", lang, "deepspace.json"), "utf8")).theme;
      for (const gone of ["sectionTheme", "themeDeepspace", "themeMidnight", "midnightNote"]) {
        expect([lang, gone, gone in theme]).toEqual([lang, gone, false]);
      }
      for (const kept of ["title", "status", "tip", "sectionFont", "fontPixel", "fontReadable", "reduceMotion"]) {
        expect([lang, kept, typeof theme[kept]]).toEqual([lang, kept, "string"]);
      }
    }
  });
});
