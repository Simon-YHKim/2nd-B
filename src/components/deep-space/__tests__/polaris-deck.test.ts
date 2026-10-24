// rev2 P3a guard: the deep-space 북극성 screen renders a progressively
// disclosed three-page deck, keeps validation data real, and never lets the
// stale 10-me reference override the canonical seven-star model.

import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

const deck = read("components/deep-space/PolarisDeck.tsx");
const screen = read("app/core-brain.tsx");
const reader = read("lib/persona/use-core-evidence-read.ts");
const companions = read("lib/persona/use-core-role-reads.ts");

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
    expect(screen).toContain("useCoreEvidenceRead(");
    expect(reader).not.toContain("loadSevenLevels");
    expect(screen).toContain("useCoreBrightnessRead(userId, primaryScope, primaryIsCurrent, primaryRead.invalidateAuto)");
    expect(companions).toContain("useOwnedSlot(owner, scope, isCurrent, invalidateAuto, loadSevenLevelsStrict)");
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
    expect(companions).toContain("loadLatestStrengths(getSupabaseClient(), owner)");
    expect(reader).not.toContain("loadLatestStrengths");
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
    const end = screen.indexOf("const pieces = persona", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const emptyBlock = screen.slice(start, end);

    expect(emptyBlock).toContain("SEVEN_STARS.map");
    expect(emptyBlock).toContain('tHome("ds.home.star.now.line")');
    expect(emptyBlock).toContain('router.push("/me/now")');
    expect(emptyBlock).toContain("body: categoryBody");
    expect(screen).toContain("const categoryBody = rolesReady ? <PolarisCategorySlots cards={visibleRoleCards} /> : roleReadStatus");
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

// Simon 2026-10-12 (Q-261012-52 · 55): the instruction line leaves the head, a
// back arrow takes its place outside the phone, and a dithered band at the
// card's bottom says there is more text. Source contracts: render tests are
// not available here, and the pure edge rule is tested in card-dismiss.test.ts.
describe("북극성 head: back arrow instead of an instruction line", () => {
  const overlay = read("components/deep-space/PolarisCardOverlay.tsx");
  const edges = read("components/deep-space/polaris-card-edges.ts");
  const LOCALES = ["en", "ko", "es", "pt", "id"];
  const locale = (lng: string) =>
    JSON.parse(fs.readFileSync(path.join(SRC, "..", "locales", lng, "core-brain.json"), "utf8")) as Record<string, unknown>;

  test("the swipe instruction is gone from the deck", () => {
    expect(deck).not.toContain("swipeCards");
    expect(deck).not.toContain("deckHint");
    expect(deck).not.toContain("deckHeadCopy");
  });

  test.each(LOCALES)("%s drops the instruction string and keeps the close name", (lng) => {
    const strings = locale(lng);
    expect(strings).not.toHaveProperty("swipeCards");
    expect(typeof strings.closeCard).toBe("string");
  });

  test("the head draws the app's back glyph only when the overlay hands it a close", () => {
    expect(deck).toContain("const close = usePolarisCardClose();");
    expect(deck).toMatch(/\{close \? \(\s*<Pressable\s+onPress=\{close\}/);
    expect(deck).toContain('accessibilityLabel={t("core-brain:closeCard")}');
    expect(deck).toContain('<PixelGlyph name="arrow_back" color={m3.color.tertiary} size={24} />');
    // 44dp touch target, like every other back in the app.
    expect(deck).toMatch(/deckBack: \{[^}]*width: 44,[^}]*height: 44/);
  });

  test("inside the phone no close is handed down: the phone's own back row stays the only back", () => {
    expect(edges).toContain("export const PolarisCardCloseContext = createContext<(() => void) | null>(null);");
    expect(overlay).toContain('const closeFromHead = useMemo(() => (embed ? null : () => dismiss("down")), [dismiss, embed]);');
    expect(overlay).toContain("<PolarisCardCloseContext.Provider value={closeFromHead}>");
    // The overlay still lets the shell draw the phone's back: it does not claim ownBack.
    expect(overlay).not.toContain("ownBack");
  });

  test("the title keeps the row and wraps instead of clipping", () => {
    expect(deck).toContain("<Text style={styles.deckTitle} numberOfLines={2}>");
    expect(deck).toMatch(/deckTitle: \{[^}]*flexGrow: 1,[^}]*flexShrink: 1,[^}]*minWidth: 0/);
  });
});

describe("북극성 card: a dithered band while more text waits below", () => {
  test("the band follows the measured body, off the same edge rule as the swipe", () => {
    expect(deck).toContain('import { cardEdges, cardHasMoreBelow } from "@/lib/polaris/card-dismiss";');
    expect(deck).toContain("const below = cardHasMoreBelow(body);");
    expect(deck).toContain("{more[page.key] ? (");
  });

  test("it is three stepped dither rows in the card's own ground, and never takes a touch", () => {
    expect(deck).toContain("const MORE_BAND = [25, 50, 75] as const;");
    expect(deck).toContain('<View pointerEvents="none" style={styles.more}>');
    expect(deck).toContain("<PixelDither density={density} style={styles.moreTint} />");
    // width / height are explicit: absoluteFill alone leaves the image at its 4x4 tile on web.
    expect(deck).toContain('moreTint: { width: "100%", height: "100%", tintColor: m3.polarisCard.surface }');
    expect(deck).toMatch(/more: \{[^}]*position: "absolute",[^}]*bottom: 0/);
    // 4px tiles: each step is two tile rows, so no row is cut mid-tile.
    expect(deck).toContain("moreStep: { height: 8 }");
  });
});
