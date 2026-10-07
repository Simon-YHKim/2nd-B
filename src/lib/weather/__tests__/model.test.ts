import { buildBoard } from "../../dashboard/board/build";
import { clockWeatherPresentation, decodeWeather, metSky, type ClockWeatherInput } from "../model";

test.each([
  ["clearsky_day", "clear"], ["fair_night", "partlyCloudy"], ["partlycloudy_polartwilight", "partlyCloudy"],
  ["cloudy", "cloudy"], ["fog", "cloudy"], ["heavyrainandthunder", "rain"],
  ["lightrainshowers_day", "rain"], ["sleet", "snow"], ["heavysnowshowersandthunder_day", "snow"],
  ["lightssleetshowersandthunder_day", "snow"], ["unknown", null], [null, null],
])("maps MET symbol %s", (symbol, sky) => { expect(metSky(symbol)).toBe(sky); });

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
test("bad or stale weather is null instead of a made-up sunny glyph", () => {
  const now = Date.now();
  const valid = { symbol: "clearsky_day", tempC: 18, validAt: new Date(now).toISOString() };
  expect(decodeWeather(valid, now)?.weather).toEqual(base.weather);
  expect(decodeWeather({ ...valid, symbol: "newcode" }, now)).toBeNull();
  expect(decodeWeather({ ...valid, tempC: NaN }, now)).toBeNull();
  expect(decodeWeather({ ...valid, tempC: "18" }, now)).toBeNull();
  expect(decodeWeather({ ...valid, validAt: new Date(now-2*3600_000).toISOString() }, now)).toBeNull();
});
