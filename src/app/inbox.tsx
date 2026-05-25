// Inbox / source list. Lists everything in `sources` for the current user.
// Tapping a row opens a localized alert with the body preview (downloaded
// from Storage). A richer detail screen comes later in the RAG track.

import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { listSources } from "@/lib/wiki/queries";
import { downloadRawClipping } from "@/lib/wiki/storage";
import type { SourceKind, SourceRow } from "@/lib/wiki/types";

const KIND_LABEL: Record<SourceKind, { en: string; ko: string }> = {
  inbox: { en: "Inbox", ko: "받은편지함" },
  article: { en: "Article", ko: "아티클" },
  video: { en: "Video", ko: "영상" },
  paper: { en: "Paper", ko: "논문" },
  reddit: { en: "Reddit", ko: "레딧" },
  code: { en: "Code", ko: "코드" },
  ai_tool: { en: "AI Tool", ko: "AI 도구" },
  self_knowledge: { en: "Self-Knowledge", ko: "자기 이해" },
};

function formatCapturedAt(iso: string, locale: "en" | "ko"): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Inbox() {
  const { t, i18n } = useTranslation("inbox");
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    setError(null);
    try {
      const data = await listSources(uid, { limit: 100 });
      setRows(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void load(userId).finally(() => setLoading(false));
  }, [userId, load]);

  if (authLoading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  async function handleRowPress(row: SourceRow): Promise<void> {
    try {
      const body = await downloadRawClipping(row.storage_path);
      const preview = body.length > 800 ? body.slice(0, 800) + "…" : body;
      Alert.alert(row.title, preview);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "본문을 불러오지 못했어요" : "Could not load body",
        (e as Error).message,
      );
    }
  }

  async function handleRefresh(): Promise<void> {
    if (!userId) return;
    setRefreshing(true);
    await load(userId);
    setRefreshing(false);
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={semantic.brand} />}
      >
        <View style={styles.header}>
          <Text variant="caption" color="brand">
            2nd-Brain
          </Text>
          <Text variant="heading">{t("title")}</Text>
          <Text variant="body" color="textMuted">
            {t("subtitle")}
          </Text>
        </View>

        <View style={styles.actions}>
          <Link href="/capture" asChild>
            <Button label={t("captureMore")} variant="primary" />
          </Link>
          <Link href="/journal" asChild>
            <Button label={t("back")} variant="secondary" />
          </Link>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text variant="body" color="textMuted">
              {t("error")} {error}
            </Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text variant="body" color="textMuted">
              {t("empty")}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <Pressable key={r.id} onPress={() => handleRowPress(r)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={styles.rowHeader}>
                  <View style={[styles.kindChip, kindChipColor(r.kind)]}>
                    <Text variant="caption" color="textMuted">
                      {KIND_LABEL[r.kind][locale]}
                    </Text>
                  </View>
                  {r.ingested ? (
                    <View style={[styles.kindChip, styles.ingestedChip]}>
                      <Text variant="caption" color="textMuted">
                        {t("ingested")}
                      </Text>
                    </View>
                  ) : null}
                  <Text variant="caption" color="textSubtle" style={styles.flexSpacer}>
                    {formatCapturedAt(r.captured_at, locale)}
                  </Text>
                </View>
                <Text variant="body" style={styles.rowTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                {r.source_url ? (
                  <Text variant="subtle" color="textSubtle" numberOfLines={1}>
                    {r.source_url}
                  </Text>
                ) : null}
                {r.tags.length > 0 ? (
                  <Text variant="subtle" color="textSubtle" numberOfLines={1}>
                    #{r.tags.join(" #")}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function kindChipColor(kind: SourceKind) {
  // Subtle per-kind tint; same neutral text color for accessibility.
  switch (kind) {
    case "video":
      return { backgroundColor: semantic.surfaceAlt, borderColor: semantic.zoneRed };
    case "paper":
      return { backgroundColor: semantic.surfaceAlt, borderColor: semantic.info };
    case "code":
      return { backgroundColor: semantic.surfaceAlt, borderColor: semantic.zoneGreen };
    case "ai_tool":
      return { backgroundColor: semantic.surfaceAlt, borderColor: semantic.brand };
    case "self_knowledge":
      return { backgroundColor: semantic.surfaceAlt, borderColor: semantic.warning };
    default:
      return { backgroundColor: semantic.surfaceAlt, borderColor: semantic.border };
  }
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  errorCard: { padding: spacing.md, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, borderWidth: 1, borderColor: semantic.danger },
  emptyCard: { padding: spacing.lg, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, alignItems: "center" },
  list: { gap: spacing.sm },
  row: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowPressed: { opacity: 0.7 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flexSpacer: { marginLeft: "auto" },
  rowTitle: { fontWeight: "600" },
  kindChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  ingestedChip: { backgroundColor: semantic.surface, borderColor: semantic.success },
});
