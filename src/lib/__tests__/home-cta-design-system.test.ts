import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

describe("home CTA design-system wiring", () => {
  test("first-run and comfort CTAs render through PremiumButton", () => {
    const source = readRepoFile("src/app/index.tsx");

    expect(source).toContain("PowerOnOverlay, PremiumButton, StarNoiseLayer, TAB_BAR_HEIGHT");
    expect(countMatches(source, /<PremiumButton\b/g)).toBeGreaterThanOrEqual(4);
    // QA #1: these CTA labels moved to the `index` locale namespace; assert the
    // t() calls (the CTAs still render through PremiumButton with these labels).
    expect(source).toContain('t("firstPiece")');
    expect(source).toContain('t("lookFirst")');
    expect(source).toContain('t("makeReadable")');
    expect(source).toContain('t("likeAsIs")');
    expect(source).not.toContain("emptyGraphCtaText");
    expect(source).not.toContain("emptyGraphSkipText");
    expect(source).not.toContain("comfortButtonPrimary");
    expect(source).not.toContain("comfortButtonPrimaryLabel");
    expect(source).not.toContain("comfortButtonLabel");
  });

  test("home tap cards share the 80ms opacity feedback pressable", () => {
    const source = readRepoFile("src/app/index.tsx");

    expect(source).toContain("function HomePressable");
    expect(source).toContain("duration: 80");
    expect(source).toContain("animateOpacity(0.8)");
    expect(source).toContain("animateOpacity(1)");
    expect(source).toMatch(/<HomePressable\s+onPress=\{dismissCoreHint\}/);
    expect(source).toMatch(/<HomePressable\s+onPress=\{\(\) => \{\s+wake\(\);/);
  });
});
