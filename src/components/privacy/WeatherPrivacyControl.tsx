import { PhonePressable as Pressable, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { useCallback, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth/AuthContext";
import { Text } from "@/components/ui/Text";
import { m3 } from "@/lib/theme/m3";
import { loadWeatherConsent, saveWeatherConsent, WeatherConsentConflictError } from "@/lib/weather/client";
import { WEATHER_CONSENT_REVISION, type WeatherConsent } from "@/lib/weather/model";
import { WEATHER_LOCATION_ENABLED } from "@/lib/location/weather-location-gate";

/** Settings offers withdrawal. The clock sheet is the only opt-in surface. */
export function WeatherPrivacyControl() {
  const { userId, isMinor } = useAuth();
  const { t, i18n } = useTranslation("ops");
  const [snapshot, setSnapshot] = useState<{ ownerId: string; status: WeatherConsent } | null>(null);
  const status = snapshot?.ownerId === userId ? snapshot.status : null;
  const scope = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A failed status read (including its quota) must not disable withdrawal.
  const canRevoke = !!userId && isMinor === false && (status?.enabled === true || (!status && failed));
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    scope.current = controller;
    setSnapshot(null); setFailed(false); setBusy(false); saving.current = false;
    if (userId && isMinor === false) void loadWeatherConsent(userId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setSnapshot({ ownerId: userId, status: next });
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [userId, isMinor]));
  async function revoke() {
    const signal = scope.current?.signal;
    if (!userId || !canRevoke || saving.current || !signal || signal.aborted) return;
    saving.current = true; setBusy(true); setFailed(false);
    try {
      // Request-only fallback. Never display an unconfirmed OFF snapshot.
      const withdrawal = status ?? { contract: WEATHER_CONSENT_REVISION, revision: 0,
        enabled: false, eligible: false, available: false };
      const next = await saveWeatherConsent(userId, withdrawal, false, i18n.language, signal);
      if (!signal.aborted) setSnapshot({ ownerId: userId, status: next });
    } catch (error) {
      if (!signal.aborted) {
        if (error instanceof WeatherConsentConflictError && error.latest) setSnapshot({ ownerId: userId, status: error.latest });
        setFailed(true);
      }
    }
    finally { if (!signal.aborted) { saving.current = false; setBusy(false); } }
  }
  // A kill switch still permits withdrawal of a previously saved grant.
  if (!WEATHER_LOCATION_ENABLED && !canRevoke) return null;
  return <View style={styles.block}>
    <Pressable accessibilityRole={status ? "switch" : "button"} accessibilityLabel={t("phone.board.weather.setting")}
      accessibilityState={status ? { checked: status.enabled, disabled: !canRevoke || busy } : { disabled: !canRevoke || busy }}
      aria-checked={status ? status.enabled : undefined}
      disabled={!canRevoke || busy} onPress={() => void revoke()} style={styles.row}>
      <Text variant="body" style={styles.label}>{t("phone.board.weather.setting")}</Text>
      <Text variant="body">{isMinor !== false ? t("phone.board.weather.off") : status ? t(status.enabled ? "phone.board.weather.on" : "phone.board.weather.off") : failed ? "" : t("common:states.loading")}</Text>
    </Pressable>
    {failed ? <Text variant="caption" accessibilityRole="alert">{t("phone.board.weather.failed")}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: 8 },
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 },
  label: { flex: 1, color: m3.color.onSurface },
});
