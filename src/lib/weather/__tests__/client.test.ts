jest.mock("../../location/weather-location-gate", () => ({ WEATHER_LOCATION_ENABLED: true }));
jest.mock("../../auth/account-epoch", () => ({
  captureAccountOwnerLease: () => ({ epoch: 1, isCurrent: () => true }),
  subscribeAccountTransition: () => () => undefined,
}));
jest.mock("../../auth/account-session-lease", () => ({ beginAccountSessionLease: () => ({
  authenticate: async () => ({ accessToken: "fixture", signal: new AbortController().signal, assertCurrent: () => undefined }),
  abort: () => undefined, release: () => undefined,
}) }));
const invoke = jest.fn();
jest.mock("../../supabase/captured-session-client", () => ({ invokeFunctionWithCapturedSession: (...args: unknown[]) => invoke(...args) }));
import { createWeatherReader, saveWeatherConsent } from "../client";
import { WEATHER_CACHE_MS, WEATHER_CONSENT_REVISION, type WeatherConsent } from "../model";
import { currentPrivacyChange, resetPrivacyChangesForTests, beginPrivacyChange, subscribePrivacyChanges } from "../../privacy/changes";

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-07T05:00:00Z")); invoke.mockReset(); resetPrivacyChangesForTests(); });
afterEach(() => { jest.useRealTimers(); });
const response = () => ({ data: { symbol: "fair_day", tempC: 17.5, validAt: new Date().toISOString() }, error: null });
test("only the rounded pair is posted and weather is cached for 30 minutes", async () => {
  const reader = createWeatherReader("owner"); invoke.mockImplementation(async () => response());
  const place = { latitude: 37.566535, longitude: 126.977969 };
  expect(await reader.read(place)).toEqual({ weather: { sky: "partlyCloudy", tempC: 17.5 }, expiresAt: Date.now() + WEATHER_CACHE_MS });
  expect(invoke.mock.calls[0][2].body).toEqual({ action: "weather", contract: WEATHER_CONSENT_REVISION, place: { latitude: 37.57, longitude: 126.98 } });
  const expiresAt = Date.now() + WEATHER_CACHE_MS;
  jest.advanceTimersByTime(20 * 60_000);
  expect((await reader.read(place))?.expiresAt).toBe(expiresAt); expect(invoke).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(10 * 60_000);
  await reader.read(place); expect(invoke).toHaveBeenCalledTimes(2); reader.clear();
});
test("provider Expires is respected beyond the display's 30-minute TTL", async () => {
  invoke.mockResolvedValue({ data: { ...response().data, nextRequestAt: new Date(Date.now()+3600_000).toUTCString() }, error: null });
  const reader = createWeatherReader("owner"); const place = { latitude: 0, longitude: 0 };
  await reader.read(place); jest.advanceTimersByTime(WEATHER_CACHE_MS);
  expect(await reader.read(place)).toBeNull(); expect(invoke).toHaveBeenCalledTimes(1); reader.clear();
});
test("invalid coordinates, HTTP failure and malformed response all return null", async () => {
  const reader = createWeatherReader("owner");
  expect(await reader.read({ latitude: NaN, longitude: 0 })).toBeNull(); expect(invoke).not.toHaveBeenCalled();
  invoke.mockRejectedValue(new Error("no network"));
  expect(await reader.read({ latitude: 0, longitude: 0 })).toBeNull();
  await reader.read({ latitude: 0, longitude: 0 }); expect(invoke).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(60_000); invoke.mockResolvedValue({ data: {}, error: null });
  expect(await reader.read({ latitude: 0, longitude: 0 })).toBeNull(); reader.clear();
});
test("clearing consent while a response is in flight never recreates the cache", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  invoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const reader = createWeatherReader("owner"); const pending = reader.read({ latitude: 0, longitude: 0 });
  await Promise.resolve(); await Promise.resolve(); reader.clear(); finish(response());
  expect(await pending).toBeNull();
});
test("a weather grant does not withdraw unrelated preferences or replay an old OFF notification", async () => {
  beginPrivacyChange("owner", { location_weather: false, external_analytics: true });
  const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
  const status: WeatherConsent = { contract: WEATHER_CONSENT_REVISION, revision: 1, enabled: false, eligible: true, available: true };
  invoke.mockResolvedValue({ data: { ...status, revision: 2, enabled: true }, error: null });
  await saveWeatherConsent("owner", status, true, "ko");
  expect(changes).toHaveBeenCalledTimes(1);
  expect(currentPrivacyChange("owner")?.prefs).toEqual({ location_weather: true }); stop();
});
