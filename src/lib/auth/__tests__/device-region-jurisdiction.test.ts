// H6 / J1: proves the device region actually reaches the age floor, and that a
// missing region does NOT raise it.
//
// The second half matters more than the first. resolveJurisdiction() answered a
// flat "KR" for its whole life, so every existing account was gated at 14. If a
// failed region read started resolving to DEFAULT(16), sign-up would break for
// the KR-first base on a signal that did not work — a regression caused by a
// safety feature. These pin that it stays on KR instead.
import { digitalConsentAge, resolveJurisdiction } from "../consent-age";

const localization = require("expo-localization") as { __setRegion: (v: string | null) => void };

describe("device region -> consent floor", () => {
  const prevEnv = process.env.EXPO_PUBLIC_JURISDICTION;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_JURISDICTION;
    localization.__setRegion(null);
  });

  afterAll(() => {
    if (prevEnv === undefined) delete process.env.EXPO_PUBLIC_JURISDICTION;
    else process.env.EXPO_PUBLIC_JURISDICTION = prevEnv;
    localization.__setRegion(null);
  });

  it("raises the floor to 16 on an EEA device", () => {
    localization.__setRegion("DE");
    expect(resolveJurisdiction()).toBe("EU");
    expect(digitalConsentAge(resolveJurisdiction())).toBe(16);
  });

  it("keeps 14 on a KR device", () => {
    localization.__setRegion("KR");
    expect(resolveJurisdiction()).toBe("KR");
    expect(digitalConsentAge(resolveJurisdiction())).toBe(14);
  });

  it("uses 13 on a US device", () => {
    localization.__setRegion("US");
    expect(resolveJurisdiction()).toBe("US");
    expect(digitalConsentAge(resolveJurisdiction())).toBe(13);
  });

  it("stays on KR when the platform reports no region", () => {
    localization.__setRegion(null);
    expect(resolveJurisdiction()).toBe("KR");
    expect(digitalConsentAge(resolveJurisdiction())).toBe(14);
  });

  it("stays on KR for a country with no row, rather than jumping to 16", () => {
    localization.__setRegion("JP");
    expect(resolveJurisdiction()).toBe("KR");
  });

  it("lets the operator override for QA regardless of device region", () => {
    localization.__setRegion("DE");
    process.env.EXPO_PUBLIC_JURISDICTION = "US";
    expect(resolveJurisdiction()).toBe("US");
  });
});
