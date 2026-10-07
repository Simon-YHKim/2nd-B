// All requests use one captured account session. Neither coordinates nor responses
// enter storage, analytics or logs. The edge returns only the forecast for this hour.
import { beginAccountSessionLease } from "../auth/account-session-lease";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { invokeFunctionWithCapturedSession } from "../supabase/captured-session-client";
import { coarsePlace, type CoarsePlace } from "../location/weather-location";
import { WEATHER_LOCATION_ENABLED } from "../location/weather-location-gate";
import { beginPrivacyChange, beginPrivacyGrant, commitPrivacyChange } from "../privacy/changes";
import { decodeConsent, decodeWeather, WEATHER_CACHE_MS, WEATHER_CONSENT_REVISION, WEATHER_TIMEOUT_MS, type WeatherConsent, type WeatherReading } from "./model";

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
    });
    session.assertCurrent();
    if (!owner.isCurrent() || result.error) throw new Error("weather_unavailable");
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
  const next = decodeConsent(await request(ownerId, { action: enabled ? "grant" : "revoke", revision: status.revision, locale: ["en", "ko", "es", "pt", "id"].includes(language) ? language : "en" }, signal));
  if (next.enabled !== enabled || next.revision <= status.revision) throw new Error("weather_not_saved");
  commitPrivacyChange(ownerId, revision, prefs);
  return next;
}

/** One forecast per controller, at most 30 minutes. Never persisted or shared between accounts. */
export function createWeatherReader(ownerId: string) {
  let cache: (WeatherReading & { key: string }) | null = null;
  let generation = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let notBefore = 0;
  return {
    clear() { cache = null; generation += 1; clearTimeout(expiryTimer); },
    async read(place: CoarsePlace, signal?: AbortSignal): Promise<WeatherReading | null> {
      if (!WEATHER_LOCATION_ENABLED || signal?.aborted) return null;
      const rounded = coarsePlace(place.latitude, place.longitude);
      if (!rounded) return null;
      const key = `${rounded.latitude},${rounded.longitude}`;
      if (cache?.key === key && cache.expiresAt > Date.now()) return { weather: cache.weather, expiresAt: cache.expiresAt };
      cache = null;
      if (Date.now() < notBefore) return null;
      const current = generation;
      try {
        notBefore = Date.now() + 60_000; // failures do not create a foreground retry storm
        const payload = await request(ownerId, { action: "weather", place: rounded }, signal);
        const result = decodeWeather(payload, Date.now());
        if (!result || signal?.aborted || current !== generation) return null;
        cache = { key, ...result };
        const providerExpiry = Date.parse(String((payload as Record<string, unknown>).nextRequestAt ?? ""));
        notBefore = Math.max(result.expiresAt, Number.isFinite(providerExpiry) ? providerExpiry : 0);
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(() => { cache = null; }, WEATHER_CACHE_MS);
        return result;
      } catch { return null; }
    },
  };
}
