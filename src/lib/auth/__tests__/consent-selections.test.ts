import {
  emptyConsentSelections,
  allRequiredAcksChecked,
  setAllRequiredAcks,
  buildSignUpConsentArgs,
  REQUIRED_ACK_KEYS,
  type ConsentSelections,
} from "../consent-selections";

const allRequired: ConsentSelections = {
  service: true,
  llmProcessing: true,
  overseasTransfer: true,
  sensitiveData: true,
  safetyNotice: true,
  marketing: false,
};

describe("consent selections (task B2)", () => {
  test("empty selections start all-false", () => {
    expect(emptyConsentSelections()).toEqual({
      service: false,
      llmProcessing: false,
      overseasTransfer: false,
      sensitiveData: false,
      safetyNotice: false,
      marketing: false,
    });
  });

  test("allRequiredAcksChecked is false until every required ack is true", () => {
    expect(allRequiredAcksChecked(emptyConsentSelections())).toBe(false);
    // marketing alone does not satisfy the gate
    expect(allRequiredAcksChecked({ ...emptyConsentSelections(), marketing: true })).toBe(false);
    // one required ack still missing
    expect(allRequiredAcksChecked({ ...allRequired, sensitiveData: false })).toBe(false);
    expect(allRequiredAcksChecked(allRequired)).toBe(true);
  });

  test("marketing is NOT a required ack", () => {
    expect([...REQUIRED_ACK_KEYS]).not.toContain("marketing");
    // a fully-required set with marketing off still passes the gate
    expect(allRequiredAcksChecked(allRequired)).toBe(true);
  });

  test("setAllRequiredAcks flips every required ack but leaves marketing alone", () => {
    const on = setAllRequiredAcks({ ...emptyConsentSelections(), marketing: true }, true);
    expect(allRequiredAcksChecked(on)).toBe(true);
    expect(on.marketing).toBe(true); // untouched
    const off = setAllRequiredAcks(allRequired, false);
    expect(allRequiredAcksChecked(off)).toBe(false);
  });

  test("buildSignUpConsentArgs maps an adult with marketing off", () => {
    const args = buildSignUpConsentArgs({
      userId: "u1",
      isMinor: false,
      locale: "en",
      selections: allRequired,
    });
    expect(args.userId).toBe("u1");
    expect(args.ageBand).toBe("adult");
    expect(args.minorTier).toBe("adult");
    expect(args.purposes).toEqual(["service"]);
    expect(args.requiredAck).toBe(true);
    expect(args.llmProcessingAck).toBe(true);
    expect(args.overseasTransferAck).toBe(true);
    expect(args.sensitiveDataAck).toBe(true);
    expect(args.optionalConsents).toEqual({ marketing: false });
  });

  test("buildSignUpConsentArgs maps a minor with marketing on", () => {
    const args = buildSignUpConsentArgs({
      userId: "m1",
      isMinor: true,
      locale: "ko",
      selections: { ...allRequired, marketing: true },
    });
    expect(args.ageBand).toBe("minor_self");
    expect(args.minorTier).toBe("minor_self");
    expect(args.purposes).toEqual(["service", "marketing"]);
    expect(args.optionalConsents).toEqual({ marketing: true });
    expect(args.locale).toBe("ko");
  });
});

// PIPA 제23조 별도 동의 - 안전 안내 (0130). 위기 판정을 crisis_events 에
// 남기는 근거이고, 민감정보에는 §15①5호(긴급한 생명·신체)를 원용할 수 없다는
// 것이 법률 검토 의견이라 이 동의가 유일한 근거다.
describe("안전 안내 동의", () => {
  it("필수 항목이라 빠지면 진행할 수 없다", () => {
    expect(REQUIRED_ACK_KEYS).toContain("safetyNotice");
    expect(allRequiredAcksChecked({ ...allRequired, safetyNotice: false })).toBe(false);
  });

  it("원장에 자기 자리로 기록된다", () => {
    // purposes 안에 섞으면 다른 동의와 한 덩어리로 보인다. "별도" 동의라는 걸
    // 나중에 증명하려면 자기 컬럼이어야 한다.
    const args = buildSignUpConsentArgs({
      userId: "u1",
      isMinor: false,
      locale: "ko",
      selections: allRequired,
    });
    expect(args.safetyNoticeAck).toBe(true);
  });

  it("거절하면 false 로 남는다 (누락과 구분된다)", () => {
    const args = buildSignUpConsentArgs({
      userId: "u1",
      isMinor: false,
      locale: "ko",
      selections: { ...allRequired, safetyNotice: false },
    });
    expect(args.safetyNoticeAck).toBe(false);
  });

  it("전체 동의 버튼이 이 항목도 켠다", () => {
    const off = { ...allRequired, safetyNotice: false, service: false };
    expect(setAllRequiredAcks(off, true).safetyNotice).toBe(true);
  });
});
