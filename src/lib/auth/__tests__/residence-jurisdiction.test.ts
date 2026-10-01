import { CONSENT_AGE_TABLE } from "../consent-age-table";
import { consentFloorForCountry } from "../consent-age";
import { residenceCountryOptions } from "../residence-country-options";
import {
  RESIDENCE_COUNTRY_CODES,
  RESIDENCE_COUNTRY_NOT_LISTED,
  resolveRegistrationConsentFloor,
} from "../residence-jurisdiction";

describe("거주 국가 복구 — 기기 지역을 읽지 못했을 때만", () => {
  test("읽힌 기기 지역은 자기신고 값으로 덮어쓰지 않는다", () => {
    const detected = consentFloorForCountry("TH");

    expect(resolveRegistrationConsentFloor("KR", detected)).toEqual(detected);
    expect(resolveRegistrationConsentFloor(RESIDENCE_COUNTRY_NOT_LISTED, detected)).toEqual(
      detected,
    );
  });

  test("기기 지역을 읽지 못했으면 선택 전까지 판정을 내리지 않는다", () => {
    const unreadable = consentFloorForCountry(null);

    expect(resolveRegistrationConsentFloor(null, unreadable)).toBeNull();
    expect(resolveRegistrationConsentFloor(undefined, unreadable)).toBeNull();
  });

  test.each([
    ["KR", 14],
    ["FR", 15],
    ["TH", 20],
  ])("거주 국가 %s 선택은 조사표의 실효 하한 %i를 적용한다", (country, age) => {
    const floor = resolveRegistrationConsentFloor(country, consentFloorForCountry(null));

    expect(floor).toMatchObject({
      country,
      source: "country-row",
      effectiveAge: age,
    });
  });

  test("목록에 없음은 표에 없는 국가와 같은 보수적 18세 폴백이다", () => {
    const floor = resolveRegistrationConsentFloor(
      RESIDENCE_COUNTRY_NOT_LISTED,
      consentFloorForCountry(null),
    );

    expect(floor).toMatchObject({
      source: "country-no-row",
      effectiveAge: 18,
      statutoryAge: null,
    });
  });

  test("임의 문자열은 더 낮은 하한을 만들지 못하고 18세 폴백으로 닫힌다", () => {
    const floor = resolveRegistrationConsentFloor("made-up", consentFloorForCountry(null));

    expect(floor).toMatchObject({ source: "country-no-row", effectiveAge: 18 });
  });

  test("선택지는 조사표 63개국과 정확히 같고 중복 없이 정렬돼 있다", () => {
    const tableCountries = Object.keys(CONSENT_AGE_TABLE).sort();

    expect(RESIDENCE_COUNTRY_CODES).toEqual(tableCountries);
    expect(new Set(RESIDENCE_COUNTRY_CODES).size).toBe(tableCountries.length);
    expect(RESIDENCE_COUNTRY_CODES).toHaveLength(63);
  });

  test("63개 선택지는 ISO 코드만 노출하지 않고 읽을 수 있는 이름을 가진다", () => {
    const options = residenceCountryOptions("en");

    expect(options).toHaveLength(63);
    expect(options.every(({ code, label }) => label.length > 1 && label !== code)).toBe(true);
  });
});
