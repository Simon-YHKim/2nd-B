// rev2 P3a guard: the deep-space 북극성 screen renders the three-page persona
// deck from 10-me (role + portrait + evidence), keeps validation data real, and
// never reintroduces the legacy "Soul Core" user-facing name.

import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

const deck = read("components/deep-space/PolarisDeck.tsx");
const screen = read("app/core-brain.tsx");

describe("북극성 persona deck (P3a)", () => {
  test("deck is a paged swiper with tab-dot a11y", () => {
    expect(deck).toMatch(/pagingEnabled/);
    expect(deck).toMatch(/accessibilityRole="tablist"/);
    expect(deck).toMatch(/accessibilityRole="tab"/);
  });

  test("deck keeps token discipline (no raw colors)", () => {
    for (const source of [deck]) {
      expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
      expect(source).not.toMatch(/rgba\(/);
    }
    expect(deck).toMatch(/m3\./);
  });

  test("deep-space 북극성 screen mounts the three real-data pages and validation entries", () => {
    expect(screen).toMatch(/PolarisDeck/);
    expect(screen).toContain('key: "role"');
    expect(screen).toContain('key: "portrait"');
    expect(screen).toContain('key: "evidence"');
    expect(screen).not.toMatch(/<TraitRadar/);
    expect(screen).toMatch(/persona\.traits\.openness/);
    expect(screen).toContain("loadLatestStrengths");
    expect(screen).toContain("loadDomainLevels");
    for (const route of ["/big-five", "/attachment", "/strengths", "/values"]) {
      expect(screen).toContain(`route: "${route}"`);
    }
    // MBTI is retired (src/app/mbti.tsx is a deep-link redirect to /persona) —
    // the deck must not promise a screener that lands somewhere else.
    expect(screen).not.toContain('route: "/mbti"');
    // History surfaces hang off the hero card (P3c/P3d).
    expect(screen).toContain('router.push("/brightness")');
    expect(screen).toContain('router.push("/ratifications")');
  });

  test("the deep-space branch does not reintroduce the Soul Core name", () => {
    // The legacy premium-shell branch may keep 소울 코어; the deep-space deck
    // block (from the isDeepSpaceUI() branch to the legacy return) must
    // use 북극성 only.
    const start = screen.indexOf("if (isDeepSpaceUI())");
    const end = screen.indexOf("<SceneHero", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const deepSpaceBlock = screen.slice(start, end);
    // QA #1: naming moved to the core-brain namespace. The deep-space block
    // must use the Polaris t() keys and never the soul-core-named ones (whose
    // ko renders "소울 코어").
    expect(deepSpaceBlock).not.toContain("소울 코어");
    expect(deepSpaceBlock).not.toContain("Soul Core");
    expect(deepSpaceBlock).not.toMatch(/t\("(myCenter|soulCoreEyebrow)"\)/);
    expect(deepSpaceBlock).toMatch(/t\("polaris/);
  });
});
