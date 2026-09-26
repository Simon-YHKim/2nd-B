import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Platform, StyleSheet, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { withTimeout } from "@/lib/async/with-timeout";
import { loadDashboard } from "@/lib/dashboard/load";
import { countAreaRecords, DASHBOARD_SOURCES, LIFE_AREAS, localDate, realHealthSamples, routineActionRoute, sourceState, todayAgenda, type DashboardData } from "@/lib/dashboard/model";
import { logRoutineCompletion } from "@/lib/ops/routines";
import { m3 } from "@/lib/theme/m3";

type Tab = "today" | "sources" | "tools";
const TABS: Tab[] = ["today", "sources", "tools"];
const BRAND_NAMES: Record<string, string> = { garmin: "Garmin Connect", instagram: "Instagram", facebook: "Facebook", x: "X", nike: "Nike Run Club", line: "LINE", whatsapp: "WhatsApp", kakao: "KakaoTalk", sms: "SMS" };
const TOOLS: { id: string; glyph: AnyGlyphName; route: string }[] = [
  { id: "assistant", glyph: "bubble", route: "/ops" },
  { id: "focus", glyph: "timer", route: "/focus" },
  { id: "reminders", glyph: "notifications", route: "/reminders" },
  { id: "money", glyph: "credit_card", route: "/ledger" },
  { id: "growth", glyph: "target", route: "/milestones" },
  { id: "meals", glyph: "fire", route: "/meals" },
  { id: "community", glyph: "group", route: "/community" },
  { id: "relationships", glyph: "person", route: "/star/relation" },
];

function go(route: string) { router.push(route as Href); }

function PhoneAction({ label, onPress, glyph = "arrow_forward", disabled = false }: {
  label: string; onPress: () => void; glyph?: AnyGlyphName; disabled?: boolean;
}) {
  return <PixelPressable onPress={onPress} disabled={disabled} accessibilityLabel={label} contentStyle={styles.action}>
    <PixelGlyph name={glyph} size={24} color={m3.color.primary} />
    <Text variant="caption" style={styles.actionText}>{label}</Text>
  </PixelPressable>;
}

