// /trends - 밝기 변화 (B5 · 별 밝기 변화 추이). A 1:1 clone of the reference
// GrowthTrendScreen (reference-app/sb-surfaces.jsx): overall brightness over the
// last 8 weeks, per-star L-level change, and a brightness log. Deterministic,
// read-only, no LLM. m3.* tokens only (migrated screen); the amber flat bar uses
// m3.accent.trendFlat. Windowed shell + TopAppBar per sb-app §4.

import { Redirect, router } from "expo-router";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, ProgressLinear } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";

// Overall brightness over 8 weeks (0..100), transcribed 1:1 from the reference.
const SERIES = [28, 31, 30, 38, 44, 47, 55, 62];
const W = 300;
const H = 120;
const PAD = 6;
const MAX = 70;
const MIN = 20;

function chartPaths() {
  const pts = SERIES.map((v, i) => {
    const x = PAD + (i / (SERIES.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - MIN) / (MAX - MIN)) * (H - PAD * 2);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const first = pts[0];
  const area = `${line} L${last[0].toFixed(1)} ${H} L${first[0].toFixed(1)} ${H} Z`;
  return { line, area, last };
}

export function TrendsScreen() {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId, loading } = useAuth();

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const { line, area, last } = chartPaths();

  // [label, was, now]. Amber when the star did NOT rise (건강 2→2).
  const stars: { ko: string; en: string; was: number; now: number }[] = [
    { ko: "커리어", en: "Career", was: 3, now: 4 },
    { ko: "관계", en: "Relationships", was: 2, now: 4 },
    { ko: "성장", en: "Growth", was: 2, now: 3 },
    { ko: "건강", en: "Health", was: 2, now: 2 },
    { ko: "재정", en: "Finance", was: 1, now: 2 },
  ];

  const events: { ko: string; en: string; from: string; to: string; whyKo: string; whyEn: string; wKo: string; wEn: string; up: boolean }[] = [
    { ko: "관계", en: "Relationships", from: "L2", to: "L3", whyKo: "통화 녹음 3건 반영", whyEn: "3 call recordings reflected", wKo: "이번 주", wEn: "This week", up: true },
    { ko: "커리어", en: "Career", from: "L2", to: "L3", whyKo: "인터뷰로 몰입 패턴 확인", whyEn: "Focus pattern confirmed via interview", wKo: "2주 전", wEn: "2 wks ago", up: true },
    { ko: "건강", en: "Health", from: "L2", to: "L1", whyKo: "기록 공백 · 밝기 감소", whyEn: "Record gap · brightness dipped", wKo: "4주 전", wEn: "4 wks ago", up: false },
    { ko: "성장", en: "Growth", from: "L1", to: "L2", whyKo: "회상 인터뷰 시작", whyEn: "Started recall interviews", wKo: "6주 전", wEn: "6 wks ago", up: true },
  ];

  const xLabels = ko ? ["8주", "", "", "4주", "", "", "", "지금"] : ["8w", "", "", "4w", "", "", "", "now"];

  return (
    <DeepSpaceScreen
      active="home"
      variant="windowed"
      header="none"
      title={ko ? "밝기 변화" : "Brightness trend"}
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <RNText style={s.headline}>{ko ? "밝기 변화" : "Brightness trend"}</RNText>
        <RNText style={s.subtitle}>
          {ko ? "지난 8주, 당신의 별자리는 꾸준히 또렷해지고 있어요." : "Over the last 8 weeks your constellation has been getting steadily clearer."}
        </RNText>

        {/* overall brightness chart */}
        <MdCard variant="elevated" style={s.chartCard}>
          <View style={s.chartHead}>
            <RNText style={s.chartLabel}>{ko ? "전체 밝기" : "Overall brightness"}</RNText>
            <View style={s.deltaRow}>
              <Svg width={15} height={11} viewBox="0 0 15 11">
                <Path d="M1 9 L6 4 L9 7 L14 2" stroke={m3.color.primary} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M14 2 L14 5 M14 2 L11 2" stroke={m3.color.primary} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <RNText style={s.delta}>{ko ? "+34% · 8주" : "+34% · 8 wks"}</RNText>
            </View>
          </View>
          <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={124} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="sbTrend" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={m3.color.primary} stopOpacity={0.32} />
                <Stop offset="100%" stopColor={m3.color.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#sbTrend)" />
            <Path d={line} fill="none" stroke={m3.color.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={last[0]} cy={last[1]} r={4.5} fill={m3.color.primary} stroke={m3.color.surface} strokeWidth={2} />
          </Svg>
          <View style={s.axisRow}>
            {xLabels.map((l, i) => (
              <RNText key={i} style={s.axisLabel}>{l}</RNText>
            ))}
          </View>
        </MdCard>

        {/* per-star change */}
        <RNText style={s.section}>{ko ? "별마다 변화" : "Per-star change"}</RNText>
        <MdCard variant="filled" style={s.starCard}>
          {stars.map((st) => (
            <View key={st.ko} style={s.starRow}>
              <RNText style={s.starName}>{ko ? st.ko : st.en}</RNText>
              <View style={s.starBar}>
                <ProgressLinear value={st.now / 5} color={st.now > st.was ? m3.color.primary : m3.accent.trendFlat} />
              </View>
              <RNText style={s.starLevel}>L{st.was}→L{st.now}</RNText>
            </View>
          ))}
        </MdCard>

        {/* brightness log */}
        <RNText style={s.section}>{ko ? "밝기 이력" : "Brightness log"}</RNText>
        <View style={s.timeline}>
          <View style={s.timelineLine} />
          {events.map((e, i) => (
            <View key={i} style={[s.event, i < events.length - 1 && s.eventGap]}>
              <View style={[s.eventDot, { backgroundColor: e.up ? m3.color.primary : m3.accent.trendFlat }]} />
              <View style={s.eventHead}>
                <RNText style={s.eventStar}>{ko ? e.ko : e.en}</RNText>
                <RNText style={[s.eventJump, { color: e.up ? m3.color.primary : m3.accent.trendFlat }]}>{e.from}→{e.to}</RNText>
                <View style={s.eventSpacer} />
                <RNText style={s.eventWeek}>{ko ? e.wKo : e.wEn}</RNText>
              </View>
              <RNText style={s.eventWhy}>{ko ? e.whyKo : e.whyEn}</RNText>
            </View>
          ))}
        </View>

        <MdButton
          variant="tonal"
          label={ko ? "이 변화를 카드로 공유" : "Share this change as a card"}
          onPress={() => router.push("/share-card")}
          style={s.share}
        />
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  scroll: { padding: m3.spacing.s4, paddingBottom: 40, gap: m3.spacing.s2 },
  headline: { color: m3.color.onSurface, fontSize: 24, fontWeight: "500", marginTop: 8 },
  subtitle: { color: m3.color.onSurfaceVariant, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  chartCard: { padding: 16, gap: 4 },
  chartHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  chartLabel: { color: m3.color.onSurface, fontSize: 14, fontWeight: "500" },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  delta: { color: m3.color.primary, fontSize: 13, fontWeight: "700" },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisLabel: { color: m3.color.onSurfaceVariant, fontSize: 10 },
  section: { color: m3.color.onSurface, fontSize: 13, fontWeight: "500", marginTop: 14, marginBottom: 2 },
  starCard: { padding: 14, gap: 12 },
  starRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  starName: { color: m3.color.onSurface, fontSize: 14, width: 52 },
  starBar: { flex: 1 },
  starLevel: { fontFamily: m3.font.mono, fontSize: 12, color: m3.color.onSurfaceVariant, width: 56, textAlign: "right" },
  timeline: { position: "relative", paddingLeft: 22, marginTop: 4 },
  timelineLine: { position: "absolute", left: 5, top: 6, bottom: 6, width: 2, backgroundColor: m3.color.outlineVariant },
  event: { position: "relative" },
  eventGap: { paddingBottom: 16 },
  eventDot: { position: "absolute", left: -22, top: 3, width: 12, height: 12, borderRadius: 6 },
  eventHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventStar: { color: m3.color.onSurface, fontSize: 14, fontWeight: "500" },
  eventJump: { fontFamily: m3.font.mono, fontSize: 12 },
  eventSpacer: { flex: 1 },
  eventWeek: { color: m3.color.onSurfaceVariant, fontSize: 11 },
  eventWhy: { color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 17, marginTop: 2 },
  share: { marginTop: 16 },
});
