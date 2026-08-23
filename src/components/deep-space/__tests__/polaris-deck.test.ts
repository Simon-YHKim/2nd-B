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
    // The tool list used to be four hardcoded `route: "/…"` literals here, and
    // this test pinned that literal form. Both moved: the list is now built from
    // `src/lib/assess/registry.ts`, which fixed two things the hardcoding hid —
    // only four of nine tools were reachable from this screen, and two
    // self-authored check-ins sat under a heading that said "validated".
    //
    // Asserting the wiring instead of the literals is STRICTER: every offerable
    // tool is now reachable, not just the four someone remembered to type.
    expect(screen).toContain('from "@/lib/assess/registry"');
    expect(screen).toContain("VALIDATED_TOOLS.map");
    expect(screen).toContain("SELF_TOOLS.map");
    // MBTI is retired (src/app/mbti.tsx is a deep-link redirect to /persona) —
    // the deck must not promise a screener that lands somewhere else. The
    // registry marks it `retired` so it cannot reach either list; this stays as
    // a second lock in case someone hand-adds a button.
    expect(screen).not.toContain('route: "/mbti"');
    expect(screen).not.toContain('push("/mbti")');
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
