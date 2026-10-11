jest.mock("../../location/weather-location-gate", () => ({ WEATHER_LOCATION_ENABLED: true }));
jest.mock("../../env", () => ({ getEnv: () => ({
  EXPO_PUBLIC_SUPABASE_URL: "https://fixture.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "fixture",
}) }));
let mockOwnerCurrent = true;
jest.mock("../../auth/account-epoch", () => ({
  captureAccountOwnerLease: () => mockOwnerCurrent ? ({ epoch: 1, isCurrent: () => mockOwnerCurrent }) : null,
  subscribeAccountTransition: () => () => undefined,
}));
jest.mock("../../auth/account-session-lease", () => ({ beginAccountSessionLease: () => ({
  authenticate: async () => ({ accessToken: "fixture", signal: new AbortController().signal, assertCurrent: () => undefined }),
  abort: () => undefined, release: () => undefined,
}) }));
const invoke = jest.fn();
jest.mock("../../supabase/captured-session-client", () => ({ invokeFunctionWithCapturedSession: (...args: unknown[]) => invoke(...args) }));
import { createWeatherReader, loadWeatherConsent, saveWeatherConsent, WeatherConsentConflictError } from "../client";
import { WEATHER_CACHE_MS, WEATHER_CONSENT_REVISION, type WeatherConsent } from "../model";
import { currentPrivacyChange, resetPrivacyChangesForTests, beginPrivacyChange, subscribePrivacyChanges } from "../../privacy/changes";

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-07T05:00:00Z")); invoke.mockReset(); resetPrivacyChangesForTests(); mockOwnerCurrent = true; });
afterEach(() => { jest.useRealTimers(); });
const response = (observedAt = new Date().toISOString()) => ({ data: { source: "noaa-metar", stations: [
  { id: "SEOU", latitude: 37.57, longitude: 126.98, tempC: 17.5, sky: "partlyCloudy", observedAt },
  { id: "ZERO", latitude: 0, longitude: 0, tempC: 22, sky: "clear", observedAt },
] }, error: null });
test("weather status, consent changes and observations request the Seoul region with the captured token", async () => {
  const status: WeatherConsent = { contract: WEATHER_CONSENT_REVISION, revision: 0, enabled: false, eligible: true, available: true };
  invoke.mockResolvedValueOnce({ data: status, error: null });
  await loadWeatherConsent("owner");
  const granted = { ...status, revision: 1, enabled: true };
  invoke.mockResolvedValueOnce({ data: granted, error: null });
  await saveWeatherConsent("owner", status, true, "ko");
  invoke.mockResolvedValueOnce(response());
  const reader = createWeatherReader("owner");
  await reader.read({ latitude: 0, longitude: 0 });
  reader.clear();
  invoke.mockResolvedValueOnce({ data: { ...status, revision: 2 }, error: null });
  await saveWeatherConsent("owner", granted, false, "ko");

  expect(invoke.mock.calls.map((call) => call[2].body.action)).toEqual(["status", "grant", "weather", "revoke"]);
  for (const call of invoke.mock.calls) {
    expect(call[0]).toBe("weather");
    expect(call[1]).toBe("fixture");
    expect(call[2].region).toBe("ap-northeast-2");
  }
});
test("the global response is cached for 30 minutes and GPS never appears in the request", async () => {
  const reader = createWeatherReader("owner"); invoke.mockImplementation(async () => response());
  const place = { latitude: 37.566535, longitude: 126.977969 };
  expect(await reader.read(place)).toEqual({ weather: { sky: "partlyCloudy", tempC: 17.5 }, expiresAt: Date.now() + WEATHER_CACHE_MS });
  expect(invoke.mock.calls[0][2].body).toEqual({ action: "weather", contract: WEATHER_CONSENT_REVISION });
  const expiresAt = Date.now() + WEATHER_CACHE_MS;
  jest.advanceTimersByTime(20 * 60_000);
  expect((await reader.read(place))?.expiresAt).toBe(expiresAt); expect(invoke).toHaveBeenCalledTimes(1);
  expect(await reader.read({ latitude: 0, longitude: 0 })).toEqual({ weather: { sky: "clear", tempC: 22 }, expiresAt });
  expect(invoke).toHaveBeenCalledTimes(1); // choosing a different public station is entirely local
  jest.advanceTimersByTime(10 * 60_000);
  await reader.read(place); expect(invoke).toHaveBeenCalledTimes(2); reader.clear();
});
test("observations expire at 90 minutes even while the bulk response is still cached", async () => {
  invoke.mockResolvedValue(response(new Date(Date.now() - 85 * 60_000).toISOString()));
  const reader = createWeatherReader("owner"); const place = { latitude: 0, longitude: 0 };
  expect((await reader.read(place))?.expiresAt).toBe(Date.now() + 5 * 60_000);
  jest.advanceTimersByTime(5 * 60_000);
  expect(await reader.read(place)).toBeNull(); expect(invoke).toHaveBeenCalledTimes(1); reader.clear();
});
test("a place without a nearby observation stays hidden without discarding the reusable bulk response", async () => {
  invoke.mockResolvedValue(response());
  const reader = createWeatherReader("owner");
  expect(await reader.read({ latitude: -60, longitude: 0 })).toBeNull();
  expect((await reader.read({ latitude: 0, longitude: 0 }))?.weather.tempC).toBe(22);
  expect(invoke).toHaveBeenCalledTimes(1); reader.clear();
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
test("clearing a cached response or changing accounts prevents old observations from being reused", async () => {
  invoke.mockImplementation(async () => response());
  const reader = createWeatherReader("owner"); const place = { latitude: 0, longitude: 0 };
  expect((await reader.read(place))?.weather.tempC).toBe(22);
  reader.clear();
  expect((await reader.read(place))?.weather.tempC).toBe(22);
  expect(invoke).toHaveBeenCalledTimes(2);
  mockOwnerCurrent = false;
  expect(await reader.read(place)).toBeNull();
  expect(invoke).toHaveBeenCalledTimes(2);
  reader.clear();
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

const consent = (revision: number, enabled: boolean): WeatherConsent => ({
  contract: WEATHER_CONSENT_REVISION, revision, enabled, eligible: true, available: true,
});
const conflict = () => ({ data: null, error: { context: { status: 409 } } });
const saved = (revision: number, enabled: boolean) => ({ data: consent(revision, enabled), error: null });

test.each([true, false])("accepts a same-state idempotent response without advancing revision (%s)", async (enabled) => {
  invoke.mockResolvedValue(saved(4, enabled));
  expect(await saveWeatherConsent("owner", consent(4, enabled), enabled, "ko")).toEqual(consent(4, enabled));
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(currentPrivacyChange("owner")?.prefs.location_weather).toBe(enabled);
});

test.each([true, false])("rejects a state transition without advancing revision (%s)", async (enabled) => {
  const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
  invoke.mockResolvedValue(saved(4, enabled));
  await expect(saveWeatherConsent("owner", consent(4, !enabled), enabled, "ko")).rejects.toThrow("weather_not_saved");
  expect(changes).toHaveBeenCalledTimes(enabled ? 0 : 1); // Withdrawal begins, but never commits.
  stop();
});

test.each([true, false])("accepts a 0235 same-state response that advances revision (%s)", async (enabled) => {
  invoke.mockResolvedValue(saved(5, enabled));
  expect(await saveWeatherConsent("owner", consent(4, enabled), enabled, "ko")).toEqual(consent(5, enabled));
});

test.each([7, 8])("rejects retry revision %s against the refreshed ON snapshot at revision 8", async (revision) => {
  const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(8, true)).mockResolvedValueOnce(saved(revision, false));
  await expect(saveWeatherConsent("owner", consent(4, true), false, "ko")).rejects.toThrow("weather_not_saved");
  expect(invoke.mock.calls[2][2].body.revision).toBe(8);
  expect(changes).toHaveBeenCalledTimes(1); // The immediate local OFF is not a successful server commit.
  stop();
});

test("rejects a response that rolls revision backward or does not save the desired state", async () => {
  invoke.mockResolvedValueOnce(saved(3, false)).mockResolvedValueOnce(saved(5, true));
  await expect(saveWeatherConsent("owner", consent(4, true), false, "ko")).rejects.toThrow("weather_not_saved");
  await expect(saveWeatherConsent("owner", consent(4, true), false, "ko")).rejects.toThrow("weather_not_saved");
});

test("A(N) withdrawal converges after B(N+1) and never re-enables local processing", async () => {
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(5, true)).mockResolvedValueOnce(saved(6, false));
  const pending = saveWeatherConsent("owner", consent(4, true), false, "ko-KR");
  expect(currentPrivacyChange("owner")?.prefs.location_weather).toBe(false);
  expect(await pending).toEqual(consent(6, false));
  expect(invoke.mock.calls.map((call) => call[2].body)).toEqual([
    { action: "revoke", revision: 4, locale: "ko", contract: WEATHER_CONSENT_REVISION },
    { action: "status", contract: WEATHER_CONSENT_REVISION },
    { action: "revoke", revision: 5, locale: "ko", contract: WEATHER_CONSENT_REVISION },
  ]);
  expect(currentPrivacyChange("owner")?.prefs.location_weather).toBe(false);
});

test.each([4, 5].flatMap((revision) => [true, false].flatMap((eligible) => [0, 1].map((advance) => ({
  revision, eligible, advance,
})))))("a conflict OFF requires a revoke write before commit: %j", async ({ revision, eligible, advance }) => {
  // 0246 can return the same revision for stored OFF; 0235 always advances.
  // With ineligible OFF, an advancing response also covers hidden stored ON -> OFF.
  const latest = { ...consent(revision, false), eligible };
  const next = { ...latest, revision: revision + advance };
  const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
  let finish!: (value: { data: WeatherConsent; error: null }) => void;
  let started!: () => void;
  const retryStarted = new Promise<void>((resolve) => { started = resolve; });
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce({ data: latest, error: null })
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; started(); }));
  const pending = saveWeatherConsent("owner", consent(4, true), false, "en");
  // Also finishes on an incorrect early return, so a skipped write fails without a timeout.
  await Promise.race([retryStarted, pending]);
  expect(changes).toHaveBeenCalledTimes(1); // Local OFF only while the write is unconfirmed.
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(invoke.mock.calls.map((call) => call[2].body)).toEqual([
    { action: "revoke", revision: 4, locale: "en", contract: WEATHER_CONSENT_REVISION },
    { action: "status", contract: WEATHER_CONSENT_REVISION },
    { action: "revoke", revision, locale: "en", contract: WEATHER_CONSENT_REVISION },
  ]);
  finish({ data: next, error: null });
  expect(await pending).toEqual(next);
  expect(changes).toHaveBeenCalledTimes(2); // Commit follows the successful write only.
  stop();
});

