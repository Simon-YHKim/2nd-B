// 홈 별자리와 북극성 화면이 **같은 일곱**을 말하는가.
//
// ⚠ 2026-08-24 에 일곱의 내용이 통째로 바뀌었다. 예전에는 "여섯 생활 도메인 +
// 프로필"(커리어·재정·관계·성장·건강·휴식 + 프로필)이었다. Simon 결정으로
// 생활 도메인은 별자리에서 내려가 대시보드로 가고, 별은 **나를 알아가는 일곱
// 자리**가 됐다 -- 프로필 · 영유아기 · 학창시절 · 20대 · 30대 이후 · 직장 · 지금.
//
// 이 파일이 지키는 규율은 그대로다: **목록이 한 곳에서만 정해진다.** 예전에
// 홈·북극성·도메인 세 곳이 서로 다른 일곱을 말해서 사용자가 같은 별을 다른
// 이름으로 배웠다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOMAIN_STARS } from "../domain-stars";
import { HOME_STAR_IDS, isHomeStarId } from "../home-stars";
import { SEVEN_STAR_IDS, SEVEN_STARS } from "../seven-stars";
import { coveredDrillLayers, meStarStaticParams } from "../../nav/me-star-route";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("홈의 일곱", () => {
  it("일곱이다", () => {
    expect(HOME_STAR_IDS).toHaveLength(7);
  });

  it("북두칠성 정의와 **같은 목록**이다 (두 벌이 되면 또 갈라진다)", () => {
    expect([...HOME_STAR_IDS]).toEqual([...SEVEN_STAR_IDS]);
  });

  it("⚠ 생활 도메인은 이제 별이 아니다", () => {
    // 커리어·재정·… 은 세컨비 대시보드로 갔다. 별자리에 남아 있으면
    // "일곱이 세 벌" 이던 혼선이 그대로 재발한다.
    for (const d of DOMAIN_STARS) {
      expect(HOME_STAR_IDS as readonly string[]).not.toContain(d.id);
    }
  });

  it("id 가 유일하다", () => {
    expect(new Set(HOME_STAR_IDS).size).toBe(HOME_STAR_IDS.length);
  });

  it("isHomeStarId 가 목록과 일치한다", () => {
    for (const id of HOME_STAR_IDS) expect(isHomeStarId(id)).toBe(true);
    expect(isHomeStarId("career")).toBe(false);
    expect(isHomeStarId("nope")).toBe(false);
  });
});

describe("별자리 그림이 목록과 어긋나지 않는다", () => {
  const home = read("src/components/deep-space/ConstellationHome.tsx");

  it("좌표가 일곱 개다", () => {
    const block = /const REV2_STARS[\s\S]*?\n\];/.exec(home)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(0);
    const ids = [...block.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(7);
    expect(new Set(ids)).toEqual(new Set(SEVEN_STAR_IDS));
  });

  it("국자·손잡이·지극선이 실재하는 별만 가리킨다", () => {
    for (const name of ["BOWL", "HANDLE", "GUIDE"]) {
      const line = new RegExp(`const ${name}: HomeStarId\\[\\] = \\[([^\\]]*)\\]`).exec(home)?.[1] ?? "";
      expect(line.length).toBeGreaterThan(0);
      for (const id of [...line.matchAll(/"([a-z]+)"/g)].map((m) => m[1])) {
        expect(SEVEN_STAR_IDS as readonly string[]).toContain(id);
      }
    }
  });

  it("별 이름을 공용 키에서 읽는다 (화면마다 다른 이름 금지)", () => {
    expect(home).toContain("t(`ds.star.${id}`)");
    const core = read("src/app/core-brain.tsx");
    // 2026-10-05: 북극성 화면이 별 이름을 부르던 자리 `ds.star.${id}` 는 레거시 꼬리에
    // 있었고 롤백 레버와 함께 빠졌다(Simon 결정 Q-261004-11 C). 배송 덱은 같은 공용 키를
    // 일곱 별 정본(SEVEN_STARS)의 key 로 부른다 - 화면마다 다른 이름 금지는 그대로다.
    expect(core).toContain("tHome(`ds.star.${star.key}`)");
  });
});

