// H6 / J1 / r53: 기기 지역이 실제로 연령 층에 도달하는가, 그리고 **지역을 못
// 읽었을 때 무엇이 일어나는가.**
//
// 뒤쪽이 앞쪽보다 중요하다. 2026-08-16 에 이 파일이 쓰였을 때 답은 "KR 에 머문다"
// 였고, 그 이유는 적혀 있는 그대로였다 — resolveJurisdiction() 이 평생 "KR" 만
// 답했으니 실패한 신호 때문에 KR-first 기반의 가입이 깨져서는 안 된다는 것.
//
// r53 에서 그 답이 뒤집혔다. Simon 2026-09-20: "나라마다 나라에 맞게 적용해야지.
// 일관 14세는 안돼." 나라를 모를 때 한국 규칙을 전 세계에 적용하는 것이 바로 그
// 일관 14 다. 그리고 표를 세어 보면 KR 14 는 보수적이지도 않다 — 63개국 중
// **41개국이 14 보다 높다.** 판독 불가를 14 로 받는다는 것은 그 41개국 거주자의
// 미성년을 그 나라 법 기준 미달로 받는다는 뜻이었다.
//
// 그래서 지금은 폴백 18 로 간다. 대가도 뒤집힌 방향으로 그대로다: **지역이 안
// 읽히는 한국 웹 14~17세는 가입이 막힌다.** 숫자로는 못 고치는 구멍이고(표를
// 넓혀도 null 은 null 이다), 닫는 것은 거주국 자기신고다 - 다음 라운드.
import { FALLBACK_CONSENT_AGE, digitalConsentAge, resolveJurisdiction } from "../consent-age";

const localization = require("expo-localization") as { __setRegion: (v: string | null) => void };

function setPin(value: string | undefined): void {
  if (value === undefined) delete process.env.EXPO_PUBLIC_JURISDICTION;
  else process.env.EXPO_PUBLIC_JURISDICTION = value;
}

describe("기기 지역 -> 자기동의 층", () => {
  const prevEnv = process.env.EXPO_PUBLIC_JURISDICTION;

  beforeEach(() => {
    setPin(undefined);
    localization.__setRegion(null);
  });

  afterAll(() => {
    setPin(prevEnv);
    localization.__setRegion(null);
  });

  it("나라마다 그 나라의 값이 온다 - 한 덩어리가 아니다", () => {
    // 옛 검사는 이 여섯을 세 값(KR 14 · US 13 · EU 16)으로 접었다. 특히
    // 오스트리아와 독일이 같은 "EU 16" 이었는데 실제로는 14 와 16 이다.
    for (const [region, age] of [
      ["KR", 14],
      ["US", 14], // 법정 13, 서버 하한이 올린다
      ["DE", 16],
      ["AT", 14], // 같은 EEA 인데 독일과 다르다
      ["FR", 15],
      ["TH", 20],
    ] as const) {
      localization.__setRegion(region);
      const floor = resolveJurisdiction();
      expect({ region, country: floor.country, age: digitalConsentAge(floor) }).toEqual({
        region,
        country: region,
        age,
      });
    }
  });

  it("플랫폼이 지역을 안 주면 폴백 18 로 간다 - KR 14 가 아니다", () => {
    localization.__setRegion(null);
    const floor = resolveJurisdiction();
    expect(floor.source).toBe("region-unreadable");
    expect(floor.country).toBeNull();
    expect(digitalConsentAge(floor)).toBe(FALLBACK_CONSENT_AGE);
    // 대가를 검사로도 적어 둔다: 이 상태의 16세는 가입할 수 없다. 이것이
    // 웹에서 흔하다고 device-region.ts 가 스스로 적는 경우다.
    expect(digitalConsentAge(floor) > 16).toBe(true);
  });

  it("표에 없는 나라는 폴백으로 가되 KR 로 둔갑하지 않는다", () => {
    // 여기 있던 검사는 "행이 없으면 16 으로 뛰지 말고 KR 에 머물러라" 였다.
    // 이제 행이 없는 나라는 폴백이고, **나라 이름이 남는다** - 표를 넓히면
    // 줄어드는 경우라서 판독 불가와 갈라 둬야 한다.
    localization.__setRegion("PK");
    const floor = resolveJurisdiction();
    expect(floor.source).toBe("country-no-row");
    expect(floor.country).toBe("PK");
    expect(digitalConsentAge(floor)).toBe(FALLBACK_CONSENT_AGE);
  });

  it("그 검사가 쓰던 일본은 이제 행이 있다", () => {
    // 옛 이름은 "a country with no row" 였고 그 예가 JP 였다. r51 이 일본
    // 행을 채웠다(16: 현행 PPC 지침 상단과 개정법을 둘 다 만족하는 최소값).
    localization.__setRegion("JP");
    const floor = resolveJurisdiction();
    expect(floor.source).toBe("country-row");
    expect(digitalConsentAge(floor)).toBe(16);
  });

  it("입법이 움직이는 나라는 층에 표시가 따라온다", () => {
    // 출시 전 재확인 대상을 호출부가 알 수 있어야 한다.
    localization.__setRegion("PT");
    expect(resolveJurisdiction().watch).toBe(true); // 13 -> 16 법안 계류
    localization.__setRegion("DE");
    expect(resolveJurisdiction().watch).toBe(false);
  });

  it("QA 핀이 기기 지역을 이긴다", () => {
    localization.__setRegion("DE");
    setPin("US");
    const floor = resolveJurisdiction();
    expect(floor.country).toBe("US");
    expect(floor.pinned).toBe(true);
  });
});