test.each([consent(3, false), consent(3, true)])(
  "rejects a first conflict refresh that does not advance from ON/4: %j", async (latest) => {
    const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
    invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce({ data: latest, error: null });
    await expect(saveWeatherConsent("owner", consent(4, true), false, "en")).rejects.toThrow("weather_not_saved");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(changes).toHaveBeenCalledTimes(1); // Immediate local OFF only; no successful commit.
    stop();
  },
);

test.each([true, false].flatMap((eligible) => ["idempotent", "advanced", "conflict"].map((reply) => ({ eligible, reply }))))(
  "the real request wrapper bounds withdrawal to three fetches: %j", async ({ eligible, reply }) => {
    const latest = { ...consent(5, false), eligible };
    const next = { ...latest, revision: reply === "advanced" ? 6 : 5 };
    const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
    const fetch = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected_fetch"));
    const actual = jest.requireActual<typeof import("../../supabase/captured-session-client")>("../../supabase/captured-session-client");
    invoke.mockImplementation(actual.invokeFunctionWithCapturedSession);
    fetch.mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(latest)))
      .mockResolvedValueOnce(reply === "conflict" ? new Response(null, { status: 409 }) : new Response(JSON.stringify(next)));
    try {
      const pending = saveWeatherConsent("owner", consent(4, true), false, "en");
      if (reply === "conflict") await expect(pending).rejects.toMatchObject({ latest });
      else expect(await pending).toEqual(next);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch.mock.calls.map((call) => JSON.parse(call[1]?.body as string))).toEqual([
        { action: "revoke", revision: 4, locale: "en", contract: WEATHER_CONSENT_REVISION },
        { action: "status", contract: WEATHER_CONSENT_REVISION },
        { action: "revoke", revision: 5, locale: "en", contract: WEATHER_CONSENT_REVISION },
      ]);
      expect(changes).toHaveBeenCalledTimes(reply === "conflict" ? 1 : 2);
    } finally { fetch.mockRestore(); stop(); }
  },
);

