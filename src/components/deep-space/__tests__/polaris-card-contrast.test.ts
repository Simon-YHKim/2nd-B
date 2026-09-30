// 북극성 카드 글자 대비를 숫자로 지킨다 (Simon localhost QA 2026-09-30:
// "글자 색상 때문에 가독성이 너무 낮아").
//
// 옛 카드(#232e4a)에서 안내 문구 `textLo` #608aa1 이 3.62:1, 링크 `primary`
// #5b8def 가 4.16:1 이었다. 카드가 북극성 보라로 바뀌면서 그 위의 글자색은
// PolarisCardOverlay 가 넘기는 팔레트와 버튼 틴트가 정한다. 여기서 그 값을
// 실제로 대비 계산해 WCAG AA(글자 4.5:1, 테두리 3:1)를 넘는지 본다 - 값을
// 바꿔도 기준을 넘으면 통과하고, 기준 밑으로 떨어지면 어느 값이든 걸린다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { m3 } from "@/lib/theme/m3";

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const card = m3.polarisCard;

describe("the contrast maths is real", () => {
  test("black on white is 21:1 and the old helper text was 3.62:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrast("#608aa1", "#232e4a")).toBeCloseTo(3.62, 1);
  });
});

describe("text on the Polaris card clears WCAG AA", () => {
  const grounds = { surface: card.surface, surfaceLow: card.surfaceLow };
  const inks = { ink: card.ink, inkMuted: card.inkMuted, inkSubtle: card.inkSubtle, action: card.action };
  for (const [groundName, ground] of Object.entries(grounds)) {
    for (const [inkName, ink] of Object.entries(inks)) {
      test(`${inkName} on ${groundName} >= 4.5:1`, () => {
        expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  test("text on a filled button >= 4.5:1", () => {
    expect(contrast(card.onAction, card.action)).toBeGreaterThanOrEqual(4.5);
  });

  test("the card edge stands out from the card >= 3:1 (non-text)", () => {
    expect(contrast(card.edge, card.surface)).toBeGreaterThanOrEqual(3);
  });
});

describe("the overlay actually hands those colours to the card", () => {
  const src = readFileSync(join(process.cwd(), "src/components/deep-space/PolarisCardOverlay.tsx"), "utf8");

  test("Text colours on the card come from the Polaris palette", () => {
    expect(src).toMatch(/textMuted: card\.inkMuted/);
    expect(src).toMatch(/textSubtle: card\.inkSubtle/);
    expect(src).toMatch(/brand: card\.action/);
    expect(src).toMatch(/<PaletteOverride palette=\{POLARIS_CARD_PALETTE\}>/);
  });

  test("buttons on the card use the lavender action, not sky blue", () => {
    expect(src).toMatch(/<MdButtonTintProvider tint=\{POLARIS_CARD_BUTTONS\}>/);
    expect(src).not.toMatch(/m3\.color\.primary/);
  });
});

describe("the card clears the home top bar that stays above it", () => {
  test("HOME_TOP_BAR_HEIGHT matches ConstellationHome's topBar height", () => {
    const home = readFileSync(join(process.cwd(), "src/components/deep-space/ConstellationHome.tsx"), "utf8").replace(/\r\n/g, "\n");
    const topBar = home.slice(home.indexOf("  topBar: {"), home.indexOf("},", home.indexOf("  topBar: {")));
    const overlay = readFileSync(join(process.cwd(), "src/components/deep-space/PolarisCardOverlay.tsx"), "utf8");
    const declared = Number(overlay.match(/export const HOME_TOP_BAR_HEIGHT = (\d+);/)?.[1]);
    expect(topBar).toMatch(/height: \d+/);
    expect(Number(topBar.match(/height: (\d+)/)?.[1])).toBe(declared);
  });
});
