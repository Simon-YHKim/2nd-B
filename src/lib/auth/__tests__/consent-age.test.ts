// r53: 자기동의 연령이 3덩어리에서 63개국 표로 바뀌었다. 이 파일이 지키는 것은
// **표 자체의 불변식**이다 — 값 하나하나가 맞는지는 1차 원문이 답하는 일이고
// (r51 조사 · CONSENT_AGE_TABLE_SOURCE 가 그 sha256 을 들고 있다), 여기서
// 기계가 답할 수 있는 것은 셋이다:
//
//   (가) 어느 행도 서버가 거부하는 나이 아래를 게이트에 내보내지 않는다
//   (나) 폴백이 못 덮는 행은 **이름과 이유가 적혀 있다** (양방향으로 문다)
//   (다) 폴백은 18 이고, Simon 이 닫은 14 가 아니다
//
// (나)를 "폴백 >= 표의 최댓값" 으로 쓰지 않은 이유: 지금 태국이 20 이라 그 검사는
// 하루도 초록일 수 없다. 폴백을 20 으로 올리면 거의 모든 나라의 18~19세 성인이
// "지역을 못 읽었다"는 이유로 막힌다 — 비용이 이득을 압도한다. 그래서 검사는
// "넘는 행이 없다" 가 아니라 **"넘는 행이 승인 목록과 정확히 같다"** 를 묻는다.
// 새 행이 조용히 넘어서면 빨강, 승인이 낡아도 빨강이다.
import {
  CONSENT_AGE_TABLE,
  CONSENT_AGE_TABLE_RECHECK_BY,
  CONSENT_AGE_TABLE_SOURCE,
  FALLBACK_CONSENT_AGE,
  FALLBACK_SHORTFALL,
  SERVER_AGE_FLOOR,
  consentFloorForCountry,
  digitalConsentAge,
  effectiveAgeFor,
  requiresGuardianConsent,
} from "../consent-age";

const ENTRIES = Object.entries(CONSENT_AGE_TABLE);