export function DashboardPhone({ ownerId, isMinor }: { ownerId: string; isMinor: boolean | null }) {
  const { t, i18n } = useTranslation("ops");
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [writeError, setWriteError] = useState(false);
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void loadDashboard(ownerId, isMinor).then((next) => {
      if (active) setData(next);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ownerId, isMinor, refresh]));

  const date = (value: string, includeTime = false) => {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return t("phone.unknownDate");
    return parsed.toLocaleString(i18n.language, includeTime
      ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric", weekday: "short" });
  };
  const agenda = data?.routines.ok && data.completions.ok
    ? todayAgenda(data.routines.value, data.completions.value, new Date()) : [];
  const completed = agenda.filter((item) => item.completed).length;
  const next = agenda.find((item) => !item.completed);
  const interviews = data?.interviews.ok ? data.interviews.value.filter((item) => item.body?.trim()) : [];
  const health = data?.healthEnabled && data.health.ok ? realHealthSamples(data.health.value)[0] : undefined;
  const partial = data && Object.values(data).some((value) => value && typeof value === "object" && "ok" in value && !value.ok);

  async function complete(id: string) {
    if (actionBusy.current) return;
    const lease = captureAccountOwnerLease(ownerId);
    if (!lease?.isCurrent()) return;
    actionBusy.current = true;
    setBusy(id);
    setWriteError(false);
    try {
      await withTimeout(logRoutineCompletion(ownerId, id, localDate(new Date())), 8_000, "dashboard completion");
      if (mounted.current && lease.isCurrent()) setRefresh((value) => value + 1);
    } catch { if (mounted.current && lease.isCurrent()) setWriteError(true); }
    finally { actionBusy.current = false; if (mounted.current && lease.isCurrent()) setBusy(null); }
  }

  const notification = data?.notifications.ok ? data.notifications.value : null;
  const notificationKey = Platform.OS === "web" ? "web" : !notification ? "unknown" :
    notification.permission === "granted" ? "granted" : notification.permission === "unavailable" ? "unavailable" : "permission";

  function today() {
    return <View style={styles.stack}>
      <PixelSurface variant="inset" contentStyle={styles.hero}>
        <Text variant="caption" style={styles.accent}>{t("phone.todayLabel")}</Text>
        <Text variant="heading" style={styles.headline}>{next?.title ?? t(agenda.length ? "phone.allDone" : "phone.startSmall")}</Text>
        {agenda.length > 0 ? <Text variant="caption" style={styles.muted}>{t("phone.progress", { done: completed, total: agenda.length })}</Text> : null}
        <PhoneAction label={t(next ? "phone.openTask" : "phone.planRoutine")} onPress={() => go(next ? routineActionRoute(next.domain_id) : "/ops")} />
      </PixelSurface>
      <View style={styles.sectionHeading}>
        <Text variant="heading">{t("phone.agenda")}</Text>
        <PhoneAction label={t("phone.allRoutines")} glyph="schedule" onPress={() => go("/reminders")} />
      </View>
      {data && (!data.routines.ok || !data.completions.ok) ? <Text variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : agenda.length === 0 ?
        <Text variant="body" style={styles.muted}>{t("phone.emptyAgenda")}</Text> : agenda.slice(0, 3).map((item) => <PixelSurface key={item.id} variant="frame" contentStyle={styles.routine}>
          <Text variant="caption" style={styles.accent}>{item.completed ? t("phone.completed") : item.reminder_time?.slice(0, 5) ?? t("phone.anytime")}</Text>
          <Text variant="body">{item.title}</Text>
          {item.reason ? <Text variant="caption" style={styles.muted}>{item.reason.slice(0, 180)}</Text> : null}
          <View style={styles.actions}>
            <PhoneAction label={t("phone.openTask")} onPress={() => go(routineActionRoute(item.domain_id))} />
            {!item.completed ? <PhoneAction label={t(busy === item.id ? "phone.saving" : "phone.markDone")} glyph="check" disabled={busy !== null || loading} onPress={() => { void complete(item.id); }} /> : null}
          </View>
        </PixelSurface>)}
      {writeError ? <Text accessibilityRole="alert" variant="caption" style={styles.muted}>{t("phone.saveError")}</Text> : null}
      <Text variant="heading">{t("phone.myWords")}</Text>
      {data && !data.interviews.ok ? <Text variant="caption" style={styles.muted}>{t("phone.readError")}</Text> : interviews[0] ?
        <PixelPressable fullWidth onPress={() => go(`/record/${encodeURIComponent(interviews[0].id)}`)} accessibilityLabel={t("phone.openEvidence")} contentStyle={styles.evidence}>
          <Text variant="body">{interviews[0].body?.trim().slice(0, 220)}</Text>
          <Text variant="caption" style={styles.muted}>{t("phone.interviewSource", { date: date(interviews[0].created_at) })}</Text>
        </PixelPressable> : <View style={styles.stack}>
          <Text variant="body" style={styles.muted}>{t("phone.emptyInterview")}</Text>
          <PhoneAction label={t("phone.startInterview")} glyph="bubble" onPress={() => go("/me/now")} />
        </View>}
      <Text variant="heading">{t("phone.lifeAreas")}</Text>
      <Text variant="caption" style={styles.muted}>{t("phone.areaScope")}</Text>
      <View style={styles.grid}>{LIFE_AREAS.map((area) => <PixelPressable key={area} onPress={() => go(`/star/${area}`)} rootStyle={styles.area} contentStyle={styles.areaContent} accessibilityLabel={t(`phone.areas.${area}`)}>
        <Text variant="caption">{t(`phone.areas.${area}`)}</Text>
        <Text variant="heading" style={styles.accent}>{data?.records.ok ? countAreaRecords(data.records.value, area) : "?"}</Text>
      </PixelPressable>)}</View>
      {health ? <PixelPressable fullWidth onPress={() => go("/star/health")} accessibilityLabel={t("phone.openActivity")} contentStyle={styles.evidence}>
        <Text variant="caption" style={styles.accent}>{t("phone.latestActivity")}</Text>
        <Text variant="body">{t(`phone.metrics.${health.metric_type}`, { defaultValue: health.metric_type })} · {health.value.toLocaleString(i18n.language)} {health.unit}</Text>
        <Text variant="caption" style={styles.muted}>{health.source} · {date(health.started_at, true)}</Text>
      </PixelPressable> : null}
    </View>;
  }

  function sourceRow(index: number) {
    const item = DASHBOARD_SOURCES[index];
    const state = data ? sourceState(item, data, isMinor) : { status: "unknown" as const, lastImport: null };
    const name = BRAND_NAMES[item.id] ?? t(`phone.sourceNames.${item.id}`);
    return <PixelSurface variant="frame" contentStyle={styles.source}>
      <View style={styles.sourceTitle}><PixelGlyph name={item.glyph} size={24} color={m3.color.primary} /><Text variant="body" style={styles.flexText}>{name}</Text></View>
      <Text variant="caption" style={styles.accent}>{t(`phone.status.${state.status}`)}</Text>
      <Text variant="caption" style={styles.muted}>{t(`phone.sourceNotes.${item.id}`)}</Text>
      {state.lastImport ? <Text variant="caption" style={styles.muted}>{t("phone.lastImport", { date: date(state.lastImport, true) })}</Text> : null}
      <PhoneAction label={t(item.mode === "manual" ? "phone.addRecord" : "phone.manageSource")} disabled={state.status === "restricted"} onPress={() => go(item.route)} />
    </PixelSurface>;
  }

  function tools() {
    return <View style={styles.stack}>
      <Text variant="heading">{t("phone.toolsTitle")}</Text>
      <View style={styles.grid}>{TOOLS.filter((item) => item.id !== "community" || isMinor === false).map((item) => <PixelPressable key={item.id} rootStyle={styles.tool} contentStyle={styles.toolContent} onPress={() => go(item.route)} accessibilityLabel={t(`phone.apps.${item.id}`)}>
        <PixelGlyph name={item.glyph} size={24} color={m3.color.primary} />
        <Text variant="caption" style={styles.centered}>{t(`phone.apps.${item.id}`)}</Text>
      </PixelPressable>)}</View>
      <PixelSurface variant="inset" contentStyle={styles.evidence}>
        <Text variant="heading">{t("phone.notifications")}</Text>
        <Text variant="body" style={styles.muted}>{t(`phone.push.${notificationKey}`, { count: notification?.scheduled ?? 0 })}</Text>
        <PhoneAction label={t("phone.reminderSettings")} glyph="notifications" onPress={() => go("/reminders")} />
      </PixelSurface>
      <Text variant="heading">{t("phone.controls")}</Text>
      <PhoneAction label={t("phone.devicePermissions")} glyph="lock" onPress={() => go("/permissions")} />
      <PhoneAction label={t("phone.dataConsent")} glyph="lock" onPress={() => go("/privacy")} />
      <PhoneAction label={t("phone.importHistory")} glyph="download" onPress={() => go("/import-hub")} />
      <Text variant="caption" style={styles.muted}>{t("phone.controlNote")}</Text>
    </View>;
  }

  return <DeepSpaceScreen active="ops" header="none" variant="windowed" title={t("phone.title")} onBack={() => router.canGoBack() ? router.back() : router.replace("/")}>
    <View style={styles.phone}>
      <View pointerEvents="none" style={styles.speaker} />
      <View style={styles.statusBar}><Text variant="caption" style={styles.accent}>{t("phone.brand")}</Text><Text variant="caption" style={styles.muted}>{date(new Date().toISOString())}</Text></View>
      <View style={styles.tabs}>{TABS.map((item) => <PixelPressable key={item} rootStyle={styles.tab} onPress={() => setTab(item)} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} background={tab === item ? m3.color.primaryContainer : m3.color.surfaceContainer} contentStyle={styles.tabContent}>
        <Text variant="caption" style={styles.centered}>{t(`phone.tabs.${item}`)}</Text>
      </PixelPressable>)}</View>
      {loading ? <Text accessibilityLiveRegion="polite" variant="caption" style={styles.readStatus}>{t("phone.loading")}</Text> : null}
      {failed || partial ? <View style={styles.errorRow}><Text variant="caption" style={styles.flexText}>{t("phone.partialError")}</Text><PhoneAction label={t("phone.retry")} glyph="refresh" onPress={() => setRefresh((value) => value + 1)} /></View> : null}
      <FlatList
        key={tab}
        data={tab === "sources" ? DASHBOARD_SOURCES.map((_, index) => index) : [0]}
        keyExtractor={(item) => `${tab}-${item}`}
        renderItem={({ item }) => tab === "sources" ? sourceRow(item) : tab === "today" ? today() : tools()}
        ListHeaderComponent={tab === "sources" ? <View style={styles.stack}><Text variant="heading">{t("phone.sourcesTitle")}</Text><Text variant="caption" style={styles.muted}>{t("phone.sourceScope")}</Text><PhoneAction label={t("phone.importHistory")} glyph="lock" onPress={() => go("/import-hub")} /></View> : null}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={SourceGap}
        ListFooterComponent={<View style={styles.footer}><Text variant="caption" style={styles.muted}>{data ? t("phone.lastRead", { date: date(data.readAt, true) }) : t("phone.noData")}</Text><PhoneAction label={t("phone.refresh")} glyph="refresh" disabled={loading} onPress={() => setRefresh((value) => value + 1)} /></View>}
      />
    </View>
  </DeepSpaceScreen>;
}

