// 화면은 "만 14세" 라고 말하는데 게이트는 태국 19세를 막는다 - r53 게이트 둘이
// 서로 모르는 채 같은 구멍을 짚었다(생성물 게이트 F2 · 비즈니스 로직 게이트
// R53-BIZ-02). 키가 다섯 로케일에 다 있다는 것과 **화면이 맞는 숫자를 그린다**는
// 것은 별개이고, C7 파리티는 앞쪽만 본다. 그래서 그 검사는 초록이었다.
//
// 이 파일이 무는 것은 셋이다:
//
//   1. 다섯 로케일의 연령 문구가 숫자를 박아두지 않는다(`{{minAge}}`).
//   2. **실제 `initI18n()` 이** 그 자리에 게이트와 같은 층을 넣는다 - 나라별로.
//      값을 따로 계산해 비교하면 "자를 자로 잰" 것이 되므로, 여기서는 앱이 실제로
//      돌리는 초기화를 돌리고 그 결과에서 문자열을 뽑는다.
//   3. `{{who}}` 주소 폴백이 그 값을 지우지 않는다. `use-address.ts:52` 가 기존
//      객체를 펼쳐 쓰기 때문에 지금은 살아남지만, 그 한 줄이 대입으로 바뀌면
//      화면에 `{{minAge}}` 가 그대로 찍힌다 - 예외도 안 나고 검사도 안 운다.
// ⚠ 호이스팅되는 jest.mock 이 **MIN_SELF_CONSENT_AGE 계산 전에** 들어가야 한다.
// 그 상수는 supabase/auth 의 모듈 로드 시점에 확정되기 때문이다. 지역 자체는
// 루트 `__mocks__/expo-localization.js` 가 `__setRegion` 으로 쥐고 있으므로
// 여기서 다시 막지 않는다 - 막으면 지역을 못 바꾼다.
jest.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: {}, from: () => ({}) }) }));
jest.mock("@/lib/env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
  }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as ts from "typescript";

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

/** auth.json 안에서 실효 하한을 말하는 자리 전부. */
const AUTH_PATHS: readonly (readonly [string, string])[] = [
  ["signUp", "ageNotice"],
  ["signUp", "birthDateHelper"],
  ["signUp", "checkAge"],
  ["signUp", "checkAgeBlocked"],
  ["errors", "ageGate"],
];

function readLocaleFile(lng: string, file: string): Record<string, Record<string, string>> {
  const raw = readFileSync(join(process.cwd(), "locales", lng, file), "utf8");
  return JSON.parse(raw) as Record<string, Record<string, string>>;
}

/** 한 지역으로 앱의 진짜 초기화를 돌리고, 문구 쪽과 **게이트 쪽을 함께** 돌려준다. */
function initWithRegion(region: string | null): {
  minAge: unknown;
  /** 게이트가 실제로 강제하는 값. 문구는 이것과 달라서는 안 된다. */
  gateFloor: number;
  /** 층이 표에서 왔는가, 폴백인가. "어느 쪽인지 코드가 안다"의 근거. */
  source: string;
  t: (key: string) => string;
  /** 진짜 공급자. 손으로 흉내 내면 지키는 대상이 사본이 된다. */
  acceptDisplayName: (userId: string, who: string) => void;
} {
  jest.resetModules();
  const loc = require("expo-localization") as { __setRegion: (v: string | null) => void };
  loc.__setRegion(region);
  const { initI18n } = require("../index") as typeof import("../index");
  const address = require("@/lib/persona/use-address") as typeof import("@/lib/persona/use-address");
  // 같은 모듈 레지스트리 · 같은 지역에서 확정된 진짜 게이트 상수.
  const { MIN_SELF_CONSENT_AGE } = require("@/lib/supabase/auth") as { MIN_SELF_CONSENT_AGE: number };
  const { resolveJurisdiction } = require("@/lib/auth/consent-age") as typeof import("@/lib/auth/consent-age");
  const i18n = initI18n();
  return {
    minAge: i18n.options.interpolation?.defaultVariables?.minAge,
    gateFloor: MIN_SELF_CONSENT_AGE,
    source: resolveJurisdiction().source,
    t: (key: string) => i18n.t(key) as unknown as string,
    acceptDisplayName: (userId, who) => {
      address.syncAddressOwner(userId, i18n.language);
      const applied = address.acceptAddressDisplayName(userId, i18n.language, who);
      if (!applied) throw new Error("이름이 적용되지 않았다 - 검사가 공허해진다");
    },
  };
}