test("a conflict preserves same-revision OFF idempotency for a confirmed OFF snapshot", async () => {
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(4, false)).mockResolvedValueOnce(saved(4, false));
  expect(await saveWeatherConsent("owner", consent(4, false), false, "en")).toEqual(consent(4, false));
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(invoke.mock.calls[2][2].body).toMatchObject({ action: "revoke", revision: 4 });
});

test("a same-revision ON conflict snapshot can still be the withdrawal retry input", async () => {
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(4, true)).mockResolvedValueOnce(saved(5, false));
  expect(await saveWeatherConsent("owner", consent(4, true), false, "en")).toEqual(consent(5, false));
  expect(invoke.mock.calls[2][2].body.revision).toBe(4);
});

test.each([false, true])("a confirmed OFF snapshot still rejects a lower conflict revision (enabled %s)", async (enabled) => {
  const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(3, enabled));
  await expect(saveWeatherConsent("owner", consent(4, false), false, "en")).rejects.toThrow("weather_not_saved");
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(changes).toHaveBeenCalledTimes(1);
  stop();
});

test("grant conflicts carry the latest state but never automatically retry opt-in", async () => {
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(5, false));
  await expect(saveWeatherConsent("owner", consent(4, false), true, "en")).rejects.toMatchObject({ latest: consent(5, false) });
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(currentPrivacyChange("owner")?.prefs.location_weather).not.toBe(true);
});

