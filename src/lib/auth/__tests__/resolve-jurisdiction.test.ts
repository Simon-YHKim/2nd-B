// R2 / r53: `resolveJurisdiction()` 은 "이 사용자에게 어느 나라의 규칙이
// 적용되는가" 의 단일 이음매다. 이름은 그대로지만 답이 바뀌었다 — 네 덩어리
// 중 하나가 아니라 **나라 + 그 나라의 층**을 돌려준다.
//
// 여기 있던 검사 셋은 "미설정 -> KR(층 14)" 를 현행 동작으로 못박고 있었다.
// 그 동작은 은퇴했다: Simon 2026-09-20 "나라마다 나라에 맞게 적용해야지.
// 일관 14세는 안돼." 나라를 모를 때 한국 규칙을 세계에 적용하는 것이 바로 그
// 일관 14 였다. 이제 미설정 · 판독 불가는 **폴백 18** 로 간다.
//
// 그 대가는 숨기지 않는다: 지역이 안 읽히는 한국 웹 14~17세는 가입이 막힌다.
// 막지 않으려면 숫자를 낮추는 것이 아니라 나라를 알아내야 하고(거주국 자기신고),
// 그래서 이 파일은 그 라운드가 물어볼 사람을 고를 수 있는지도 함께 지킨다 —
// 핀 · 기기 지역 · 판독 불가가 서로 다른 `source` 로 나오는가.

import { FALLBACK_CONSENT_AGE, digitalConsentAge, resolveJurisdiction } from "../consent-age";

const localization = require("expo-localization") as { __setRegion: (v: string | null) => void };

/** `process.env.X = undefined` 는 문자열 "undefined" 를 넣는다. 지우는 것은 delete 다. */
function setPin(value: string | undefined): void {
  if (value === undefined) delete process.env.EXPO_PUBLIC_JURISDICTION;
  else process.env.EXPO_PUBLIC_JURISDICTION = value;
}

describe("resolveJurisdiction 이음매 (R2 / r53)", () => {
  const saved = process.env.EXPO_PUBLIC_JURISDICTION;

  beforeEach(() => {
    setPin(undefined);
    localization.__setRegion(null);
  });

  afterAll(() => {
    setPin(saved);
    localization.__setRegion(null);
  });

  test("핀도 지역도 없으면 폴백 18 - 더는 KR 14 가 아니다", () => {
    const floor = resolveJurisdiction();
    expect(floor.source).toBe("region-unreadable");
    expect(floor.country).toBeNull();
    expect(floor.statutoryAge).toBeNull(); // 폴백은 어느 나라의 법도 아니다
    expect(digitalConsentAge(floor)).toBe(FALLBACK_CONSENT_AGE);
  });

  test("운영자 핀은 나라 코드를 받는다 (QA · 스테이징 전용)", () => {
    for (const [pin, country, age] of [
      ["US", "US", 14], // 법정 13, 서버 하한이 14 로 올린다
      ["de", "DE", 16],
      [" kr ", "KR", 14],
      ["TH", "TH", 20],
    ] as const) {
      setPin(pin);
      const floor = resolveJurisdiction();
      expect({ pin, country: floor.country, age: digitalConsentAge(floor) }).toEqual({ pin, country, age });
      expect(floor.pinned).toBe(true);
    }
  });

  test("표에 없는 나라를 핀하면 그 경로도 시험된다 - 폴백이되 나라 이름은 남는다", () => {
    setPin("PK");
    const floor = resolveJurisdiction();
    expect(floor.source).toBe("country-no-row");
    expect(floor.country).toBe("PK");
    expect(floor.pinned).toBe(true);
    expect(digitalConsentAge(floor)).toBe(FALLBACK_CONSENT_AGE);
  });

  test("옛 버킷 값 EU 는 나라가 아니라 핀이 없던 것으로 친다", () => {
    // ISO 3166-1 의 EU 는 예외 유보 코드지 나라가 아니다. 나라로 읽으면 유럽
    // 전체가 "표에 없는 나라" 가 되어 조용히 폴백 18 이 된다 - 회원국마다 다른
    // 값(AT 14 · FR 15 · DE 16)을 실어 둔 이번 라운드의 의미가 사라진다.
    setPin("EU");
    localization.__setRegion("AT");
    const floor = resolveJurisdiction();
    expect(floor.country).toBe("AT");
    expect(floor.pinned).toBe(false);
    expect(digitalConsentAge(floor)).toBe(14); // 오스트리아 DSG § 4 Abs. 4
  });

  test("형식이 안 맞는 핀도 무시하고 기기 지역으로 내려간다", () => {
    for (const pin of ["KOR", "X", "", "korea"]) {
      setPin(pin);
      localization.__setRegion("FR");
      const floor = resolveJurisdiction();
      expect({ pin, country: floor.country, pinned: floor.pinned }).toEqual({
        pin,
        country: "FR",
        pinned: false,
      });
    }
  });

  test("핀은 기기 지역을 이긴다", () => {
    setPin("JP");
    localization.__setRegion("DE");
    const floor = resolveJurisdiction();
    expect(floor.country).toBe("JP");
    expect(floor.pinned).toBe(true);
    expect(digitalConsentAge(floor)).toBe(16);
  });
});
