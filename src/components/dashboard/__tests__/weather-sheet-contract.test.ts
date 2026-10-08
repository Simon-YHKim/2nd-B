// Expo 56 renderer is unavailable: assert the shipped interaction seams and pure model separately.
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(__dirname, "../../../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

test("consent sheet uses phone colours, stepped corners, native back and 44px controls", () => {
  const sheet = read("src/components/dashboard/board/WeatherSheet.tsx");
  expect(sheet).toContain('animationType="slide" onRequestClose={onClose}');
  expect(sheet).toContain("<ScreenModal");
  expect(sheet).toContain("<PixelRoundRect fill={phoneIos.cell}");
  expect(sheet).toContain("borderRadius: 0");
  expect(sheet).toContain("minWidth: 44, minHeight: 44");
  expect(sheet).toContain("onPress={onTerms}");
  expect(sheet).not.toContain('from "expo-router"');
  expect(read("src/components/dashboard/DashboardPhone.tsx")).toContain('onTerms={() => { clockWeather.cancel(); setWeatherSheet(null); go("/terms"); }}');
  expect(sheet).toContain("disabled={busy}");
  expect(sheet).not.toMatch(/#[0-9a-f]{3,8}\b|\bm3\./i);
});

test("clock renders the model's action as a labelled icon with no visible instruction", () => {
  const parts = read("src/components/dashboard/board/BoardParts.tsx");
  const pin = parts.slice(parts.indexOf("{part.weatherAction ?"), parts.indexOf("{weather ? <Pressable"));
  expect(pin).toContain("<WeatherPin />"); expect(pin).toContain("accessibilityLabel=");
  expect(pin).not.toContain("<Text");
  expect(parts).toMatch(/weatherTap: \{ minWidth: 44, minHeight: 44/);
  expect(parts).not.toMatch(/requestWeatherLocation|readWeatherPlace|loadWeatherConsent/);
});

test("five locale bundles contain the consent, withdrawal, denied and credit copy", () => {
  const keys = ["title", "body", "terms", "enable", "cancel", "failed", "settingsBody", "webSettingsBody", "settings", "done", "setting", "on", "off", "source", "sourceTerms"];
  for (const locale of ["en", "ko", "es", "pt", "id"]) {
    const copy = JSON.parse(read(`locales/${locale}/ops.json`)).phone.board.weather;
    for (const key of keys) expect(copy[key]?.length).toBeGreaterThan(0);
    expect(copy.source).toContain("NOAA/NWS");
    expect(copy.source).toContain("50 km");
    expect(copy.source).toContain("90");
    expect(`${copy.body} ${copy.source}`).not.toMatch(/MET Norway|CC BY/);
  }
  const sheet = read("src/components/dashboard/board/WeatherSheet.tsx");
  expect(sheet).toContain('Linking.openURL("https://aviationweather.gov/data/api/")');
  expect(sheet).toContain('Linking.openURL("https://www.weather.gov/disclaimer")');
  expect(sheet).toContain('t("phone.board.weather.sourceTerms")');
  const privacy = read("src/components/privacy/WeatherPrivacyControl.tsx");
  expect(privacy).toContain("saveWeatherConsent(userId, status, false");
  expect(privacy).toContain("aria-checked={status?.enabled === true}");
});
