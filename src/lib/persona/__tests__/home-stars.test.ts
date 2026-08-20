// 홈과 북극성 화면이 **같은 일곱**을 말하는가.
//
// Simon 결정 2026-08-21: 북극성 화면의 "나를 아는 일곱 가지"가 폐기되는 심리
// 구인 대신 홈의 일곱(6 도메인 + 프로필)을 보여준다. 그 전에는 세 곳이 서로
// 달랐다 -- 홈은 6도메인+프로필, 북극성 화면의 **잠긴** 상태는 `DOMAIN_STARS`
// (담아내기 포함), 잠금 해제 상태는 심리 구인 7종. 목록이 셋이었다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOMAIN_STARS } from "../domain-stars";
import { HOME_STAR_IDS, NON_HOME_DOMAINS, isHomeStarId } from "../home-stars";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("홈의 일곱", () => {
  it("일곱이다", () => {
    expect(HOME_STAR_IDS).toHaveLength(7);
  });

  it("여섯 도메인 + 프로필이다 (담아내기는 홈에 없다)", () => {
    expect(HOME_STAR_IDS).toContain("profile");
    expect(HOME_STAR_IDS).not.toContain("collect");
    const domains = HOME_STAR_IDS.filter((id) => id !== "profile");
    expect(domains).toHaveLength(6);
    for (const id of domains) {
      expect(DOMAIN_STARS.map((d) => d.id)).toContain(id);
    }
  });

  it("홈에 안 그리는 도메인이 무엇인지 드러난다", () => {
    // 담아내기는 데이터 도메인이라 홈에 안 그린다(CLAUDE.md). 목록이 바뀌면
    // 여기서 보인다 -- 숫자를 박지는 않는다.
    expect(NON_HOME_DOMAINS).toContain("collect");
  });

  it("isHomeStarId 가 모르는 값을 거른다", () => {
    expect(isHomeStarId("career")).toBe(true);
    expect(isHomeStarId("profile")).toBe(true);
    expect(isHomeStarId("collect")).toBe(false);
    expect(isHomeStarId("nope")).toBe(false);
  });
});

describe("세 화면이 같은 일곱을 쓴다", () => {
  // 렌더 테스트가 막혀 있으므로(RN 0.85 + jest) 소스를 읽어 대조한다.
  it("별자리 홈의 좌표 목록이 정확히 이 일곱이다", () => {
    const src = read("src/components/deep-space/ConstellationHome.tsx");
    const block = /const REV2_STARS[^=]*=\s*\[([\s\S]*?)\];/.exec(src);
    expect(block).not.toBeNull();
    const ids = [...block![1].matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([...HOME_STAR_IDS]);
  });

  it("북극성 화면이 심리 구인이 아니라 이 일곱을 그린다", () => {
    const src = read("src/app/core-brain.tsx");
    expect(src).toContain("HOME_STAR_IDS.map");
    // 구인 목록은 이 화면에서 완전히 빠졌다.
    expect(src).not.toContain("SELF_UNDERSTANDING_STARS");
  });

  it("북극성 화면이 없는 것을 광고하지 않는다", () => {
    // "곧" 배지는 엔진이 없는 구인 둘(보여지는 나 · 될 수 있는 나)을 가리켰다.
    // 도메인은 일곱 다 실재하므로 그 배지가 있을 이유가 없다.
    const src = read("src/app/core-brain.tsx");
    expect(src).not.toContain('t("soon")');
  });
});
