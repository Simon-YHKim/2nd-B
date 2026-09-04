// /formats — manage the user-created & community-shared clipper formats that
// back the G3 flow (clipper_templates, migration 0027). Four things, exactly as
// scoped: (1) my formats list, (2) community-shared list, (3) per-format share
// toggle, (4) delete — plus a full edit form (TemplateEditor). All CRUD goes
// through src/lib/wiki/template-queries.ts; RLS does the authorization. No LLM
// calls and no schema work here, so the C-constraints are untouched. Reached
// from the /profile hub and a link on /capture. Token-only styling (DESIGN.md).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import {
  PremiumAppShell,
  SceneHero,
  PremiumCard,
  PremiumButton,
  PremiumEmptyState,
  PremiumLoadingState,
  PremiumErrorState,
  PremiumModal,
  PremiumBottomSheet,
  PremiumToast,
} from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { PreferenceSwitch } from "@/components/ui/PreferenceToggle";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
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
import { REPORT_REASONS, type ReportReason } from "@/lib/wiki/moderation";
import {
  reportTemplate,
  blockOwner,
  unblockAllOwners,
  listBlockedOwnerIds,
} from "@/lib/wiki/moderation-queries";
import { CLIPPER_TEMPLATE_LIST, type ClipperTemplate } from "@/lib/wiki/clipper-templates";
import { TemplateEditor } from "@/components/wiki/TemplateEditor";
import { AddFormatFlow } from "@/components/wiki/AddFormatFlow";
import { FormatSchemaView, type FormatSchemaInput } from "@/components/wiki/FormatSchemaView";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceFormatsScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

type Locale = "en" | "ko";
type Toast = { message: string; tone: "info" | "success" | "danger" };

