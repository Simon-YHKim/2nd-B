import { buildBoard } from "../../dashboard/board/build";
import { clockWeatherPresentation, decodeWeather, selectWeather, WEATHER_CACHE_MS, type ClockWeatherInput } from "../model";

const now = Date.parse("2026-10-08T01:00:00Z");
const place = { latitude: 0, longitude: 0 };
const observation = (overrides: Record<string, unknown> = {}) => ({
  id: "TEST", latitude: 0.1, longitude: 0, tempC: 18, sky: "clear", observedAt: new Date(now).toISOString(), ...overrides,
});
function reading(stations: unknown[], at = now, location = place) {
  const decoded = decodeWeather({ source: "noaa-metar", stations });
  expect(decoded).not.toBeNull();
  return selectWeather(decoded!, location, at);
}

test.each(["clear", "partlyCloudy", "cloudy", "rain", "snow"])("accepts the observed %s sky", (sky) => {
  expect(reading([observation({ sky })])?.weather).toEqual({ sky, tempC: 18 });
});

const base: ClockWeatherInput = { enabled: true, consent: true, permission: "granted", weather: { sky: "clear", tempC: 18 } };
test.each([true, null])("minor/unknown age %s hides weather and pin", (minor) => {
  expect(clockWeatherPresentation(base, minor)).toEqual({ weather: null, weatherAction: null });
});
test("the board decides the pin, settings and weather; default remains clock only", () => {
  expect(clockWeatherPresentation({ ...base, consent: false }, false).weatherAction).toBe("consent");
  for (const permission of ["denied", "blocked"] as const) {
    expect(clockWeatherPresentation({ ...base, permission }, false)).toEqual({ weather: null, weatherAction: "settings" });
  }
  expect(buildBoard(null, new Date(), false).parts[0]).toMatchObject({ weather: null, weatherAction: null });
  expect(buildBoard(null, new Date(), false, base).parts[0]).toMatchObject({ weather: base.weather, weatherAction: null });
  expect(clockWeatherPresentation({ ...base, weather: null }, false)).toEqual({ weather: null, weatherAction: null });
});
test("selects the nearest station within 50 km, using the latest observation of each station", () => {
  const stations = [
    observation({ id: "NEAR", latitude: 0.1, sky: "rain", observedAt: new Date(now - 60_000).toISOString() }),
    observation({ id: "FAR", latitude: 0.44, tempC: 5 }),
    observation({ id: "NEAR", latitude: 0.1, sky: "snow", tempC: -2 }),
  ];
  expect(reading(stations)?.weather).toEqual({ sky: "snow", tempC: -2 });
  expect(reading([...stations].reverse())?.weather).toEqual({ sky: "snow", tempC: -2 });
  expect(reading([observation({ latitude: 0.44 })])?.weather).toEqual(base.weather);
  expect(reading([observation({ latitude: 0.46 })])).toBeNull();
  expect(reading([])).toBeNull();
});

test("distance works across the date line and rejects invalid device positions", () => {
  expect(reading([observation({ latitude: 0, longitude: -179.9 })], now, { latitude: 0, longitude: 179.9 })?.weather).toEqual(base.weather);
  expect(reading([observation()], now, { latitude: NaN, longitude: 0 })).toBeNull();
  expect(reading([observation()], now, { latitude: 91, longitude: 0 })).toBeNull();
});

test.each([
  { sky: "unknown" }, { tempC: NaN }, { tempC: null }, { tempC: "18" }, { tempC: 100.01 }, { tempC: -100.01 },
  { latitude: 91 }, { longitude: Infinity }, { longitude: -181 }, { id: "" }, { observedAt: "invalid" },
])("invalid observation %j produces no invented weather", (invalid) => {
  expect(reading([observation(invalid)])).toBeNull();
});

test("stale and future observations are hidden; the observation deadline can shorten the cache", () => {
  expect(reading([observation({ observedAt: new Date(now - 90 * 60_000).toISOString() })])).toBeNull();
  expect(reading([observation({ observedAt: new Date(now + 10 * 60_000).toISOString() })])).toBeNull();
  expect(reading([observation({ observedAt: new Date(now + 9 * 60_000).toISOString() })])?.weather).toEqual(base.weather);
  expect(reading([observation({ observedAt: new Date(now - 85 * 60_000).toISOString() })])?.expiresAt).toBe(now + 5 * 60_000);
  expect(reading([observation()])?.expiresAt).toBe(now + WEATHER_CACHE_MS);
});

test("rejects an unknown source, non-list and oversized bulk responses", () => {
  expect(decodeWeather({ source: "met", stations: [observation()] })).toBeNull();
  expect(decodeWeather({ source: "noaa-metar", stations: {} })).toBeNull();
  expect(decodeWeather({ source: "noaa-metar", stations: Array(10_001).fill(observation()) })).toBeNull();
  expect(decodeWeather(null)).toBeNull();
});