describe("연령 문구는 실제로 적용된 층을 말한다", () => {
  const prevPin = process.env.EXPO_PUBLIC_JURISDICTION;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_JURISDICTION;
  });

  afterAll(() => {
    jest.resetModules();
    if (prevPin === undefined) delete process.env.EXPO_PUBLIC_JURISDICTION;
    else process.env.EXPO_PUBLIC_JURISDICTION = prevPin;
    const loc = require("expo-localization") as { __setRegion: (v: string | null) => void };
    loc.__setRegion(null);
  });

  it("다섯 로케일 어디에도 나이가 리터럴로 박혀 있지 않다", () => {
    const offenders: string[] = [];
    for (const lng of LOCALES) {
      const auth = readLocaleFile(lng, "auth.json");
      const deepspace = readLocaleFile(lng, "deepspace.json");
      const entries: [string, string][] = AUTH_PATHS.map(([ns, key]) => [
        `${lng}/auth.json ${ns}.${key}`,
        auth[ns][key],
      ]);
      entries.push([`${lng}/deepspace.json auth.ageNotice`, deepspace.auth.ageNotice]);
      // ⚠ `consent.json` 의 `notice.minorBanner`("14 to 17")와
      // `detail.service.body`("confirm you are 14 or older")도 **같은 결함**이지만
      // 여기서 고치지 못했다: 그 본문을 바꾸면 CONSENT_VERSION 을 올려야 하고,
      // 그 값은 서버가 소유한 email-v3 튜플과 맞물려 있어 마이그레이션이 필요하다
      // (w7-schema-consent-regressions.test.ts:182). 후속 라운드 항목.

      for (const [where, value] of entries) {
        if (typeof value !== "string") {
          offenders.push(`${where}: 문자열이 아니다`);
          continue;
        }
        // 보간자가 있어야 하고 - 있다는 것만으로는 부족하다 - 숫자가 남아 있으면 안 된다.
        if (!value.includes("{{minAge}}")) offenders.push(`${where}: {{minAge}} 없음 -> ${value}`);
        const literal = value.match(/\b(1[0-9]|2[0-9])\b/g);
        if (literal) offenders.push(`${where}: 나이 리터럴 ${literal.join(",")} -> ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // 게이트가 넓힌 세 경우를 그대로 쓴다. 하나라도 14 를 그리면 그것이 옛 버그다.
  it.each([
    ["TH", 20, "표에 있는 나라 - 표 값이 간다"],
    ["DE", 16, "같은 EU 라도 나라마다 다르다"],
    ["KR", 14, "한국은 14 로 그대로"],
    // 표 값(13)과 실효 값(14)이 갈리는 유일한 계열이다. 이 행이 없으면 표 값이
    // 화면으로 새도 초록이다 - r56 비즈로직 게이트가 변이로 증명했다(R56-BIZ-02).
    ["US", 14, "법정 13 을 제품 하한 14 로 올린 값이 간다 - 13 이 보이면 새는 것"],
    [null, 18, "지역을 못 읽으면 폴백 18 - KR 14 가 아니다"],
  ])("지역 %s -> 화면이 %i 을 그린다 (%s)", (region, expected, _why) => {
    const { minAge, gateFloor, t } = initWithRegion(region as string | null);

    expect(minAge).toBe(expected);
    // ⚠ 문구는 **게이트가 강제하는 값**과 같아야 한다. 둘이 갈리면 "계산된 것처럼
    // 보이는데 틀린" 상태가 되고, 그건 고정 14 보다 나쁘다.
    expect(minAge).toBe(gateFloor);

    // 매개변수화한 **여덟 키 전부**를 실제로 그려 본다. 리터럴 스캔만 하면
    // 네임스페이스 로딩이나 키 경로가 깨져도 초록이 나온다.
    for (const key of [
      "auth:signUp.ageNotice",
      "auth:signUp.birthDateHelper",
      "auth:signUp.checkAge",
      "auth:signUp.checkAgeBlocked",
      "auth:errors.ageGate",
      "deepspace:auth.ageNotice",
    ]) {
      const rendered = t(key);
      expect(`${key} -> ${rendered}`).toContain(String(expected));
      // 보간이 실패하면 i18next 는 던지지 않고 자리표시자를 그대로 남긴다.
      expect(`${key} -> ${rendered}`).not.toContain("{{minAge}}");
    }
  });

  it("네 나라가 네 숫자를 낸다 - 한 값으로 접히지 않는다", () => {
    const seen = [null, "KR", "FR", "TH"].map((r) => initWithRegion(r).minAge);
    expect(seen).toEqual([18, 14, 15, 20]);
    expect(new Set(seen).size).toBe(4);
  });

  it("층이 표에서 왔는지 폴백인지 코드가 구분한다", () => {
    // "아직 해석되지 않음" 상태는 없다 - 해석은 동기이고 늘 값을 낸다. 대신 그
    // 값이 어디서 왔는지는 source 가 말한다. 폴백 18 두 경우를 **같은 숫자로
    // 뭉개도 같은 경우가 아니다**(consent-age.ts:119-131).
    expect(initWithRegion("KR").source).toBe("country-row");
    expect(initWithRegion(null).source).toBe("region-unreadable");
    expect(initWithRegion("KE").source).toBe("country-no-row"); // 표 밖의 나라
    expect(initWithRegion("KE").minAge).toBe(18);
  });

  it("차단된 사용자의 스크린리더 힌트도 같은 숫자를 읽는다", () => {
    // ⚠ 여기서 키를 **이름으로** 그려 보기만 하면 "그 키가 화면에 실제로 물려
    // 있는가" 는 안 보는 것이다. r56 생성물 게이트가 그걸 변이로 증명했다 -
    // `BirthDateField.tsx:57` 의 hint 를 `passwordHint` 로 바꿔도 이 파일은
    // 10/10 초록이었다(F-02). 파일 해시로 봉인하는 것은 답이 아니다. 해시는
    // 무관한 편집에도 울고, 정상적으로 갱신하고 나면 틀린 바인딩을 다시 놓친다.
    //
    // 렌더러가 이 저장소에 없어서(`auth-bootstrap-settlement.test.ts:13-14`)
    // 두 쪽을 갈라 문다. **둘이 같은 it 안에 있어야** 합쳐서 한 문장이 된다:
    //   (가) 화면이 그 키를 hint 로 쓰는가 - JSX 속성을 AST 로 읽는다.
    //   (나) 그 키가 TH 에서 20 을 그리는가 - 실제 초기화로 그린다.
    const src = readFileSync(join(process.cwd(), "src/components/auth/BirthDateField.tsx"), "utf8");
    const sf = ts.createSourceFile("BirthDateField.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const bound: string[] = [];
    const walk = (node: ts.Node): void => {
      if (ts.isJsxAttribute(node) && node.name.getText() === "accessibilityHint") {
        bound.push(node.initializer ? node.initializer.getText() : "(초기화 없음)");
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
    // 한 자리여야 한다. 늘어나면 어느 것이 보조기술에 가는지 이 검사가 모른다.
    expect(bound).toEqual(['{t("signUp.birthDateHelper")}']);

    const { t } = initWithRegion("TH");
    const hint = t("auth:signUp.birthDateHelper");
    expect(hint).toContain("20");
    expect(hint).not.toContain("14");
    expect(hint).not.toContain("{{minAge}}");
  });

  it("주소 공급자가 이름을 넣어도 minAge 가 살아남는다", () => {
    // `{{who}}` 와 `{{minAge}}` 는 같은 defaultVariables 객체에 산다. 공급자가
    // 펼치기 대신 대입으로 바뀌면 minAge 가 조용히 사라지고 화면에 자리표시자가
    // 그대로 찍힌다. 손으로 흉내 내지 않고 **실제 공급자**를 부른다.
    const { acceptDisplayName, t } = initWithRegion("TH");
    acceptDisplayName("user-1", "홍길동");
    expect(t("auth:signUp.checkAgeBlocked")).toContain("20");
    expect(t("auth:signUp.checkAgeBlocked")).not.toContain("{{minAge}}");
  });

  it("운영자 핀도 문구까지 따라온다", () => {
    process.env.EXPO_PUBLIC_JURISDICTION = "FR";
    const { minAge, t } = initWithRegion(null);
    expect(minAge).toBe(15);
    expect(t("auth:errors.ageGate")).toContain("15");
  });
});
