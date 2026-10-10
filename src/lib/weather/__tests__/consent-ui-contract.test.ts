import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("withdrawal errors update the visible owner-bound snapshot before clearing busy state", () => {
  const source = readFileSync(resolve(__dirname, "../../../components/privacy/WeatherPrivacyControl.tsx"), "utf8");
  const handler = source.slice(source.indexOf("async function revoke()"), source.indexOf("// A kill switch"));
  expect(handler).toMatch(/catch \(error\)[\s\S]*if \(!signal\.aborted\)[\s\S]*error instanceof WeatherConsentConflictError && error\.latest/);
  expect(handler).toContain("setSnapshot({ ownerId: userId, status: error.latest })");
  expect(handler).toMatch(/finally \{ if \(!signal\.aborted\)/);
  expect(source).toContain("snapshot?.ownerId === userId ? snapshot.status : null");
});

test("status failure leaves the existing withdrawal switch usable for an adult, even with the kill switch off", () => {
  const source = readFileSync(resolve(__dirname, "../../../components/privacy/WeatherPrivacyControl.tsx"), "utf8");
  expect(source).toContain("!!userId && isMinor === false && (status?.enabled === true || (!status && failed))");
  expect(source).toContain("if (!WEATHER_LOCATION_ENABLED && !canRevoke) return null");
  expect(source).toContain("disabled={!canRevoke || busy}");
  expect(source).toMatch(/const withdrawal = status \?\? \{ contract: WEATHER_CONSENT_REVISION, revision: 0/);
  expect(source).toContain("saveWeatherConsent(userId, withdrawal, false, i18n.language, signal)");
  expect(source).not.toContain("setSnapshot({ ownerId: userId, status: withdrawal })");
});
