// Inbox / source list. Lists everything in `sources` for the current user.
// Tapping a row opens a localized alert with the body preview (downloaded
// from Storage). A richer detail screen comes later in the RAG track.

import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppNav } from "@/components/ui/AppNav";
import { deleteSource, listSources } from "@/lib/wiki/queries";
import { runPhase1, readPhase1 } from "@/lib/wiki/phase1";
import { generateSourcePage } from "@/lib/wiki/phase2";
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
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [phase1Id, setPhase1Id] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bodyById, setBodyById] = useState<Record<string, string>>({});

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
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (bodyById[row.id] === undefined) {
      try {
        const body = await downloadRawClipping(row.storage_path);
        setBodyById((prev) => ({ ...prev, [row.id]: body }));
      } catch (e) {
        setBodyById((prev) => ({ ...prev, [row.id]: `_(${locale === "ko" ? "본문 로드 실패" : "body load failed"}: ${(e as Error).message})_` }));
      }
    }
  }

  async function handleRefresh(): Promise<void> {
    if (!userId) return;
    setRefreshing(true);
    await load(userId);
    setRefreshing(false);
  }

  async function handleRunPhase1(row: SourceRow): Promise<void> {
    if (!userId) return;
    setPhase1Id(row.id);
    try {
      const result = await runPhase1({ userId, sourceId: row.id, locale });
      Alert.alert(
        locale === "ko" ? `요약 + 4개 질문 생성됨` : `Summary + 4 questions generated`,
        result.summary +
          "\n\n" +
          (locale === "ko" ? "성찰 질문:" : "Reflection questions:") +
          "\n" +
          result.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      );
      await load(userId);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "Phase 1 실패" : "Phase 1 failed",
        (e as Error).message,
      );
    } finally {
      setPhase1Id(null);
    }
  }

  async function handleDeleteSource(row: SourceRow): Promise<void> {
    if (!userId) return;
    if (row.ingested) {
      Alert.alert(
        locale === "ko" ? "삭제 불가" : "Cannot delete",
        locale === "ko"
          ? "위키 페이지로 승격된 소스는 먼저 위키에서 페이지를 삭제해야 해요."
          : "Promoted sources need the wiki page deleted first.",
      );
      return;
    }
    Alert.alert(
      locale === "ko" ? "이 캡처를 삭제할까요?" : "Delete this capture?",
      locale === "ko"
        ? "본문 파일은 Supabase Storage에 남아 있을 수 있어요 (자동 정리는 v2)."
        : "The body file may stay in Supabase Storage (auto-cleanup ships in v2).",
      [
        { text: locale === "ko" ? "취소" : "Cancel", style: "cancel" },
        {
          text: locale === "ko" ? "삭제" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSource(userId, row.id);
              await load(userId);
            } catch (e) {
              Alert.alert(
                locale === "ko" ? "삭제 실패" : "Delete failed",
                (e as Error).message,
              );
            }
          },
        },
      ],
    );
  }

  async function handleGeneratePage(row: SourceRow): Promise<void> {
    if (!userId) return;
    setGeneratingId(row.id);
    try {
      const result = await generateSourcePage(userId, row.id);
      const msg =
        locale === "ko"
          ? `[[${result.slug}]] 위키 페이지 생성됨${result.danglingSlugs.length > 0 ? ` (연결 안 된 슬러그: ${result.danglingSlugs.length})` : ""}`
          : `Generated wiki page [[${result.slug}]]${result.danglingSlugs.length > 0 ? ` (${result.danglingSlugs.length} dangling link${result.danglingSlugs.length === 1 ? "" : "s"})` : ""}`;
      Alert.alert(msg);
      await load(userId); // reflect ingested=true
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "위키 페이지 생성 실패" : "Could not generate wiki page",
        (e as Error).message,
      );
    } finally {
      setGeneratingId(null);
    }
  }

  return (
    <PremiumAppShell>
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
            <Text variant="body" color="textMuted" style={styles.emptyText}>
              {t("empty")}
            </Text>
            <Text variant="subtle" color="textSubtle" style={{ textAlign: "center", lineHeight: 18 }}>
              {locale === "ko"
                ? "받은편지함은 캡처한 자료가 모이는 곳. 여기서 Phase 1(요약 + 4질문)을 돌리거나 위키 페이지로 발전시킬 수 있어요."
                : "Your inbox holds captured sources. Run Phase 1 (summary + 4 questions) here, or promote a row to a wiki page."}
            </Text>
            <Link href="/capture" asChild>
              <Pressable hitSlop={6}>
                <Text variant="caption" color="brand">
                  {locale === "ko" ? "→ 첫 캡처 시작" : "→ Capture your first"}
                </Text>
              </Pressable>
            </Link>
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
                <View style={styles.rowActions}>
                  {readPhase1(r.frontmatter) === null ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleRunPhase1(r);
                      }}
                      style={styles.generateBtn}
                      disabled={phase1Id === r.id}
                      hitSlop={4}
                    >
                      <Text variant="caption" color="brand">
                        {phase1Id === r.id
                          ? locale === "ko"
                            ? "요약 중…"
                            : "Summarizing…"
                          : locale === "ko"
                            ? "→ 요약 + 4질문"
                            : "→ Summarize + 4 questions"}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        const p1 = readPhase1(r.frontmatter)!;
                        Alert.alert(
                          locale === "ko" ? "Phase 1 결과" : "Phase 1 result",
                          p1.summary + "\n\n" + p1.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
                        );
                      }}
                      style={styles.generateBtn}
                      hitSlop={4}
                    >
                      <Text variant="caption" color="success">
                        {locale === "ko" ? "✓ Phase 1 보기" : "✓ Phase 1 — view"}
                      </Text>
                    </Pressable>
                  )}
                  {!r.ingested ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleGeneratePage(r);
                      }}
                      style={styles.generateBtn}
                      disabled={generatingId === r.id}
                      hitSlop={4}
                    >
                      <Text variant="caption" color="brand">
                        {generatingId === r.id
                          ? locale === "ko"
                            ? "생성 중…"
                            : "Generating…"
                          : locale === "ko"
                            ? "→ 위키 페이지 생성"
                            : "→ Generate wiki page"}
                      </Text>
                    </Pressable>
                  ) : (
                    <Link href="/wiki" asChild>
                      <Pressable style={styles.generateBtn} hitSlop={4} onPress={(e) => e.stopPropagation()}>
                        <Text variant="caption" color="success">
                          {locale === "ko" ? "→ 위키에서 보기" : "→ View in wiki"}
                        </Text>
                      </Pressable>
                    </Link>
                  )}
                  {!r.ingested ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleDeleteSource(r);
                      }}
                      style={styles.generateBtn}
                      hitSlop={4}
                    >
                      <Text variant="caption" color="textSubtle">
                        {locale === "ko" ? "삭제" : "Delete"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                {expandedId === r.id ? (
                  <View style={styles.expandedSection}>
                    {Object.keys(r.frontmatter).length > 0 ? (
                      <View style={styles.metaCard}>
                        <Text variant="caption" color="textMuted">
                          {locale === "ko" ? "메타데이터" : "Metadata"}
                        </Text>
                        {Object.entries(r.frontmatter)
                          .filter(([k]) => k !== "__phase1__")
                          .slice(0, 10)
                          .map(([k, v]) => (
                            <Text key={k} variant="subtle" color="textSubtle" numberOfLines={2}>
                              <Text variant="subtle" color="textMuted">{k}:</Text>{" "}
                              {Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </Text>
                          ))}
                      </View>
                    ) : null}
                    {bodyById[r.id] === undefined ? (
                      <ActivityIndicator color={semantic.brand} />
                    ) : (
                      <Text variant="subtle" color="textMuted" style={styles.body} selectable>
                        {bodyById[r.id]}
                      </Text>
                    )}
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
        <AppNav locale={locale} />
      </ScrollView>
    </PremiumAppShell>
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
  emptyCard: { padding: spacing.lg, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, alignItems: "center", gap: spacing.sm },
  emptyText: { textAlign: "center" },
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
  rowActions: { marginTop: spacing.xs, flexDirection: "row", flexWrap: "wrap", gap: spacing.md, alignItems: "center" },
  generateBtn: { paddingVertical: spacing.xs },
  expandedSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  metaCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: 2,
  },
  body: { lineHeight: 20 },
});
