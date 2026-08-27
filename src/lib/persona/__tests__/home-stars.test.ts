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
  });
});