test.each([consent(5, true), consent(5, false), { ...consent(5, false), eligible: false },
  consent(4, false), { ...consent(4, false), eligible: false }].flatMap((latest) => [409, 503].map((status) => ({ latest, status }))))(
  "a failed retry never commits or fetches a final status: %j", async ({ latest, status }) => {
    const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
    invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce({ data: latest, error: null })
      .mockResolvedValueOnce({ data: null, error: { context: { status } } })
      .mockResolvedValueOnce(saved(6, false)); // Must never read this apparent success.
    const pending = saveWeatherConsent("owner", consent(4, true), false, "en");
    await expect(pending).rejects.toBeInstanceOf(WeatherConsentConflictError);
    await expect(pending).rejects.toMatchObject({ latest }); // Display only, not a saved withdrawal.
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls.map((call) => call[2].body.action)).toEqual(["revoke", "status", "revoke"]);
    expect(invoke.mock.calls[2][2].body.revision).toBe(latest.revision);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(currentPrivacyChange("owner")?.prefs.location_weather).toBe(false);
    stop();
  },
);

test.each([429, 503])("does not retry or refresh a non-conflict HTTP %s", async (status) => {
  invoke.mockResolvedValue({ data: null, error: { context: { status } } });
  await expect(saveWeatherConsent("owner", consent(4, true), false, "en")).rejects.toThrow("weather_unavailable");
  expect(invoke).toHaveBeenCalledTimes(1);
});

