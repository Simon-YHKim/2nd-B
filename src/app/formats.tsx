// /formats — manage the user-created & community-shared clipper formats that
// back the G3 flow (clipper_templates, migration 0027). Four things, exactly as
// scoped: (1) my formats list, (2) community-shared list, (3) per-format share
// toggle, (4) delete — plus a full edit form (TemplateEditor). All CRUD goes
// through src/lib/wiki/template-queries.ts; RLS does the authorization. No LLM
// calls and no schema work here, so the C-constraints are untouched. Reached
// from the /profile hub and a link on /capture. Token-only styling (DESIGN.md).

import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import {
  PremiumAppShell,
  SceneHero,
  PremiumCard,
  PremiumButton,
  PremiumEmptyState,
  PremiumLoadingState,
  PremiumErrorState,
  PremiumModal,
  PremiumToast,
} from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { PreferenceSwitch } from "@/components/ui/PreferenceToggle";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { VILLAGE_UI } from "@/lib/village-ui";
import {
  listAccessibleTemplates,
  setTemplateShared,
  deleteTemplate,
  saveTemplate,
  type CustomClipperTemplate,
} from "@/lib/wiki/template-queries";
import { partitionTemplates, type TemplateDraft } from "@/lib/wiki/template-validate";
import { CLIPPER_TEMPLATE_LIST, type ClipperTemplate } from "@/lib/wiki/clipper-templates";
import { TemplateEditor } from "@/components/wiki/TemplateEditor";
import { AddFormatFlow } from "@/components/wiki/AddFormatFlow";
import { FormatSchemaView, type FormatSchemaInput } from "@/components/wiki/FormatSchemaView";

type Locale = "en" | "ko";
type Toast = { message: string; tone: "info" | "success" | "danger" };

