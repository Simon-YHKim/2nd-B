import type { ClockWeather, SkyCondition } from "../dashboard/board/contract";
import type { CoarsePlace, WeatherLocationStatus } from "../location/weather-location";

export const WEATHER_CONSENT_REVISION = "weather-v1-261007";
export const WEATHER_CACHE_MS = 30 * 60_000;
export const WEATHER_TIMEOUT_MS = 10_000;
export const WEATHER_OBSERVATION_MAX_AGE_MS = 90 * 60_000;
const WEATHER_FUTURE_TOLERANCE_MS = 10 * 60_000;
const WEATHER_STATION_RADIUS_KM = 50;
const WEATHER_MAX_STATIONS = 10_000;
const EARTH_RADIUS_KM = 6371.0088;
const SKY_CONDITIONS = new Set<SkyCondition>(["clear", "partlyCloudy", "cloudy", "rain", "snow"]);

export interface WeatherReading { weather: ClockWeather; expiresAt: number }
export interface WeatherStation {
  id: string;
  latitude: number;
  longitude: number;
  tempC: number;
  sky: SkyCondition;
  observedAt: number;
}

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

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

/** Public station observations only. Strip unknown fields before keeping the bulk in memory. */
export function decodeWeather(value: unknown): readonly WeatherStation[] | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (payload.source !== "noaa-metar" || !Array.isArray(payload.stations) || payload.stations.length > WEATHER_MAX_STATIONS) return null;
  const latest = new Map<string, WeatherStation>();
  for (const item of payload.stations) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[A-Z0-9]{3,8}$/.test(row.id) ||
        !isCoordinate(row.latitude, 90) || !isCoordinate(row.longitude, 180) ||
        typeof row.tempC !== "number" || !Number.isFinite(row.tempC) || Math.abs(row.tempC) > 100 ||
        typeof row.sky !== "string" || !SKY_CONDITIONS.has(row.sky as SkyCondition)) continue;
    const observedAt = typeof row.observedAt === "string" ? Date.parse(row.observedAt) : NaN;
    if (!Number.isFinite(observedAt)) continue;
    const previous = latest.get(row.id);
    if (previous && previous.observedAt >= observedAt) continue;
    latest.set(row.id, { id: row.id, latitude: row.latitude, longitude: row.longitude,
      tempC: row.tempC, sky: row.sky as SkyCondition, observedAt });
  }
  return [...latest.values()];
}

/** The device's position is used only here, never as a provider query or a cache key. */
export function selectWeather(stations: readonly WeatherStation[], place: CoarsePlace, now: number): WeatherReading | null {
  if (!isCoordinate(place.latitude, 90) || !isCoordinate(place.longitude, 180) || !Number.isFinite(now)) return null;
  const radians = Math.PI / 180;
  let nearest: WeatherStation | null = null;
  let nearestKm = WEATHER_STATION_RADIUS_KM;
  for (const station of stations) {
    if (station.observedAt <= now - WEATHER_OBSERVATION_MAX_AGE_MS || station.observedAt >= now + WEATHER_FUTURE_TOLERANCE_MS) continue;
    const dLat = (station.latitude - place.latitude) * radians;
    const dLon = (station.longitude - place.longitude) * radians;
    const arc = Math.sin(dLat / 2) ** 2 + Math.cos(place.latitude * radians) * Math.cos(station.latitude * radians) * Math.sin(dLon / 2) ** 2;
    const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, arc))));
    if (km > nearestKm || (km === nearestKm && nearest && station.id >= nearest.id)) continue;
    nearest = station;
    nearestKm = km;
  }
  if (!nearest) return null;
  return { weather: { sky: nearest.sky, tempC: nearest.tempC },
    expiresAt: Math.min(now + WEATHER_CACHE_MS, nearest.observedAt + WEATHER_OBSERVATION_MAX_AGE_MS) };
}

export function decodeConsent(value: unknown): WeatherConsent {
  if (!value || typeof value !== "object") throw new Error("weather_unavailable");
  const row = value as Record<string, unknown>;
  if (row.contract !== WEATHER_CONSENT_REVISION || !Number.isSafeInteger(row.revision) || (row.revision as number) < 0 ||
      typeof row.enabled !== "boolean" || typeof row.eligible !== "boolean" || typeof row.available !== "boolean") throw new Error("weather_unavailable");
  return { contract: WEATHER_CONSENT_REVISION, revision: row.revision as number, enabled: row.enabled, eligible: row.eligible, available: row.available };
}
