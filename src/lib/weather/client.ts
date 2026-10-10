// Every account fetches the same public station observations. The device chooses
// a nearby station in memory; its location and choice never enter any request.
import { beginAccountSessionLease } from "../auth/account-session-lease";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { invokeFunctionWithCapturedSession } from "../supabase/captured-session-client";
import { coarsePlace, type CoarsePlace } from "../location/weather-location";
import { WEATHER_LOCATION_ENABLED } from "../location/weather-location-gate";
import { beginPrivacyChange, beginPrivacyGrant, commitPrivacyChange } from "../privacy/changes";
import { decodeConsent, decodeWeather, selectWeather, WEATHER_CACHE_MS, WEATHER_CONSENT_REVISION, WEATHER_TIMEOUT_MS, type WeatherConsent, type WeatherReading, type WeatherStation } from "./model";

export class WeatherConsentConflictError extends Error {
  constructor(readonly latest?: WeatherConsent) { super("weather_changed"); }
}

async function request(ownerId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const owner = captureAccountOwnerLease(ownerId);
  if (!owner) throw new Error("weather_unavailable");
  const pending = beginAccountSessionLease(ownerId, signal);
  const unsubscribe = subscribeAccountTransition(() => { if (!owner.isCurrent()) pending.abort(); });
  const timeout = setTimeout(() => pending.abort(), WEATHER_TIMEOUT_MS);
  try {
    const session = await pending.authenticate();
    session.assertCurrent();
    if (!owner.isCurrent()) throw new Error("weather_unavailable");
    const result = await invokeFunctionWithCapturedSession("weather", session.accessToken, {
      body: { ...body, contract: WEATHER_CONSENT_REVISION }, signal: session.signal,
      region: "ap-northeast-2",
    });
    session.assertCurrent();
    if (!owner.isCurrent()) throw new Error("weather_unavailable");
    if (result.error?.context.status === 409) throw new WeatherConsentConflictError();
    if (result.error) throw new Error("weather_unavailable");
    return result.data;
  } finally {
    clearTimeout(timeout);
    unsubscribe();
    pending.release();
  }
}

export async function loadWeatherConsent(ownerId: string, signal?: AbortSignal): Promise<WeatherConsent> {
  return decodeConsent(await request(ownerId, { action: "status" }, signal));
}

export async function saveWeatherConsent(ownerId: string, status: WeatherConsent, enabled: boolean, locale: string, signal?: AbortSignal): Promise<WeatherConsent> {
  if (enabled && (!WEATHER_LOCATION_ENABLED || !status.eligible || !status.available)) throw new Error("weather_unavailable");
  // Publish only this key. Do not synthesize OFF for the user's other preferences.
  const prefs = { location_weather: enabled };
  const revision = enabled ? beginPrivacyGrant(ownerId) : beginPrivacyChange(ownerId, prefs);
  const language = locale.toLowerCase().split("-")[0];
  const owner = captureAccountOwnerLease(ownerId);
  const assertCurrent = () => {
    if (signal?.aborted || !owner?.isCurrent()) throw new Error("weather_unavailable");
  };
  const write = (current: WeatherConsent) => {
    assertCurrent();
    return request(ownerId, { action: enabled ? "grant" : "revoke", revision: current.revision,
      locale: ["en", "ko", "es", "pt", "id"].includes(language) ? language : "en" }, signal).then(decodeConsent);
  };
  let next: WeatherConsent;
  try { next = await write(status); }
  catch (error) {
    if (!(error instanceof WeatherConsentConflictError)) throw error;
    assertCurrent();
    let latest = await loadWeatherConsent(ownerId, signal);
    assertCurrent();
    // A conflict never retries an opt-in. Only withdrawal may retry, once.
    if (enabled) throw new WeatherConsentConflictError(latest);
    if (!latest.enabled) next = latest;
    else {
      try { next = await write(latest); }
      catch (retryError) {
        assertCurrent();
        if (retryError instanceof WeatherConsentConflictError) {
          try { latest = await loadWeatherConsent(ownerId, signal); }
          catch { assertCurrent(); throw new WeatherConsentConflictError(latest); }
          assertCurrent();
          if (!latest.enabled) next = latest;
          else throw new WeatherConsentConflictError(latest);
        } else throw new WeatherConsentConflictError(latest);
      }
    }
  }
  assertCurrent();
  if (next.enabled !== enabled || next.revision < status.revision) throw new Error("weather_not_saved");
  commitPrivacyChange(ownerId, revision, prefs);
  return next;
}

/** One public bulk per controller, at most 30 minutes. No device position is cached. */
export function createWeatherReader(ownerId: string) {
  const owner = captureAccountOwnerLease(ownerId);
  let cache: { stations: readonly WeatherStation[]; expiresAt: number } | null = null;
  let generation = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let notBefore = 0;
  const clear = () => { cache = null; generation += 1; clearTimeout(expiryTimer); notBefore = 0; };
  const selected = (place: CoarsePlace): WeatherReading | null => {
    if (!cache) return null;
    const result = selectWeather(cache.stations, place, Date.now());
    return result ? { ...result, expiresAt: Math.min(result.expiresAt, cache.expiresAt) } : null;
  };
  return {
    clear,
    async read(place: CoarsePlace, signal?: AbortSignal): Promise<WeatherReading | null> {
      if (!WEATHER_LOCATION_ENABLED || signal?.aborted) return null;
      if (!owner?.isCurrent()) { clear(); return null; }
      const rounded = coarsePlace(place.latitude, place.longitude);
      if (!rounded) return null;
      if (cache && cache.expiresAt > Date.now()) return selected(rounded);
      cache = null;
      if (Date.now() < notBefore) return null;
      const current = generation;
      try {
        notBefore = Date.now() + 60_000; // failures do not create a foreground retry storm
        const payload = await request(ownerId, { action: "weather" }, signal);
        const stations = decodeWeather(payload);
        if (!stations || signal?.aborted || current !== generation || !owner.isCurrent()) return null;
        cache = { stations, expiresAt: Date.now() + WEATHER_CACHE_MS };
        notBefore = cache.expiresAt;
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(() => { cache = null; }, WEATHER_CACHE_MS);
        return selected(rounded);
      } catch { return null; }
    },
  };
}
