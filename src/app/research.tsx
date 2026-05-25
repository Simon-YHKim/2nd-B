// Curated psychology references browser. Surfaces knowledge_sources
// rows from the Curator Engine (blueprint §6 Engine 6) so users can
// see which validated frameworks ground the Advisor's responses.
//
// Sources are pre-seeded by the curator workflow (Big Five, Attachment,
// SDT, CBT, Erikson, VIA per blueprint §9). Each row carries DOI/URL +
// verification metadata (C8).

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, ActivityIndicator, Alert, Linking, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

interface Source {
  id: string;
  title: string;
  authors: string[] | null;
  doi: string | null;
  url: string | null;
  framework: string | null;
  age_range: string | null;
  locale: string | null;
  summary_en: string | null;
  summary_ko: string | null;
  verified_at: string | null;
}

const FRAMEWORK_LABEL: Record<string, { en: string; ko: string }> = {
  big_five: { en: "Big Five", ko: "Big Five" },
  attachment: { en: "Attachment Theory", ko: "애착이론" },
  sdt: { en: "Self-Determination", ko: "자기결정성 이론" },
  cbt: { en: "CBT", ko: "CBT" },
  erikson: { en: "Erikson Stages", ko: "에릭슨 단계" },
  via: { en: "VIA Strengths", ko: "VIA 성격 강점" },
};

export default function Research() {
  const { i18n } = useTranslation();
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFramework, setActiveFramework] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const supabase = getSupabaseClient();
    void supabase
      .from("knowledge_sources")
      .select("id, title, authors, doi, url, framework, age_range, locale, summary_en, summary_ko, verified_at")
      .order("framework", { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          Alert.alert(locale === "ko" ? "로드 실패" : "Load failed", error.message);
          setSources([]);
        } else {
          setSources((data ?? []) as Source[]);
        }
        setLoading(false);
      });
  }, [userId, locale]);

  if (authLoading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  const frameworks = [...new Set(sources.map((s) => s.framework).filter((f): f is string => !!f))];
  const visible = activeFramework
    ? sources.filter((s) => s.framework === activeFramework)
    : sources;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="caption" color="brand">
            2nd-Brain
          </Text>
          <Text variant="heading" style={{ marginTop: spacing.xs }}>
            {locale === "ko" ? "큐레이션된 자료" : "Curated research"}
          </Text>
          <Text variant="body" color="textMuted">
            {locale === "ko"
              ? "어드바이저가 인용하는 검증된 학술 자료. 모든 항목에 DOI 또는 URL이 있으며, 큐레이터 검증을 통과한 것만 등록돼요."
              : "Validated academic sources the Advisor cites. Every row has a DOI or URL and has passed curator verification."}
          </Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : sources.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "아직 등록된 자료가 없어요. 큐레이터 워크플로가 진행 중이에요."
                : "No sources yet — the curator workflow is in progress."}
            </Text>
          </View>
        ) : (
          <>
            {frameworks.length > 1 ? (
              <View style={styles.frameworkFilter}>
                <Text variant="caption" color="textMuted">
                  {locale === "ko" ? "프레임으로 필터" : "Filter by framework"}
                </Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => setActiveFramework(null)}
                    style={[styles.chip, activeFramework === null && styles.chipActive]}
                  >
                    <Text variant="caption" color={activeFramework === null ? "background" : "textMuted"}>
                      {locale === "ko" ? "전체" : "All"}
                    </Text>
                  </Pressable>
                  {frameworks.map((f) => {
                    const active = activeFramework === f;
                    const label = FRAMEWORK_LABEL[f]?.[locale] ?? f;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setActiveFramework(active ? null : f)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text variant="caption" color={active ? "background" : "textMuted"}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Text variant="subtle" color="textSubtle">
              {locale === "ko"
                ? `${visible.length}개의 자료 (전체 ${sources.length})`
                : `${visible.length} source${visible.length === 1 ? "" : "s"} (of ${sources.length})`}
            </Text>

            <View style={styles.list}>
              {visible.map((s) => {
                const summary = locale === "ko" ? s.summary_ko ?? s.summary_en : s.summary_en ?? s.summary_ko;
                const fwLabel = s.framework && FRAMEWORK_LABEL[s.framework]?.[locale];
                return (
                  <View key={s.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      {fwLabel ? (
                        <View style={styles.fwChip}>
                          <Text variant="caption" color="brand">{fwLabel}</Text>
                        </View>
                      ) : null}
                      {s.verified_at ? (
                        <View style={[styles.fwChip, { borderColor: semantic.success }]}>
                          <Text variant="caption" color="success">
                            {locale === "ko" ? "검증됨" : "Verified"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="body" style={styles.cardTitle} selectable>
                      {s.title}
                    </Text>
                    {s.authors && s.authors.length > 0 ? (
                      <Text variant="subtle" color="textSubtle" selectable>
                        {s.authors.slice(0, 4).join(", ")}{s.authors.length > 4 ? " et al." : ""}
                      </Text>
                    ) : null}
                    {summary ? (
                      <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs, lineHeight: 20 }} selectable>
                        {summary}
                      </Text>
                    ) : null}
                    {s.doi || s.url ? (
                      <Pressable
                        onPress={() => {
                          const target = s.doi ? `https://doi.org/${s.doi}` : (s.url as string);
                          void Linking.openURL(target);
                        }}
                        hitSlop={4}
                      >
                        <Text variant="subtle" color="brand" numberOfLines={1} style={{ marginTop: spacing.xs }}>
                          → {s.doi ? `doi.org/${s.doi}` : s.url}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.actions}>
          <Link href="/journal" asChild>
            <Button label={locale === "ko" ? "일기로 돌아가기" : "Back to journal"} variant="secondary" />
          </Link>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyCard: { padding: spacing.lg, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, alignItems: "center" },
  frameworkFilter: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
  },
  chipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  cardHead: { flexDirection: "row", gap: spacing.xs },
  fwChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm, borderWidth: 1, borderColor: semantic.brand, backgroundColor: semantic.surfaceAlt },
  cardTitle: { fontWeight: "600", marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
