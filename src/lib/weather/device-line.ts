import type { WeatherLocationStatus } from "../location/weather-location";

/**
 * The privacy row shows the account's consent, not whether this device hands over a location.
 * With consent on and the device not allowing location, the app reads no location here
 * (readWeatherPlace returns null unless the status is "granted"). The row then shows, under the
 * switch, the sentence the weather sheet already uses when the device permission is off.
 *
 * Allowed, switched off for everyone ("off") and "unavailable" say nothing: the reason there is
 * not the device permission, and the line would state a cause the code does not know.
 * Under 18 the row is always off, so there is nothing to explain.
 */
export function showsDeviceNotAllowedLine(
  evidence: "on" | "off" | "unknown",
  isMinor: boolean | null,
  device: WeatherLocationStatus | null,
): boolean {
  if (evidence !== "on" || isMinor !== false) return false;
  return device === "denied" || device === "blocked" || device === "undetermined";
}
