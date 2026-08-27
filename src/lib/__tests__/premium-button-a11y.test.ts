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

    // ⚠ **옛 소스 줄을 글자 그대로 박지 않는다.**
    //   여기 `const BTN_DISABLED_FG = withAlpha(cosmic.moonWhite, 0.72);` 가 박혀
    //   있었는데, 그 줄의 뜻은 "비활성 글자색은 opacity 가 아니라 **색**으로 준다"다.
    //   리터럴로 박아두면 **더 나은 구현으로 바꿔도 깨진다** — 실제로 규칙 4
    //   (정적 반투명 금지)에 맞춰 미리 합성하는 `surfAlpha` 로 옮기자 깨졌다.
    //   그래서 뜻만 남기고 표현을 푼다.
    expect(source).toMatch(/const BTN_DISABLED_FG = \w*[Aa]lpha\(cosmic\.moonWhite, 0\.72[,)]/);
    // 비활성은 **opacity 로 흐리게 하지 않는다** — 그러면 글자가 바탕보다 또렷해진다.
    expect(source).not.toMatch(/BTN_DISABLED_\w+\s*=\s*\{[^}]*opacity/);
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

  test("capture disabled save gate exposes localized reason hints", () => {
    const capture = readRepoFile("src/app/capture.tsx");
    const en = JSON.parse(readRepoFile("locales/en/capture.json")) as {
      submitHints: Record<string, string>;
      ocrReview: { submitHint: string };
    };
    const ko = JSON.parse(readRepoFile("locales/ko/capture.json")) as {
      submitHints: Record<string, string>;
      ocrReview: { submitHint: string };
    };
    const requiredHints = ["writeFirst", "fileRequired", "ocrRequired", "journalLocked", "journalLimit", "saving"];

    expect(capture).toContain("const submitAccessibilityHint = canSubmit");
    expect(capture).toContain('t("submitHints.writeFirst")');
    expect(capture).toContain('t("submitHints.fileRequired")');
    expect(capture).toContain('t("submitHints.ocrRequired")');
    expect(capture).toContain('t("ocrReview.submitHint")');
    expect(capture).toContain("accessibilityHint={submitAccessibilityHint}");
    for (const key of requiredHints) {
      expect(en.submitHints[key]).toEqual(expect.any(String));
      expect(ko.submitHints[key]).toEqual(expect.any(String));
    }
    expect(en.ocrReview.submitHint).toContain("before saving");
    expect(ko.ocrReview.submitHint).toContain("저장");
  });
});
