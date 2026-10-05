// rev2 P3a guard: the deep-space 북극성 screen renders a progressively
// disclosed three-page deck, keeps validation data real, and never lets the
// stale 10-me reference override the canonical seven-star model.

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
    // 2026-10-05: 여기서 `loadDomainLevels` 를 단언했다. 그 로더는 레거시 꼬리의 도메인
    // 밝기만 읽었고 꼬리와 함께 빠졌다(Simon 결정 Q-261004-11 C). 덱의 실데이터 밝기는
    // 일곱 별 로더가 진다.
    expect(screen).toContain("loadSevenLevels(");
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

  // 2026-10-05: 덱 블록의 경계가 바뀌었다. 전에는 `if (isDeepSpaceUI())` 분기부터 레거시
  // 꼬리의 `<SceneHero` 앞까지였다. 롤백 레버가 없어져(Simon 결정 Q-261004-11 C) 화면
  // 함수 전체가 덱이다 - CoreBrainScreen 부터 다음 최상단 함수 앞까지.
  test("first page is one canonical synthesis message with one seven-to-one graphic", () => {
    const start = screen.indexOf("function CoreBrainScreen()");
    const end = screen.indexOf("\nfunction evidenceLabel", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const deepSpaceBlock = screen.slice(start, end);

    expect(screen).toContain('from "@/lib/persona/seven-stars"');
    expect(screen).toContain("loadLatestStrengths");
    expect(deepSpaceBlock).toContain("strengthSummary");
    expect(deepSpaceBlock).toContain("SEVEN_STARS.map");
    expect(screen).toContain("stepPolyline");
    expect(deepSpaceBlock).toContain("PixelStarSvg");
    expect(deepSpaceBlock).toContain('t("currentBrightness")');
    expect(screen).toContain("POLARIS_BOWL_IDS");
    expect(screen).toContain("POLARIS_HANDLE_IDS");
    expect(screen).toContain("POLARIS_GUIDE_IDS");
    expect(screen).toContain("index % 3 === 0");
    expect(deepSpaceBlock).toContain('width="100%"');

    const outputPoint = screen.match(/const POLARIS_OUTPUT_POINT = \[(\d+),\s*(\d+)\]/);
    const outerStar = deepSpaceBlock.match(
      /<PixelStarSvg cx=\{POLARIS_OUTPUT_POINT\[0\]\} cy=\{POLARIS_OUTPUT_POINT\[1\]\} r=\{(\d+)\}/,
    );
    const viewBox = deepSpaceBlock.match(/viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/);
    expect(outputPoint).not.toBeNull();
    expect(outerStar).not.toBeNull();
    expect(viewBox).not.toBeNull();
    expect(Number(outputPoint?.[2]) - Number(outerStar?.[1])).toBeGreaterThanOrEqual(Number(viewBox?.[2]));

    expect(deepSpaceBlock).not.toMatch(/\b(homeDomains|topDomain|roleHeadline|traitRows|strengthLabels|confidenceDots)\b/);
    expect(deepSpaceBlock).not.toMatch(/dsDeck\.(traitList|personCard|strengthRow|evidenceMeta)/);
    expect(deepSpaceBlock).not.toContain("BIG FIVE");
    expect(deepSpaceBlock).not.toContain("가장 밝은 나");
  });

  test("empty state opens a canonical self-knowledge star instead of a retired domain check", () => {
    const start = screen.indexOf("if (evidence.length === 0)");
    const end = screen.indexOf("const visibleRoleCards", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const emptyBlock = screen.slice(start, end);

    expect(emptyBlock).toContain("SEVEN_STARS.map");
    expect(emptyBlock).toContain('tHome("ds.home.star.now.line")');
    expect(emptyBlock).toContain('router.push("/me/now")');
    expect(emptyBlock).toContain("PolarisCategorySlots");
    expect(emptyBlock).not.toContain('router.push("/attachment")');
  });

  test("the screen does not reintroduce the Soul Core name", () => {
    // Until 2026-10-05 the legacy premium-shell branch could keep 소울 코어 and only
    // the deck block was checked. That branch left with the rollback lever, so the
    // whole screen function is the deck and must use 북극성 only.
    const start = screen.indexOf("function CoreBrainScreen()");
    const end = screen.indexOf("\nfunction evidenceLabel", start);
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
