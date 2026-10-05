// 결제 전 미성년 취소권 고지의 대상이 문구가 말하는 사람과 같은가 (R2C-04, 2026-10-05).
//
// 문구는 "만 19세 미만이라면" 인데 표시 조건은 isMinor(만 18세 미만)였다. 웹 실측에서
// 16세는 /plans 에 고지 1줄, 18세와 성인은 0줄이었다. 한국 민법상 미성년인 18세가 빠졌다.
// 여기서 무는 것은 넷이다: 경계(18 보임 · 19 안 보임), 예전 대상의 상위 집합인지,
// 문구의 숫자와 코드의 숫자가 같은지(문구가 바뀌면 이 검사가 먼저 운다), 그리고
// 만 18세 확장이 한국 법역에서만 일어나는지(GS-2069-01: 문구는 관할 한정 없이 취소권을
// 단정하는데 대부분의 나라에서 만 18세는 성년이다).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { KR_CIVIL_MAJORITY_AGE, KR_JURISDICTION, showsMinorPurchaseNotice } from "../minor-purchase-notice";

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

/** AuthContext 가 실제로 내는 상태. isMinor 는 나이를 알면 age < 18 이다. 나라 기본값은 한국. */
function probe(age: number, country: string | null = KR_JURISDICTION): { isMinor: boolean; age: number; country: string | null } {
  return { isMinor: age < 18, age, country };
}

/** 한국 밖이거나 지역을 못 읽은 경우(null). US · JP · TH 는 63개국 표에 행이 있고 ZZ 는 행이 없는 코드다. */
const NOT_KR: Array<string | null> = [null, "US", "JP", "TH", "ZZ"];

describe("고지 대상은 만 19세 미만이다", () => {
  test("민법 성년 나이는 19 다", () => {
    expect(KR_CIVIL_MAJORITY_AGE).toBe(19);
  });

  test.each([
    [14, true],
    [17, true],
    [18, true],
    [19, false],
    [40, false],
  ])("만 %i세 -> %s", (age, shows) => {
    expect(showsMinorPurchaseNotice(probe(age))).toBe(shows);
  });

  test("한국 법역에서 만 18세가 이번에 새로 들어온 유일한 나이다", () => {
    // 고친 뒤 처음 보는 사람이 누구인지를 못박는다. 이 목록이 늘면 의도하지 않은 확장이다.
    const newcomers: number[] = [];
    for (let age = 0; age <= 120; age += 1) {
      const before = probe(age).isMinor === true;
      if (!before && showsMinorPurchaseNotice(probe(age))) newcomers.push(age);
    }
    expect(newcomers).toEqual([18]);
  });

  test.each(NOT_KR)("법역 %s 에서는 새로 들어오는 나이가 없다 - 만 18세는 예전처럼 안 본다", (country) => {
    // GS-2069-01: 관할 한정 없는 취소권 문장을 한국 밖 성년(대부분 18)에게 새로 보이지 않는다.
    const newcomers: number[] = [];
    for (let age = 0; age <= 120; age += 1) {
      const before = probe(age, country).isMinor === true;
      if (!before && showsMinorPurchaseNotice(probe(age, country))) newcomers.push(age);
    }
    expect(newcomers).toEqual([]);
    expect(showsMinorPurchaseNotice(probe(18, country))).toBe(false);
  });

  test("법역 비교는 resolveJurisdiction 이 내는 대문자 코드 그대로다", () => {
    expect(KR_JURISDICTION).toBe("KR");
    // 소문자는 resolveJurisdiction 이 내지 않는 값이다. 들어와도 넓히는 쪽으로 해석하지 않는다.
    expect(showsMinorPurchaseNotice(probe(18, "kr"))).toBe(false);
  });

  test("예전에 보던 사람은 그대로 본다 - 상위 집합이다", () => {
    const states = [KR_JURISDICTION, ...NOT_KR].flatMap((country) => [
      ...Array.from({ length: 121 }, (_, age) => probe(age, country)),
      { isMinor: true, age: null, country }, // birth_date 가 없어 보호 쪽으로 둔 프로필
      { isMinor: null, age: null, country }, // 로딩 · 세션 없음 · 프로브 실패
    ]);
    for (const state of states) {
      if (state.isMinor === true) expect(showsMinorPurchaseNotice(state)).toBe(true);
    }
  });

  test.each([KR_JURISDICTION, ...NOT_KR])(
    "나이를 모르면(법역 %s): 보호 쪽 프로필은 보이고, 아직 모르는 상태는 숨긴다(예전과 같다)",
    (country) => {
      expect(showsMinorPurchaseNotice({ isMinor: true, age: null, country })).toBe(true);
      expect(showsMinorPurchaseNotice({ isMinor: null, age: null, country })).toBe(false);
    },
  );
});

