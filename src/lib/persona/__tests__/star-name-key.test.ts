// 원장 화면들이 seven: 행을 **원시 id 로 새지 않게** 하는 해석기.
//
// 2026-08-25 실측에서 발견된 표시 결함: /ratifications(승인 이력)와 /review
// 넛지가 SELF_UNDERSTANDING_STARS 를 직조회해서, 새 체계의 "seven:school" 행이
// 그 글자 그대로 화면에 떴다. 예외도 없고 죽지도 않는다 -- 그냥 사용자가
// 모르는 외계 id 를 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { starNameKey } from "../star-name";
import { tierKey } from "../seven-tier-history";
import { SEVEN_STARS } from "../seven-stars";
import { SELF_UNDERSTANDING_STARS } from "../stars";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("starNameKey — 두 체계 다 i18n 키를 얻는다", () => {
  it("새 별은 홈과 같은 ds.star 키", () => {
    for (const s of SEVEN_STARS) {
      expect(starNameKey(tierKey(s.id))).toBe(`ds.star.${s.key}`);
    }
  });

  it("옛 축은 ds.home.starName 키 (다섯 로케일이 이미 갖고 있는 것)", () => {
    for (const s of SELF_UNDERSTANDING_STARS) {
      expect(starNameKey(s.id)).toBe(`ds.home.starName.${s.id}`);
    }
  });

  it("⚠ 같은 글자 now 가 접두사에 따라 다른 키로 갈린다", () => {
    expect(starNameKey("now")).toBe("ds.home.starName.now");
    expect(starNameKey(tierKey("now"))).toBe("ds.star.now");
  });

  it("모르는 id 는 null — 지어내지 않는다", () => {
    expect(starNameKey("mystery")).toBeNull();
    expect(starNameKey("seven:nope")).toBeNull();
  });

  it("키가 다섯 로케일에 실재한다", () => {
    for (const loc of ["en", "ko", "es", "pt", "id"]) {
      const dict = JSON.parse(read(`locales/${loc}/home.json`)) as {
        ds?: { star?: Record<string, string>; home?: { starName?: Record<string, string> } };
      };
      for (const s of SEVEN_STARS) expect(dict.ds?.star?.[s.key]).toBeTruthy();
      for (const s of SELF_UNDERSTANDING_STARS) {
        expect(dict.ds?.home?.starName?.[s.id]).toBeTruthy();
      }
    }
  });
});

describe("두 화면이 해석기를 실제로 쓴다 (직조회 재발 금지)", () => {
  it("/ratifications", () => {
    const src = read("src/app/ratifications.tsx");
    expect(src).toContain("starNameKey(starId)");
    expect(src).not.toContain("SELF_UNDERSTANDING_STARS.find");
  });

  it("/brightness", () => {
    // 2026-10-05 재조준: 여기서 레거시 /review 넛지(legacy/screens/review.tsx)를 읽었다.
    // 그 보관본은 롤백 레버 제거와 함께 E:/Legacy/2ndB 로 나갔고(Simon 결정 Q-261004-11 C)
    // 검사는 보관본을 읽지 않는다. 같은 해석기(resolveStarName)를 쓰는 배송 화면은
    // /brightness 다 - 직조회 재발 금지라는 성질을 그쪽에서 본다.
    const src = read("src/app/brightness.tsx");
    expect(src).toContain("resolveStarName(starId, locale");
    expect(src).not.toContain("SELF_UNDERSTANDING_STARS.find");
  });
});
