import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Redirect, router, useFocusEffect, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth/AuthContext";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import { loadDashboard } from "@/lib/dashboard/load";
import { DASHBOARD_SOURCES, sourceState, type DashboardData } from "@/lib/dashboard/model";
import { DEFAULT_REFRESH_SETTINGS, getRefreshSettings, normalizeRefreshTime, REFRESH_MINUTE_OPTIONS, setRefreshSettings, type RefreshMinutes, type RefreshSettings } from "@/lib/dashboard/refresh-cadence";
import { m3 } from "@/lib/theme/m3";

const BRAND_NAMES: Record<string, string> = {
  garmin: "Garmin Connect", instagram: "Instagram", facebook: "Facebook",
  x: "X", nike: "Nike Run Club", line: "LINE", whatsapp: "WhatsApp",
  kakao: "KakaoTalk", sms: "SMS",
};

function Text({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.text, style]} />;
}

export default function DataConnections() {
  const { userId, isMinor, loading } = useAuth();
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  return <DataConnectionsBody key={`${userId}:${isMinor}`} ownerId={userId} isMinor={isMinor} />;
}

function DataConnectionsBody({ ownerId, isMinor }: { ownerId: string; isMinor: boolean | null }) {
  const { t, i18n } = useTranslation(["settings", "ops"]);
  const [refreshSettings, setRefreshSettingsState] = useState<RefreshSettings>(DEFAULT_REFRESH_SETTINGS);
  const [timeDraft, setTimeDraft] = useState(DEFAULT_REFRESH_SETTINGS.anchorTime);
  const [timeError, setTimeError] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const readSequence = useRef(0);
  const savingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    const sequence = ++readSequence.current;
    setRefreshing(false);
    void getRefreshSettings(ownerId).then((value) => {
      if (active) { setRefreshSettingsState(value); setTimeDraft(value.anchorTime); setTimeError(false); }
    });
    void loadDashboard(ownerId, isMinor).then((value) => {
      if (active && readSequence.current === sequence) { setData(value); setReadError(false); }
    }).catch(() => { if (active && readSequence.current === sequence) setReadError(true); });
    return () => { active = false; readSequence.current++; };
  }, [ownerId, isMinor]));

  const refreshNow = async () => {
    if (refreshing) return;
    const sequence = ++readSequence.current;
    setRefreshing(true);
    setReadError(false);
    try {
      const next = await loadDashboard(ownerId, isMinor);
      if (readSequence.current === sequence) setData(next);
    } catch {
      if (readSequence.current === sequence) setReadError(true);
    } finally {
      if (readSequence.current === sequence) setRefreshing(false);
    }
  };

  const saveSettings = async (next: RefreshSettings) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      await setRefreshSettings(ownerId, next);
      setRefreshSettingsState(next);
      setTimeDraft(next.anchorTime);
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const selectMinutes = (value: RefreshMinutes) => {
    if (value !== refreshSettings.intervalMinutes) void saveSettings({ ...refreshSettings, intervalMinutes: value });
  };

  const saveTime = () => {
    const normalized = normalizeRefreshTime(timeDraft);
    if (!normalized) { setTimeError(true); return; }
    setTimeError(false);
    if (normalized !== refreshSettings.anchorTime) void saveSettings({ ...refreshSettings, anchorTime: normalized });
    else setTimeDraft(normalized);
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(i18n.language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : t("ops:phone.unknownDate");
  };
  const refreshLabel = (value: RefreshMinutes) => value < 60 ? t("settings:dataRefreshMinutes", { count: value })
      : t("settings:dataRefreshHours", { count: value / 60 });

  return <DeepSpaceScreen active="settings" header="none" variant="windowed" title={t("settings:dataConnections")} onBack={() => router.back()}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <PixelSurface variant="inset" contentStyle={styles.panel}>
        <Text variant="heading">{t("settings:dataRefreshTitle")}</Text>
        <Text variant="body" style={styles.secondary}>{t("settings:dataRefreshScope")}</Text>
        <View style={styles.toggleRow}>
          <Text variant="body" style={styles.toggleLabel}>{t("settings:dataRefreshAuto")}</Text>
          <PixelPressable
            accessibilityRole="switch"
            accessibilityLabel={t("settings:dataRefreshAuto")}
            accessibilityState={{ checked: refreshSettings.enabled, busy: saving }}
            disabled={saving}
            onPress={() => { void saveSettings({ ...refreshSettings, enabled: !refreshSettings.enabled }); }}
            background={refreshSettings.enabled ? m3.color.primaryContainer : m3.color.surfaceContainerHigh}
            contentStyle={[styles.toggleTrack, { justifyContent: refreshSettings.enabled ? "flex-end" : "flex-start" }]}
          ><View style={[styles.toggleThumb, refreshSettings.enabled && styles.toggleThumbOn]} /></PixelPressable>
        </View>
        <Text variant="caption" style={styles.secondary}>{t(refreshSettings.enabled ? "settings:dataRefreshOn" : "settings:dataRefreshOff")}</Text>
        {refreshSettings.enabled ? <>
          <Text variant="body">{t("settings:dataRefreshInterval")}</Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {REFRESH_MINUTE_OPTIONS.map((value) => <PixelPressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={refreshLabel(value)}
              accessibilityState={{ checked: refreshSettings.intervalMinutes === value, busy: saving }}
              disabled={saving}
              onPress={() => { selectMinutes(value); }}
              background={refreshSettings.intervalMinutes === value ? m3.color.primaryContainer : m3.color.surfaceContainerHigh}
              contentStyle={styles.option}
            >
              <Text variant="caption" style={styles.optionText}>{refreshLabel(value)}</Text>
            </PixelPressable>)}
          </View>
          <Text variant="body">{t("settings:dataRefreshTime")}</Text>
          <View style={styles.timeRow}>
            <TextInput
              accessibilityLabel={t("settings:dataRefreshTime")}
              value={timeDraft}
              onChangeText={(value) => { setTimeDraft(value); setTimeError(false); }}
              onSubmitEditing={saveTime}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              maxLength={5}
              placeholder="07:30"
              placeholderTextColor={m3.color.onSurfaceVariant}
              style={styles.timeInput}
            />
            <PixelPressable disabled={saving} onPress={saveTime} accessibilityLabel={t("settings:dataRefreshTimeSave")} contentStyle={styles.action}>
              <Text variant="caption">{t("settings:dataRefreshTimeSave")}</Text>
            </PixelPressable>
          </View>
          {timeError ? <Text accessibilityRole="alert" variant="caption" style={styles.error}>{t("settings:dataRefreshTimeError")}</Text> : null}
          <Text variant="caption" style={styles.secondary}>{t("settings:dataRefreshTimeHint")}</Text>
        </> : null}
        {saveError ? <Text accessibilityRole="alert" variant="caption" style={styles.error}>{t("settings:dataRefreshSaveError")}</Text> : null}
        <Text variant="caption" style={styles.secondary}>{data ? t("ops:phone.lastRead", { date: formatDate(data.readAt) }) : t(readError ? "ops:phone.noData" : "ops:phone.loading")}</Text>
        <PixelPressable disabled={refreshing} onPress={() => { void refreshNow(); }} accessibilityLabel={t("ops:phone.refresh")} contentStyle={styles.action}>
          <PixelGlyph name="refresh" size={24} color={m3.color.primary} />
          <Text variant="caption">{t(refreshing ? "ops:phone.loading" : "ops:phone.refresh")}</Text>
        </PixelPressable>
      </PixelSurface>

      <Text variant="heading">{t("ops:phone.sourcesTitle")}</Text>
      <Text variant="body" style={styles.secondary}>{t("ops:phone.sourceScope")}</Text>
      {readError ? <Text accessibilityRole="alert" variant="caption" style={styles.error}>{t("ops:phone.readError")}</Text> : null}
      {DASHBOARD_SOURCES.map((source) => {
        const state = data ? sourceState(source, data, isMinor) : { status: "unknown" as const, lastImport: null };
        const name = BRAND_NAMES[source.id] ?? t(`ops:phone.sourceNames.${source.id}`);
        const action = t(source.mode === "manual" ? "ops:phone.addRecord" : "ops:phone.manageSource");
        return <PixelSurface key={source.id} variant="frame" contentStyle={styles.panel}>
          <View style={styles.sourceTitle}>
            <PixelGlyph name={source.glyph} size={24} color={m3.color.primary} />
            <Text variant="body" style={styles.sourceName}>{name}</Text>
          </View>
          <Text variant="caption" style={styles.accent}>{t(`ops:phone.status.${state.status}`)}</Text>
          <Text variant="body" style={styles.secondary}>{t(`ops:phone.sourceNotes.${source.id}`)}</Text>
          {state.lastImport ? <Text variant="caption" style={styles.secondary}>{t("ops:phone.lastImport", { date: formatDate(state.lastImport) })}</Text> : null}
          <PixelPressable
            disabled={state.status === "restricted"}
            accessibilityLabel={`${name}: ${action}`}
            onPress={() => router.push(source.route as Href)}
            contentStyle={styles.action}
          >
            <Text variant="caption">{action}</Text>
          </PixelPressable>
        </PixelSurface>;
      })}
      <PixelPressable onPress={() => router.push("/import-hub")} accessibilityLabel={t("ops:phone.importHistory")} contentStyle={styles.action}>
        <Text variant="caption">{t("ops:phone.importHistory")}</Text>
      </PixelPressable>
      <PixelPressable onPress={() => router.push("/privacy")} accessibilityLabel={t("ops:phone.dataConsent")} contentStyle={styles.action}>
        <Text variant="caption">{t("ops:phone.dataConsent")}</Text>
      </PixelPressable>
      <PixelPressable onPress={() => router.push("/permissions")} accessibilityLabel={t("ops:phone.devicePermissions")} contentStyle={styles.action}>
        <Text variant="caption">{t("ops:phone.devicePermissions")}</Text>
      </PixelPressable>
    </ScrollView>
  </DeepSpaceScreen>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: m3.color.surface },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 12 },
  text: { color: m3.color.onSurface },
  secondary: { color: m3.color.onSecondaryContainer, lineHeight: 23 },
  accent: { color: m3.color.primary },
  error: { color: m3.color.error },
  panel: { padding: 16, gap: 10 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  toggleLabel: { flex: 1 },
  toggleTrack: { width: 58, minHeight: 44, alignItems: "center", flexDirection: "row", paddingHorizontal: 5 },
  toggleThumb: { width: 20, height: 20, backgroundColor: m3.color.onSurfaceVariant },
  toggleThumbOn: { backgroundColor: m3.color.primary },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minWidth: 82, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  optionText: { textAlign: "center" },
  timeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  timeInput: { minWidth: 90, minHeight: 44, borderWidth: 2, borderColor: m3.color.outline, backgroundColor: m3.color.surfaceContainerHigh, color: m3.color.onSurface, paddingHorizontal: 10, fontSize: 16, fontFamily: "Galmuri11" },
  sourceTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceName: { flex: 1 },
  action: { minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
});
