// 도메인 별 렌즈 (rev2 11-star): tapping a life-domain star on the home
// constellation opens THIS screen — a per-domain lens, not the flat wiki list.
// Mirrors the reference 11-star: domain header, a 세컨비 briefing, the
// 담기 / 기록 보기 action pair, and the domain's own record timeline.
//
// HONESTY: the reference briefing shows a fabricated analysis ("최근 3주의 64%가
// 일이었어요"). We never invent that — the briefing derives from the real record
// count, or a neutral prompt when the star is empty (same real-or-neutral
// discipline as the values/data/career screens). Career keeps its richer
// 쌓아온 길 credential timeline at /career, reachable via the drill-down.
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

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

interface DomainRecordRow {
  id: string;
  topic: string | null;
  body: string | null;
  created_at: string;
}

// The life-domain ↔ Big Five trait association from the design canon
// (public/proto/data/screens/domain-meta.json `related`). A general design
// statement about each domain, NOT the user's measured data — shown as a small
// header caption to match the reference 11-star ("성실성 · 외향성"). collect has
// none.
const DOMAIN_TRAIT: Partial<Record<DomainId, string>> = {
  career: "성실성 · 외향성",
  finance: "신경성",
  growth: "개방성",
  relation: "우호성 · 애착",
  health: "신경성",
  recreation: "개방성",
};

// Per-domain secondary action (the reference 11-star's Drill Down), sourced from
// the design canon domain-meta.json `next`. Each star gets a distinct drill:
// growth → 회상, relation → 관계 인터뷰, recreation → 세컨비, career → 쌓아온 길.
// Domains whose canon action is just "담기" (finance/health) or the catch-all
// (collect) fall back to their filtered record list.
const DOMAIN_DRILL: Partial<Record<DomainId, { labelKey: string; route: string }>> = {
  career: { labelKey: "star.drillCareer", route: "/career" },
  growth: { labelKey: "star.drillGrowth", route: "/audit" },
  relation: { labelKey: "star.drillRelation", route: "/interview" },
  recreation: { labelKey: "star.drillRecreation", route: "/secondb" },
};

async function listDomainRecords(userId: string, domain: DomainId): Promise<DomainRecordRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("records")
    .select("id, topic, body, created_at")
    .eq("user_id", userId)
    .contains("tags", [domainTagFor(domain)])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as DomainRecordRow[];
}

function relativeDay(iso: string, t: TFunction<"deepspace">): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return t("star.relToday");
  if (days === 1) return t("star.relYesterday");
  if (days < 7) return t("star.relDays", { n: days });
  if (days < 30) return t("star.relWeeks", { n: Math.floor(days / 7) });
  return t("star.relMonths", { n: Math.floor(days / 30) });
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

  const [rows, setRows] = useState<DomainRecordRow[] | null>(null);
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
    <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={name} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.headRow}>
          <RNText style={[m3TextStyle("headlineSmall"), s.headline]}>{name}</RNText>
          {level != null ? (
            <View style={s.levelWrap}>
              <View style={s.dots}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <View key={n} style={[s.dot, n <= level ? s.dotOn : s.dotOff]} />
                ))}
              </View>
              <RNText style={[m3TextStyle("labelMedium"), s.levelText]}>{`L${level}`}</RNText>
            </View>
          ) : null}
        </View>
        {ko && DOMAIN_TRAIT[domainId] ? (
          <RNText style={[m3TextStyle("bodySmall"), s.traitCaption]}>{`숨은 결 · ${DOMAIN_TRAIT[domainId]}`}</RNText>
        ) : null}

        {/* 세컨비 briefing (honest) */}
        <MdCard variant="outlined" style={s.briefCard}>
          <SecondbHead size={30} track={false} />
          <RNText style={[m3TextStyle("bodyMedium"), s.briefText]}>{briefing}</RNText>
        </MdCard>

        {/* action pair — mirrors 11-star 성과 입력 / Drill Down */}
        <View style={s.actions}>
          <MdButton
            variant="tonal"
            label={t("star.capture")}
            // med#1 (map knownBug): capturing FROM a star must carry that
            // star's domain tag — a bare /capture push let auto-classification
            // file the piece under a different star than the one the user was
            // standing on.
            onPress={() => router.push({ pathname: "/capture-full", params: { tag: `domain:${domainId}` } })}
            style={s.actionBtn}
          />
          <MdButton
            variant="outlined"
            label={DOMAIN_DRILL[domainId] ? t(DOMAIN_DRILL[domainId]!.labelKey) : t("star.seeRecords")}
            onPress={() =>
              DOMAIN_DRILL[domainId]
                ? router.push(DOMAIN_DRILL[domainId]!.route as never)
                : router.push({ pathname: "/records", params: { tags: `domain:${domainId}` } })
            }
            style={s.actionBtn}
          />
        </View>

        {/* domain record timeline */}
        {rows === null ? (
          <PremiumLoadingState message={t("star.loading")} />
        ) : failed ? (
          <MdCard variant="outlined" style={s.stateCard}>
            <RNText style={[m3TextStyle("bodyMedium"), s.stateText]}>
              {t("star.loadError")}
            </RNText>
            <MdButton variant="text" label={t("star.retry")} onPress={refresh} />
          </MdCard>
        ) : count === 0 ? (
          <MdCard variant="outlined" style={s.stateCard}>
            <RNText style={[m3TextStyle("bodyMedium"), s.stateText]}>
              {t("star.empty")}
            </RNText>
          </MdCard>
        ) : (
          <View style={s.timeline}>
            {rows.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })}
                accessibilityRole="button"
                accessibilityLabel={r.topic ?? t("star.recordFallback")}
              >
                <MdCard variant="outlined" style={s.entry}>
                  <View style={s.entryDot} />
                  <View style={s.entryBody}>
                    <View style={s.entryHead}>
                      <RNText style={[m3TextStyle("bodyMedium"), s.entryTitle]} numberOfLines={1}>
                        {r.topic ?? r.body?.split("\n")[0] ?? t("star.untitled")}
                      </RNText>
                      <RNText style={[m3TextStyle("labelSmall"), s.entryTime]}>{relativeDay(r.created_at, t)}</RNText>
                    </View>
                    {r.body ? (
                      <RNText style={[m3TextStyle("bodySmall"), s.entrySub]} numberOfLines={2}>
                        {r.body}
                      </RNText>
                    ) : null}
                  </View>
                </MdCard>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  headline: { color: m3.color.onSurface, fontFamily: m3.font.brand, flexShrink: 1 },
  levelWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: m3.color.primary },
  dotOff: { backgroundColor: withAlpha(m3.color.onSurface, 0.18) },
  levelText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.mono, fontWeight: "700" },
  traitCaption: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: -4, marginBottom: 2 },
  briefCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 16 },
  briefText: { flex: 1, color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: { flex: 1 },
  stateCard: { marginTop: 18, padding: 16, gap: 8, alignItems: "center" },
  stateText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center" },
  timeline: { marginTop: 18, gap: 8 },
  entry: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 13 },
  entryDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: withAlpha(m3.color.primary, 0.9) },
  entryBody: { flex: 1, gap: 3 },
  entryHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  entryTitle: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "600" },
  entryTime: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.mono },
  entrySub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
});
