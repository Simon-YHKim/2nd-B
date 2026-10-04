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
    expect(core).toContain("tHome(`ds.star.${id}`)");
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
    expect(page).toContain('router.push("/avatar-studio")');
    expect(page).not.toContain('router.push("/profile")');
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
