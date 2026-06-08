// Curated psychology references browser. Surfaces knowledge_sources
// rows from the Curator Engine (blueprint §6 Engine 6) so users can
// see which validated frameworks ground the Advisor's responses.
//
// Sources are pre-seeded by the curator workflow (Big Five, Attachment,
// SDT, CBT, Erikson, VIA per blueprint §9). Each row carries DOI/URL +
// verification metadata (C8).

import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, PremiumErrorState, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
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

export default function Research() {
  const { t, i18n } = useTranslation("research");
  const { userId, loading: authLoading } = useAuth();
  const isKorean = i18n.language === "ko";

  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeFramework, setActiveFramework] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    const supabase = getSupabaseClient();
    void supabase
      .from("knowledge_sources")
      .select("id, title, authors, doi, url, framework, age_range, locale, summary_en, summary_ko, verified_at")
      .order("framework", { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          console.warn("[research] load sources failed", error.message);
          setSources([]);
          setLoadError(true);
        } else {
          setSources((data ?? []) as Source[]);
        }
        setLoading(false);
      });
  }, [userId, reloadKey]);

  if (authLoading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  if (loadError) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumErrorState
            title={t("error.title")}
            body={t("error.body")}
            retryLabel={t("error.retry")}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </View>
      </PremiumAppShell>
    );
  }

  const frameworks = [...new Set(sources.map((s) => s.framework).filter((f): f is string => !!f))];
  const visible = activeFramework ? sources.filter((s) => s.framework === activeFramework) : sources;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.knowledge.island}
          worker={VILLAGE_UI.knowledge.worker}
          accent={VILLAGE_UI.knowledge.accent}
          speech={t("hero.speech")}
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : sources.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="body" color="textMuted">
              {t("empty")}
            </Text>
          </View>
        ) : (
          <>
            {frameworks.length > 1 ? (
              <View style={styles.frameworkFilter}>
                <Text variant="caption" color="textMuted">
                  {t("filter.label")}
                </Text>
                <View style={styles.chipRow} accessibilityRole="tablist" accessibilityLabel={t("filter.accessibilityLabel")}>
                  <Pressable
                    onPress={() => setActiveFramework(null)}
                    style={[styles.chip, activeFramework === null && styles.chipActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activeFramework === null }}
                    accessibilityLabel={t("filter.all")}
                  >
                    <Text variant="caption" color={activeFramework === null ? "background" : "textMuted"}>
                      {t("filter.all")}
                    </Text>
                  </Pressable>
                  {frameworks.map((f) => {
                    const active = activeFramework === f;
                    const label = t(`frameworks.${f}`, { defaultValue: f });
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setActiveFramework(active ? null : f)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={label}
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
              {t("sourceCount", { visible: visible.length, total: sources.length, plural: visible.length === 1 ? "" : "s" })}
            </Text>

            <View style={styles.list}>
              {visible.map((s) => {
                const summary = isKorean ? s.summary_ko ?? s.summary_en : s.summary_en ?? s.summary_ko;
                const fwLabel = s.framework ? t(`frameworks.${s.framework}`, { defaultValue: s.framework }) : null;
                return (
                  <View key={s.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      {fwLabel ? (
                        <View style={styles.fwChip}>
                          <Text variant="caption" color="brand">
                            {fwLabel}
                          </Text>
                        </View>
                      ) : null}
                      {s.verified_at ? (
                        <View style={[styles.fwChip, { borderColor: semantic.success }]}>
                          <Text variant="caption" color="success">
                            {t("verified")}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="body" style={styles.cardTitle} selectable>
                      {s.title}
                    </Text>
                    {s.authors && s.authors.length > 0 ? (
                      <Text variant="subtle" color="textSubtle" selectable>
                        {s.authors.slice(0, 4).join(", ")}
                        {s.authors.length > 4 ? " et al." : ""}
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
                        accessibilityRole="link"
                        accessibilityLabel={t("link.label", { title: s.title })}
                        accessibilityHint={t("link.hint")}
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
  fwChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.brand,
    backgroundColor: semantic.surfaceAlt,
  },
  cardTitle: { fontFamily: fontFamilies.pixelKo, fontWeight: "600", marginTop: spacing.xs },
});