function SourceGap() { return <View style={styles.gap} />; }

const styles = StyleSheet.create({
  phone: { flex: 1, width: "100%", maxWidth: 460, alignSelf: "center", borderWidth: 4, borderTopColor: m3.color.surfaceBright, borderLeftColor: m3.color.surfaceBright, borderRightColor: m3.color.surface, borderBottomColor: m3.color.surface, backgroundColor: m3.color.surface },
  speaker: { width: 48, height: 4, marginTop: 8, marginBottom: 8, alignSelf: "center", backgroundColor: m3.color.surfaceBright },
  statusBar: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  tabs: { flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  tab: { flex: 1, minWidth: 0 },
  tabContent: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  content: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 24, gap: 12 },
  stack: { gap: 12 },
  hero: { padding: 16, gap: 12 },
  headline: { lineHeight: 32, paddingBottom: 4 },
  accent: { color: m3.color.primary },
  muted: { color: m3.color.onSurfaceVariant, lineHeight: 20, paddingBottom: 2 },
  routine: { padding: 12, gap: 8 },
  sectionHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  actionText: { flexShrink: 1, lineHeight: 20, paddingBottom: 2 },
  evidence: { padding: 14, gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  area: { width: "30%", flexGrow: 1, minWidth: 80 },
  areaContent: { minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6 },
  tool: { width: "46%", flexGrow: 1, minWidth: 110 },
  toolContent: { minHeight: 88, justifyContent: "center", alignItems: "center", gap: 8 },
  centered: { textAlign: "center", lineHeight: 20, paddingBottom: 2 },
  source: { padding: 12, gap: 8 },
  sourceTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  flexText: { flex: 1, flexShrink: 1 },
  readStatus: { paddingHorizontal: 12, paddingVertical: 8, color: m3.color.onSurfaceVariant },
  errorRow: { flexDirection: "row", gap: 8, padding: 12, alignItems: "center" },
  footer: { paddingTop: 20, gap: 12 },
  gap: { height: 10 },
});
