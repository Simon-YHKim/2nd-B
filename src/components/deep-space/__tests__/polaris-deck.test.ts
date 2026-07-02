// rev2 P3a guard: the deep-space 북극성 screen renders the persona DECK
// (swipe cards + Big Five radar + validation entry), the "Soul Core" user-facing
// name is dropped on the canon track, and the new components keep token discipline.

import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

const deck = read("components/deep-space/PolarisDeck.tsx");
const radar = read("components/persona/TraitRadar.tsx");
const screen = read("app/core-brain.tsx");

describe("북극성 persona deck (P3a)", () => {
  test("deck is a paged swiper with tab-dot a11y", () => {
    expect(deck).toMatch(/pagingEnabled/);
    expect(deck).toMatch(/accessibilityRole="tablist"/);
    expect(deck).toMatch(/accessibilityRole="tab"/);
  });

  test("deck and radar keep token discipline (no raw colors)", () => {
    for (const source of [deck, radar]) {
      expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
      expect(source).not.toMatch(/rgba\(/);
    }
    expect(deck).toMatch(/m3\./);
    expect(radar).toMatch(/m3\.accent\./);
  });

  test("deep-space 북극성 screen mounts the deck with radar + validation entry", () => {
    expect(screen).toMatch(/PolarisDeck/);
    expect(screen).toMatch(/TraitRadar/);
    expect(screen).toMatch(/북극성 · 종합/);
    for (const route of ["/big-five", "/ipip-neo", "/attachment", "/motivation", "/strengths", "/mbti", "/audit"]) {
      expect(screen).toContain(`route: "${route}"`);
    }
    // History surfaces hang off the hero card (P3c/P3d).
    expect(screen).toContain('router.push("/brightness")');
    expect(screen).toContain('router.push("/ratifications")');
  });

  test("radar discloses its source honestly (instrument vs approximation)", () => {
    expect(radar).toMatch(/instrumentLabel/);
    expect(radar).toMatch(/근사치/);
  });

  test("the deep-space branch does not reintroduce the Soul Core name", () => {
    // The legacy premium-shell branch may keep 소울 코어; the deep-space deck
    // block (from the isDeepSpaceUI() branch marker to the legacy return) must
    // use 북극성 only.
    const start = screen.indexOf("rev2 P3a (deep-space track)");
    const end = screen.indexOf("<SceneHero");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const deepSpaceBlock = screen.slice(start, end);
    expect(deepSpaceBlock).not.toContain("소울 코어");
    expect(deepSpaceBlock).not.toContain("Soul Core");
    expect(deepSpaceBlock).toContain("북극성");
  });
});
