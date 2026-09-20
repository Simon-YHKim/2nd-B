// r53: 나라 -> 자기동의 층. 옛 `jurisdictionForCountry()` 를 대체한
// `consentFloorForCountry()` 를 지킨다.
//
// 이 파일이 원래 지키던 것은 "확정되지 않은 나라는 전부 천장(16)으로" 라는
// 비대칭이었고, 그 비대칭은 여전히 살아 있다 — 다만 표현이 바뀌었다. 63개국
// 표가 생겼으니 이제 비대칭은 "행을 **낮출** 때의 증거 기준"이다(1차 원문이
// 있을 때만 폴백 아래로 내린다). 행이 없는 나라는 폴백으로 간다.
//
// 그리고 이 파일이 새로 지키는 것이 하나 더 있다. 옛 함수는 모르는 나라에
// `null` 을 줬고, 그래서 **"지역을 못 읽었다"와 "읽었는데 표에 없다"가 호출부에서
// 같은 값**이었다. 자기신고로 구제할 수 있는 것은 앞의 하나뿐이라 둘을 갈라야
// 한다 — 이제 `source` 가 그 둘을 다른 이름으로 돌려준다. 파일 이름은 그대로
// 두었다(경로 인용이 여럿이고, 내용은 헤더가 말한다).
import {
  FALLBACK_CONSENT_AGE,
  SERVER_AGE_FLOOR,
  consentFloorForCountry,
  digitalConsentAge,
} from "../consent-age";

/** 표에 없는 나라(r51 조사 범위 밖, T3). 값이 생기면 이 목록부터 낡는다. */
const NOT_IN_TABLE = ["PK", "BD", "KZ", "NP"];

describe("consentFloorForCountry - 표에 있는 나라", () => {
  it("나라마다 다른 값을 준다 - 한 덩어리로 접지 않는다", () => {
    // 옛 코드는 이 여섯을 KR 14 · US 13 · EU 16 세 값으로 접었다.
    const floors = ["KR", "US", "FR", "DE", "IN", "TH"].map(
      (cc) => `${cc}=${consentFloorForCountry(cc).statutoryAge}`,
    );
    expect(floors).toEqual(["KR=14", "US=13", "FR=15", "DE=16", "IN=18", "TH=20"]);
  });

  it("EEA 가 더는 한 칸이 아니다 - 회원국마다 자기 조문을 쓴다", () => {
    // 여기 있던 검사는 이 열한 나라가 **전부 16** 이기를 요구했다. 그 값은
    // "각국 값을 모르니 Art.8 천장으로" 라는 결론이었고, r51 이 열한 나라 모두를
    // 국내법 조문 원문으로 확정했다. 프랑스 15 와 아일랜드 16 은 2026-08-16 에
    // 출처가 갈린다고 적혀 있던 바로 그 둘이다.
    expect(
      Object.fromEntries(
        ["FR", "IE", "DE", "NL", "GR", "CZ", "PL", "IS", "NO", "LI", "GB"].map((cc) => [
          cc,
          consentFloorForCountry(cc).statutoryAge,
        ]),
      ),
    ).toEqual({ FR: 15, IE: 16, DE: 16, NL: 16, GR: 15, CZ: 15, PL: 16, IS: 13, NO: 13, LI: 16, GB: 13 });
  });

  it("행이 오면 source 와 basis 와 watch 가 함께 온다", () => {
    const kr = consentFloorForCountry("KR");
    expect(kr).toEqual({
      effectiveAge: 14,
      statutoryAge: 14,
      country: "KR",
      source: "country-row",
      basis: "statute",
      watch: true, // 개정안 계류 - 표 주석 참조
      pinned: false,
    });
    // 법에 숫자가 없어 민법으로 돌아간 보수값은 basis 로 걸러진다.
    expect(consentFloorForCountry("TH").basis).toBe("civil-capacity");
    // 감독기관 지침이 숫자를 댄 나라도 따로 표시된다.
    expect(consentFloorForCountry("AU").basis).toBe("regulator-guidance");
  });

  it("서버 하한이 법정 값보다 높으면 게이트 값만 올라간다", () => {
    const gb = consentFloorForCountry("GB");
    expect(gb.statutoryAge).toBe(13);
    expect(gb.effectiveAge).toBe(SERVER_AGE_FLOOR);
    expect(digitalConsentAge(gb)).toBe(14);
  });

  it("플랫폼이 실제로 줄 법한 대소문자 · 공백을 받는다", () => {
    expect(consentFloorForCountry("kr").country).toBe("KR");
    expect(consentFloorForCountry(" de ").statutoryAge).toBe(16);
  });
});

describe("consentFloorForCountry - 세 경우를 갈라 둔다", () => {
  it("③ 표에 있다 - country-row", () => {
    expect(consentFloorForCountry("JP").source).toBe("country-row");
    // ⚠ JP 는 여기서 null 을 기대하던 나라다. 이제 행이 있다(16, 개인정보보호
    // 위원회 지침). BR 도 마찬가지로 행이 있다(18, 민법 보수값).
    expect(consentFloorForCountry("BR").source).toBe("country-row");
  });

  it("② 지역은 읽혔는데 표에 없다 - country-no-row, 나라 이름은 남는다", () => {
    for (const cc of NOT_IN_TABLE) {
      const floor = consentFloorForCountry(cc);
      expect({ cc, source: floor.source, country: floor.country }).toEqual({
        cc,
        source: "country-no-row",
        country: cc,
      });
      expect(floor.statutoryAge).toBeNull(); // 폴백은 법이 아니다
      expect(floor.effectiveAge).toBe(FALLBACK_CONSENT_AGE);
    }
  });

  it("① 지역을 못 읽었다 - region-unreadable, 나라가 null 이다", () => {
    // 나라로 쓸 수 없는 신호는 전부 여기다: 없음 · 빈 문자열 · alpha-3.
    // 표를 아무리 넓혀도 이 경우는 줄지 않는다 - 그래서 ②와 갈라 둔다.
    for (const input of [null, undefined, "", "   ", "KOR", "K", "1R"]) {
      const floor = consentFloorForCountry(input);
      expect({ input, source: floor.source, country: floor.country }).toEqual({
        input,
        source: "region-unreadable",
        country: null,
      });
      expect(floor.effectiveAge).toBe(FALLBACK_CONSENT_AGE);
    }
  });

  it("②와 ①이 같은 숫자를 주지만 같은 값은 아니다", () => {
    // 다음 라운드(거주국 자기신고)가 구제할 수 있는 것은 ① 뿐이다. 숫자만 보고
    // 두 경우를 같다고 판단하면 그 라운드가 물어볼 사람을 못 고른다.
    const noRow = consentFloorForCountry("PK");
    const unreadable = consentFloorForCountry(null);
    expect(noRow.effectiveAge).toBe(unreadable.effectiveAge);
    expect(noRow.source).not.toBe(unreadable.source);
  });

  it("어떤 입력에도 서버 하한 아래를 돌려주지 않는다", () => {
    const inputs = ["KR", "US", "GB", "FR", "JP", "PK", "", null, "ZZ", "gb", "KOR"];
    for (const cc of inputs) {
      expect(digitalConsentAge(consentFloorForCountry(cc))).toBeGreaterThanOrEqual(SERVER_AGE_FLOOR);
    }
  });
});
