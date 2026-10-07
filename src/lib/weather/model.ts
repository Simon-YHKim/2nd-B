import type { ClockWeather, SkyCondition } from "../dashboard/board/contract";
import type { WeatherLocationStatus } from "../location/weather-location";

export const WEATHER_CONSENT_REVISION = "weather-v1-261007";
export const WEATHER_CACHE_MS = 30 * 60_000;
export const WEATHER_TIMEOUT_MS = 10_000;

export interface WeatherReading { weather: ClockWeather; expiresAt: number }

export interface WeatherConsent {
  revision: number;
  contract: typeof WEATHER_CONSENT_REVISION;
  enabled: boolean;
  eligible: boolean;
  available: boolean;
}

export interface ClockWeatherInput {
  enabled: boolean;
  consent: boolean;
  permission: WeatherLocationStatus;
  weather: ClockWeather | null;
}

export const EMPTY_WEATHER: ClockWeatherInput = { enabled: false, consent: false, permission: "off", weather: null };

/** Display policy belongs to the board model, never to the clock renderer. */
export function clockWeatherPresentation(input: ClockWeatherInput, isMinor: boolean | null) {
  if (isMinor !== false || !input.enabled) return { weather: null, weatherAction: null };
  if (!input.consent) return { weather: null, weatherAction: "consent" as const };
  if (input.permission === "denied" || input.permission === "blocked") return { weather: null, weatherAction: "settings" as const };
  if (input.permission === "undetermined") return { weather: null, weatherAction: "consent" as const };
  return { weather: input.permission === "granted" ? input.weather : null, weatherAction: null };
}

/** MET Locationforecast symbol_code (day/night/polartwilight use the same drawing).
 * clearsky -> clear; fair/partlycloudy -> partlyCloudy; cloudy/fog -> cloudy;
 * rain variants -> rain; sleet/snow (showers/thunder included) -> snow.
 * Unknown codes -> null. https://api.met.no/doc/locationforecast/datamodel */
export function metSky(symbol: unknown): SkyCondition | null {
  if (typeof symbol !== "string") return null;
  const code = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (code === "clearsky") return "clear";
  if (code === "fair" || code === "partlycloudy") return "partlyCloudy";
  if (code === "cloudy" || code === "fog") return "cloudy";
  if (/^(light|heavy)?rain(showers)?(andthunder)?$/.test(code)) return "rain";
  if (/^(light|heavy)?(sleet|snow)(showers)?(andthunder)?$/.test(code)) return "snow";
  // MET's historical spelling is lightsnowshowersandthunder / lightssleetshowersandthunder.
  if (code === "lightssleetshowersandthunder" || code === "lightssnowshowersandthunder") return "snow";
  return null;
}

export function decodeWeather(value: unknown, now: number): WeatherReading | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const sky = metSky(row.symbol);
  const validAt = typeof row.validAt === "string" ? Date.parse(row.validAt) : NaN;
  // This is a forecast for the current hour, not an observed temperature.
  if (!sky || !Number.isFinite(validAt) || validAt > now + 60 * 60_000 || validAt < now - 90 * 60_000) return null;
  if (row.tempC !== null && (typeof row.tempC !== "number" || !Number.isFinite(row.tempC) || Math.abs(row.tempC) > 100)) return null;
  return { weather: { sky, tempC: row.tempC as number | null }, expiresAt: now + WEATHER_CACHE_MS };
}

export function decodeConsent(value: unknown): WeatherConsent {
  if (!value || typeof value !== "object") throw new Error("weather_unavailable");
  const row = value as Record<string, unknown>;
  if (row.contract !== WEATHER_CONSENT_REVISION || !Number.isSafeInteger(row.revision) || (row.revision as number) < 0 ||
      typeof row.enabled !== "boolean" || typeof row.eligible !== "boolean" || typeof row.available !== "boolean") throw new Error("weather_unavailable");
  return { contract: WEATHER_CONSENT_REVISION, revision: row.revision as number, enabled: row.enabled, eligible: row.eligible, available: row.available };
}
