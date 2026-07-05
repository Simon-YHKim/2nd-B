// Inbox / source list. Lists everything in `sources` for the current user.
// Tapping a row expands a localized body preview (downloaded from Storage).
// A richer detail screen comes later in the RAG track.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { VILLAGE_UI } from "@/lib/village-ui";
import { deleteSource, listSources } from "@/lib/wiki/queries";
import { promotePendingUploads } from "@/lib/wiki/promote-pending";
import { runPhase1, readPhase1 } from "@/lib/wiki/phase1";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { downloadRawClipping } from "@/lib/wiki/storage";
import type { SourceKind, SourceRow } from "@/lib/wiki/types";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceInboxScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

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

// Cap the cached body map to the last 5 expanded rows. Insertion order in a
// plain object follows key-add order, so the first key is the oldest entry;
// when adding a new key past the cap, drop that oldest one. Re-adding an
// existing key just overwrites it without growing the map.
const BODY_CACHE_LIMIT = 5;
type InboxToast = { message: string; tone: "info" | "success" | "danger" };
type InboxFeedbackModal = {
  title: string;
  body: string;
  confirm?: { label: string; variant: "primary" | "danger"; onPress: () => void | Promise<void> };
} | null;

// Known body-load error placeholders, keyed by locale. These are cached into
// bodyById on a downloadRawClipping failure so the expanded row shows calm
// product-tone copy instead of an infinite spinner. They are also treated as
// retryable by handleRowPress: a re-tap re-fetches instead of re-showing the
// stale error (the cached value is a defined string, not undefined, so the
// plain `=== undefined` check alone would never retry until 5 other rows evict
// it).
const BODY_LOAD_ERROR: Record<"en" | "ko", string> = {
  ko: "_(본문을 불러오지 못했어요. 잠시 후 다시 열어 주세요.)_",
  en: "_(Couldn't load this content. Tap to reopen in a moment.)_",
};
function isBodyLoadError(body: string | undefined): boolean {
  return body === BODY_LOAD_ERROR.ko || body === BODY_LOAD_ERROR.en;
}

function addBodyCapped(
  prev: Record<string, string>,
  id: string,
  body: string,
): Record<string, string> {
  const next = { ...prev, [id]: body };
  const keys = Object.keys(next);
  if (keys.length > BODY_CACHE_LIMIT) {
    delete next[keys[0]];
  }
  return next;
}

const META_LABELS: Record<string, { en: string; ko: string }> = {
  title: { en: "Saved title", ko: "저장한 제목" },
  source: { en: "Original source", ko: "원본 출처" },
  url: { en: "Original link", ko: "원본 링크" },
  kind: { en: "Source type", ko: "자료 종류" },
  summary: { en: "Summary", ko: "요약" },
  "target-category": { en: "Filing area", ko: "분류 위치" },
  "simon-relevance": { en: "Why it matters", ko: "중요한 이유" },
  "actionable-takeaway": { en: "Suggested next step", ko: "다음 행동" },
};

