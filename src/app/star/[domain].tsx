// 도메인 별 렌즈 (rev2 11-star): tapping a life-domain star on the home
// constellation opens THIS screen — a per-domain lens, not the flat wiki list.
// Mirrors the reference 11-star: domain header, a 세컨비 briefing, the
// paired actions, and a distinct visual lens for every life domain.
//
// HONESTY: the reference briefing shows a fabricated analysis ("최근 3주의 64%가
// 일이었어요"). We never invent that — the briefing derives from the real record
// count, or a neutral prompt when the star is empty (same real-or-neutral
// discipline as the values/data/career screens). Structured sources such as
// the ledger, people map, recreation items and health samples stay real too.
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import {
  DomainStarLens,
  type DomainLensRecord,
} from "@/components/deep-space/DomainStarLens";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DOMAIN_STARS, getDomainStar, isDomainId, domainTagFor, type DomainId } from "@/lib/persona/domain-stars";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import type { LadderLevel } from "@/lib/persona/brightness";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";

// Layer B remains hidden: this slot mirrors the prototype's compact top-bar
// caption with the domain's own visual lens, not a psychological construct.
const DOMAIN_HEADER_META: Record<DomainId, { ko: string; en: string }> = {
  career: { ko: "쌓아온 길", en: "Built path" },
  finance: { ko: "이번 달 흐름", en: "Monthly flow" },
  growth: { ko: "기록의 시간대", en: "Record chapters" },
  relation: { ko: "나의 사람들", en: "My people" },
  health: { ko: "건강 기록", en: "Health records" },
  recreation: { ko: "휴식 지도", en: "Rest map" },
  collect: { ko: "정리 대기", en: "To organize" },
};

const DOMAIN_ACTION: Record<
  DomainId,
  { primaryKo: string; primaryEn: string; secondaryKo: string; secondaryEn: string; route: string }
> = {
  career: {
    primaryKo: "성과 입력",
    primaryEn: "Add achievement",
    secondaryKo: "Drill Down",
    secondaryEn: "Drill Down",
    route: "/career-drilldown",
  },
  finance: {
    primaryKo: "내역 입력",
    primaryEn: "Add entry",
    secondaryKo: "가계 보기",
    secondaryEn: "Open ledger",
    route: "/ledger",
  },
  growth: {
    primaryKo: "장면 담기",
    primaryEn: "Add a moment",
    secondaryKo: "회상하기",
    secondaryEn: "Reflect",
    route: "/audit",
  },
  relation: {
    primaryKo: "사람 담기",
    primaryEn: "Add a person",
    secondaryKo: "사람 지도",
    secondaryEn: "People map",
    route: "/people",
  },
  health: {
    primaryKo: "기록 담기",
    primaryEn: "Add a record",
    secondaryKo: "데이터 연결",
    secondaryEn: "Connect data",
    // "/import" hosts the actual device-health connect path (Health Connect /
    // HealthKit ingest into health_samples — the table this star's
    // crossSourceAgreement reads). "/import-hub"'s health FILE import lands in
    // `sources` and can never feed health_samples, so the star's own CTA was
    // pointing at the one import surface that could not light it (P0②).
    route: "/import",
  },
  recreation: {
    primaryKo: "휴식 담기",
    primaryEn: "Add rest",
    secondaryKo: "휴식 지도",
    secondaryEn: "Rest map",
    route: "/rest",
  },
  collect: {
    primaryKo: "담기",
    primaryEn: "Capture",
    secondaryKo: "기록 보기",
    secondaryEn: "See records",
    route: "/records",
  },
};

async function listDomainRecords(userId: string, domain: DomainId): Promise<DomainLensRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from("records")
    .select("id, topic, body, created_at")
    .eq("user_id", userId)
    .contains("tags", [domainTagFor(domain)])
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as DomainLensRecord[];
}

function StarHeaderAction({
  caption,
  level,
}: {
  caption: string;
  level: LadderLevel | null;
}) {
  const displayLevel = level ?? 1;
  return (
    <View style={s.headerAction}>
      <RNText style={[m3TextStyle("bodySmall"), s.headerCaption]} numberOfLines={1}>
        {caption}
      </RNText>
      <View style={s.headerGauge}>
        {[1, 2, 3, 4, 5].map((value) => (
          <View
            key={value}
            style={[s.headerSegment, value <= displayLevel ? s.headerSegmentOn : s.headerSegmentOff]}
          />
        ))}
      </View>
      <RNText style={[m3TextStyle("labelMedium"), s.levelText]}>{`L${displayLevel}`}</RNText>
    </View>
  );
}

