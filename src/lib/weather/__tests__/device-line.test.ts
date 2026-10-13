import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { showsDeviceNotAllowedLine } from "../device-line";

// Q-261013-77 (Simon, 2026-10-13) · Z75: the privacy row read "on" on a phone that never allowed
// location. The row shows consent; the device permission is a second condition. The row keeps its
// word and adds one factual line only when consent is on and this device has not allowed location.
describe("the line under the weather location row", () => {
  test.each(["denied", "blocked", "undetermined"] as const)("consent on + device %s: shown", (device) => {
    expect(showsDeviceNotAllowedLine("on", false, device)).toBe(true);
  });

  test.each(["granted", "off", "unavailable", null] as const)("consent on + device %s: not shown", (device) => {
    expect(showsDeviceNotAllowedLine("on", false, device)).toBe(false);
  });

  test.each(["off", "unknown"] as const)("consent %s: never shown, whatever the device says", (evidence) => {
    for (const device of ["denied", "blocked", "undetermined", "granted"] as const) {
      expect(showsDeviceNotAllowedLine(evidence, false, device)).toBe(false);
    }
  });

  test.each([true, null])("under 18 or age unknown (%s): never shown", (isMinor) => {
    expect(showsDeviceNotAllowedLine("on", isMinor, "denied")).toBe(false);
  });
});

describe("the row wires the line without asking for the permission or adding a settings button", () => {
  const source = readFileSync(resolve(__dirname, "../../../components/privacy/WeatherPrivacyControl.tsx"), "utf8");

  test("it only reads the status, for the current account, and re-reads when the app returns", () => {
    expect(source).toContain("weatherLocationStatus().then(");
    expect(source).not.toContain("requestWeatherLocation");
    expect(source).toContain("setDevice({ ownerId: userId, status: next })");
    expect(source).toContain("device?.ownerId === userId ? device.status : null");
    expect(source).toContain('AppState.addEventListener("change"');
    expect(source).toContain("listener.remove()");
  });

  test("the line is plain text under the switch: no alert role, no link to settings", () => {
    expect(source).toContain('{deviceNotAllowed ? <Text variant="caption" testID="weather-device-not-allowed">{t("phone.board.weather.deviceNotAllowed")}</Text> : null}');
    expect(source).not.toContain("openSettings");
    expect(source).not.toContain("phone.board.weather.settings");
  });

  test.each(["en", "ko", "es", "pt", "id"])("%s has the sentence", (locale) => {
    const ops = JSON.parse(readFileSync(resolve(__dirname, "../../../..", "locales", locale, "ops.json"), "utf8"));
    expect(ops.phone.board.weather.deviceNotAllowed.trim().length).toBeGreaterThan(10);
  });

  test("the Korean sentence is the one that was decided", () => {
    const ops = JSON.parse(readFileSync(resolve(__dirname, "../../../..", "locales", "ko", "ops.json"), "utf8"));
    expect(ops.phone.board.weather.deviceNotAllowed).toBe("이 기기에서는 위치 접근이 허용돼 있지 않아 위치를 읽지 않습니다.");
  });
});