function humanizeMetaKey(key: string): string {
  return key.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatMetaValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    const items = value.map((v) => (typeof v === "string" || typeof v === "number" ? String(v) : "")).filter(Boolean);
    return items.length > 0 ? items.join(", ") : null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function visibleMetadataEntries(frontmatter: SourceRow["frontmatter"], locale: "en" | "ko"): Array<{ label: string; value: string }> {
  return Object.entries(frontmatter)
    .filter(([key]) => key !== "__phase1__")
    .map(([key, value]) => {
      const formatted = formatMetaValue(value);
      if (!formatted) return null;
      return { label: META_LABELS[key]?.[locale] ?? humanizeMetaKey(key), value: formatted };
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null)
    .slice(0, 10);
}

// Memoized row so the whole list does not re-render on every parent state
// change. It only receives the props it needs + stable callbacks (useCallback
// in the parent), so React.memo can skip rows whose props are unchanged.
type InboxRowProps = {
  row: SourceRow;
  expanded: boolean;
  body: string | undefined;
  phase1Pending: boolean;
  generatePending: boolean;
  locale: "en" | "ko";
  t: TFunction<"inbox">;
  onPress: (row: SourceRow) => void;
  onRunPhase1: (row: SourceRow) => void;
  onViewPhase1: (row: SourceRow) => void;
  onGeneratePage: (row: SourceRow) => void;
  onDeleteSource: (row: SourceRow) => void;
};

const InboxRow = React.memo(function InboxRow({
  row: r,
  expanded,
  body,
  phase1Pending,
  generatePending,
  locale,
  t,
  onPress,
  onRunPhase1,
  onViewPhase1,
  onGeneratePage,
  onDeleteSource,
}: InboxRowProps) {
  const metaEntries = visibleMetadataEntries(r.frontmatter, locale);
  return (
    <TouchableOpacity activeOpacity={0.7}
      onPress={() => onPress(r)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={t("openItem", { title: r.title })}
      accessibilityHint={
        expanded
          ? locale === "ko"
            ? "본문 미리보기를 닫습니다"
            : "Collapses the content preview"
          : locale === "ko"
            ? "본문 미리보기를 엽니다"
            : "Expands the content preview"
      }
    >
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
          <TouchableOpacity activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation();
              void onRunPhase1(r);
            }}
            style={[styles.generateBtn, phase1Pending && styles.generateBtnDisabled]}
            disabled={phase1Pending}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t("createBriefFor", { title: r.title })}
            accessibilityState={{ disabled: phase1Pending, busy: phase1Pending }}
          >
            <Text variant="caption" color="brand">
              {phase1Pending
                ? locale === "ko"
                  ? "요약 중…"
                  : "Summarizing…"
                : locale === "ko"
                  ? "요약 + 4질문"
                  : "Summarize + 4 questions"}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation();
              onViewPhase1(r);
            }}
            style={styles.generateBtn}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t("viewBriefFor", { title: r.title })}
          >
            <Text variant="caption" color="success">
              {t("viewBrief")}
            </Text>
          </TouchableOpacity>
        )}
        {!r.ingested ? (
          <TouchableOpacity activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation();
              void onGeneratePage(r);
            }}
            style={[styles.generateBtn, generatePending && styles.generateBtnDisabled]}
            disabled={generatePending}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t("generateWikiFor", { title: r.title })}
            accessibilityState={{ disabled: generatePending, busy: generatePending }}
          >
            <Text variant="caption" color="brand">
              {generatePending
                ? locale === "ko"
                  ? "생성 중…"
                  : "Generating…"
                : locale === "ko"
                  ? "위키 페이지 생성"
                  : "Generate wiki page"}
            </Text>
          </TouchableOpacity>
        ) : (
          <Link href={{ pathname: "/wiki", params: { focusSourceId: r.id } }} asChild>
            <TouchableOpacity activeOpacity={0.7}
              style={styles.generateBtn}
              hitSlop={14}
              onPress={(e) => e.stopPropagation()}
              accessibilityRole="link"
              accessibilityLabel={t("viewInWikiFor", { title: r.title })}
            >
              <Text variant="caption" color="success">
                {t("viewInWiki")}
              </Text>
            </TouchableOpacity>
          </Link>
        )}
        {!r.ingested ? (
          <TouchableOpacity activeOpacity={0.7}
            onPress={(e) => {
              e.stopPropagation();
              void onDeleteSource(r);
            }}
            style={[styles.generateBtn, styles.deleteBtn]}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={t("deleteItem", { title: r.title })}
          >
            <Text variant="caption" color="textSubtle">
              {t("delete")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {expanded ? (
        <View style={styles.expandedSection}>
          {metaEntries.length > 0 ? (
            <View style={styles.metaCard}>
              <Text variant="caption" color="textMuted">
                {t("savedDetails")}
              </Text>
              {metaEntries.map((entry) => (
                  <Text key={entry.label} variant="subtle" color="textSubtle" numberOfLines={2}>
                    <Text variant="subtle" color="textMuted">{entry.label}:</Text>{" "}
                    {entry.value}
                  </Text>
                ))}
            </View>
          ) : null}
          {body === undefined ? (
            <ActivityIndicator color={semantic.brand} />
          ) : (
            <Text variant="subtle" color="textMuted" style={styles.body} selectable>
              {body}
            </Text>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

function InboxLegacy() {
  const { t, i18n } = useTranslation("inbox");
  const { userId, loading: authLoading, hasProfile, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [phase1Id, setPhase1Id] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bodyById, setBodyById] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<InboxToast | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<InboxFeedbackModal>(null);
  // Mirror of bodyById so the stable handleRowPress callback can read the
  // latest cache without listing bodyById in its deps (which would change its
  // identity and defeat InboxRow memoization).
  const bodyByIdRef = useRef(bodyById);
  bodyByIdRef.current = bodyById;
  const expandedIdRef = useRef(expandedId);
  expandedIdRef.current = expandedId;

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const showFeedback = useCallback((title: string, body: string): void => {
    setFeedbackModal({ title, body });
  }, []);

  const showToast = useCallback((message: string, tone: InboxToast["tone"] = "info"): void => {
    setToast({ message, tone });
  }, []);

  function runModalConfirm(): void {
    const current = feedbackModal?.confirm;
    setFeedbackModal(null);
    if (current) void current.onPress();
  }

  const load = useCallback(
    async (uid: string) => {
      setError(null);
      try {
        // Best-effort recovery before listing: clippings whose Storage copy
        // didn't land at capture time (_body_fallback) get re-uploaded and
        // their pending flag cleared. Cheap when nothing is pending.
        await promotePendingUploads(uid).catch((e) => {
          console.warn("[inbox] promote-pending failed", (e as Error).message);
        });
        const data = await listSources(uid, { limit: 100 });
        setRows(data);
      } catch (e) {
        // Keep the raw error in logs only; the error card shows product-tone copy + retry.
        console.warn("[inbox] listSources failed", (e as Error).message);
        setError(
          locale === "ko"
            ? "받은편지함을 불러오지 못했어요. 아래로 당겨 새로고침해 주세요."
            : "Couldn't load your inbox. Pull down to refresh.",
        );
      }
    },
    [locale],
  );

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void load(userId).finally(() => setLoading(false));
  }, [userId, load]);

  // Stable callbacks passed to the memoized InboxRow. Each uses functional
  // state updates so its identity never changes across renders, letting
  // React.memo skip rows whose own props are unchanged.
  const fetchBody = useCallback(
    async (row: SourceRow) => {
      try {
        const body = await downloadRawClipping(row.storage_path);
        setBodyById((prev) => addBodyCapped(prev, row.id, body));
      } catch (e) {
        // Raw error stays in logs only; users see calm product-tone copy.
        console.warn("[inbox] downloadRawClipping failed", (e as Error).message);
        setBodyById((prev) => addBodyCapped(prev, row.id, BODY_LOAD_ERROR[locale]));
      }
    },
    [locale],
  );

  const handleRowPress = useCallback(
    (row: SourceRow): void => {
      // Toggle expand/collapse. The functional updater is pure (no side
      // effects), so it stays correct under StrictMode double-invocation.
      const wasExpanded = expandedIdRef.current === row.id;
      setExpandedId((prev) => (prev === row.id ? null : row.id));
      if (wasExpanded) return;
      // First expand for this row, and body not cached yet (or the cached value
      // is a prior load-error placeholder): fetch it. Reading from the ref keeps
      // this callback's identity stable. Treating the error placeholder as
      // retryable is what makes the "tap to reopen" copy actually re-fetch
      // instead of re-showing the stale error until 5 other rows evict it.
      const cached = bodyByIdRef.current[row.id];
      if (cached === undefined || isBodyLoadError(cached)) {
        void fetchBody(row);
      }
    },
    [fetchBody],
  );

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setRefreshing(true);
    await load(userId);
    setRefreshing(false);
  }, [userId, load]);

  const handleRunPhase1 = useCallback(
    async (row: SourceRow): Promise<void> => {
      if (!userId) return;
      setPhase1Id(row.id);
      try {
        const result = await runPhase1({ userId, sourceId: row.id, locale, minor: isMinor === true });
        showFeedback(
          t("briefGenerated"),
          result.summary +
            "\n\n" +
            (t("reflectionQuestions")) +
            "\n" +
            result.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
        );
        await load(userId);
      } catch (e) {
        // Raw error stays in logs only; user sees product-tone copy + retry.
        console.warn("[inbox] runPhase1 (summary + questions) failed", (e as Error).message);
        showFeedback(
          t("briefError"),
          locale === "ko"
            ? "잠시 후 요약 + 4질문을 다시 시도해 주세요. 계속 안 되면 다른 소스를 먼저 정리해 볼 수 있어요."
            : "Try generating the summary and 4 questions again in a moment. If it keeps failing, you can refine another source first.",
        );
      } finally {
        setPhase1Id(null);
      }
    },
    [userId, locale, isMinor, load, showFeedback],
  );

  const handleViewPhase1 = useCallback(
    (row: SourceRow): void => {
      const p1 = readPhase1(row.frontmatter);
      if (!p1) return;
      showFeedback(
        t("sourceBrief"),
        p1.summary + "\n\n" + p1.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      );
    },
    [locale, showFeedback],
  );

  const handleDeleteSource = useCallback(
    async (row: SourceRow): Promise<void> => {
      if (!userId) return;
      if (row.ingested) {
        showFeedback(
          t("cannotDelete"),
          t("cannotDeleteBody"),
        );
        return;
      }
      setFeedbackModal({
        title: t("deleteConfirmTitle"),
        body: t("deleteConfirmBody"),
        confirm: {
          label: t("delete"),
          variant: "danger",
          onPress: async () => {
            try {
              await deleteSource(userId, row.id);
              await load(userId);
              showToast(t("captureDeleted"), "success");
            } catch (e) {
              // Keep the raw error in logs only; show product-tone copy.
              console.warn("[inbox] deleteSource failed", (e as Error).message);
              showFeedback(
                t("deleteError"),
                t("deleteErrorBody"),
              );
            }
          },
        },
      });
    },
    [userId, locale, load, showFeedback, showToast],
  );

  const handleGeneratePage = useCallback(
    async (row: SourceRow): Promise<void> => {
      if (!userId) return;
      setGeneratingId(row.id);
      try {
        const result = await generateSourcePage(userId, row.id);
        const pageName = row.title.trim().length > 0 ? row.title : result.slug.replace(/[-_]+/g, " ");
        const msg =
          locale === "ko"
            ? `${pageName} 위키 페이지를 만들었어요${result.danglingSlugs.length > 0 ? ` · 아직 연결할 참고 이름 ${result.danglingSlugs.length}개` : ""}`
            : `Created a wiki page for ${pageName}${result.danglingSlugs.length > 0 ? ` · ${result.danglingSlugs.length} reference name${result.danglingSlugs.length === 1 ? "" : "s"} still need a page` : ""}`;
        showToast(msg, "success");
        await load(userId); // reflect ingested=true
      } catch (e) {
        // Keep the raw error in logs only; show product-tone copy + retry.
        console.warn("[inbox] generateSourcePage failed", (e as Error).message);
        showFeedback(
          t("wikiError"),
          t("wikiErrorBody"),
        );
      } finally {
        setGeneratingId(null);
      }
    },
    [userId, locale, load, showFeedback, showToast],
  );

  const renderRow = useCallback(
    ({ item }: { item: SourceRow }) => (
      <InboxRow
        row={item}
        expanded={expandedId === item.id}
        body={bodyById[item.id]}
        phase1Pending={phase1Id === item.id}
        generatePending={generatingId === item.id}
        locale={locale}
        t={t}
        onPress={handleRowPress}
        onRunPhase1={handleRunPhase1}
        onViewPhase1={handleViewPhase1}
        onGeneratePage={handleGeneratePage}
        onDeleteSource={handleDeleteSource}
      />
    ),
    [
      expandedId,
      bodyById,
      phase1Id,
      generatingId,
      locale,
      t,
      handleRowPress,
      handleRunPhase1,
      handleViewPhase1,
      handleGeneratePage,
      handleDeleteSource,
    ],
  );

  if (authLoading) {
    return (
      <PremiumAppShell>
        <View style={styles.loadingCenter}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }
  // No-profile OAuth session must not reach this LLM screen (Phase-1 → Gemini)
  // before C10 age-gate + PIPA consent. (Root gate in _layout also covers this.)
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const listHeader = (
    <View style={styles.listHeader}>
      <SceneHero
        eyebrow={t("eyebrow")}
        title={t("heroTitle")}
        subtitle={t("heroSubtitle")}
        island={VILLAGE_UI.records.island}
        worker={VILLAGE_UI.records.worker}
        accent={VILLAGE_UI.records.accent}
        speech={
          locale === "ko"
            ? "캡처한 자료는 여기서 요약하거나 위키 페이지로 키울 수 있어요."
            : "Captured sources can be summarized here or promoted into wiki pages."
        }
      />

      <View style={styles.actions}>
        <Link href="/capture" asChild>
          <Button
            label={t("captureMore")}
            variant="primary"
            accessibilityHint={
              t("addSourceHint")
            }
          />
        </Link>
      </View>
    </View>
  );

  // FlatList renders this only when `data` (rows) is empty. The original
  // ScrollView swapped between loading / error / empty in exactly this order,
  // so the same precedence is preserved here.
  const listEmpty = loading ? (
    <View style={styles.center}>
      <ActivityIndicator color={semantic.brand} />
    </View>
  ) : error ? (
    <View style={styles.errorCard}>
      <Text variant="body" color="textMuted">
        {error}
      </Text>
      <TouchableOpacity activeOpacity={0.7}
        hitSlop={14}
        onPress={() => void handleRefresh()}
        style={styles.errorRetry}
        accessibilityRole="button"
        accessibilityLabel={t("retryLabel")}
      >
        <Text variant="caption" color="brand">
          {t("tryAgain")}
        </Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.emptyCard}>
      <Text variant="body" color="textMuted" style={styles.emptyText}>
        {t("empty")}
      </Text>
      <Text variant="subtle" color="textSubtle" style={{ textAlign: "center", lineHeight: 18 }}>
        {locale === "ko"
          ? "받은편지함은 캡처한 자료가 모이는 곳. 여기서 요약과 질문(요약 + 4질문)을 만들거나 위키 페이지로 발전시킬 수 있어요."
          : "Your inbox holds captured sources. Create a Source brief (summary + 4 questions) here, or promote a row to a wiki page."}
      </Text>
      <Link href="/capture" asChild>
        <TouchableOpacity activeOpacity={0.7}
          hitSlop={14}
          style={styles.emptyLink}
          accessibilityRole="link"
          accessibilityLabel={t("firstCaptureLabel")}
          accessibilityHint={
            t("firstCaptureHint")
          }
        >
          <Text variant="caption" color="brand">
            {t("firstCapture")}
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );

  return (
    <PremiumAppShell>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.scroll}
        ItemSeparatorComponent={ListSeparator}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={semantic.brand} />}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
      />
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
      <PremiumModal
        visible={feedbackModal !== null}
        onClose={() => setFeedbackModal(null)}
        accessibilityLabel={feedbackModal?.confirm ? t("feedback.confirmLabel") : t("feedback.noticeLabel")}
      >
        <Text variant="heading">{feedbackModal?.title}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {feedbackModal?.body}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={feedbackModal?.confirm ? t("feedback.cancel") : t("feedback.dismiss")}
            variant="secondary"
            onPress={() => setFeedbackModal(null)}
            style={styles.modalButton}
            accessibilityHint={t("feedback.dismissHint")}
          />
          {feedbackModal?.confirm ? (
            <Button
              label={feedbackModal.confirm.label}
              variant={feedbackModal.confirm.variant}
              onPress={runModalConfirm}
              style={styles.modalButton}
              accessibilityHint={t("feedback.confirmHint")}
            />
          ) : null}
        </View>
      </PremiumModal>
    </PremiumAppShell>
  );
}

// The old list used a wrapping View with gap: spacing.sm between rows. FlatList
// has no such gap, so this separator reproduces the exact inter-row spacing
// without putting a margin on the row itself (which would create a per-item
// style-wrapper gap that double-counts at the list edges).
function ListSeparator() {
  return <View style={styles.rowSeparator} />;
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
  scroll: { paddingBottom: spacing.xl },
  // Hero + actions block. Reproduces the old ScrollView gap (spacing.lg between
  // hero and actions, and the same gap below the block before the list/empty).
  listHeader: { gap: spacing.lg, marginBottom: spacing.lg },
  // Vertical space between rows; matches the old styles.list gap (spacing.sm).
  rowSeparator: { height: spacing.sm },
  actions: { gap: spacing.sm },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  loadingCenter: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  errorCard: { padding: spacing.md, backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, borderWidth: 1, borderColor: semantic.danger, gap: spacing.sm },
  errorRetry: {
    alignSelf: "flex-start",
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  emptyCard: {
    padding: spacing.lg,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyText: { textAlign: "center" },
  emptyLink: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  list: { gap: spacing.sm },
  row: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    shadowColor: cosmic.pixelLamp,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    ...androidElevationStyle(androidElevation.card),
  },
  rowPressed: { opacity: 0.7 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flexSpacer: { marginStart: "auto" },
  // A-6: user-authored titles follow the P2-10 font preference via <Text variant="body">.
  rowTitle: { fontWeight: "600" },
  kindChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  ingestedChip: { backgroundColor: semantic.surface, borderColor: semantic.success },
  rowActions: { marginTop: spacing.xs, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" },
  generateBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
  },
  generateBtnDisabled: { opacity: 0.62 },
  deleteBtn: { backgroundColor: "transparent" },
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

export default function Inbox() {
  if (isDeepSpaceUI()) return <DeepSpaceInboxScreen />;
  return <InboxLegacy />;
}
