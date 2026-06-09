// Records browser (queue B / A-to-Z Phase 6) — user-facing "기록".
// Lists every piece the user has saved (journal / capture / audit / imagine
// / wiki), with a type filter and a local search. Each row opens the record
// detail (/record/[id]). Reuses the pure evidence mapping so the type label,
// date, and source route are a single source of truth.
//
// Renders meaningful loading / empty / error states so the route is never
// blank, and can be reached directly via URL.

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { PremiumAppShell, ReferenceShardCard, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  mergeEvidence,
  evidenceTypeLabel,
  type EvidenceType,
  type OriginShard,
  type RawRecordRow,
  type RawSourceRow,
} from "@/lib/persona/evidence";
import { VILLAGE_IDS, VILLAGE_LABEL, type VillageId } from "@/lib/graph/relatedness";
import { VILLAGE_UI } from "@/lib/village-ui";

const TYPE_FILTERS: (EvidenceType | "all")[] = ["all", "journal", "capture", "audit", "interview", "imagine", "wiki"];
// Warm-gold for records by default; a few types carry their companion accent.
const TYPE_ACCENT: Record<EvidenceType, string> = {
  journal: cosmic.pixelLamp,
  capture: cosmic.signalMint,
  wiki: cosmic.signalBlue,
  interview: cosmic.soulViolet,
  audit: cosmic.soulViolet,
  imagine: cosmic.dreamPink,
};

// Memoized row so FlatList recycling does not re-render every visible card on
// each keystroke / filter change. Renders ONLY the card (no per-item wrapper
// View) — inter-card spacing is owned by the list separator, not the row.
const ShardRow = memo(function ShardRow({ shard: s, locale }: { shard: OriginShard; locale: "en" | "ko" }) {
  return (
    <ReferenceShardCard
      title={s.title}
      meta={[s.dateLabel, evidenceTypeLabel(s.type, locale)].filter(Boolean).join(" · ")}
      accent={TYPE_ACCENT[s.type]}
      onPress={() =>
        // Both record- and source-origin shards open the unified detail screen;
        // it reads the right table from the `origin` param (sources live in the
        // wiki ingest store). This opens the SPECIFIC piece instead of dumping
        // the user on the generic capture/wiki screen.
        router.push({ pathname: "/record/[id]", params: { id: s.id, origin: s.origin } })
      }
    />
  );
});

