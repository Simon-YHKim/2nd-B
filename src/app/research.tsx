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
import { Redirect } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { VILLAGE_UI } from "@/lib/village-ui";

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
    return <Redirect href="/sign-in" />;
  }

  const frameworks = [...new Set(sources.map((s) => s.framework).filter((f): f is string => !!f))];
  const visible = activeFramework
    ? sources.filter((s) => s.framework === activeFramework)
    : sources;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "자료실" : "Research"}
          title={locale === "ko" ? "검증된 근거를 모아둬요" : "Keep the evidence visible"}
          subtitle={locale === "ko" ? "Big Five · 애착 · CBT · VIA" : "Big Five · attachment · CBT · VIA"}
          island={VILLAGE_UI.knowledge.island}
          worker={VILLAGE_UI.knowledge.worker}
          accent={VILLAGE_UI.knowledge.accent}
          speech={
            locale === "ko"
              ? "세컨비가 참고하는 근거만 따로 모아 보여줄게요."
              : "Only verified sources that SecondB can cite show up here."
          }
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : sources.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "아직 등록된 자료가 없어요. 큐레이터 워크플로가 진행 중이에요."
                : "No sources yet. The curator workflow is in progress."}
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
                          {s.doi ? `doi.org/${s.doi}` : s.url}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}

      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyCard: {
    padding: spacing.lg,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: "center",
  },
  frameworkFilter: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
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
    shadowColor: cosmic.signalBlue,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cardHead: { flexDirection: "row", gap: spacing.xs },
  fwChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.sm, borderWidth: 1, borderColor: semantic.brand, backgroundColor: semantic.surfaceAlt },
  cardTitle: { fontWeight: "600", marginTop: spacing.xs },
});
