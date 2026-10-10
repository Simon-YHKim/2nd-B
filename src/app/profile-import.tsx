import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { PhoneFlatList as FlatList, PhoneScrollView as ScrollView, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip } from "@/components/m3";
import { Text } from "@/components/ui/Text";
import { ScreenModal } from "@/components/ui/ScreenModal";
import { PremiumLoadingState } from "@/components/premium";
import { ContextReviewCard, ImportCheck, ProfileChangeReview, useImportStyles } from "@/components/profile-import/parts";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAppRouter, useHardwareBack, useScreenParams } from "@/lib/nav/phone-embed";
import { KeyboardAvoidingArea, useKeyboard } from "@/lib/ui/keyboard";
import { pickTextFile } from "@/lib/import/file-read";
import { buildProfileContextPrompt } from "@/lib/import/profile-context-prompt";
import {
  parseProfileContext, selectedProfileContext, selectAllContext, ProfileContextError, PROFILE_CONTEXT_MAX_BYTES,
  PROFILE_CONTEXT_CATEGORIES, type ProfileContext, type ReviewedContext, type ContextCategory,
} from "@/lib/import/profile-context";
import {
  applyProfileContextImport, fetchProfileImportSnapshot, listProfileContextImports, withdrawProfileContextImport,
  type ProfileImportBatch, type ProfileImportRequest, type ProfileImportSnapshot, type ProfileImportCursor,
} from "@/lib/supabase/profile-context-import";
import { type ProfileDetails } from "@/lib/persona/profile-details";
import { invalidateProfileStarLevel } from "@/lib/persona/load-profile-star";

type Stage = "prepare" | "input" | "review" | "confirm" | "done" | "history";
export default function ProfileImportScreen() {
  const { userId, loading, isMinor } = useAuth();
  if (loading) return <PremiumLoadingState />;
  if (!userId) return <Redirect href="/sign-in" />;
  // Changing accounts destroys the old draft, pending receipt and all async UI state.
  return <ProfileImportFlow key={userId} userId={userId} adult={isMinor === false} />;
}

