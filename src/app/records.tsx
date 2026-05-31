// Records browser (queue B / A-to-Z Phase 6) — user-facing "기록".
// Lists every piece the user has saved (journal / capture / audit / imagine
// / wiki), with a type filter and a local search. Each row opens the record
// detail (/record/[id]). Reuses the pure evidence mapping so the type label,
// date, and source route are a single source of truth.
//
// Renders meaningful loading / empty / error states so the route is never
// blank, and can be reached directly via URL.

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
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

const TYPE_FILTERS: (EvidenceType | "all")[] = ["all", "journal", "capture", "audit", "interview", "imagine", "wiki"];
// Domain (village) filter chips — "all" plus the six villages, in graph order.
const DOMAIN_CHIPS: ("all" | VillageId)[] = ["all", ...VILLAGE_IDS];

// Warm-gold for records by default; a few types carry their companion accent.
const TYPE_ACCENT: Record<EvidenceType, string> = {
  journal: cosmic.pixelLamp,
  capture: cosmic.signalMint,
  wiki: cosmic.signalBlue,
  interview: cosmic.soulViolet,
  audit: cosmic.soulViolet,
  imagine: cosmic.dreamPink,
};

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

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SceneHero
          eyebrow={
            domainFilter === "all"
              ? (locale === "ko" ? "05. 기록 보관소" : "05. Records")
              : (locale === "ko"
                  ? `${VILLAGE_LABEL[domainFilter].ko} · 기록`
                  : `${VILLAGE_LABEL[domainFilter].en} · Records`)
          }
          title={locale === "ko" ? "남긴 조각을 다시 만나요" : "Revisit every piece you left"}
          subtitle={locale === "ko" ? "일기 · 담기 · 검사 · 공상까지 한곳에" : "Journal, capture, assessments, and imagine in one place"}
          island="records"
          worker="momo"
          speech={
            locale === "ko"
              ? "모든 조각은 시간순으로 보관했어요. 필요한 기억을 바로 꺼내볼까요?"
              : "Every piece is kept by time. Want to pull a memory back out?"
          }
          primaryAction={{
            label: locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece",
            onPress: () => router.push("/journal"),
          }}
          railIcons={["⌂", "▤", "⌕", "◇"]}
        />

        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={locale === "ko" ? "조각 검색" : "Search pieces"}
          accessibilityLabel={locale === "ko" ? "기록 검색" : "Search records"}
        />

        {/* Domain (village) filter — the primary "which village" cut. Set by the
            village node that brought you here, switchable via these chips. */}
        <Text variant="caption" color="textSubtle" style={styles.filterLabel}>
          {locale === "ko" ? "마을" : "Village"}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {DOMAIN_CHIPS.map((d) => {
            const active = d === domainFilter;
            const label = d === "all" ? (locale === "ko" ? "전체" : "All") : VILLAGE_LABEL[d][locale];
            return (
              <Pressable
                key={d}
                onPress={() => setDomainFilter(d)}
                style={[styles.chip, active ? styles.chipActive : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text variant="caption" color={active ? "background" : "textMuted"}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text variant="caption" color="textSubtle" style={styles.filterLabel}>
          {locale === "ko" ? "종류" : "Type"}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
              >
                <Text variant="caption" color={active ? "background" : "textMuted"}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {busy ? (
          <View style={styles.center}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
              {locale === "ko" ? "조각을 불러오지 못했어요." : "Couldn't load your pieces."}
            </Text>
            <Button label={locale === "ko" ? "다시 시도" : "Try again"} variant="secondary" onPress={reload} />
          </View>
        ) : filtered.length === 0 ? (
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
              <Button label={locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece"} variant="primary" onPress={() => router.push("/journal")} />
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((s) => (
              <ReferenceShardCard
                key={`${s.origin}:${s.id}`}
                title={s.title}
                meta={[s.dateLabel, evidenceTypeLabel(s.type, locale)].filter(Boolean).join(" · ")}
                accent={TYPE_ACCENT[s.type]}
                onPress={() =>
                  // `records`-origin shards open the record detail; `sources`-
                  // origin shards (capture / imagine) live in the wiki store,
                  // so open their wiki page instead of /record/[id] (which
                  // only reads the records table).
                  s.origin === "record"
                    ? router.push({ pathname: "/record/[id]", params: { id: s.id } })
                    : router.push(s.route)
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: 110 },
  center: { paddingVertical: spacing.xxl, alignItems: "center", justifyContent: "center" },
  stateBox: { paddingVertical: spacing.xl, gap: spacing.md, alignItems: "center" },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  // Pull each chip row up under its small section label (scroll gap is lg).
  filterLabel: { marginBottom: -spacing.sm, letterSpacing: 0.5 },
  chip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  list: { gap: spacing.xs },
});
