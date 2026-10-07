import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { currentPrivacyChange, subscribePrivacyChanges } from "../privacy/changes";
import { readWeatherPlace, requestWeatherLocation, weatherLocationStatus } from "../location/weather-location";
import { WEATHER_LOCATION_ENABLED } from "../location/weather-location-gate";
import { createWeatherReader, loadWeatherConsent, saveWeatherConsent } from "./client";
import { createWeatherController, type WeatherState } from "./controller";
import { EMPTY_WEATHER } from "./model";

export function useClockWeather(ownerId: string, isMinor: boolean | null, locale: string) {
  const [snapshot, setSnapshot] = useState<{ ownerId: string; state: WeatherState } | null>(null);
  const controller = useMemo(() => {
    const lease = captureAccountOwnerLease(ownerId);
    const reader = createWeatherReader(ownerId);
    return createWeatherController({
      enabled: WEATHER_LOCATION_ENABLED, isMinor,
      current: () => lease?.isCurrent() === true,
      locallyAllowed: () => currentPrivacyChange(ownerId)?.prefs.location_weather !== false,
      consent: (signal) => loadWeatherConsent(ownerId, signal),
      save: (status, signal) => saveWeatherConsent(ownerId, status, true, locale, signal),
      permission: weatherLocationStatus, requestPermission: requestWeatherLocation,
      place: readWeatherPlace, weather: reader.read, clear: reader.clear,
    }, (state) => setSnapshot({ ownerId, state }));
  }, [ownerId, isMinor, locale]);

  useEffect(() => {
    controller.activate();
    const off = subscribePrivacyChanges((change) => {
      if (change.ownerId === ownerId && change.prefs.location_weather === false) controller.withdraw();
    });
    const account = subscribeAccountTransition(() => {
      if (!captureAccountOwnerLease(ownerId)) controller.withdraw();
    });
    return () => { off(); account(); controller.dispose(); };
  }, [controller, ownerId]);

  useFocusEffect(useCallback(() => {
    if (AppState.currentState === "active") void controller.refresh();
    const listener = AppState.addEventListener("change", (next) => {
      if (next === "active") void controller.refresh();
      else controller.suspend();
    });
    return () => { listener.remove(); controller.suspend(); };
  }, [controller]));
  // An old render's data cannot appear on a new/unknown account or while gated off.
  return { state: snapshot?.ownerId === ownerId && isMinor === false && WEATHER_LOCATION_ENABLED ? snapshot.state : { ...EMPTY_WEATHER, busy: false, failed: false }, enable: controller.enable, cancel: controller.cancel };
}