describe("별을 누르면 그 별의 요약이 열린다 (Simon 결정 4 = B)", () => {
  const shell = read("src/components/deep-space/DeepSpaceShell.tsx");

  it("요약 라우트로 간다", () => {
    expect(shell).toContain("router.push(`/me/${id}`)");
  });

  it("바로 인터뷰로 던지지 않는다", () => {
    // 지금까지 뭘 했는지 볼 자리 없이 대화만 열면 매번 처음부터인 기분이 된다.
    expect(shell).not.toContain('router.push("/interview")');
  });

  it("요약 화면이 일곱을 전부 안다", () => {
    const page = read("src/app/me/[star].tsx");
    expect(page).toContain("isSevenStarId");
    expect(page).toContain("getSevenStar");
    // 잠긴 별을 눌러도 인터뷰로 못 가야 한다.
    expect(page).toContain("isUnlived");
  });

  it("프로필 별의 채우기 CTA가 실제 입력 화면으로 직행한다", () => {
    const page = read("src/app/me/[star].tsx");
    expect(page).toContain('router.push("/profile-details")');
    expect(page).not.toContain('router.push("/profile")');
  });

  // Simon 2026-10-06: 프로필 별은 설명 카드 대신 프로필을 바로 보여준다 - 아바타,
  // 요약 한 줄, 버튼 하나(채운 칸이 없으면 설정, 있으면 수정). 아바타 꾸미기는 /profile 에.
  it("프로필 별은 아바타와 요약 한 줄, 설정/수정 버튼 하나를 보여준다", () => {
    const page = read("src/app/me/[star].tsx");
    expect(page).toContain("<AvatarPreview spec=");
    expect(page).toContain("PROFILE_DETAIL_FIELDS.flatMap");
    expect(page).toContain("profileChoiceLabelKey(field.key, value)");
    expect(page).toContain('t(countFilledDetails(profile.details) > 0 ? "ds.star.editProfile" : "ds.star.setupProfile")');
    // 읽기 실패는 "프로필 없음"이 아니다 - 설정/수정을 고르지 않는다.
    expect(page).toContain(': t("ds.star.openProfile");');
    expect(page).not.toContain('router.push("/avatar-studio")');
    expect(page).not.toContain('t("ds.star.profileBody")');
  });

  // Simon 2026-10-07: 두 줄 - 큰 아바타, 그다음 요약 세 줄. 제목은 왼쪽 위, 연필은 오른쪽 위.
  it("프로필 별은 큰 아바타 · 요약 세 줄 · 오른쪽 위 연필로 그린다", () => {
    const page = read("src/app/me/[star].tsx");
    expect(page).toContain('<PixelGlyph name="edit"');
    expect(page).toContain("accessibilityLabel={profileCta}");
    // 10-07 2차: 아바타 폭 = 요약 상자 폭, 요약은 말줄임 없이 다섯 줄 높이에서 스크롤.
    expect(page).toContain("size={avatarWidth} />");
    expect(page).not.toContain("numberOfLines={1}");
    expect(page).toContain("profileSummary: { maxHeight: m3.type.bodyLarge.line * 5 }");
    expect(page.indexOf("styles.profileHeader")).toBeLessThan(page.indexOf("styles.profileAvatarRow"));
    // Approved import design: real status, labeled facts, common flow and server history.
    expect(page).toContain("Math.min(208, Math.floor(nativeEvent.layout.width))");
    expect(page).toContain("fetchStatusMessage(userId)");
    expect(page).toContain('router.push("/profile-import")');
    expect(page).toContain('params: { mode: "history" }');
  });

  it("정적 웹 export도 일곱 요약 경로를 전부 만든다", () => {
    const page = read("src/app/me/[star].tsx");
    expect(page).toContain("export function generateStaticParams");
    expect(page).toContain("return meStarStaticParams();");
    expect(meStarStaticParams()).toEqual(SEVEN_STAR_IDS.map((star) => ({ star })));
  });

  it("요약 그래픽은 실제로 판 층만 켠다", () => {
    expect(
      coveredDrillLayers({ fact: 2, feeling: 0, meaning: 1, belief: 0, echo: 0 }),
    ).toEqual(["fact", "meaning"]);
  });
});

describe("각 별에 이름이 있다 (다섯 로케일)", () => {
  it.each(["en", "ko", "es", "pt", "id"])("%s", (loc) => {
    const dict = JSON.parse(read(`locales/${loc}/home.json`)) as {
      ds?: { star?: Record<string, string> };
    };
    const star = dict.ds?.star ?? {};
    for (const s of SEVEN_STARS) {
      expect(typeof star[s.key]).toBe("string");
      expect((star[s.key] ?? "").length).toBeGreaterThan(0);
    }
    expect((star.editAvatar ?? "").length).toBeGreaterThan(0);
    for (const key of ["setupProfile", "editProfile", "profileEmpty"]) {
      expect((star[key] ?? "").length).toBeGreaterThan(0);
    }
  });
});

