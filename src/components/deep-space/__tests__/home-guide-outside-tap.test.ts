// Q-261014-62 (Simon, 2026-10-14 20:33): while the home guide is up, a tap outside it closes it.
//
// The guide's first step dims everything but the Scrap tab with four panels. On home those
// panels now close the guide and remember it, as the bubble's "다시 보지 않기" does; the hole over
// the Scrap tab still leads into the record flow. The capture screen's later steps use the same
// card and keep stopping taps outside: they pass no outside handler.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

const CARD = read("src/components/deep-space/FirstRecordCoachmark.tsx");
const HOME = read("src/components/deep-space/HomeCoachmarks.tsx");
const CAPTURE = read("src/components/deep-space/DeepSpaceViews.tsx");

describe("the home guide closes on a tap outside it", () => {
  it("home hands the card the same close that its button uses", () => {
    expect(HOME).toContain("onSkip={finish}");
    expect(HOME).toContain("onOutsidePress={finish}");
    // finish forgets the back claim and remembers the guide as seen.
    expect(HOME).toMatch(/const finish = useCallback\(\(\) => \{\s*backOwner\.current\?\.release\(\);\s*markCoachmarksSeen\(ownerId\);/);
  });

  it("all four dimmed panels take that tap, and the hole over the target does not", () => {
    const panels = CARD.match(/<DitherPanel [^>]*\/>/g) ?? [];
    expect(panels).toHaveLength(4);
    for (const panel of panels) expect(panel).toContain("onPress={onOutsidePress}");
    // The target frame between them still lets taps through to the Scrap tab.
    expect(CARD).toMatch(/<View\s+pointerEvents="none"\s+style=\{\[\s*styles\.targetFrame/);
  });

  it("a panel with a handler is pressable but not read out; without one it only stops taps", () => {
    const panel = CARD.slice(CARD.indexOf("function DitherPanel("), CARD.indexOf("export function FirstRecordCoachmark("));
    expect(panel).toContain("<Pressable accessible={false} onPress={onPress} style={[styles.dimPanel, style]}>");
    expect(panel).toContain('<View pointerEvents="auto" style={[styles.dimPanel, style]}>');
    expect(panel).toMatch(/return onPress \? \(/);
  });

  it("the capture screen's steps keep stopping taps outside", () => {
    expect(CAPTURE).toContain("<FirstRecordCoachmark");
    expect(CAPTURE).not.toContain("onOutsidePress");
  });
});
