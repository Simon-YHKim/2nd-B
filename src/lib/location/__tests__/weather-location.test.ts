// Turning on the weather location is a set of steps, not a code change (DECISIONS 26.10.07 13:18).
// While the gate is off, nothing in weather-location.ts may touch the SDK. It may only be on
// once the privacy policy (Korean and English), the terms, the iOS permission text and an
// adults-only location_weather consent key all cover it.
import { readFileSync } from "node:fs";
import path from "node:path";

const sdkCalls = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: () => sdkCalls("getForegroundPermissionsAsync"),
  requestForegroundPermissionsAsync: () => sdkCalls("requestForegroundPermissionsAsync"),
  getLastKnownPositionAsync: () => sdkCalls("getLastKnownPositionAsync"),
  getCurrentPositionAsync: () => sdkCalls("getCurrentPositionAsync"),
  Accuracy: { Low: 2 },
}));

import { MINOR_PROMOTABLE_KEYS, PRIVACY_PREF_KEYS } from "../../privacy/prefs";
import { WEATHER_LOCATION_ENABLED, WEATHER_LOCATION_BLOCKERS } from "../weather-location-gate";
import { coarsePlace, readWeatherPlace, requestWeatherLocation, weatherLocationStatus } from "../weather-location";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

interface AppJson {
  expo: {
    plugins: unknown[];
    android: { permissions: string[]; blockedPermissions: string[] };
  };
}
const appJson = () => JSON.parse(read("app.json")) as AppJson;
type LocationPluginOptions = {
  locationWhenInUsePermission?: string;
  locationAlwaysPermission?: string;
  locationAlwaysAndWhenInUsePermission?: string;
  isAndroidBackgroundLocationEnabled?: boolean;
  isIosBackgroundLocationEnabled?: boolean;
  isAndroidForegroundServiceEnabled?: boolean;
};
const locationPlugin = () =>
  (appJson().expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-location") as [string, LocationPluginOptions] | undefined)?.[1];

interface Disclosure {
  policy: string;
  terms: string;
  iosText: string;
  prefKeys: readonly string[];
  minorKeys: readonly string[];
}

/** What is still missing before the read may switch on. Empty means ready. */
function missingBeforeOn({ policy, terms, iosText, prefKeys, minorKeys }: Disclosure): string[] {
  const missing: string[] = [];
  // The policy already says '위치' and 'location' about ads, so it must tie them to the weather.
  if (!/위치[^\n]{0,80}날씨|날씨[^\n]{0,80}위치/.test(policy) || !/location[^\n]{0,80}weather|weather[^\n]{0,80}location/i.test(policy)) {
    missing.push("privacy policy (ko + en) does not say the location is used for the weather");
  }
  if (!/위치기반서비스/.test(terms)) missing.push("terms have no location-based service clause (Location Information Act art. 19)");
  if (!/weather/i.test(iosText)) missing.push("the iOS permission text does not say weather");
  if (!prefKeys.includes("location_weather")) missing.push("no location_weather consent key");
  if (minorKeys.includes("location_weather")) missing.push("minors could switch location_weather on");
  return missing;
}

function repoDisclosure(): Disclosure {
  return {
    policy: read("docs/legal/privacy-policy.md"),
    terms: read("docs/legal/terms-of-service.md"),
    iosText: String(locationPlugin()?.locationWhenInUsePermission ?? ""),
    prefKeys: PRIVACY_PREF_KEYS as readonly string[],
    minorKeys: MINOR_PROMOTABLE_KEYS as readonly string[],
  };
}

test("the readiness check names each missing piece and passes only when all of them are there", () => {
  const ready: Disclosure = {
    policy: "하루 관리판의 날씨를 보여 주려고 대략적인 위치를 씁니다 ... we use your approximate location to show the weather",
    terms: "제n조 (위치기반서비스)",
    iosText: "PolaScope uses your approximate location only to show the weather.",
    prefKeys: ["health_import", "location_weather"],
    minorKeys: ["long_term_memory"],
  };
  expect(missingBeforeOn(ready)).toEqual([]);
  expect(missingBeforeOn({ ...ready, policy: "광고 SDK 가 대략적인 위치를 ... approximate location for ads" })).toHaveLength(1);
  expect(missingBeforeOn({ ...ready, terms: "" })).toHaveLength(1);
  expect(missingBeforeOn({ ...ready, iosText: "" })).toHaveLength(1);
  expect(missingBeforeOn({ ...ready, prefKeys: ["health_import"] })).toHaveLength(1);
  expect(missingBeforeOn({ ...ready, minorKeys: ["location_weather"] })).toHaveLength(1);
});

test("the gate may be on only when the policy, the terms, the iOS text and an adults-only consent key cover it", () => {
  const missing = missingBeforeOn(repoDisclosure());
  if (WEATHER_LOCATION_ENABLED) expect(missing).toEqual([]);
  else expect(WEATHER_LOCATION_BLOCKERS.length).toBeGreaterThan(0);
});

test("the code disclosures are complete, while publication and provider blockers keep activation separate", () => {
  expect(missingBeforeOn(repoDisclosure())).toEqual([]);
  if (WEATHER_LOCATION_ENABLED) expect(WEATHER_LOCATION_BLOCKERS).toEqual([]);
});

test("the app asks for the approximate foreground location only", () => {
  const { android } = appJson().expo;
  expect(android.permissions).toContain("android.permission.ACCESS_COARSE_LOCATION");
  expect(android.permissions).not.toContain("android.permission.ACCESS_FINE_LOCATION");
  // expo-location's own manifest declares the fine permission; blocking it leaves the OS only the approximate grant.
  expect(android.blockedPermissions).toEqual(expect.arrayContaining([
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_BACKGROUND_LOCATION",
  ]));
  const plugin = locationPlugin();
  expect(plugin).toBeDefined();
  expect(plugin?.isAndroidBackgroundLocationEnabled).toBe(false);
  expect(plugin?.isIosBackgroundLocationEnabled).toBe(false);
  expect(plugin?.isAndroidForegroundServiceEnabled).toBe(false);
  expect(plugin?.locationAlwaysPermission).toBeUndefined();
  expect(plugin?.locationAlwaysAndWhenInUsePermission).toBeUndefined();
});

describe("coarse place", () => {
  test("two decimals, about 1 km", () => {
    expect(coarsePlace(37.566535, 126.977969)).toEqual({ latitude: 37.57, longitude: 126.98 });
    expect(coarsePlace(-33.868820, 151.209296)).toEqual({ latitude: -33.87, longitude: 151.21 });
  });

  test("a rounded -0 is 0", () => {
    expect(Object.is(coarsePlace(-0.001, -0.004)?.latitude, 0)).toBe(true);
    expect(Object.is(coarsePlace(-0.001, -0.004)?.longitude, 0)).toBe(true);
  });

  test("not a place on Earth gives null", () => {
    expect(coarsePlace(Number.NaN, 0)).toBeNull();
    expect(coarsePlace(91, 0)).toBeNull();
    expect(coarsePlace(0, -181)).toBeNull();
  });
});

(WEATHER_LOCATION_ENABLED ? describe.skip : describe)("while the gate is off", () => {
  test("every entry point answers off and never touches the SDK", async () => {
    sdkCalls.mockClear();
    await expect(weatherLocationStatus()).resolves.toBe("off");
    await expect(requestWeatherLocation()).resolves.toBe("off");
    await expect(readWeatherPlace()).resolves.toBeNull();
    expect(sdkCalls).not.toHaveBeenCalled();
  });
});
