import { consentAfterFailedRevoke, consentEvidence } from "../consent-evidence";
import { WEATHER_CONSENT_REVISION, type WeatherConsent } from "../model";

const status = (enabled: boolean, eligible: boolean): WeatherConsent => ({
  contract: WEATHER_CONSENT_REVISION, revision: 5, enabled, eligible, available: true,
});

test.each([
  { snapshot: null, revoked: false, expected: "unknown" },
  { snapshot: undefined, revoked: false, expected: "unknown" },
  { snapshot: null, revoked: true, expected: "unknown" },
  ...[true, false].flatMap((eligible) => [true, false].map((revoked) => ({
    snapshot: status(true, eligible), revoked, expected: "on",
  }))),
  { snapshot: status(false, true), revoked: false, expected: "off" },
  { snapshot: status(false, true), revoked: true, expected: "off" },
  { snapshot: status(false, false), revoked: false, expected: "unknown" },
  { snapshot: status(false, false), revoked: true, expected: "off" },
])("consent evidence %j", ({ snapshot, revoked, expected }) => {
  expect(consentEvidence(snapshot, revoked)).toBe(expected);
});

test("a successful ineligible revoke is OFF for this visit, but a fresh read is unknown", () => {
  const snapshot = status(false, false);
  expect(consentEvidence(snapshot, true)).toBe("off");
  expect(consentEvidence(snapshot)).toBe("unknown");
  expect(consentEvidence({ ...snapshot, available: false })).toBe("unknown");
  expect(consentEvidence({ ...snapshot, eligible: true, available: false })).toBe("off");
});

test.each([null, status(true, true), status(false, false)].flatMap((previous) =>
  [undefined, status(false, true), status(false, false)].map((latest) => ({ previous, latest })),
))("failed revoke retains the exact previous snapshot for absent/OFF evidence: %j", ({ previous, latest }) => {
  expect(consentAfterFailedRevoke(previous, latest)).toBe(previous);
});

test.each([true, false])("failed revoke adopts a confirmed ON/7 (eligible %s)", (eligible) => {
  const latest = { ...status(true, eligible), revision: 7 };
  expect(consentAfterFailedRevoke(status(true, true), latest)).toBe(latest);
  expect(consentAfterFailedRevoke(null, latest)).toBe(latest);
});