function FormatsLegacy() {
  const { i18n, t: tf } = useTranslation("formats");
  const { userId, loading } = useAuth();
  const locale: Locale = i18n.language === "ko" ? "ko" : "en";
  const kbHeight = useKeyboard();
  const { height: windowHeight } = useWindowDimensions();

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
  // Play UGC moderation (migration 0097). `moderating` is the community row the
  // sheet is open for; `blockedIds` only drives the unblock control and the
  // optimistic hide, since the clipper_templates read policy already filters.
  const [moderating, setModerating] = useState<CustomClipperTemplate | null>(null);
  const [modBusy, setModBusy] = useState(false);
  const [blockedIds, setBlockedIds] = useState<ReadonlySet<string>>(new Set());

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
    // Blocks are a side channel: the list above is already filtered server-side,
    // so a failure here costs the unblock control, never the screen.
    listBlockedOwnerIds(userId)
      .then((ids) => {
        if (mountedRef.current && seq === loadSeqRef.current) setBlockedIds(new Set(ids));
      })
      .catch((e) => {
        if (typeof console !== "undefined") console.warn("[formats] blocks load failed", (e as Error).message);
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
        flashToast(tf("toast.shareFailed"), "danger");
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

  // Play UGC moderation. Both writes drop the row optimistically because the
  // clipper_templates read policy (0097) hides anything this user reported and
  // every format by an author they blocked, so the optimistic list matches what
  // the next load returns. A failure reverts by reloading rather than by
  // guessing, since the server is the authority on what is still visible.
  // Apply an optimistic removal, or re-fetch if the list is not on screen.
  // The moderation sheet outlives the list (liftAllBlocks reloads underneath
  // it), and these handlers bump loadSeqRef before they know that, which
  // invalidates the in-flight reload. Without this branch the screen would sit
  // on a loading spinner forever, with no retry affordance.
  function dropFromList(keep: (t: CustomClipperTemplate) => boolean) {
    if (templates === null) {
      reload();
      return;
    }
    setTemplates((prev) => (prev ? prev.filter(keep) : prev));
  }

  async function submitReport(reason: ReportReason) {
    if (!userId || !moderating || modBusy) return;
    const target = moderating;
    loadSeqRef.current++; // a write invalidates any in-flight reload
    setModBusy(true);
    try {
      await reportTemplate(userId, target.id, reason);
      if (!mountedRef.current) return;
      dropFromList((x) => x.id !== target.id);
      setModerating(null);
      flashToast(tf("toast.reportSuccess"), "success");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[formats] report failed", (e as Error).message);
      if (!mountedRef.current) return;
      // Close on failure too: the sheet is bottom-anchored and the toast paints
      // over its own footer, so leaving it open hides the explanation.
      setModerating(null);
      if (templates === null) reload();
      flashToast(tf("toast.reportFailed"), "danger");
    } finally {
      if (mountedRef.current) setModBusy(false);
    }
  }

  async function submitBlock() {
    if (!userId || !moderating || modBusy) return;
    const ownerId = moderating.ownerId;
    loadSeqRef.current++;
    setModBusy(true);
    try {
      await blockOwner(userId, ownerId);
      if (!mountedRef.current) return;
      // Every shared format by that author goes, not just the one tapped.
      dropFromList((x) => x.ownerId !== ownerId);
      setBlockedIds((s) => new Set(s).add(ownerId));
      setModerating(null);
      flashToast(tf("toast.blockSuccess"), "success");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[formats] block failed", (e as Error).message);
      if (!mountedRef.current) return;
      setModerating(null);
      if (templates === null) reload();
      flashToast(tf("toast.blockFailed"), "danger");
    } finally {
      if (mountedRef.current) setModBusy(false);
    }
  }

  async function liftAllBlocks() {
    if (!userId || modBusy) return;
    setModBusy(true);
    try {
      await unblockAllOwners(userId);
      if (!mountedRef.current) return;
      setBlockedIds(new Set());
      flashToast(tf("toast.unblockSuccess"), "success");
      // Close the sheet first: reload() unmounts the list under it, and a write
      // from a sheet floating over a torn-down list is the race dropFromList
      // exists to catch. Closing removes the race instead of surviving it.
      setModerating(null);
      reload(); // the un-hidden formats only come back from the server
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[formats] unblock failed", (e as Error).message);
      if (mountedRef.current) flashToast(tf("toast.unblockFailed"), "danger");
    } finally {
      if (mountedRef.current) setModBusy(false);
    }
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
      flashToast(tf("toast.deleteSuccess"), "success");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[formats] delete failed", (e as Error).message);
      if (mountedRef.current) flashToast(tf("toast.deleteFailed"), "danger");
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
      flashToast(tf("toast.saveSuccess"), "success");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[formats] save failed", (e as Error).message);
      if (mountedRef.current) flashToast(tf("toast.saveFailed"), "danger");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={tf("loading.formats")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const partition = templates ? partitionTemplates(templates, userId) : { mine: [], community: [] };

  function nameOf(t: CustomClipperTemplate): string {
    return (locale === "ko" ? t.name.ko : t.name.en) || t.name.en || t.name.ko || tf("labels.untitled");
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
                flashToast(tf("toast.addSuccess"), "success");
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <>
              <SceneHero
                eyebrow={tf("hero.eyebrow")}
                title={tf("hero.title")}
                subtitle={tf("hero.subtitle")}
                island={VILLAGE_UI.knowledge.island}
                worker={VILLAGE_UI.knowledge.worker}
                accent={VILLAGE_UI.knowledge.accent}
                speech={tf("hero.speech")}
              />

              <PremiumButton
                label={tf("actions.addFormat")}
                variant="primary"
                onPress={() => setAdding(true)}
                full
              />

              {/* Built-in default formats (the bundled 8). Always available and
                  read-only — they back the classifier, so they show even before
                  any DB-stored custom format exists (and even if the load fails). */}
              <View style={styles.sectionHead}>
                <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                  {tf("builtIn.headingWithCount", { count: CLIPPER_TEMPLATE_LIST.length })}
                </Text>
              </View>
              {CLIPPER_TEMPLATE_LIST.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setViewing(schemaOfBundled(t))}
                  accessibilityRole="button"
                  accessibilityLabel={`${(locale === "ko" ? t.name.ko : t.name.en) || t.name.en} ${tf("labels.viewGuide")}`}
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
                      {tf("labels.tapViewGuide")}
                    </Text>
                  </PremiumCard>
                </Pressable>
              ))}

              {templates === null && !loadError ? (
                <PremiumLoadingState message={tf("loading.generic")} />
              ) : loadError ? (
                <PremiumErrorState
                  title={tf("error.loadTitle")}
                  body={tf("error.loadBody")}
                  onRetry={reload}
                  retryLabel={tf("error.retry")}
                />
              ) : (
                <>
                  {/* Section 1 — my formats */}
                  <View style={styles.sectionHead}>
                    <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                      {partition.mine.length ? tf("mine.headingWithCount", { count: partition.mine.length }) : tf("mine.heading")}
                    </Text>
                  </View>

                  {partition.mine.length === 0 ? (
                    <PremiumEmptyState
                      title={tf("mine.emptyTitle")}
                      body={tf("mine.emptyBody")}
                      action={
                        <PremiumButton
                          label={tf("actions.goCapture")}
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
                            accessibilityLabel={`${nameOf(t)} ${tf("labels.share")}`}
                          />
                        }
                      >
                        {whatOf(t) ? (
                          <Text variant="subtle" color="textMuted">{whatOf(t)}</Text>
                        ) : null}
                        <Text variant="subtle" color={t.isShared ? "brand" : "textSubtle"} style={styles.shareNote}>
                          {t.isShared ? tf("mine.shared") : tf("mine.private")}
                        </Text>
                        <View style={styles.cardActions}>
                          <Pressable
                            onPress={() => setViewing(schemaOfCustom(t))}
                            style={styles.deleteLink}
                            hitSlop={14}
                            accessibilityRole="button"
                            accessibilityLabel={`${nameOf(t)} ${tf("labels.viewGuide")}`}
                          >
                            <Text variant="subtle" color="brand">{tf("labels.guide")}</Text>
                          </Pressable>
                          <PremiumButton
                            label={tf("actions.edit")}
                            variant="secondary"
                            onPress={() => setEditing(t)}
                            style={styles.editAction}
                          />
                          <Pressable
                            onPress={() => setConfirmDelete(t)}
                            style={styles.deleteLink}
                            hitSlop={14}
                            accessibilityRole="button"
                            accessibilityLabel={`${nameOf(t)} ${tf("labels.delete")}`}
                          >
                            <Text variant="subtle" color="textMuted">{tf("actions.delete")}</Text>
                          </Pressable>
                        </View>
                      </PremiumCard>
                    ))
                  )}

                  {/* Section 2 — community-shared formats (read-only) */}
                  <View style={styles.sectionHead}>
                    <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                      {partition.community.length
                        ? tf("community.headingWithCount", { count: partition.community.length })
                        : tf("community.heading")}
                    </Text>
                  </View>

                  {/* Blocking is reversible from here. There is no author identity
                      anywhere in the app, so a per-author list would be a column
                      of meaningless ids; one control is the honest surface. */}
                  {blockedIds.size > 0 ? (
                    <View style={styles.blockedRow}>
                      <Text variant="subtle" color="textSubtle">
                        {tf("community.blockedCount", { count: blockedIds.size })}
                      </Text>
                      <Pressable
                        onPress={() => void liftAllBlocks()}
                        disabled={modBusy}
                        style={styles.deleteLink}
                        hitSlop={14}
                        accessibilityRole="button"
                        accessibilityLabel={tf("community.unblockAll")}
                        accessibilityState={{ disabled: modBusy, busy: modBusy }}
                      >
                        <Text variant="subtle" color="brand">{tf("community.unblockAll")}</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {partition.community.length === 0 ? (
                    <Text variant="subtle" color="textSubtle" style={styles.communityEmpty}>
                      {tf("community.empty")}
                    </Text>
                  ) : (
                    partition.community.map((t) => (
                      // The card used to be one big Pressable. Nesting the
                      // moderation action inside it collapsed the whole card
                      // into a single accessibility element (and on the web
                      // export, one role="button" inside another is
                      // children-presentational), so a screen reader could
                      // never reach report/block. Discrete links instead, the
                      // same shape the my-formats card above already uses.
                      <PremiumCard key={t.id} accent={semantic.info} eyebrow={metaOf(t)} title={nameOf(t)}>
                        {whatOf(t) ? <Text variant="subtle" color="textMuted">{whatOf(t)}</Text> : null}
                        <View style={styles.cardActions}>
                          <Pressable
                            onPress={() => setViewing(schemaOfCustom(t))}
                            style={styles.deleteLink}
                            hitSlop={14}
                            accessibilityRole="button"
                            accessibilityLabel={`${nameOf(t)} ${tf("labels.viewGuide")}`}
                          >
                            <Text variant="subtle" color="brand">{tf("labels.guide")}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setModerating(t)}
                            style={styles.deleteLink}
                            hitSlop={14}
                            accessibilityRole="button"
                            accessibilityLabel={`${nameOf(t)} ${tf("moderation.action")}`}
                          >
                            <Text variant="subtle" color="textMuted">{tf("moderation.action")}</Text>
                          </Pressable>
                        </View>
                      </PremiumCard>
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
        accessibilityLabel={tf("deleteModal.label")}
      >
        <Text variant="heading" style={{ fontSize: typography.sizes.lg }}>
          {tf("deleteModal.title")}
        </Text>
        <Text variant="body" color="textMuted">
          {confirmDelete ? nameOf(confirmDelete) : ""}
        </Text>
        <Text variant="subtle" color="textSubtle">
          {tf("deleteModal.body")}
        </Text>
        <View style={styles.modalActions}>
          <PremiumButton
            label={tf("actions.cancel")}
            variant="ghost"
            disabled={!!busyId}
            onPress={() => setConfirmDelete(null)}
            full
          />
          <PremiumButton
            label={tf("actions.delete")}
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
        accessibilityLabel={tf("guideModal.label")}
      >
        <Text variant="caption" color="brand" style={styles.sectionEyebrow}>
          {tf("guideModal.eyebrow")}
        </Text>
        {viewing ? <FormatSchemaView schema={viewing} locale={locale} /> : null}
        <View style={styles.modalActions}>
          <PremiumButton
            label={tf("actions.close")}
            variant="secondary"
            onPress={() => setViewing(null)}
            full
          />
        </View>
      </PremiumModal>

      {/* Play UGC policy: report + block for community-shared formats. A sheet
          rather than a modal, per the O-7 touch rule (a tap simplifies; it does
          not stack an overlay on the thing that was tapped). Reasons are a fixed
          list, never free text, so this never becomes its own moderation
          surface (0064 decision #6). */}
      <PremiumBottomSheet
        visible={!!moderating}
        onClose={() => (modBusy ? undefined : setModerating(null))}
        accessibilityLabel={tf("moderation.sheetLabel")}
      >
        {/* PremiumBottomSheet sets no maxHeight and anchors to the bottom, so
            tall content would grow off the TOP of the screen unreachable. Bound
            it here rather than in the shared primitive: at a large OS text
            scale five reasons plus two buttons outgrow a short phone. */}
        <ScrollView
          style={{ maxHeight: windowHeight * 0.6 }}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="heading" style={{ fontSize: typography.sizes.lg }}>
            {tf("moderation.title")}
          </Text>
          <Text variant="body" color="textMuted">
            {moderating ? nameOf(moderating) : ""}
          </Text>
          <Text variant="subtle" color="textSubtle">
            {tf("moderation.body")}
          </Text>

          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {tf("moderation.reportHeading")}
          </Text>
          {REPORT_REASONS.map((reason) => (
            <Pressable
              key={reason}
              onPress={() => void submitReport(reason)}
              disabled={modBusy}
              style={styles.reasonRow}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tf(`moderation.reasons.${reason}`)}
              accessibilityState={{ disabled: modBusy, busy: modBusy }}
            >
              <Text variant="body" color="text">
                {tf(`moderation.reasons.${reason}`)}
              </Text>
            </Pressable>
          ))}

          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {tf("moderation.blockHeading")}
          </Text>
          <Text variant="subtle" color="textSubtle">
            {tf("moderation.blockBody")}
          </Text>
          <View style={styles.modalActions}>
            <PremiumButton
              label={tf("moderation.block")}
              variant="danger"
              loading={modBusy}
              onPress={() => void submitBlock()}
              full
            />
            <PremiumButton
              label={tf("actions.cancel")}
              variant="ghost"
              disabled={modBusy}
              onPress={() => setModerating(null)}
              full
            />
          </View>
        </ScrollView>
      </PremiumBottomSheet>

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
  blockedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sheetContent: { gap: spacing.sm },
  reasonRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  modalActions: { gap: spacing.sm, marginTop: spacing.xs },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});

export default function Formats() {
  // med#11 은 이 라우트의 딥스페이스 기본을 EXPORT 화면으로 두고 클리퍼 형식 관리를
  // `?view=manager` 뒤로 밀어냈다. 2026-09-04 감사에서 그 기본값만 홀로 어긋나 있는
  // 것이 확인돼 뒤집는다 — 이름표·캐논·개발자 대장·실제 진입점이 전부 "관리"를 가리킨다:
  //   · 캐논 screens.json 은 이 라우트를 `component: null, appOnly: true,
  //     title: "클리퍼 형식 관리"` 로 적는다 (내보내기 화면은 캐논 컴포넌트가 없다).
  //   · 앱 안에서 여기로 오는 진입점은 둘뿐이고 **둘 다** ?view=manager 를 달고 있다
  //     (capture.tsx 의 담기 2차 탭과 인라인 '형식 관리' 링크). 파라미터 없이 들어오는
  //     앱 내 경로는 0건이라, 기본을 뒤집어도 앱 안에서 깨지는 동선이 없다.
  //   · 기본이 dock 없는 PremiumAppShell(FormatsLegacy)이 되면서 이 라우트는
  //     DEEP_SPACE_DOCK_PATHS 에서 빠졌다 — 그 전에는 dock 도 back 칩도 없었다.
  // 내보내기 화면은 **지우지 않고** ?view=export 뒤에 살려 둔다. 최종 거처(/account
  // 의 export-account 옆인지 /data 인지)는 아직 열린 결정이고, 지금 지우면 그 결정을
  // 대신 내려버린다. ?view=manager 는 무동작 별칭으로 남아 저장된 링크가 계속 통한다.
  const { view } = useLocalSearchParams<{ view?: string }>();
  if (view === "export" && isDeepSpaceUI()) return <DeepSpaceFormatsScreen />;
  return <FormatsLegacy />;
}