export default function Formats() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale: Locale = i18n.language === "ko" ? "ko" : "en";
  const kbHeight = useKeyboard();

  const [templates, setTemplates] = useState<CustomClipperTemplate[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<CustomClipperTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomClipperTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pendingShareIds, setPendingShareIds] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<FormatSchemaInput | null>(null);

  // Async-race guards: ignore results after unmount, and apply only the latest
  // load (a write bumps loadSeqRef so a stale reload can't clobber a mutation).
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  // Set true on (re)mount too, not just false on cleanup — otherwise React
  // Strict Mode's mount→unmount→mount would leave it false on the live mount
  // and every guarded setState would be skipped (screen never loads).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function flashToast(message: string, tone: Toast["tone"]) {
    setToast({ message, tone });
  }
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(h);
  }, [toast]);

  const reload = useCallback(() => {
    if (!userId) return;
    const seq = ++loadSeqRef.current;
    setLoadError(false);
    setTemplates(null);
    listAccessibleTemplates(userId)
      .then((rows) => {
        if (mountedRef.current && seq === loadSeqRef.current) setTemplates(rows);
      })
      .catch((e) => {
        if (typeof console !== "undefined") console.warn("[formats] load failed", (e as Error).message);
        if (mountedRef.current && seq === loadSeqRef.current) setLoadError(true);
      });
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  function toggleShare(t: CustomClipperTemplate, next: boolean) {
    // Ignore a second tap while this row's write is still in flight — that race
    // could otherwise let an earlier failed write's revert clobber a later one.
    if (!userId || pendingShareIds.has(t.id)) return;
    loadSeqRef.current++; // a write invalidates any in-flight reload
    setPendingShareIds((s) => new Set(s).add(t.id));
    // Optimistic: flip locally now, revert if the write fails.
    setTemplates((prev) => (prev ? prev.map((x) => (x.id === t.id ? { ...x, isShared: next } : x)) : prev));
    setTemplateShared(userId, t.id, next)
      .catch((e) => {
        if (typeof console !== "undefined") console.warn("[formats] share toggle failed", (e as Error).message);
        if (!mountedRef.current) return;
        setTemplates((prev) => (prev ? prev.map((x) => (x.id === t.id ? { ...x, isShared: !next } : x)) : prev));
        flashToast(locale === "ko" ? "공유 설정을 바꾸지 못했어요." : "Could not change sharing.", "danger");
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setPendingShareIds((s) => {
          const n = new Set(s);
          n.delete(t.id);
          return n;
        });
      });
  }

  async function confirmDeleteNow() {
    if (!userId || !confirmDelete) return;
    const target = confirmDelete;
    loadSeqRef.current++; // a stale reload must not resurrect the deleted row
    setBusyId(target.id);
    try {
      await deleteTemplate(userId, target.id);
      if (!mountedRef.current) return;
      setTemplates((prev) => (prev ? prev.filter((x) => x.id !== target.id) : prev));
      setConfirmDelete(null);
      flashToast(locale === "ko" ? "형식을 삭제했어요." : "Format deleted.", "success");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[formats] delete failed", (e as Error).message);
      if (mountedRef.current) flashToast(locale === "ko" ? "삭제하지 못했어요." : "Could not delete.", "danger");
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  }

  async function handleSaveEdit(draft: TemplateDraft) {
    if (!userId || !editing) return;
    loadSeqRef.current++;
    setSaving(true);
    try {
      const saved = await saveTemplate({
        ownerId: userId,
        slug: editing.slug, // upsert key, preserved so we update rather than duplicate
        baseKind: draft.baseKind,
        name: draft.name,
        what: draft.what,
        triggers: draft.triggers,
        defaultTags: draft.defaultTags,
        targetCategory: draft.targetCategory,
        wikiTarget: draft.wikiTarget,
        aiProperties: draft.aiProperties,
        shared: editing.isShared, // share state is owned by the list toggle
      });
      if (!mountedRef.current) return;
      // Update in place, or prepend if the upsert INSERTed (e.g. the original
      // row was deleted out-of-band) so a saved format is never dropped from view.
      setTemplates((prev) => {
        if (!prev) return [saved];
        return prev.some((x) => x.id === saved.id)
          ? prev.map((x) => (x.id === saved.id ? saved : x))
          : [saved, ...prev];
      });
      setEditing(null);
      flashToast(locale === "ko" ? "형식을 저장했어요." : "Format saved.", "success");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[formats] save failed", (e as Error).message);
      if (mountedRef.current) flashToast(locale === "ko" ? "저장하지 못했어요." : "Could not save.", "danger");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "형식을 불러오는 중이에요…" : "Loading formats…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const partition = templates ? partitionTemplates(templates, userId) : { mine: [], community: [] };

  function nameOf(t: CustomClipperTemplate): string {
    return (locale === "ko" ? t.name.ko : t.name.en) || t.name.en || t.name.ko || (locale === "ko" ? "(이름 없음)" : "(untitled)");
  }
  function whatOf(t: CustomClipperTemplate): string {
    return (locale === "ko" ? t.what.ko : t.what.en) || t.what.en || t.what.ko || "";
  }
  function metaOf(t: CustomClipperTemplate): string {
    return t.targetCategory ? `${t.baseKind} · ${t.targetCategory}` : t.baseKind;
  }
  // Normalize a format (bundled or custom) into the locale-resolved guide view.
  function schemaOfBundled(t: ClipperTemplate): FormatSchemaInput {
    return {
      name: (locale === "ko" ? t.name.ko : t.name.en) || t.name.en,
      baseKind: t.kind,
      what: (locale === "ko" ? t.what.ko : t.what.en) || t.what.en,
      targetCategory: t.targetCategoryDefault,
      defaultTags: t.defaultTags,
      triggers: t.triggers,
      aiProperties: t.aiProperties.map((p) => ({ name: p.name, type: p.type, describe: locale === "ko" ? p.describe.ko : p.describe.en })),
    };
  }
  function schemaOfCustom(t: CustomClipperTemplate): FormatSchemaInput {
    return {
      name: nameOf(t),
      baseKind: t.baseKind,
      what: whatOf(t),
      targetCategory: t.targetCategory,
      defaultTags: t.defaultTags,
      triggers: t.triggers,
      aiProperties: t.aiProperties.map((p) => ({ name: p.name, type: p.type, describe: locale === "ko" ? p.describe.ko : p.describe.en })),
    };
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) }]} keyboardShouldPersistTaps="handled">
          {editing ? (
            <TemplateEditor
              initial={editing}
              locale={locale}
              saving={saving}
              onSave={handleSaveEdit}
              onCancel={() => setEditing(null)}
            />
          ) : adding ? (
            <AddFormatFlow
              userId={userId}
              locale={locale}
              onSaved={(saved) => {
                setTemplates((prev) => (prev ? [saved, ...prev.filter((x) => x.id !== saved.id)] : [saved]));
                setAdding(false);
                flashToast(locale === "ko" ? "형식을 추가했어요." : "Format added.", "success");
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <>
              <SceneHero
                eyebrow={locale === "ko" ? "형식" : "Formats"}
                title={locale === "ko" ? "내 클리퍼 형식" : "My clipper formats"}
                subtitle={locale === "ko" ? "내가 만든 형식과 마을이 공유한 형식" : "Formats you made and ones the village shared"}
                island={VILLAGE_UI.knowledge.island}
                worker={VILLAGE_UI.knowledge.worker}
                accent={VILLAGE_UI.knowledge.accent}
                speech={
                  locale === "ko"
                    ? "형식을 다듬으면 다음 자료부터 더 잘 정리돼요."
                    : "Tune a format and the next pieces file themselves better."
                }
              />

              <PremiumButton
                label={locale === "ko" ? "형식 추가" : "Add format"}
                variant="primary"
                onPress={() => setAdding(true)}
                full
              />

              {/* Built-in default formats (the bundled 8). Always available and
                  read-only — they back the classifier, so they show even before
                  any DB-stored custom format exists (and even if the load fails). */}
              <View style={styles.sectionHead}>
                <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                  {locale === "ko" ? `기본 형식 (${CLIPPER_TEMPLATE_LIST.length})` : `Built-in formats (${CLIPPER_TEMPLATE_LIST.length})`}
                </Text>
              </View>
              {CLIPPER_TEMPLATE_LIST.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setViewing(schemaOfBundled(t))}
                  accessibilityRole="button"
                  accessibilityLabel={`${(locale === "ko" ? t.name.ko : t.name.en) || t.name.en} ${locale === "ko" ? "분류 기준 보기" : "view filing guide"}`}
                >
                  <PremiumCard
                    accent={semantic.brand}
                    eyebrow={t.targetCategoryDefault ? `${t.kind} · ${t.targetCategoryDefault}` : t.kind}
                    title={(locale === "ko" ? t.name.ko : t.name.en) || t.name.en}
                  >
                    <Text variant="subtle" color="textMuted">
                      {locale === "ko" ? t.what.ko : t.what.en}
                    </Text>
                    <Text variant="subtle" color="brand" style={styles.shareNote}>
                      {locale === "ko" ? "눌러서 분류 기준 보기 ›" : "Tap to view filing guide ›"}
                    </Text>
                  </PremiumCard>
                </Pressable>
              ))}

              {templates === null && !loadError ? (
                <PremiumLoadingState message={locale === "ko" ? "불러오는 중이에요…" : "Loading…"} />
              ) : loadError ? (
                <PremiumErrorState
                  title={locale === "ko" ? "형식을 불러오지 못했어요" : "Couldn't load your formats"}
                  body={locale === "ko" ? "연결을 확인하고 다시 시도해 주세요." : "Check your connection and try again."}
                  onRetry={reload}
                  retryLabel={locale === "ko" ? "다시 시도" : "Try again"}
                />
              ) : (
                <>
                  {/* Section 1 — my formats */}
                  <View style={styles.sectionHead}>
                    <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                      {locale === "ko" ? `내 형식${partition.mine.length ? ` (${partition.mine.length})` : ""}` : `My formats${partition.mine.length ? ` (${partition.mine.length})` : ""}`}
                    </Text>
                  </View>

                  {partition.mine.length === 0 ? (
                    <PremiumEmptyState
                      title={locale === "ko" ? "아직 만든 형식이 없어요" : "No formats yet"}
                      body={
                        locale === "ko"
                          ? "캡처 중 새 형식을 제안받아 저장하면 여기에 모여요."
                          : "Save an AI-proposed format while capturing and it lands here."
                      }
                      action={
                        <PremiumButton
                          label={locale === "ko" ? "담으러 가기" : "Go capture"}
                          variant="secondary"
                          onPress={() => router.push("/capture")}
                          full
                        />
                      }
                    />
                  ) : (
                    partition.mine.map((t) => (
                      <PremiumCard
                        key={t.id}
                        accent={VILLAGE_UI.knowledge.accent}
                        eyebrow={metaOf(t)}
                        title={nameOf(t)}
                        right={
                          <PreferenceSwitch
                            value={t.isShared}
                            onValueChange={(next) => toggleShare(t, next)}
                            disabled={pendingShareIds.has(t.id)}
                            accessibilityLabel={`${nameOf(t)} ${locale === "ko" ? "공유" : "share"}`}
                          />
                        }
                      >
                        {whatOf(t) ? (
                          <Text variant="subtle" color="textMuted">{whatOf(t)}</Text>
                        ) : null}
                        <Text variant="subtle" color={t.isShared ? "brand" : "textSubtle"} style={styles.shareNote}>
                          {t.isShared
                            ? locale === "ko" ? "마을에 공유됨" : "Shared with the village"
                            : locale === "ko" ? "나만 보기" : "Private to you"}
                        </Text>
                        <View style={styles.cardActions}>
                          <Pressable
                            onPress={() => setViewing(schemaOfCustom(t))}
                            style={styles.deleteLink}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`${nameOf(t)} ${locale === "ko" ? "분류 기준 보기" : "view filing guide"}`}
                          >
                            <Text variant="subtle" color="brand">{locale === "ko" ? "기준" : "Guide"}</Text>
                          </Pressable>
                          <PremiumButton
                            label={locale === "ko" ? "편집" : "Edit"}
                            variant="secondary"
                            onPress={() => setEditing(t)}
                            style={styles.editAction}
                          />
                          <Pressable
                            onPress={() => setConfirmDelete(t)}
                            style={styles.deleteLink}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`${nameOf(t)} ${locale === "ko" ? "삭제" : "delete"}`}
                          >
                            <Text variant="subtle" color="textMuted">{locale === "ko" ? "삭제" : "Delete"}</Text>
                          </Pressable>
                        </View>
                      </PremiumCard>
                    ))
                  )}

                  {/* Section 2 — community-shared formats (read-only) */}
                  <View style={styles.sectionHead}>
                    <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                      {locale === "ko" ? `마을 공유 형식${partition.community.length ? ` (${partition.community.length})` : ""}` : `Community formats${partition.community.length ? ` (${partition.community.length})` : ""}`}
                    </Text>
                  </View>

                  {partition.community.length === 0 ? (
                    <Text variant="subtle" color="textSubtle" style={styles.communityEmpty}>
                      {locale === "ko"
                        ? "아직 마을에 공유된 형식이 없어요. 누군가 형식을 공유하면 여기 나타나요."
                        : "No shared formats yet. When someone shares one, it shows up here."}
                    </Text>
                  ) : (
                    partition.community.map((t) => (
                      <Pressable
                        key={t.id}
                        onPress={() => setViewing(schemaOfCustom(t))}
                        accessibilityRole="button"
                        accessibilityLabel={`${nameOf(t)} ${locale === "ko" ? "분류 기준 보기" : "view filing guide"}`}
                      >
                        <PremiumCard accent={semantic.info} eyebrow={metaOf(t)} title={nameOf(t)}>
                          {whatOf(t) ? <Text variant="subtle" color="textMuted">{whatOf(t)}</Text> : null}
                          <Text variant="subtle" color="brand" style={styles.shareNote}>
                            {locale === "ko" ? "눌러서 분류 기준 보기 ›" : "Tap to view filing guide ›"}
                          </Text>
                        </PremiumCard>
                      </Pressable>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete confirm — themed modal (RN Alert two-button dialogs don't render
          on the web export). The irreversibility lives in its own sentence. */}
      <PremiumModal
        visible={!!confirmDelete}
        onClose={() => (busyId ? undefined : setConfirmDelete(null))}
        accessibilityLabel={locale === "ko" ? "형식 삭제 확인" : "Delete format confirmation"}
      >
        <Text variant="heading" style={{ fontSize: 18 }}>
          {locale === "ko" ? "이 형식을 삭제할까요?" : "Delete this format?"}
        </Text>
        <Text variant="body" color="textMuted">
          {confirmDelete ? nameOf(confirmDelete) : ""}
        </Text>
        <Text variant="subtle" color="textSubtle">
          {locale === "ko" ? "삭제하면 되돌릴 수 없어요." : "This can't be undone."}
        </Text>
        <View style={styles.modalActions}>
          <PremiumButton
            label={locale === "ko" ? "취소" : "Cancel"}
            variant="ghost"
            disabled={!!busyId}
            onPress={() => setConfirmDelete(null)}
            full
          />
          <PremiumButton
            label={locale === "ko" ? "삭제" : "Delete"}
            variant="danger"
            loading={!!busyId}
            onPress={confirmDeleteNow}
            full
          />
        </View>
      </PremiumModal>

      {/* Item 1a: tap a format to see how it classifies (read-only guide). */}
      <PremiumModal
        visible={!!viewing}
        onClose={() => setViewing(null)}
        accessibilityLabel={locale === "ko" ? "분류 기준 보기" : "View filing guide"}
      >
        <Text variant="caption" color="brand" style={styles.sectionEyebrow}>
          {locale === "ko" ? "분류 기준" : "Filing guide"}
        </Text>
        {viewing ? <FormatSchemaView schema={viewing} locale={locale} /> : null}
        <View style={styles.modalActions}>
          <PremiumButton
            label={locale === "ko" ? "닫기" : "Close"}
            variant="secondary"
            onPress={() => setViewing(null)}
            full
          />
        </View>
      </PremiumModal>

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  sectionHead: { marginTop: spacing.sm },
  sectionEyebrow: { letterSpacing: 0, fontWeight: "700" },
  shareNote: { marginTop: spacing.xs },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  editAction: { flexGrow: 1, flexShrink: 1, minWidth: 120 },
  deleteLink: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  communityEmpty: { lineHeight: 20 },
  modalActions: { gap: spacing.sm, marginTop: spacing.xs },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});
