import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("withdrawal errors adopt only ON evidence and preserve the owner and screen fences", () => {
  const source = readFileSync(resolve(__dirname, "../../../components/privacy/WeatherPrivacyControl.tsx"), "utf8");
  const handler = source.slice(source.indexOf("async function revoke()"), source.indexOf("// A kill switch"));
  expect(handler).toMatch(/catch \(error\)[\s\S]*if \(!signal\.aborted\)[\s\S]*error instanceof WeatherConsentConflictError/);
  expect(handler).toContain("const retained = consentAfterFailedRevoke(status, error.latest)");
  expect(handler).toContain("if (retained !== status && retained) setSnapshot({ ownerId: userId, status: retained })");
  expect(handler).not.toContain("status: error.latest");
  expect(handler).toMatch(/catch \(error\)[\s\S]*setFailure\("save"\)/);
  expect(handler).toMatch(/finally \{ if \(!signal\.aborted\)/);
  expect(source).toContain("snapshot?.ownerId === userId ? snapshot.status : null");
});

test("unknown evidence leaves withdrawal usable for an adult, even with the kill switch off", () => {
  const source = readFileSync(resolve(__dirname, "../../../components/privacy/WeatherPrivacyControl.tsx"), "utf8");
  expect(source).toContain('const evidence = consentEvidence(status, snapshot?.revoked)');
  expect(source).toContain('!!userId && isMinor === false && evidence !== "off" && (!!status || failed)');
  expect(source).toContain("if (!WEATHER_LOCATION_ENABLED && !canRevoke) return null");
  expect(source).toContain("disabled={!canRevoke || busy}");
  expect(source).toContain("saveWeatherConsent(userId, status, false, i18n.language, signal)");
  expect(source).not.toMatch(/status \?\? \{/);
});

test("only a successful revoke carries visit-local OFF evidence; focus and account changes reset it", () => {
  const source = readFileSync(resolve(__dirname, "../../../components/privacy/WeatherPrivacyControl.tsx"), "utf8");
  expect(source).toContain('if (!signal.aborted && consentEvidence(next, true) === "off") setSnapshot({ ownerId: userId, status: next, revoked: true })');
  expect(source).toContain("setSnapshot(null); setFailure(null)");
  expect(source).toContain("if (isCurrent()) { setSnapshot({ ownerId: userId, status: next }); setFailure(null); }");
  expect(source).toContain("return () => controller.abort()");
  expect(source).toContain("}, [userId, isMinor])");
  expect(source).toContain("}, [readConsent])");
  expect(source).toContain('isMinor !== false ? t("phone.board.weather.off") : confirmed ? t(evidence === "on" ? "phone.board.weather.on" : "phone.board.weather.off") : status || failed ? "" : t("common:states.loading")');
  expect(source).not.toContain("status.enabled");
});

test("commit uses the same evidence rule only after an actual write and revision validation", () => {
  const source = readFileSync(resolve(__dirname, "../client.ts"), "utf8");
  expect(source).toContain('if (consentEvidence(next, !enabled) !== (enabled ? "on" : "off")) throw new Error("weather_not_saved")');
  expect(source).toMatch(/assertConsentProgress\(baseline, next\);\s*commitPrivacyChange/);
});