// The seven domain stars are a fixed set, so pre-render one static page per
// domain in the web export. Without this, /star/<domain> has no static HTML on
// GitHub Pages and a direct hit falls back to 404.html; pre-rendering makes each
// lens resolve on a direct URL and keeps the route in the client route tree.
export async function generateStaticParams(): Promise<{ domain: string }[]> {
  return DOMAIN_STARS.map((d) => ({ domain: d.slug }));
}

export default function DomainStarScreen() {
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId, loading } = useAuth();

  const [rows, setRows] = useState<DomainLensRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [level, setLevel] = useState<LadderLevel | null>(null);

  const valid = typeof domain === "string" && isDomainId(domain);
  const domainId = valid ? (domain as DomainId) : null;

  const refresh = useCallback(() => {
    if (!userId || !domainId) return;
    listDomainRecords(userId, domainId)
      .then((r) => {
        setRows(r);
        setFailed(false);
      })
      .catch((e) => {
        console.warn("[star] list failed", (e as Error).message);
        setRows([]);
        setFailed(true);
      });
    // Real record-based domain level (L1–L5) — no LLM, no fabrication.
    loadDomainLevels(userId)
      .then((b) => setLevel(b.domainLevels[domainId] ?? null))
      .catch(() => setLevel(null));
  }, [userId, domainId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  if (!domainId) return <Redirect href="/" />;

  const name = ko ? getDomainStar(domainId).nameKo : getDomainStar(domainId).nameEn;
  const headerMeta = DOMAIN_HEADER_META[domainId][ko ? "ko" : "en"];
  const action = DOMAIN_ACTION[domainId];
  const count = rows?.length ?? 0;

  // Honest briefing: real count or a neutral empty prompt — never a fabricated
  // "N% was work" analysis.
  const briefing =
    rows === null
      ? t("star.briefingOpening")
      : count === 0
        ? t("star.briefingEmpty")
        : count === 1
          ? t("star.briefingCountOne", { n: count })
          : t("star.briefingCount", { n: count });

  return (
    <DeepSpaceScreen
      active="home"
      header="none"
      variant="museumLike"
      title={name}
      onBack={() => router.back()}
      action={<StarHeaderAction caption={headerMeta} level={level} />}
    >
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* 세컨비 briefing (honest) */}
        <MdCard variant="outlined" style={s.briefCard}>
          <SecondbHead size={30} track={false} />
          <RNText style={[m3TextStyle("bodyMedium"), s.briefText]}>{briefing}</RNText>
        </MdCard>

        {/* action pair — mirrors 11-star 성과 입력 / Drill Down */}
        <View style={s.actions}>
          <MdButton
            variant="tonal"
            label={ko ? action.primaryKo : action.primaryEn}
            // med#1 (map knownBug): capturing FROM a star must carry that
            // star's domain tag — a bare /capture push let auto-classification
            // file the piece under a different star than the one the user was
            // standing on.
            onPress={() => router.push({ pathname: "/capture-full", params: { tag: `domain:${domainId}` } })}
            style={s.actionBtn}
          />
          <MdButton
            variant="outlined"
            label={ko ? action.secondaryKo : action.secondaryEn}
            onPress={() => router.push(action.route as never)}
            style={s.actionBtn}
          />
        </View>

        {/* Distinct domain lens — real structured data or an honest empty state. */}
        {rows === null ? (
          <PremiumLoadingState message={t("star.loading")} />
        ) : failed ? (
          <MdCard variant="outlined" style={s.stateCard}>
            <RNText style={[m3TextStyle("bodyMedium"), s.stateText]}>
              {t("star.loadError")}
            </RNText>
            <MdButton variant="text" label={t("star.retry")} onPress={refresh} />
          </MdCard>
        ) : (
          <DomainStarLens
            domain={domainId}
            userId={userId}
            records={rows}
            level={level}
            ko={ko}
          />
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  headerAction: { flexDirection: "row", alignItems: "center", gap: 7, maxWidth: 184 },
  headerCaption: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, maxWidth: 76 },
  headerGauge: { flexDirection: "row", gap: 4 },
  headerSegment: { width: 12, height: 5, borderRadius: 3 },
  headerSegmentOn: { backgroundColor: m3.color.primary },
  headerSegmentOff: { backgroundColor: withAlpha(m3.color.primary, 0.2) },
  levelText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.mono, fontWeight: "700" },
  briefCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: withAlpha(m3.color.primaryContainer, 0.34),
  },
  briefText: { flex: 1, color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: { flex: 1 },
  stateCard: { marginTop: 18, padding: 16, gap: 8, alignItems: "center" },
  stateText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center" },
});
