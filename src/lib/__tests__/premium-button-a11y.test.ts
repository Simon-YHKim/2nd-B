import { readFileSync } from "node:fs";
import path from "node:path";

import { gameboy } from "@/lib/theme/gameboy-tokens";
import { cosmic, withAlpha } from "@/lib/theme/tokens";

const root = path.resolve(__dirname, "../../..");

type Rgb = [number, number, number];

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function parseRgba(value: string): { rgb: Rgb; alpha: number } {
  const match = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/);
  if (!match) throw new Error(`Invalid rgba value: ${value}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

function composite(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return foreground.map((channel, index) => Math.round(channel * alpha + background[index] * (1 - alpha))) as Rgb;
}

function srgb(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  return 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
}

describe("PremiumButton disabled accessibility", () => {
  test("disabled PremiumButton stays on the Pressable path with announced state", () => {
    const source = readRepoFile("src/components/premium/surfaces.tsx");

    expect(source).toContain("const BTN_DISABLED_FG = withAlpha(cosmic.moonWhite, 0.72);");
    expect(source).not.toMatch(/if\s*\(isDisabled\)\s*{\s*return\s*\(\s*<View/s);
    expect(source).toContain("disabled={isDisabled}");
    expect(source).toContain("accessibilityState={{ ...accessibilityState, disabled: !!isDisabled, busy: !!loading }}");
    expect(source).toContain("!isDisabled ? animatedPressStyle : null");
  });

  test("disabled foreground contrast clears the 3:1 floor on premium dark surfaces", () => {
    const surface = parseHex(cosmic.space950);
    const disabledBg = parseRgba(withAlpha(cosmic.mistGray, 0.16));
    const disabledFg = parseRgba(withAlpha(cosmic.moonWhite, 0.72));
    const bgOnSurface = composite(disabledBg.rgb, surface, disabledBg.alpha);
    const fgOnBg = composite(disabledFg.rgb, bgOnSurface, disabledFg.alpha);

    expect(disabledFg.alpha).toBeGreaterThanOrEqual(0.72);
    expect(contrastRatio(fgOnBg, bgOnSurface)).toBeGreaterThanOrEqual(3);
  });

  test("secondary button edge contrast clears the non-text floor", () => {
    const secondaryBg = parseHex(cosmic.space700);
    const border = parseRgba(gameboy.border);
    const borderOnSecondary = composite(border.rgb, secondaryBg, border.alpha);

    // Active build is deep-space (cyan): the edge is the eye-cyan border. The
    // contrast floor below is the real a11y guarantee and holds in both builds.
    expect(gameboy.border).toBe("rgba(70,182,255,0.68)");
    expect(contrastRatio(borderOnSecondary, secondaryBg)).toBeGreaterThanOrEqual(3);
  });

  // Legacy UI track removed 2026-06-23: the "capture disabled save gate" case pinned the
  // legacy src/app/capture.tsx accessibilityHint wiring (submitAccessibilityHint +
  // t("submitHints.*")). src/app/capture.tsx is now a thin deep-space wrapper and the
  // deep-space CaptureView does not render that disabled-save-gate hint surface, so this
  // legacy-only accessibility-wiring assertion has no surviving equivalent and is
  // removed. The premium-button disabled a11y guarantees (the Pressable path, announced
  // disabled/busy state, and the 3:1 contrast floor) are still covered by the cases
  // above against src/components/premium/surfaces.tsx.
});