// QA 261004 W-08/D-10. The /me/<star> gauge labelled its five cells with the
// interview's "L1 · Fact" … "L5 · Echo". In this app L1~L5 is the brightness
// ladder, and coverage tops out at L4 (L5 comes only from ratification), so a
// fully covered period showed a lit "L5 · Echo" next to a home star at L4. The
// copy also called the layers "topics", and "{{n}} records" read "1 records".
describe("/me/<star> 게이지는 층 이름만 쓰고 단위·복수를 맞춘다", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  const LAYERS = ["fact", "feeling", "meaning", "belief", "echo"] as const;
  type StarCopy = Record<string, unknown> & { layer?: Record<string, unknown> };
  const starCopy = (loc: string) =>
    (JSON.parse(read(`locales/${loc}/home.json`)) as { ds: { star: StarCopy } }).ds.star;

  it("화면이 인터뷰의 L 번호 라벨을 그리지 않는다", () => {
    const page = read("src/app/me/[star].tsx");
    expect(page).not.toContain("LAYER_LABEL");
    expect(page).toContain("t(`ds.star.layer.${layer}`)");
    expect(page).toContain('t("ds.star.records", { count: summary.records })');
  });

  it.each(LOCALES)("%s: 층 이름에 L 번호가 없고, 단위가 '주제'가 아니다", (loc) => {
    const star = starCopy(loc);
    for (const layer of LAYERS) {
      const name = star.layer?.[layer];
      expect(typeof name).toBe("string");
      expect({ layer, name }).not.toEqual({ layer, name: expect.stringMatching(/\bL\d|·/) });
    }
    for (const key of ["meter", "dug"]) {
      expect({ key, value: star[key] }).not.toEqual({
        key,
        value: expect.stringMatching(/주제|topic|tema|etapa/i),
      });
    }
  });

  it.each(LOCALES)("%s: 기록 개수는 count 복수형 쌍이다", (loc) => {
    const star = starCopy(loc);
    expect(star.records).toEqual(expect.stringContaining("{{count}}"));
    expect(star.records_plural).toEqual(expect.stringContaining("{{count}}"));
  });

  it("i18next(v3 호환)로 풀면 1 record / 2 records 가 된다", async () => {
    const i18next = (await import("i18next")).default;
    const inst = i18next.createInstance();
    await inst.init({
      lng: "en",
      compatibilityJSON: "v3",
      resources: Object.fromEntries(
        LOCALES.map((loc) => [loc, { home: JSON.parse(read(`locales/${loc}/home.json`)) }]),
      ),
      defaultNS: "home",
      interpolation: { escapeValue: false },
    });
    expect(inst.t("ds.star.records", { count: 1 })).toBe("1 record");
    expect(inst.t("ds.star.records", { count: 2 })).toBe("2 records");
    expect(inst.t("ds.star.records", { count: 1, lng: "es" })).toBe("1 registro");
    expect(inst.t("ds.star.records", { count: 3, lng: "ko" })).toBe("기록 3개");
    expect(inst.t("ds.star.layer.echo", { lng: "ko" })).toBe("울림");
  });
});

