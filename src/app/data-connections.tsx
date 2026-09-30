import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router, useFocusEffect, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth/AuthContext";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { PixelTimeSheet } from "@/components/pixel/PixelTimeSheet";
import { formatClock } from "@/components/pixel/time-wheel";
import { m3TextStyle } from "@/components/m3/typeface";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import { loadDashboard } from "@/lib/dashboard/load";
import { DASHBOARD_SOURCES, SOURCE_GROUPS, sourceGroup, sourceState, type DashboardData } from "@/lib/dashboard/model";
import { DEFAULT_REFRESH_SETTINGS, getRefreshSettings, setRefreshSettings, type RefreshSettings } from "@/lib/dashboard/refresh-cadence";
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
  const { t, i18n } = useTranslation(["settings", "ops", "common"]);
  const [refreshSettings, setRefreshSettingsState] = useState<RefreshSettings>(DEFAULT_REFRESH_SETTINGS);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
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
      if (active) setRefreshSettingsState(value);
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

  const saveSettings = async (next: RefreshSettings): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      await setRefreshSettings(ownerId, next);
      setRefreshSettingsState(next);
      return true;
    } catch {
      setSaveError(true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const openTimeSheet = () => {
    setSaveError(false);
    setTimeSheetOpen(true);
  };
  // Closing without a failed save leaves nothing to retry, so the error goes with the sheet.
  const closeTimeSheet = () => {
    setSaveError(false);
    setTimeSheetOpen(false);
  };

  // The sheet stays open when a save fails, so the chosen time is not lost and the error shows inside it.
  const saveTime = async (anchorTime: string) => {
    if (anchorTime === refreshSettings.anchorTime) closeTimeSheet();
    else if (await saveSettings({ ...refreshSettings, anchorTime })) setTimeSheetOpen(false);
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(i18n.language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : t("ops:phone.unknownDate");
  };
  const dailyLabel = t("settings:dataRefreshDaily", {
    time: formatClock(refreshSettings.anchorTime, t("common:timePicker.pattern"), {
      am: t("common:timePicker.am"), pm: t("common:timePicker.pm"),
    }),
  });

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
        {refreshSettings.enabled ? <PixelPressable
          variant="frame"
          fullWidth
          disabled={saving}
          onPress={openTimeSheet}
          accessibilityLabel={`${t("settings:dataRefreshTimeLabel")}, ${dailyLabel}`}
          accessibilityHint={t("settings:dataRefreshTimeOpen")}
          accessibilityState={{ expanded: timeSheetOpen, busy: saving }}
          contentStyle={styles.timeTrigger}
        >
          <PixelGlyph name="schedule" size={24} color={m3.color.primary} />
          <Text style={styles.timeValue}>{dailyLabel}</Text>
          <PixelGlyph name="expandMore" size={24} color={m3.color.primary} />
        </PixelPressable> : null}
        {saveError && !timeSheetOpen ? <Text accessibilityRole="alert" variant="caption" style={styles.error}>{t("settings:dataRefreshSaveError")}</Text> : null}
        <Text variant="caption" style={styles.secondary}>{data ? t("ops:phone.lastRead", { date: formatDate(data.readAt) }) : t(readError ? "ops:phone.noData" : "ops:phone.loading")}</Text>
        <PixelPressable
          fullWidth
          disabled={refreshing}
          onPress={() => { void refreshNow(); }}
          accessibilityLabel={t("ops:phone.refresh")}
          accessibilityState={{ busy: refreshing }}
          contentStyle={styles.action}
        >
          <PixelGlyph name="refresh" size={24} color={m3.color.primary} />
          <Text variant="caption">{t(refreshing ? "ops:phone.loading" : "ops:phone.refresh")}</Text>
        </PixelPressable>
      </PixelSurface>

      <Text variant="heading">{t("ops:phone.sourcesTitle")}</Text>
      {readError ? <Text accessibilityRole="alert" variant="caption" style={styles.error}>{t("ops:phone.readError")}</Text> : null}
      {SOURCE_GROUPS.map((group) => {
        const sources = DASHBOARD_SOURCES.filter((source) => sourceGroup(source) === group);
        return <View key={group} style={styles.group}>
          <Text accessibilityRole="header" style={styles.groupTitle}>{t(`ops:phone.sourceGroups.${group}`)}</Text>
          {group === "manual" ? <PixelSurface variant="frame" contentStyle={styles.panel}>
            {/* No-break spaces keep a multi-word name ("Nike Run Club") on one line. */}
            <Text variant="body" style={styles.sourceName}>{sources.map((source) => (BRAND_NAMES[source.id] ?? source.id).replace(/ /g, "\u00a0")).join(" · ")}</Text>
            <Text variant="body" style={styles.secondary}>{t("ops:phone.sourceNotes.manual")}</Text>
            <PixelPressable onPress={() => router.push("/capture")} accessibilityLabel={t("ops:phone.addRecord")} contentStyle={styles.action}>
              <Text variant="caption">{t("ops:phone.addRecord")}</Text>
            </PixelPressable>
          </PixelSurface> : sources.map((source) => {
            // The age lock does not wait for the read: a minor or an unconfirmed age never gets a live button.
            const locked = "adultOnly" in source && source.adultOnly && isMinor !== false;
            const state = locked ? { status: "restricted" as const, lastImport: null }
              : data ? sourceState(source, data, isMinor) : { status: "unknown" as const, lastImport: null };
            const name = BRAND_NAMES[source.id] ?? t(`ops:phone.sourceNames.${source.id}`);
            // Device cards open the tab that holds the consent and OS-permission row and the "reflect today"
            // read. That tap also arms the daily automatic read on this phone (lib/health/auto-read.ts), so
            // the label names the screen, not a read.
            const action = t(group === "device" ? "ops:phone.openHealth" : "ops:phone.manageSource");
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
        </View>;
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
    <PixelTimeSheet
      visible={timeSheetOpen}
      value={refreshSettings.anchorTime}
      title={t("settings:dataRefreshSheetTitle")}
      busy={saving}
      error={saveError ? t("settings:dataRefreshSaveError") : null}
      onCancel={closeTimeSheet}
      onSave={(anchorTime) => { void saveTime(anchorTime); }}
    />
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
  timeTrigger: { minHeight: 44, paddingHorizontal: 12, alignItems: "center", flexDirection: "row", gap: 10 },
  // Chrome, not reading text: the readable-font option must not turn these into Pretendard.
  timeValue: { ...m3TextStyle("titleMedium"), flex: 1 },
  group: { gap: 10 },
  groupTitle: { ...m3TextStyle("titleMedium"), color: m3.color.primary },
  sourceTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceName: { flex: 1 },
  action: { minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
});
