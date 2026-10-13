import { PhonePressable as Pressable, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { useCallback, useRef, useState } from "react";
import { AppState, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth/AuthContext";
import { Text } from "@/components/ui/Text";
import { m3 } from "@/lib/theme/m3";
import { loadWeatherConsent, saveWeatherConsent, WeatherConsentConflictError } from "@/lib/weather/client";
import type { WeatherConsent } from "@/lib/weather/model";
import { consentAfterFailedRevoke, consentEvidence } from "@/lib/weather/consent-evidence";
import { WEATHER_LOCATION_ENABLED } from "@/lib/location/weather-location-gate";
import { weatherLocationStatus, type WeatherLocationStatus } from "@/lib/location/weather-location";
import { showsDeviceNotAllowedLine } from "@/lib/weather/device-line";

/** Settings offers withdrawal. The clock sheet is the only opt-in surface. */
export function WeatherPrivacyControl() {
  const { userId, isMinor } = useAuth();
  const { t, i18n } = useTranslation("ops");
  const [snapshot, setSnapshot] = useState<{ ownerId: string; status: WeatherConsent; revoked?: boolean } | null>(null);
  const status = snapshot?.ownerId === userId ? snapshot.status : null;
  const evidence = consentEvidence(status, snapshot?.revoked);
  const confirmed = evidence !== "unknown";
  const scope = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A masked OFF or failed status read must not disable withdrawal; initial loading still waits.
  const canRevoke = !!userId && isMinor === false && evidence !== "off" && (!!status || failed);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    scope.current = controller;
    setSnapshot(null); setFailed(false); setBusy(false); saving.current = false;
    if (userId && isMinor === false) void loadWeatherConsent(userId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setSnapshot({ ownerId: userId, status: next });
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [userId, isMinor]));
  // The device's own location permission, read without asking for it. Consent can be on while
  // this device never allowed location; the row then says the app reads no location here (Z75).
  // Read again when the app comes back to the front, since the permission is changed in OS settings.
  const [device, setDevice] = useState<{ ownerId: string; status: WeatherLocationStatus } | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    setDevice(null);
    const read = () => {
      if (userId) void weatherLocationStatus().then((next) => { if (live) setDevice({ ownerId: userId, status: next }); });
    };
    read();
    const listener = AppState.addEventListener("change", (next) => { if (next === "active") read(); });
    return () => { live = false; listener.remove(); };
  }, [userId]));
  const deviceNotAllowed = showsDeviceNotAllowedLine(evidence, isMinor, device?.ownerId === userId ? device.status : null);
  async function revoke() {
    const signal = scope.current?.signal;
    if (!userId || !canRevoke || saving.current || !signal || signal.aborted) return;
    saving.current = true; setBusy(true); setFailed(false);
    try {
      // Keep an unknown status explicit; the client uses revision 0 only for the request.
      const next = await saveWeatherConsent(userId, status, false, i18n.language, signal);
      if (!signal.aborted && consentEvidence(next, true) === "off") setSnapshot({ ownerId: userId, status: next, revoked: true });
    } catch (error) {
      if (!signal.aborted) {
        if (error instanceof WeatherConsentConflictError) {
          const retained = consentAfterFailedRevoke(status, error.latest);
          if (retained !== status && retained) setSnapshot({ ownerId: userId, status: retained });
        }
        setFailed(true);
      }
    }
    finally { if (!signal.aborted) { saving.current = false; setBusy(false); } }
  }
  // A kill switch still permits withdrawal of a previously saved grant.
  if (!WEATHER_LOCATION_ENABLED && !canRevoke) return null;
  return <View style={styles.block}>
    <Pressable accessibilityRole={confirmed ? "switch" : "button"} accessibilityLabel={t("phone.board.weather.setting")}
      accessibilityState={confirmed ? { checked: evidence === "on", disabled: !canRevoke || busy } : { disabled: !canRevoke || busy }}
      aria-checked={confirmed ? evidence === "on" : undefined}
      disabled={!canRevoke || busy} onPress={() => void revoke()} style={styles.row}>
      <Text variant="body" style={styles.label}>{t("phone.board.weather.setting")}</Text>
      <Text variant="body">{isMinor !== false ? t("phone.board.weather.off") : confirmed ? t(evidence === "on" ? "phone.board.weather.on" : "phone.board.weather.off") : status || failed ? "" : t("common:states.loading")}</Text>
    </Pressable>
    {deviceNotAllowed ? <Text variant="caption" testID="weather-device-not-allowed">{t("phone.board.weather.deviceNotAllowed")}</Text> : null}
    {failed ? <Text variant="caption" accessibilityRole="alert">{t("phone.board.weather.failed")}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: 8 },
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 },
  label: { flex: 1, color: m3.color.onSurface },
});