// Simon 2026-10-12 (Q-261012-57, mock B). The star summary says its name once,
// shows the layer count once, and draws the five layers as a ladder. The two
// sentences that explained brightness stay as the screen reader's words only.
// Source contracts: render tests are not available here; the rung order and
// lighting are tested in src/lib/interview/__tests__/star-ladder.test.ts.
describe("/me/<star> 요약은 사다리 하나로 말한다", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  const page = read("src/app/me/[star].tsx");
  const star = (loc: string) =>
    (JSON.parse(read(`locales/${loc}/home.json`)) as { ds: { star: Record<string, unknown> } }).ds.star;

  it("머리줄은 어느 별이든 화면 이름이고, 별 이름은 본문에 한 번이다", () => {
    expect(page).toContain('title={t("ds.star.pageLabel")}');
    expect(page).not.toContain('title={isProfileStar ? t("ds.star.pageLabel") : name}');
    // The page label is no longer repeated above the star's name.
    expect(page.match(/t\("ds\.star\.pageLabel"\)/g)?.length).toBe(1);
    expect(page).not.toContain("styles.pageLabel");
  });

  it("층 수는 한 번, 사다리의 켜진 층에서 센다", () => {
    expect(page.match(/t\("ds\.star\.count"/g)?.length).toBe(1);
    expect(page).toContain('t("ds.star.count", { n: ladder.filter((rung) => rung.on).length, total: ladder.length })');
  });

  it("밝기를 설명하던 문장 둘은 낭독 이름으로만 남는다", () => {
    expect(page).toContain('accessibilityRole="progressbar"');
    expect(page).toMatch(/accessibilityLabel=\{t\("ds\.star\.meter",/);
    expect(page).toMatch(/text: t\("ds\.star\.dug",/);
    // Neither sentence is drawn as visible text any more.
    expect(page).not.toMatch(/<Text[^>]*>\s*\{t\("ds\.star\.(meter|dug)"/);
    expect(page).not.toContain("ds.star.recordsLabel");
  });

  it("사다리는 한 곳에서 정한 순서로 그리고, 줄에는 층 이름만 쓴다", () => {
    expect(page).toContain('import { starLadderRungs } from "@/lib/interview/star-ladder";');
    expect(page).toContain("? starLadderRungs(summary.covered)");
    expect(page).toContain("{ladder.map(({ layer, on }) => (");
    expect(page).not.toMatch(/gaugeSegment|styles\.gauge/);
  });

  it("줄은 44 아래로 줄지 않고, 본문이 창 높이까지 자라 사다리가 남는 높이를 가져간다", () => {
    expect(page).toContain("const RUNG_MIN = 44;");
    expect(page).toContain("starBody: { flexGrow: 1 }");
    expect(page).toMatch(/rung: \{[^}]*flexGrow: 1,[^}]*flexBasis: RUNG_MIN,[^}]*minHeight: RUNG_MIN/);
    expect(page).toMatch(/ladder: \{[^}]*flexGrow: 1,[^}]*maxHeight: RUNG_MAX \* 5 \+ RUNG_GAP \* 4/);
  });

  it.each(LOCALES)("%s: 짧은 층 수 문자열이 있고 구역 제목은 없다", (loc) => {
    const copy = star(loc);
    expect(copy).not.toHaveProperty("recordsLabel");
    expect(copy.count).toEqual(expect.stringContaining("{{n}}/{{total}}"));
    // The spoken sentences are still there for the progress bar.
    expect(typeof copy.meter).toBe("string");
    expect(typeof copy.dug).toBe("string");
  });

  // Simon 2026-10-12 (Q-261012-62): a star with no story yet shows the same
  // ladder, all five rungs off and "0/5", instead of one line of text.
  it("이야기가 0 인 별도 사다리를 그린다: 한 줄 글은 불러오는 중에만 남는다", () => {
    expect(page).toMatch(/const ladder = !isProfileStar && !locked && summary !== null && !waitingEmpty\s+\? starLadderRungs\(summary\.covered\)\s+: null;/);
    // The one exception: an empty star still waiting on the star before it cannot be
    // started, so it shows that one reason and nothing else (like a period not reached).
    expect(page).toContain('const waitingEmpty = entry?.kind === "previous" && summary !== null && summary.cells === 0 && summary.records === 0;');
    expect(page).not.toContain('t("ds.star.emptyBody")');
    expect(page).toMatch(/\) : currentRead\.status === "loading" \? \(\s+<MdCard variant="outlined" style=\{styles\.card\}>\s+<Text[^>]*>\s+\{t\("ds\.star\.loading"\)\}/);
    // No "0 records" line under an empty ladder.
    expect(page).toContain("{summary.records > 0 ? (");
    // The button already says Start until a first layer is covered.
    expect(page).toContain('label={summary && (summary.cells ?? 0) > 0 ? t("ds.star.continue") : t("ds.star.start")}');
  });

  // The sentence itself stays in the locales: the records check screen (dds-audit-screen.tsx)
  // still says it for a period with nothing in it.
  it.each(LOCALES)("%s: 빈 상태 문장은 다른 화면이 쓰므로 로케일에 남는다", (loc) => {
    expect(typeof star(loc).emptyBody).toBe("string");
    expect(typeof star(loc).start).toBe("string");
  });
});
