// Records browser (queue B / A-to-Z Phase 6) — user-facing "기록".
// Lists every piece the user has saved (journal / capture / audit / imagine
// / wiki), with a type filter and a local search. Each row opens the record
// detail (/record/[id]). Reuses the pure evidence mapping so the type label,
// date, and source route are a single source of truth.
//
// Renders meaningful loading / empty / error states so the route is never
// blank, and can be reached directly via URL.

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { PremiumAppShell, ReferenceShardCard, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AdSlot } from "@/components/ads/AdSlot";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
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
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceRecordsScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

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
      // A topic-less piece falls back to the type label as its title; repeating
      // the same label in the meta line read as "오늘의 별가루 · 오늘의 별가루" on
      // the very row the first-save CTA lands on.
      meta={[s.dateLabel, evidenceTypeLabel(s.type, locale)]
        .filter((part) => part && part !== s.title)
        .join(" · ")}
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

function RecordsLegacy() {
  const { t, i18n } = useTranslation("records");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  // Domain (village) filter — entering from a village node carries
  // ?domain=<villageId>, so Records opens already filtered to that village's
  // pieces (menu restructure Phase 4). The chip row can change it afterward.
  //
  // Tags filter — entering from a /trinity life-area card carries
  // ?tags=<comma,separated>, a DIFFERENT taxonomy (health/app/brain/finance
  // tags, not village ids). Records then shows only pieces whose tags intersect
  // that set (case-insensitive). Coexists with ?domain= — both apply if present.
  const params = useLocalSearchParams<{ domain?: string; tags?: string }>();
  const paramDomain: VillageId | "all" =
    VILLAGE_IDS.includes(params.domain as VillageId) ? (params.domain as VillageId) : "all";
  const tagFilter = useMemo(() => {
    const raw = typeof params.tags === "string" ? params.tags : "";
    return raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  }, [params.tags]);

  const [shards, setShards] = useState<OriginShard[]>([]);
  // Raw tags per piece, keyed `${origin}:${id}`. OriginShard only retains the
  // derived village `domain`, not the raw tag array, so the ?tags= life-area
  // filter (a separate taxonomy) needs the originals kept alongside.
  const [tagsByKey, setTagsByKey] = useState<Map<string, string[]>>(new Map());
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
        if (!cancelled) {
          const keyed = new Map<string, string[]>();
          for (const r of recRows) keyed.set(`record:${r.id}`, r.tags ?? []);
          for (const s of srcRows) keyed.set(`source:${s.id}`, s.tags ?? []);
          setTagsByKey(keyed);
          setShards(mergeEvidence(recRows, srcRows, locale));
        }
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
  useFocusRefetch(() => setReloadKey((k) => k + 1), Boolean(userId));

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
      // Life-area tags filter (?tags=): keep only pieces whose own tags
      // intersect the requested set, case-insensitive. Coexists with domain.
      if (tagFilter.length > 0) {
        const own = (tagsByKey.get(`${s.origin}:${s.id}`) ?? []).map((t) => t.toLowerCase());
        if (!own.some((t) => tagFilter.includes(t))) return false;
      }
      if (q.length > 0 && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [shards, query, typeFilter, domainFilter, tagFilter, tagsByKey]);

  // Memoized here — before any early return — so hook order stays stable across
  // renders (FlatList renderItem perf without violating rules-of-hooks).
  const renderRow = useCallback(
    ({ item }: { item: OriginShard }) => <ShardRow shard={item} locale={locale} />,
    [locale],
  );

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
      ? t("eyebrowRoot")
      : t("eyebrowVillage", { village: villageLabel });
  const heroTitle =
    domainFilter === "all"
      ? t("titleRoot")
      : t("titleVillage");
  const heroSubtitle =
    domainFilter === "all"
      ? t("subtitleRoot")
      : t("subtitleVillage");

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
        placeholder={t("searchPlaceholder")}
        accessibilityLabel={t("searchLabel")}
      />

      <Text variant="caption" color="textSubtle" style={styles.filterLabel}>
        {t("type")}
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
          const label = tf === "all" ? t("filterAll") : evidenceTypeLabel(tf, locale);
          return (
            <TouchableOpacity
              key={tf}
              onPress={() => setTypeFilter(tf)}
              style={[styles.chip, active ? styles.chipActive : null]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t("filterBy", { label })}
            >
              <Text variant="caption" color={active ? "background" : "textMuted"}>{label}</Text>
            </TouchableOpacity>
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
        {t("loadError")}
      </Text>
      <Button
        label={t("tryAgain")}
        variant="secondary"
        onPress={reload}
        accessibilityHint={
          t("retryHint")
        }
      />
    </View>
  ) : (
    <View style={styles.stateBox}>
      <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
        {shards.length === 0
          ? locale === "ko"
            ? "아직 남긴 별가루가 없어요. 오늘의 별가루를 하나 남겨볼까요?"
            : "No pieces yet. Want to leave today's piece?"
          : locale === "ko"
            ? "조건에 맞는 별가루가 없어요."
            : "No pieces match that filter."}
      </Text>
      {shards.length === 0 ? (
        <Button
          label={t("leavePiece")}
          variant="primary"
          onPress={() => router.push("/capture")}
          accessibilityHint={
            t("leaveHint")
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
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        // First (and only) ad placement: list FOOTER, never between pieces —
        // policy-gated (free adult + consent + env), structurally inert until
        // the ads-consent toggle ships. Suppressed on loading/error/empty:
        // empty states guide the next action, they don't monetize (canon).
        ListFooterComponent={
          !busy && !error && filtered.length > 0 ? (
            <AdSlot slotEnvKey="EXPO_PUBLIC_ADSENSE_SLOT_RECORDS" />
          ) : null
        }
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

export default function Records() {
  if (isDeepSpaceUI()) return <DeepSpaceRecordsScreen />;
  return <RecordsLegacy />;
}