export default function Records() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  // Domain (village) filter — entering from a village node carries
  // ?domain=<villageId>, so Records opens already filtered to that village's
  // pieces (menu restructure Phase 4). The chip row can change it afterward.
  const params = useLocalSearchParams<{ domain?: string }>();
  const paramDomain: VillageId | "all" =
    VILLAGE_IDS.includes(params.domain as VillageId) ? (params.domain as VillageId) : "all";

  const [shards, setShards] = useState<OriginShard[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvidenceType | "all">("all");
  const [domainFilter, setDomainFilter] = useState<VillageId | "all">(paramDomain);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setBusy(true);
    setError(false);
    (async () => {
      try {
        const supabase = getSupabaseClient();
        // Records browser unifies two stores: `records` (journal / audit /
        // interview) and `sources` (capture / imagine — the wiki ingest
        // path). Read both, then mergeEvidence sorts by recency so a just-
        // captured piece shows up here, not just in the wiki.
        const [recRes, srcRes] = await Promise.all([
          supabase
            .from("records")
            .select("id, kind, topic, created_at, tags")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("sources")
            .select("id, kind, title, captured_at, tags")
            .eq("user_id", userId)
            .order("captured_at", { ascending: false })
            .limit(200),
        ]);
        if (recRes.error) throw recRes.error;
        if (srcRes.error) throw srcRes.error;
        const recRows = (recRes.data ?? []) as RawRecordRow[];
        const srcRows = (srcRes.data ?? []) as RawSourceRow[];
        if (!cancelled) setShards(mergeEvidence(recRows, srcRows, locale));
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[records] load failed", (e as Error).message);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, locale, reloadKey]);

  // Re-sync the filter when the URL domain changes (tapping a different village
  // re-enters /records with a new ?domain). A manual chip pick sticks until then.
  useEffect(() => {
    setDomainFilter(paramDomain);
  }, [paramDomain]);

  const swipeVillage = useCallback(
    (step: 1 | -1) => {
      const currentVillage = domainFilter === "all" ? "records" : domainFilter;
      const currentIndex = VILLAGE_IDS.indexOf(currentVillage);
      const nextIndex = (currentIndex + step + VILLAGE_IDS.length) % VILLAGE_IDS.length;
      const nextVillage = VILLAGE_IDS[nextIndex];
      if (nextVillage === "knowledge") {
        router.replace("/wiki");
        return;
      }
      setDomainFilter(nextVillage);
      router.setParams({ domain: nextVillage });
    },
    [domainFilter],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shards.filter((s) => {
      if (domainFilter !== "all" && s.domain !== domainFilter) return false;
      if (typeFilter !== "all" && s.type !== typeFilter) return false;
      if (q.length > 0 && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [shards, query, typeFilter, domainFilter]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const reload = () => setReloadKey((k) => k + 1);
  const activeVillage: VillageId = domainFilter === "all" ? "records" : domainFilter;
  const villageUi = VILLAGE_UI[activeVillage];
  const villageLabel = VILLAGE_LABEL[activeVillage][locale];
  const heroEyebrow =
    domainFilter === "all"
      ? (locale === "ko" ? "05. 기록 보관소" : "05. Records")
      : (locale === "ko" ? `${villageLabel} · 기록` : `${villageLabel} · records`);
  const heroTitle =
    domainFilter === "all"
      ? (locale === "ko" ? "남긴 조각을 다시 만나요" : "Revisit every piece you left")
      : (locale === "ko" ? "이 영역의 조각" : "Pieces in this area");
  const heroSubtitle =
    domainFilter === "all"
      ? (locale === "ko" ? "일기 · 담기 · 검사 · 영감까지 한곳에" : "Journal, capture, assessments, and inspiration in one place")
      : (locale === "ko" ? "이 영역에 모인 기록만 골라 봅니다" : "Only the records gathered in this area");

  // Header (hero + search + type chips) lives above the virtualized list, so it
  // scrolls with the rows instead of pinning. The map of type chips stays a
  // horizontal ScrollView — only the long vertical records list is virtualized.
  const listHeader = (
    <View style={styles.headerInner}>
      <SceneHero
        eyebrow={heroEyebrow}
        title={heroTitle}
        subtitle={heroSubtitle}
        island={villageUi.island}
        worker={villageUi.worker}
        accent={villageUi.accent}
        speech={villageUi.speech[locale]}
        onSwipeLeft={() => swipeVillage(1)}
        onSwipeRight={() => swipeVillage(-1)}
      />

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={locale === "ko" ? "조각 검색" : "Search pieces"}
        accessibilityLabel={locale === "ko" ? "기록 검색" : "Search records"}
      />

      <Text variant="caption" color="textSubtle" style={styles.filterLabel}>
        {locale === "ko" ? "종류" : "Type"}
      </Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.chipStrip}
        contentContainerStyle={styles.chipRow}
      >
        {TYPE_FILTERS.map((tf) => {
          const active = tf === typeFilter;
          const label = tf === "all" ? (locale === "ko" ? "전체" : "All") : evidenceTypeLabel(tf, locale);
          return (
            <Pressable
              key={tf}
              onPress={() => setTypeFilter(tf)}
              style={[styles.chip, active ? styles.chipActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={locale === "ko" ? `${label} 기록 필터` : `Filter records by ${label}`}
            >
              <Text variant="caption" color={active ? "background" : "textMuted"}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  // Busy / error / empty share the one ListEmptyComponent slot: when busy or
  // error we feed FlatList an empty data array, so this is what renders. The
  // empty copy itself still distinguishes "no pieces at all" from "filter has
  // no match" via shards.length.
  const listEmpty = busy ? (
    <View style={styles.center}>
      <ActivityIndicator color={semantic.brand} />
    </View>
  ) : error ? (
    <View style={styles.stateBox}>
      <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
        {locale === "ko" ? "조각을 불러오지 못했어요." : "Couldn't load your pieces."}
      </Text>
      <Button
        label={locale === "ko" ? "다시 시도" : "Try again"}
        variant="secondary"
        onPress={reload}
        accessibilityHint={
          locale === "ko" ? "기록과 소스 목록을 다시 불러옵니다." : "Retries loading records and sources."
        }
      />
    </View>
  ) : (
    <View style={styles.stateBox}>
      <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
        {shards.length === 0
          ? locale === "ko"
            ? "아직 남긴 조각이 없어요. 오늘의 조각을 하나 남겨볼까요?"
            : "No pieces yet. Want to leave today's piece?"
          : locale === "ko"
            ? "조건에 맞는 조각이 없어요."
            : "No pieces match that filter."}
      </Text>
      {shards.length === 0 ? (
        <Button
          label={locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece"}
          variant="primary"
          onPress={() => router.push("/capture")}
          accessibilityHint={
            locale === "ko" ? "캡처 화면을 열어 오늘의 조각을 저장합니다." : "Opens capture to save today's piece."
          }
        />
      ) : null}
    </View>
  );

  return (
    <PremiumAppShell>
      <FlatList
        data={busy || error ? [] : filtered}
        keyExtractor={(s) => `${s.origin}:${s.id}`}
        renderItem={({ item }) => <ShardRow shard={item} locale={locale} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ItemSeparatorComponent={ListSeparator}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
      />
    </PremiumAppShell>
  );
}

// Inter-card spacing now lives in the separator (previously styles.list gap),
// so no per-item wrapper is needed and the gap stays consistent.
function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: 110 },
  // Reproduces the old ScrollView's inter-element spacing (gap: lg) for the
  // header block (hero / search / type label / chip strip) now that those live
  // inside ListHeaderComponent instead of being direct ScrollView children.
  headerInner: { gap: spacing.lg },
  center: { paddingVertical: spacing.xxl, alignItems: "center", justifyContent: "center" },
  stateBox: { paddingVertical: spacing.xl, gap: spacing.md, alignItems: "center" },
  chipStrip: { flexGrow: 0, marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingEnd: spacing.lg },
  // Pull each chip row up under its small section label (scroll gap is lg).
  filterLabel: { marginBottom: -spacing.sm, letterSpacing: 0 },
  chip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  // Was styles.list `gap: spacing.xs` between cards; the FlatList separator now
  // reproduces that exact inter-card gap so spacing is unchanged.
  separator: { height: spacing.xs },
});