describe("문구와 코드가 같은 숫자를 말한다", () => {
  test.each(["en", "ko", "es", "pt", "id"])("%s 문구의 나이가 KR_CIVIL_MAJORITY_AGE 다", (lng) => {
    const pack = JSON.parse(read(`locales/${lng}/deepspace.json`)) as {
      ds: { plans: { minorPurchaseNotice: string } };
    };
    const ages = pack.ds.plans.minorPurchaseNotice.match(/\d+/g);
    // 숫자가 정확히 하나, 그리고 그게 코드의 기준이다. 문구를 18 로 바꾸면 여기서 운다.
    expect(ages).toEqual([String(KR_CIVIL_MAJORITY_AGE)]);
  });

  test("AuthContext 의 isMinor 는 여전히 18 기준이다 - 그래서 고지는 따로 나이를 본다", () => {
    // 이 값이 19 로 바뀌면 위 '새로 들어온 나이' 모델도 다시 봐야 한다.
    expect(read("src/lib/auth/AuthContext.tsx")).toContain("const MINOR_AGE_CEILING = 18;");
  });
});

describe("결제 화면이 이 판정으로 고지를 그린다", () => {
  const screen = read("src/screens/deepspace/dds-plans-screen.tsx");

  test("고지 키는 한 번만, 이 판정 조건 안에서 그린다", () => {
    const at = screen.indexOf('t("ds.plans.minorPurchaseNotice")');
    expect(at).toBeGreaterThan(-1);
    expect(screen.indexOf('t("ds.plans.minorPurchaseNotice")', at + 1)).toBe(-1);
    // 고지를 감싼 조건이 이 판정이어야 한다. isMinor === true 로 되돌리면 18세가 다시 빠진다.
    const condStart = screen.lastIndexOf("{showsMinorPurchaseNotice(", at);
    expect(condStart).toBeGreaterThan(-1);
    const between = screen.slice(condStart, at);
    // 나라도 함께 넘긴다. country 를 빼면 GS-2069-01 의 관할 한정 없는 확장으로 돌아간다.
    expect(between).toMatch(/^\{showsMinorPurchaseNotice\(\{ isMinor, age, country: jurisdictionCountry \}\) \? \(/);
    // 그 사이에서 다른 조건이 열리거나 닫히지 않는다 - 고지가 이 조건의 참 갈래 안에 있다.
    expect(between.match(/\? \(/g)).toHaveLength(1);
    expect(between).not.toContain(") : null}");
    expect(between).not.toContain("isMinor === true");
  });

  test("나이는 같은 useAuth 에서 온다 - 추가 질의가 없다", () => {
    expect(screen).toContain("const { userId, hasProfile, isMinor, age, profileProbeFailed, loading: authLoading } = auth;");
  });

  test("나라는 단일 이음매 resolveJurisdiction 에서 한 번만 읽는다", () => {
    // 가입 화면들과 같은 모양이다. 기기 지역을 직접 읽거나 로케일로 나라를 짐작하지 않는다.
    expect(screen).toContain('import { resolveJurisdiction } from "@/lib/auth/consent-age";');
    expect(screen).toContain("const jurisdictionCountry = useMemo(() => resolveJurisdiction().country, []);");
    expect(screen).not.toContain("deviceRegionCode");
  });
});