function ProfileImportFlow({ userId, adult }: { userId: string; adult: boolean }) {
  const s = useImportStyles();
  const router = useAppRouter(); const { mode } = useScreenParams<{ mode?: string }>();
  const { t, i18n } = useTranslation("profile"); const keyboard = useKeyboard();
  const [stage, setStage] = useState<Stage>(mode === "history" ? "history" : "prepare");
  const [raw, setRaw] = useState(""); const [document, setDocument] = useState<ProfileContext | null>(null);
  const [review, setReview] = useState<ReviewedContext>({}); const [filter, setFilter] = useState<ContextCategory | "all">("all");
  const [snapshot, setSnapshot] = useState<ProfileImportSnapshot | null>(null); const [patch, setPatch] = useState<ProfileDetails>({});
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ProfileImportBatch | null>(null); const [history, setHistory] = useState<ProfileImportBatch[]>([]);
  const [hasMore, setHasMore] = useState(false); const [historyLoaded, setHistoryLoaded] = useState(false);
  const [dialog, setDialog] = useState<"discard" | ProfileImportBatch | null>(null);
  const pending = useRef<ProfileImportRequest | null>(null); const live = useRef(true); const working = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const selectedCount = Object.values(review).filter((v) => v.selected).length;
  const move = (next: Stage) => { setError(null); setNotice(null); setStage(next); };
  const exit = useCallback(() => {
    if (router.canGoBack()) router.back(); else router.replace("/me/profile");
  }, [router]);
  const back = useCallback(() => {
    if (working.current) return;
    if (dialog) { setDialog(null); return; }
    if (stage === "review") { setStage("input"); setError(null); return; }
    if (stage === "confirm" && !pending.current) { setStage("review"); setError(null); return; }
    if (raw || document || pending.current) { setDialog("discard"); return; }
    exit();
  }, [dialog, stage, raw, document, exit]);
  useHardwareBack(useCallback(() => { back(); return true; }, [back]));
  const begin = () => { if (working.current) return false; working.current = true; setBusy(true); setError(null); return true; };
  const end = () => { working.current = false; if (live.current) setBusy(false); };
  const reset = () => {
    setRaw(""); setDocument(null); setReview({}); setPatch({}); setConsent(false); setSnapshot(null);
    setReceipt(null); pending.current = null; setFilter("all"); move("prepare");
  };
  const parse = (text: string) => {
    setError(null);
    try {
      const next = parseProfileContext(text);
      if (!next.items.length) { setError(t("contextImport.empty")); return; }
      setDocument(next); setReview(Object.fromEntries(next.items.map((item) => [item.id, { selected: false, confirmed: false, statement: item.statement }])));
      setPatch({}); setSnapshot(null); setConsent(false); pending.current = null; setFilter("all"); move("review");
    } catch (e) {
      const key = e instanceof ProfileContextError ? { size: "invalidSize", syntax: "invalidSyntax", contract: "invalidContract", references: "invalidReferences", selection: "invalidContract" }[e.code] : "invalidSyntax";
      setError(t(`contextImport.${key}`));
    }
  };
  const pick = async () => {
    if (!begin()) return;
    try { const file = await pickTextFile({ maxBytes: PROFILE_CONTEXT_MAX_BYTES }); if (file && live.current) { setRaw(file.text); parse(file.text); } }
    catch { if (live.current) setError(t("contextImport.invalidSize")); } finally { end(); }
  };
  const copy = async () => {
    try { await Clipboard.setStringAsync(buildProfileContextPrompt(i18n.language)); if (live.current) setNotice(t("contextImport.copied")); }
    catch { if (live.current) setError(t("contextImport.copyFailed")); }
  };
  const confirm = async () => {
    if (!document || !begin()) return;
    try {
      selectedProfileContext(document, review);
      const current = await fetchProfileImportSnapshot(userId);
      if (live.current) { setSnapshot(current); setPatch({}); move("confirm"); }
    } catch { if (live.current) setError(t("contextImport.failed")); } finally { end(); }
  };
  const save = async () => {
    if (!document || !snapshot || !consent || !begin()) return;
    try {
      if (!pending.current) {
        const selected = selectedProfileContext(document, review);
        const profilePatch = Object.fromEntries(Object.entries(patch).filter(([key, value]) => value?.trim() && value.trim() !== snapshot.details[key as keyof ProfileDetails]).map(([key, value]) => [key, value?.trim()]));
        pending.current = { requestId: Crypto.randomUUID(), document: selected.document, confirmedIds: selected.confirmedIds, profilePatch, expectedRevision: snapshot.revision };
      }
      const saved = await applyProfileContextImport(userId, pending.current);
      if (!live.current) return;
      invalidateProfileStarLevel(userId); setReceipt(saved); setRaw(""); setDocument(null); setReview({}); setPatch({}); pending.current = null;
      move("done");
    } catch (e) {
      if (!live.current) return;
      const message = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      if (message.includes("profile_conflict")) {
        pending.current = null; setSnapshot(null); setPatch({}); setConsent(false); setStage("review"); setError(t("contextImport.profileConflict"));
      } else { setError(t("contextImport.failed")); }
    } finally { end(); }
  };
  const loadHistory = useCallback(async (before?: ProfileImportCursor) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null);
    try {
      const rows = await listProfileContextImports(userId, before);
      if (live.current) { setHistory((prior) => before ? [...prior, ...rows] : rows); setHasMore(rows.length === 30); setHistoryLoaded(true); }
    } catch { if (live.current) setError(t("contextImport.historyError")); }
    finally { working.current = false; if (live.current) setBusy(false); }
  }, [userId, t]);
  useEffect(() => { if (stage === "history") void loadHistory(); }, [stage, loadHistory]);
  const withdraw = async (batch: ProfileImportBatch) => {
    if (!begin()) return;
    try {
      const removed = await withdrawProfileContextImport(userId, batch.id);
      if (live.current) {
        setHistory((rows) => rows.map((row) => row.id === removed.id ? removed : row)); setDialog(null);
        invalidateProfileStarLevel(userId); setNotice(t(removed.profile_restored === false && batch.profile_change_count > 0 ? "contextImport.withdrawalKeptProfile" : "contextImport.withdrawn"));
      }
    } catch { if (live.current) { setDialog(null); setError(t("contextImport.withdrawalFailed")); } } finally { end(); }
  };
  const feedback = <>{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}{notice ? <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text> : null}</>;
  const footerPad = { paddingBottom: 28 + keyboard };

  return <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t(stage === "history" ? "contextImport.history" : "contextImport.title")} onBack={back}>
    <KeyboardAvoidingArea style={s.flex}>
      {stage === "review" && document ? <FlatList data={document.items.filter((item) => filter === "all" || item.category === filter)}
        keyExtractor={(item) => item.id} contentContainerStyle={[s.body, footerPad]} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={s.stack}>
          <Text accessibilityRole="header" style={s.heading}>{t("contextImport.reviewTitle")}</Text>
          <Text style={s.small}>{t("contextImport.sourceReported")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
            <MdChip kind="filter" label={t("contextImport.allCategories")} selected={filter === "all"} onPress={() => setFilter("all")} />
            {PROFILE_CONTEXT_CATEGORIES.filter((category) => document.items.some((item) => item.category === category)).map((category) => <MdChip key={category} kind="filter" label={t(`contextImport.category.${category}`)} selected={filter === category} onPress={() => setFilter(category)} />)}
          </ScrollView>
          <View style={s.row}><Text accessibilityLiveRegion="polite" style={s.text}>{t("contextImport.selected", { count: selectedCount })}</Text>
            <MdButton variant="text" label={t("contextImport.selectAll")} onPress={() => setReview(selectAllContext(document, review, true))} />
            <MdButton variant="text" label={t("contextImport.clearAll")} onPress={() => setReview(selectAllContext(document, review, false))} />
          </View><Text style={s.small}>{t("contextImport.selectionScope")}</Text>{feedback}
        </View>}
        renderItem={({ item }) => <ContextReviewCard item={item} sources={document.sources.filter((source) => item.evidence_ids.includes(source.id))} value={review[item.id]}
          onChange={(value) => setReview((previous) => ({ ...previous, [item.id]: value }))} />}
        ListFooterComponent={<MdButton label={t("contextImport.confirmSelection")} disabled={!selectedCount || busy || Object.values(review).some((value) => value.selected && !value.statement.trim())} loading={busy} onPress={() => void confirm()} />}
      /> : stage === "history" ? <FlatList data={history} keyExtractor={(batch) => batch.id} contentContainerStyle={[s.body, footerPad]}
        ListHeaderComponent={<View style={s.stack}><Text accessibilityRole="header" style={s.heading}>{t("contextImport.history")}</Text>{feedback}</View>}
        ListEmptyComponent={<Text style={s.muted}>{t(busy ? "contextImport.loading" : historyLoaded ? "contextImport.historyEmpty" : "contextImport.historyError")}</Text>}
        renderItem={({ item }) => <MdCard variant="outlined" style={s.card}>
          <Text style={s.small}>{new Date(item.created_at).toLocaleString(i18n.language)}</Text>
          <Text style={s.text}>{t("contextImport.doneBody", { count: item.item_count })}</Text>
          {item.status === "withdrawn" ? <Text style={s.small}>{t("contextImport.withdrawn")}</Text> : <View style={s.row}>
            {item.source_id ? <MdButton variant="text" label={t("contextImport.viewRecords")} onPress={() => router.push({ pathname: "/record/[id]", params: { id: item.source_id!, origin: "source" } })} /> : null}
            <MdButton variant="text" label={t("contextImport.withdraw")} disabled={busy} onPress={() => setDialog(item)} />
          </View>}
        </MdCard>}
        ListFooterComponent={<View style={s.actions}>
          {error ? <MdButton label={t("contextImport.retry")} disabled={busy} onPress={() => void loadHistory()} /> : null}
          {hasMore ? <MdButton label={t("contextImport.loadMore")} variant="outlined" disabled={busy} loading={busy} onPress={() => void loadHistory(history.at(-1))} /> : null}
          <MdButton label={t("contextImport.importMore")} variant="outlined" disabled={busy} onPress={reset} />
        </View>} /> : <ScrollView contentContainerStyle={[s.body, footerPad]} keyboardShouldPersistTaps="handled">
        {stage === "prepare" ? <>
          <Text accessibilityRole="header" style={s.heading}>{t("contextImport.prepareTitle")}</Text>
          <Text style={s.text}>{t("contextImport.prepareBody")}</Text>
          <MdCard variant="outlined" style={s.card}><Text style={s.muted}>{t("contextImport.privacy")}</Text></MdCard>
          <MdButton label={t("contextImport.copyPrompt")} onPress={() => void copy()} />
          <MdButton label={t("contextImport.next")} variant="outlined" onPress={() => move("input")} />
          <MdButton label={t("contextImport.history")} variant="text" onPress={() => move("history")} />
        </> : null}
        {stage === "input" ? <>
          <Text accessibilityRole="header" style={s.heading}>{t("contextImport.inputTitle")}</Text>
          <Text style={s.muted}>{t("contextImport.inputBody")}</Text>
          <Field label={t("contextImport.pasteLabel")} placeholder={t("contextImport.pastePlaceholder")} multiline numberOfLines={12}
            autoCorrect={false} autoCapitalize="none" value={raw} onChangeText={(value) => {
              if (value.length > PROFILE_CONTEXT_MAX_BYTES) { setError(t("contextImport.invalidSize")); return; }
              setError(null); setRaw(value);
            }} editable={!busy} />
          <MdButton label={t("contextImport.chooseFile")} variant="outlined" loading={busy} disabled={busy} onPress={() => void pick()} />
          <MdButton label={t("contextImport.review")} disabled={!raw.trim() || busy} onPress={() => parse(raw)} />
          <Text style={s.small}>{t("contextImport.privacy")}</Text>
        </> : null}
        {stage === "confirm" && snapshot ? <>
          <Text accessibilityRole="header" style={s.heading}>{t("contextImport.confirmTitle")}</Text>
          <Text style={s.text}>{t("contextImport.selected", { count: selectedCount })}</Text>
          <Text style={s.muted}>{t("contextImport.confirmBody")}</Text>
          <ProfileChangeReview current={snapshot.details} patch={patch} adult={adult} disabled={busy || !!pending.current} onChange={setPatch} />
          <ImportCheck label={t("contextImport.saveConsent")} checked={consent} disabled={busy || !!pending.current} onChange={() => setConsent(!consent)} />
          <MdButton label={t(pending.current ? "contextImport.retry" : "contextImport.apply", { count: selectedCount })} loading={busy}
            disabled={busy || !consent || Object.values(patch).some((value) => !value?.trim())} onPress={() => void save()} />
        </> : null}
        {stage === "done" && receipt ? <>
          <Text accessibilityRole="header" style={s.heading}>{t("contextImport.doneTitle")}</Text>
          <Text style={s.text}>{t("contextImport.doneBody", { count: receipt.item_count })}</Text>
          <MdButton label={t("contextImport.viewProfile")} onPress={() => router.replace("/me/profile")} />
          {receipt.source_id ? <MdButton label={t("contextImport.viewRecords")} variant="outlined" onPress={() => router.push({ pathname: "/record/[id]", params: { id: receipt.source_id!, origin: "source" } })} /> : null}
          <MdButton label={t("contextImport.history")} variant="text" onPress={() => move("history")} />
        </> : null}
        {feedback}
      </ScrollView>}
    </KeyboardAvoidingArea>
    <ScreenModal visible={dialog !== null} transparent onRequestClose={() => { if (!working.current) setDialog(null); }}>
      <View style={s.modal}><MdCard style={s.card}>
        <Text style={s.heading}>{t(dialog === "discard" ? "contextImport.discardTitle" : "contextImport.withdrawConfirmTitle")}</Text>
        <Text style={s.muted}>{t(dialog === "discard" ? pending.current ? "contextImport.pendingExitBody" : "contextImport.discardBody" : "contextImport.withdrawConfirmBody")}</Text>
        <MdButton label={t(dialog === "discard" ? pending.current ? "contextImport.history" : "contextImport.discard" : "contextImport.withdraw")} disabled={busy} loading={busy}
          onPress={() => { if (dialog === "discard") { const unknownResult = !!pending.current; setDialog(null); reset(); if (unknownResult) move("history"); else exit(); } else if (dialog) void withdraw(dialog); }} />
        <MdButton label={t("contextImport.cancel")} variant="text" disabled={busy} onPress={() => setDialog(null)} />
      </MdCard></View>
    </ScreenModal>
  </DeepSpaceScreen>;
}
