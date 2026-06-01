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
  marketing: false,
};

describe("consent selections (task B2)", () => {
  test("empty selections start all-false", () => {
    expect(emptyConsentSelections()).toEqual({
      service: false,
      llmProcessing: false,
      overseasTransfer: false,
      sensitiveData: false,
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
