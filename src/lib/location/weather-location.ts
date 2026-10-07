// Reads where the phone is, coarsely, for the clock-row weather (Simon 2026-10-07,
// Q-261007-39 = GPS; conditions in DECISIONS 26.10.07 13:17).
//
// Off while WEATHER_LOCATION_ENABLED is false (./weather-location-gate): every entry point
// answers "off" or null and never touches the SDK.
//
// Never prompts on its own. weatherLocationStatus() and readWeatherPlace() only check; the
// one call that can show the OS dialog is requestWeatherLocation(), for an explicit tap.
//
// Keeps the least: the fix is rounded to two decimals (about 1 km) inside readWeatherPlace()
// and the exact coordinates never leave this module. Nothing here stores or sends a place;
// the caller hands the coarse place to the weather source and keeps it no longer than the
// weather it fetched.
//
// Asks for the foreground permission only. app.json blocks the fine and background
// permissions on Android, so the OS can only grant an approximate fix there.
import { loadExpoLocation } from "./location-sdk";
import { WEATHER_LOCATION_ENABLED } from "./weather-location-gate";

export type WeatherLocationStatus = "off" | "unavailable" | "undetermined" | "blocked" | "granted";

export interface CoarsePlace {
  latitude: number;
  longitude: number;
}

/** A fix this recent is good enough for the weather. */
export const WEATHER_PLACE_MAX_AGE_MS = 30 * 60_000;

/** Two decimals: about 1.1 km north to south, a little less east to west in Korea. */
export function coarsen(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A coarse place, or null for a fix that is not a place on Earth. */
export function coarsePlace(latitude: number, longitude: number): CoarsePlace | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // `+ 0` turns a rounded -0 into 0 so equal places compare equal.
  return { latitude: coarsen(latitude) + 0, longitude: coarsen(longitude) + 0 };
}

// The few calls used, described structurally so a change in the SDK's own types shows up
// here and nowhere else.
interface PermissionLike {
  granted: boolean;
  status?: string;
  canAskAgain?: boolean;
}
interface PositionLike {
  coords: { latitude: number; longitude: number };
}
interface LocationSdk {
  getForegroundPermissionsAsync(): Promise<PermissionLike>;
  requestForegroundPermissionsAsync(): Promise<PermissionLike>;
  getLastKnownPositionAsync(options?: { maxAge?: number }): Promise<PositionLike | null>;
  getCurrentPositionAsync(options?: { accuracy?: number }): Promise<PositionLike>;
  Accuracy: { Low: number };
}

function sdk(): LocationSdk | null {
  const loaded = loadExpoLocation();
  if (!loaded) return null;
  const candidate = loaded as unknown as Partial<LocationSdk>;
  return typeof candidate.getForegroundPermissionsAsync === "function" &&
    typeof candidate.requestForegroundPermissionsAsync === "function" &&
    typeof candidate.getLastKnownPositionAsync === "function" &&
    typeof candidate.getCurrentPositionAsync === "function" &&
    candidate.Accuracy !== undefined
    ? (candidate as LocationSdk)
    : null;
}

function statusOf(permission: PermissionLike): WeatherLocationStatus {
  if (permission.granted) return "granted";
  return permission.status === "denied" && permission.canAskAgain === false ? "blocked" : "undetermined";
}

/** Whether the location can be read right now. Shows nothing. */
export async function weatherLocationStatus(): Promise<WeatherLocationStatus> {
  if (!WEATHER_LOCATION_ENABLED) return "off";
  const location = sdk();
  if (!location) return "unavailable";
  try {
    return statusOf(await location.getForegroundPermissionsAsync());
  } catch {
    return "unavailable";
  }
}

/** The one call that may show the OS permission dialog. Only for an explicit tap. */
export async function requestWeatherLocation(): Promise<WeatherLocationStatus> {
  if (!WEATHER_LOCATION_ENABLED) return "off";
  const location = sdk();
  if (!location) return "unavailable";
  try {
    return statusOf(await location.requestForegroundPermissionsAsync());
  } catch {
    return "unavailable";
  }
}

/** The coarse place for the weather, or null. Never prompts. */
export async function readWeatherPlace(): Promise<CoarsePlace | null> {
  if ((await weatherLocationStatus()) !== "granted") return null;
  const location = sdk();
  if (!location) return null;
  try {
    const recent = await location.getLastKnownPositionAsync({ maxAge: WEATHER_PLACE_MAX_AGE_MS });
    const fix = recent ?? (await location.getCurrentPositionAsync({ accuracy: location.Accuracy.Low }));
    return coarsePlace(fix.coords.latitude, fix.coords.longitude);
  } catch {
    return null;
  }
}