describe("국가별 자기동의 연령 표 (r53)", () => {
  it("표가 실제로 실렸다 - 빈 표로 조용히 통과하는 것을 막는다", () => {
    // 아래 모든 검사는 표를 순회한다. 표가 비면 전부 공짜로 통과한다.
    expect(ENTRIES.length).toBe(63);
    expect(CONSENT_AGE_TABLE_SOURCE.countries).toBe(ENTRIES.length);
    expect(CONSENT_AGE_TABLE_SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(CONSENT_AGE_TABLE_SOURCE.schema).toBe("r51-age-table/1");
  });

  it("모든 키가 ISO 3166-1 alpha-2 이고 값이 온전하다", () => {
    const bad = ENTRIES.filter(
      ([cc, row]) =>
        !/^[A-Z]{2}$/.test(cc) ||
        !Number.isInteger(row.age) ||
        typeof row.watch !== "boolean" ||
        !["statute", "regulator-guidance", "civil-capacity"].includes(row.basis),
    );
    expect(bad).toEqual([]);
  });

  // ── (가) 서버 하한 ────────────────────────────────────────────────────
  it("어느 행도 서버가 거부하는 나이를 게이트에 내보내지 않는다", () => {
    // 표에는 법정 값(미국 13 · 영국 13 …)을 그대로 싣는다. 게이트가 쓰는 값은
    // max(법정, 서버 하한)이라 13 짜리 행이 13세를 통과시키는 일은 없다.
    // 이 검사가 없으면 클라이언트가 통과시키고 서버가 거부하는 조합이 생긴다.
    const below = ENTRIES.map(([cc, row]) => ({ cc, effective: effectiveAgeFor(row.age) }))
      .filter((r) => r.effective < SERVER_AGE_FLOOR);
    expect(below).toEqual([]);
  });

  it("법정 값과 실효 값을 갈라 둔다 - 법값을 클램프로 덮어쓰지 않았다", () => {
    // 서버 하한이 바뀌는 날 13 이 살아나야 한다. 그러려면 표가 13 을 기억하고
    // 있어야 하고, 클램프는 소비 지점 한 곳에만 있어야 한다.
    expect(CONSENT_AGE_TABLE.US.age).toBe(13); // COPPA
    expect(CONSENT_AGE_TABLE.GB.age).toBe(13); // UK GDPR Art. 8(1)
    expect(consentFloorForCountry("US").statutoryAge).toBe(13);
    expect(consentFloorForCountry("US").effectiveAge).toBe(14);
    expect(effectiveAgeFor(13)).toBe(SERVER_AGE_FLOOR);
    expect(effectiveAgeFor(20)).toBe(20); // 하한이지 상한이 아니다
  });

  // ── (나) 폴백이 못 덮는 행 ─────────────────────────────────────────────
  it("폴백보다 높은 행이 승인 목록과 정확히 같다", () => {
    const above = ENTRIES.filter(([, row]) => effectiveAgeFor(row.age) > FALLBACK_CONSENT_AGE)
      .map(([cc]) => cc)
      .sort();
    expect(above).toEqual(Object.keys(FALLBACK_SHORTFALL).sort());
    // 오늘의 값도 못박는다: 태국 하나뿐이고 20 이다. 둘째 나라가 생기면 그것은
    // 폴백 선택을 다시 계산해야 한다는 신호지 목록에 한 줄 더하는 일이 아니다.
    expect(above).toEqual(["TH"]);
    expect(CONSENT_AGE_TABLE.TH.age).toBe(20);
  });

  it("승인마다 이유가 적혀 있다 - 이름만 적고 넘어가지 못한다", () => {
    const thin = Object.entries(FALLBACK_SHORTFALL).filter(([, why]) => why.trim().length < 40);
    expect(thin).toEqual([]);
  });

  // ── (다) 폴백 ─────────────────────────────────────────────────────────
  it("폴백은 18 이다 - 16 도 아니고 Simon 이 닫은 14 도 아니다", () => {
    expect(FALLBACK_CONSENT_AGE).toBe(18);
    // 16 을 고르면 표에서 그보다 높은 행이 23개가 된다. 그 수를 여기 박아 둔다:
    // 폴백을 16 으로 되돌리는 변이는 위의 승인 목록 검사에서 23개로 빨강이 된다.
    const aboveSixteen = ENTRIES.filter(([, row]) => effectiveAgeFor(row.age) > 16).length;
    expect(aboveSixteen).toBe(23);
    // 14 로 되돌리면 41개 행이 폴백을 넘는다.
    const aboveFourteen = ENTRIES.filter(([, row]) => effectiveAgeFor(row.age) > 14).length;
    expect(aboveFourteen).toBe(41);
  });

  it("서버 하한은 14 그대로다 - 이 라운드가 건드리는 것이 아니다", () => {
    expect(SERVER_AGE_FLOOR).toBe(14);
  });

  // ── watch 행 ──────────────────────────────────────────────────────────
  it("입법이 움직이는 행에 재확인 기한이 붙어 있다", () => {
    const watched = ENTRIES.filter(([, row]) => row.watch).map(([cc]) => cc).sort();
    expect(watched).toEqual(["AR", "AU", "CL", "CO", "ES", "GB", "IL", "IT", "KR", "NG", "NO", "PT", "TR", "UA"]);
    expect(CONSENT_AGE_TABLE_RECHECK_BY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 칠레가 2026-12-01 에 실제로 바뀐다. 기한이 그날보다 늦으면 이미 틀린 값을
    // 들고 있는 날이 생긴다.
    expect(CONSENT_AGE_TABLE_RECHECK_BY <= "2026-12-01").toBe(true);
    expect(CONSENT_AGE_TABLE.CL.watch).toBe(true);
  });

  // ── 값 스팟 체크 ──────────────────────────────────────────────────────
  it("여섯 개의 서로 다른 값이 전부 살아 있다", () => {
    // 한 행을 지우는 변이가 여기서도 빨강이 되도록, 값의 종류마다 한 나라씩
    // 짚는다. 숫자는 r51 조사의 1차 원문 값이다.
    expect(consentFloorForCountry("GB").statutoryAge).toBe(13); // UK GDPR 8(1)
    expect(consentFloorForCountry("KR").statutoryAge).toBe(14); // 개인정보 보호법 22조의2
    expect(consentFloorForCountry("FR").statutoryAge).toBe(15); // Loi 78-17 art. 45
    expect(consentFloorForCountry("DE").statutoryAge).toBe(16); // GDPR 8(1) 기본값
    expect(consentFloorForCountry("IN").statutoryAge).toBe(18); // DPDP 2023 s.9(1)
    expect(consentFloorForCountry("TH").statutoryAge).toBe(20); // PDPA 20 + CCC 19
    const ages = new Set(ENTRIES.map(([, row]) => row.age));
    expect([...ages].sort((a, b) => a - b)).toEqual([13, 14, 15, 16, 18, 20]);
  });

  it("한국은 14 다 - 다시 확인했고, 그러나 세계 기본값은 아니다", () => {
    expect(consentFloorForCountry("KR").effectiveAge).toBe(14);
    expect(digitalConsentAge(consentFloorForCountry("KR"))).toBe(14);
    // 같은 14 를 모르는 나라에까지 적용하지 않는다는 것이 이 라운드의 전부다.
    expect(digitalConsentAge(consentFloorForCountry(null))).toBe(18);
  });
});

describe("층 소비 함수", () => {
  it("digitalConsentAge 는 층이 없으면 나라를 모르는 것과 같이 답한다", () => {
    expect(digitalConsentAge()).toBe(18);
    expect(digitalConsentAge(null)).toBe(18);
    expect(digitalConsentAge(consentFloorForCountry("DE"))).toBe(16);
  });

  it("requiresGuardianConsent 가 그 층과 비교한다", () => {
    const kr = consentFloorForCountry("KR");
    const de = consentFloorForCountry("DE");
    expect(requiresGuardianConsent(14, kr)).toBe(false);
    expect(requiresGuardianConsent(13, kr)).toBe(true);
    expect(requiresGuardianConsent(14, de)).toBe(true); // GDPR 8(1) 기본값 16
    expect(requiresGuardianConsent(17, de)).toBe(false);
    // 미국 13 은 서버 하한에 걸려 14 가 된다 - 13세는 여전히 막힌다.
    expect(requiresGuardianConsent(13, consentFloorForCountry("US"))).toBe(true);
    expect(requiresGuardianConsent(14, consentFloorForCountry("US"))).toBe(false);
    // 층을 안 주면 폴백 18.
    expect(requiresGuardianConsent(17)).toBe(true);
    expect(requiresGuardianConsent(18)).toBe(false);
  });
});