test.each([429, 503])("after status HTTP %s, an unknown withdrawal accepts any confirmed OFF revision", async (status) => {
  invoke.mockResolvedValueOnce({ data: null, error: { context: { status } } });
  await expect(loadWeatherConsent("owner")).rejects.toThrow("weather_unavailable");
  const unknown = null;
  for (const revision of [0, 1, 8]) {
    invoke.mockResolvedValueOnce(saved(revision, false));
    expect(await saveWeatherConsent("owner", unknown, false, "ko")).toEqual(consent(revision, false));
    expect(invoke.mock.calls.at(-1)?.[2].body).toEqual({ action: "revoke", revision: 0, locale: "ko", contract: WEATHER_CONSENT_REVISION });
  }
  invoke.mockResolvedValueOnce(saved(9, true));
  await expect(saveWeatherConsent("owner", unknown, false, "ko")).rejects.toThrow("weather_not_saved");
});

test.each([0, 1, 8].flatMap((revision) => [0, 1].map((advance) => ({ revision, advance }))))(
  "an unknown withdrawal retries the conflict OFF snapshot and validates its write: %j", async ({ revision, advance }) => {
    invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(revision, false)).mockResolvedValueOnce(saved(revision + advance, false));
    expect(await saveWeatherConsent("owner", null, false, "ko")).toEqual(consent(revision + advance, false));
    expect(invoke.mock.calls[0][2].body.revision).toBe(0);
    expect(invoke.mock.calls[2][2].body).toMatchObject({ action: "revoke", revision });
    expect(invoke).toHaveBeenCalledTimes(3);
  },
);

test.each(["write", "retry"])("a confirmed ON/0 snapshot is not an unknown withdrawal during %s", async (path) => {
  if (path === "retry") invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(0, true));
  invoke.mockResolvedValueOnce(saved(0, false));
  await expect(saveWeatherConsent("owner", consent(0, true), false, "ko")).rejects.toThrow("weather_not_saved");
});

test.each(["write", "conflict"])("an unknown withdrawal uses the confirmed ON/0 retry snapshot during %s", async (path) => {
  const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
  invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(0, true));
  invoke.mockResolvedValueOnce(path === "conflict" ? conflict() : saved(0, false));
  await expect(saveWeatherConsent("owner", null, false, "ko")).rejects.toThrow(path === "conflict" ? "weather_changed" : "weather_not_saved");
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(changes).toHaveBeenCalledTimes(1);
  stop();
});

test("an unknown snapshot cannot grant consent", async () => {
  await expect(saveWeatherConsent("owner", null, true, "ko")).rejects.toThrow("weather_unavailable");
  expect(invoke).not.toHaveBeenCalled();
});

test.each(["abort", "owner"])("stops conflict recovery when %s changes during the refresh", async (kind) => {
  const scope = new AbortController();
  invoke.mockResolvedValueOnce(conflict()).mockImplementationOnce(async () => {
    if (kind === "abort") scope.abort(); else mockOwnerCurrent = false;
    return saved(5, true);
  });
  await expect(saveWeatherConsent("owner", consent(4, true), false, "en", scope.signal)).rejects.toThrow("weather_unavailable");
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(currentPrivacyChange("owner")?.prefs.location_weather).toBe(false);
});

test.each(["abort", "owner"].flatMap((kind) => [false, true].map((fails) => ({ kind, fails }))))(
  "a retry response cannot commit after the scope changes: %j", async ({ kind, fails }) => {
    const scope = new AbortController();
    const changes = jest.fn(); const stop = subscribePrivacyChanges(changes);
    invoke.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(saved(5, false))
      .mockImplementationOnce(async () => {
        if (kind === "abort") scope.abort(); else mockOwnerCurrent = false;
        if (fails) throw new Error("network");
        return saved(6, false);
      });
    await expect(saveWeatherConsent("owner", consent(4, true), false, "en", scope.signal)).rejects.toThrow("weather_unavailable");
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(changes).toHaveBeenCalledTimes(1);
    stop();
  },
);
