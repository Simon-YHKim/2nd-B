import { PhonePressable as Pressable, PhoneScrollView as ScrollView, PhoneTextInput as TextInput, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { SceneTransition } from "@/components/motion/SceneTransition";
// Personal data import hub (Claude Design import-hub.dc.html). Extends the
// /import pipeline (captureFromMarkdown): sensitivity-tiered hub → consent sheet
// (A file / B connector, with the mandatory 무엇을/어디에/이 기기에서만 blocks)
// → on-device parse → propose→ratify (user approves only) → history/revoke.
//
// Privacy contract (docs/PERSONAL-DATA-IMPORT-SPEC.md): location/comms need
// explicit consent (0 byte before it), on-device + raw-not-kept, minors (and an
// age not confirmed yet) are locked out of comms/location (C10), nothing is
// applied automatically.
// deepSpace.* tokens only, assembled from the shared Ops kit.

import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { PlainText as RNText } from "@/components/ui/PlainText";
import { checkboxSpaceKeyProps } from "@/lib/ui/checkbox-space-key";
import { useAppRouter, usePhoneEmbed } from "@/lib/nav/phone-embed";
import { useTranslation } from "react-i18next";
import { renderedUiLanguage } from "@/lib/i18n/ui-language";

import { deepSpace, deepSpaceSpacing, flattenAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { m3 } from "@/lib/theme/m3";
import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { SecondbStatusHeader } from "@/components/deepspace";
import { MetaChip, OpsState, OpsStatusChip, ProgressBar, type OpsChipTone } from "@/components/deepspace/ops";
import { enqueueAutoReasoningSource } from "@/app/reasoning";
import { useAuth } from "@/lib/auth/AuthContext";
import { reactExpression } from "@/lib/companion/expression";
import { RECORD_SAVE_CUE } from "@/lib/audio/app-cues";
import { useUiSound } from "@/lib/audio/use-ui-sound";
import { useProgression } from "@/lib/progression/useProgression";
import { upsertKakaoRelationPeople } from "@/lib/relation/import-signals";
import { recordImportConsent } from "@/lib/supabase/consent";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { deleteSourcesByIds, findSurvivingSourceIds } from "@/lib/records/delete-bulk";
import { captureEvent, proposalDecided } from "@/lib/analytics";
import { detectImportKind, type ImportKind } from "@/lib/import/detect";
import { fileImportSupported, pickTextFile } from "@/lib/import/file-read";
import { buildProposals, proposalsToMarkdown, type ImportOutcome } from "@/lib/import/proposals";
import { ratifyLedgerEntries, type LedgerRatifyResult } from "@/lib/import/ledger-ratify";
import {
  addImportHistory,
  getImportHistory,
  withdrawImportHistoryEntry,
  type ImportHistoryEntry,
  type ImportWithdrawalKept,
} from "@/lib/import/history";
import { createdSourceIds, importWithdrawalJudge, keptNotice } from "@/lib/import/history-ownership";
import { getEnv } from "@/lib/env";
import { getGoogleAccessToken } from "@/lib/google/gisToken";
import { fetchCalendarEvents, googleEventsToIcs, GOOGLE_CALENDAR_READONLY_SCOPE } from "@/lib/google/calendar";
import { fetchTasks, googleTasksToOutcome, GOOGLE_TASKS_READONLY_SCOPE } from "@/lib/google/tasks";

/**
 * 이 화면의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.accent.stageFloor` — 들여오기 허브는 무대 바닥 위에 카드를 놓는다.
 */
const impAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.accent.stageFloor);

type Tier = "critical" | "sensitive" | "normal";
type Mode = "file" | "connector";

// The tile copy (name · sub line · "what" block) lives in import:hub.sources.<key>.*
// in all five locales (Q-261005-01 = A, QA 261006 tr3). It used to be nameKo/nameEn ·
// subKo/subEn · whatKo/whatEn here, so es/pt/id painted the English pair.
interface ImportSource {
  key: string;
  badge: string;
  tier: Tier;
  mode: Mode;
  minorLocked: boolean;
  kind: ImportKind;
  /** Set on the Google OAuth connectors; picks the scope + fetch path. */
  googleKind?: "calendar" | "tasks";
}

const SOURCES: ImportSource[] = [
  { key: "kakao", badge: "KA", tier: "critical", mode: "file", minorLocked: true, kind: "kakao" },
  { key: "takeout", badge: "LO", tier: "critical", mode: "file", minorLocked: true, kind: "takeout-location" },
  { key: "sms", badge: "SM", tier: "critical", mode: "file", minorLocked: true, kind: "sms" },
  { key: "live-location", badge: "LV", tier: "critical", mode: "connector", minorLocked: true, kind: "unknown" },
  { key: "health", badge: "HE", tier: "sensitive", mode: "file", minorLocked: false, kind: "apple-health" },
  { key: "email", badge: "EM", tier: "sensitive", mode: "file", minorLocked: false, kind: "email" },
  { key: "notion", badge: "NO", tier: "normal", mode: "file", minorLocked: false, kind: "markdown" },
  { key: "google", badge: "GC", tier: "normal", mode: "connector", minorLocked: false, kind: "ics", googleKind: "calendar" },
  { key: "google-tasks", badge: "GT", tier: "normal", mode: "connector", minorLocked: false, kind: "markdown", googleKind: "tasks" },
  { key: "calendar", badge: "IC", tier: "normal", mode: "file", minorLocked: false, kind: "ics" },
];

// F7 (C10): the parser kinds behind the minor-locked comms/location tiles. Derived
// from SOURCES so it never drifts. runAnalyze re-checks the CONTENT-DETECTED kind
// against this, because content-sniffing can route a locked export (a KakaoTalk /
// SMS / Takeout-location file) through a NON-locked tile (e.g. Notion/markdown),
// which openSource's tile-level lock alone does not stop.
const MINOR_LOCKED_KINDS = new Set<ImportKind>(
  SOURCES.filter((s) => s.minorLocked && s.kind !== "unknown").map((s) => s.kind),
);

const TIER_COLOR: Record<Tier, string> = {
  critical: deepSpace.dangerText,
  sensitive: deepSpace.warning,
  normal: deepSpace.accent,
};

type Step = "hub" | "consent" | "input" | "review" | "history";

export function ImportHubScreen() {
  // Phone-aware: inside the dashboard phone, back from the hub step steps the
  // phone back instead of popping the app stack.
  const router = useAppRouter();
  // 가져오기 완료 소리(Q-261006-11, 저장 소리 재사용). 새로 기록된 것이 있을 때만.
  const playImportCue = useUiSound(RECORD_SAVE_CUE.source, RECORD_SAVE_CUE);
  // Inside the dashboard phone (~180px column at 320x568) the history link
  // ran off the title row; let that row wrap there.
  const inPhone = usePhoneEmbed() !== null;
  const { i18n, t: importT } = useTranslation("import");
  // The language actually on screen (#2064): system locale for the consent ledger
  // and the reasoning queue below. Copy goes through t(), which paints the same one.
  const ko = renderedUiLanguage(i18n) === "ko";
  const { userId, isMinor } = useAuth();
  const progression = useProgression();

  const [step, setStep] = useState<Step>("hub");
  // A failed import used to end exactly like a successful one: back at the hub, no message,
  // nothing kept -- after the user had walked a consent flow and picked a file for it.
  const [importErr, setImportErr] = useState(false);
  // Ledger booking runs best-effort AFTER the import lands, but rows the user
  // explicitly chose must not vanish silently (logic audit P1, dbl round 3):
  // ratifyLedgerEntries RESOLVES with {inserted, failed, skipped} counts (per-row
  // fail-soft, never rejects on row failures), so the warning derives from the
  // resolved counts. null = no warning; inserted===0 = total failure; inserted>0 =
  // partial. Since 0224 the ledger dedups a re-imported statement, so re-importing
  // is the safe advice in both cases (rows already booked come back as skipped).
  const [ledgerWarn, setLedgerWarn] = useState<LedgerRatifyResult | null>(null);
  // Rows the last ratify found already booked by an earlier import (0224). Not a failure.
  const [ledgerSkipped, setLedgerSkipped] = useState(0);
  // How many chosen items the last ratify found already imported, with nothing new
  // to log (0 = it logged). Without it that ratify ended like a success that left no
  // history line behind.
  const [alreadyImported, setAlreadyImported] = useState(0);
  const [active, setActive] = useState<ImportSource | null>(null);
  const [paste, setPaste] = useState("");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  // The parser kind behind `outcome`; ratify re-checks it against the minor lock.
  const [outcomeKind, setOutcomeKind] = useState<ImportKind | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errored, setErrored] = useState(false);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [gErr, setGErr] = useState<string | null>(null);
  const [histErr, setHistErr] = useState<string | null>(null);
  // The rows the last withdrawal left in place because they were not provably that
  // entry's own, by why (null = none yet). Without it a withdrawal that kept a row read
  // as a full one.
  const [histKept, setHistKept] = useState<ImportWithdrawalKept | null>(null);
  const googleClientId = getEnv().EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  // Hub copy: import:hub.* (Q-261005-01 = A). The short keys stay so the steps below
  // read the same; es/pt/id now paint their own words instead of the English map.
  const t = (k: string) => importT(`hub.${k}`);
  const name = (s: ImportSource) => importT(`hub.sources.${s.key}.name`);
  const sourceCopy = (s: ImportSource, field: "sub" | "what") => importT(`hub.sources.${s.key}.${field}`);

  useEffect(() => {
    setHistErr(null);
    void getImportHistory(userId).then(setHistory);
    // userId in deps (F-08): re-read when auth resolves so the scoped key is
    // read for the right user, and a user switch never shows the prior user's log.
  }, [step, userId]);

  const openSource = (s: ImportSource) => {
    // C10: comms/location stay locked for minors AND for an age we do not know yet
    // (isMinor null: loading, no profile, or a failed profile probe). Only a
    // confirmed adult (false) opens them.
    if (s.minorLocked && isMinor !== false) return;
    setActive(s);
    setPaste("");
    setOutcome(null);
    setOutcomeKind(null);
    setErrored(false);
    setGErr(null);
    setStep("consent");
  };

  // Shared by both inputs: paste (any platform) and the web file picker. Content
  // sniffing wins; the filename only helps route .ics/.eml/.md by extension.
  const runAnalyze = (content: string, fileName: string) => {
    if (!active) return;
    setErrored(false);
    if (content.trim().length === 0) {
      setErrored(true);
      return;
    }
    const detected = detectImportKind(fileName, content);
    const kind = detected === "unknown" ? active.kind : detected;
    // F7 (C10): re-apply the minor lock to the DETECTED kind. openSource blocks the
    // locked TILES, but a minor can open a non-locked tile and feed a comms/location
    // export whose content sniffs to kakao/sms/takeout-location; without this the
    // kakao/sms branch would run and store message-derived snippets in `sources`.
    // An unconfirmed age (null) is locked the same way as a confirmed minor.
    if (isMinor !== false && MINOR_LOCKED_KINDS.has(kind)) {
      setErrored(true);
      return;
    }
    const out = buildProposals(kind, content);
    if (out.proposals.length === 0) {
      setErrored(true);
      return;
    }
    setOutcome(out);
    setOutcomeKind(kind);
    setSelected(new Set(out.proposals.filter((p) => !p.sensitive).map((p) => p.id))); // sensitive default-excluded
    setStep("review");
  };

  const analyze = () => runAnalyze(paste, "");

  // Read the chosen export file (web file dialog or native document picker),
  // then run the same pipeline. The raw text is held only long enough to parse;
  // nothing is uploaded or stored.
  const chooseFile = async () => {
    setErrored(false);
    try {
      const picked = await pickTextFile();
      if (!picked) return; // cancelled / unsupported
      // raw-not-kept: the file text is only the parser input — never stored in
      // state (so it can't linger or re-render into the textarea on a parse miss).
      runAnalyze(picked.text, picked.name);
    } catch {
      setErrored(true);
    }
  };

  // Google Calendar connector: OAuth (GIS token model, web) → fetch events →
  // serialize to .ics → reuse the SAME analyze/review/ratify path as a file.
  const connectGoogle = async () => {
    if (!active || busy) return;
    setGErr(null);
    setBusy(true);
    try {
      const isTasks = active.googleKind === "tasks";
      const token = await getGoogleAccessToken({
        clientId: googleClientId,
        scope: isTasks ? GOOGLE_TASKS_READONLY_SCOPE : GOOGLE_CALENDAR_READONLY_SCOPE,
      });
      const out = isTasks
        ? googleTasksToOutcome(await fetchTasks(token))
        : buildProposals("ics", googleEventsToIcs(await fetchCalendarEvents(token)));
      if (out.proposals.length === 0) {
        setBusy(false);
        setGErr(t("gErrNoEvents"));
        return;
      }
      setOutcome(out);
      setSelected(new Set(out.proposals.filter((p) => !p.sensitive).map((p) => p.id)));
      setBusy(false);
      setStep("review");
    } catch (e) {
      setBusy(false);
      setGErr(e === "native_pending" ? t("gErrNative") : e === "denied" ? t("gErrDenied") : t("gErrGeneric"));
    }
  };

  const ratify = async () => {
    if (!active || !outcome || !userId || busy) return;
    const chosen = outcome.proposals.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;
    let landedNew = false;
    // C10 at the write: re-check the lock against the tile AND the content-detected
    // kind. The age can stop being confirmed between analyze and ratify, and a
    // comms/location import must not land for an age we do not know.
    if (isMinor !== false && (active.minorLocked || (outcomeKind !== null && MINOR_LOCKED_KINDS.has(outcomeKind)))) {
      setImportErr(true);
      return;
    }
    setBusy(true);
    setLedgerWarn(null);
    setLedgerSkipped(0);
    try {
      const result = await captureFromMarkdown({ userId, rawMd: proposalsToMarkdown(name(active), chosen), kindOverride: "self_knowledge" });
      // propose→ratify quality signal AFTER the import actually landed (a
      // failed attempt must not count, and the retry path would double-count
      // if this fired before the await — adversarial review 2026-07-26).
      // Counts only, consent-gated inside captureEvent. Unchecked rows are the
      // closest thing this flow has to a decline (no explicit reject button).
      captureEvent(proposalDecided({ flow: "import", decision: "ratify", count: chosen.length }));
      const unchecked = outcome.proposals.length - chosen.length;
      if (unchecked > 0) {
        captureEvent(proposalDecided({ flow: "import", decision: "decline", count: unchecked }));
      }
      const s = outcome.summary;
      // finance-csv (S1-4): book the chosen transactions into ops_ledger. The
      // captureFromMarkdown above already landed the summary note; this lands
      // the actual ledger rows the proposals carry (ledgerEntry payload).
      // Content sniffing routes any bank/card CSV here regardless of
      // active.key, so gate on the payload, not the source. AWAITED (review
      // P1 round 2) so the history line below records what actually BOOKED
      // ({inserted}), not what was merely selected: per-row fail-soft keeps
      // this bounded, and a thrown call means nothing inserted (0). Watches
      // keeps the parsed signal total -- the user ratifies channel/rhythm
      // proposals, not watch events, so no ratified denomination exists.
      let bookedTxns = 0;
      if (chosen.some((p) => p.ledgerEntry)) {
        const attempted = chosen.filter((p) => p.ledgerEntry).length;
        const booked = await ratifyLedgerEntries(userId, chosen).catch(() => null);
        bookedTxns = booked?.inserted ?? 0;
        // #1117 intent, completed for the resolve contract (dbl round 3):
        // ratifyLedgerEntries never rejects on row failures -- it resolves
        // with {inserted, failed, skipped} -- so the warning must read those
        // counts, not a .catch(). PARTIAL failure warns too: the user chose
        // those rows. Since 0224 (RD-261007-01) the ledger dedups a statement
        // imported again, so "re-import the file" is safe after a partial
        // booking as well - the booked rows come back as skipped, not doubled.
        const failedTxns = booked ? booked.failed : attempted;
        if (failedTxns > 0) setLedgerWarn({ inserted: bookedTxns, failed: failedTxns });
        setLedgerSkipped(booked?.skipped ?? 0);
      }
      // An exact duplicate hands back the row an EARLIER import created and writes
      // nothing, so the entry logs only rows this import created - as the file import
      // does. Logging the duplicate made withdrawing this entry delete the earlier
      // import's row (vibe r260919 r29 §3-6). Transactions booked just now are new
      // rows either way (re-importing is how a failed booking is retried), so they
      // still get a line.
      const createdIds = createdSourceIds(result);
      const logged = createdIds.length > 0 || bookedTxns > 0;
      landedNew = logged;
      if (logged) {
        await addImportHistory(userId, {
          id: `${Date.now()}`,
          sourceKey: active.key,
          name: name(active),
          atIso: new Date().toISOString(),
          summary:
            (s.notes > 0 ? `${t("notes")} ${s.notes} · ` : "") +
            (s.watches > 0 ? `${t("watches")} ${s.watches} · ` : "") +
            (bookedTxns > 0 ? `${t("txns")} ${bookedTxns} · ` : "") +
            `${t("appts")} ${s.appointments} · ${t("places")} ${s.places + s.events} · ${t("raw")} 0`,
          sourceIds: createdIds,
          // Every id here is a row this import created, so its withdrawal may delete
          // them all without asking whose they are (history-ownership.ts).
          owned: true,
        });
      }
      setAlreadyImported(logged ? 0 : chosen.length);
      // P0④: the consent sheet the user just walked finally leaves a ledger row
      // (consent_records). Best-effort — the import itself already landed.
      void recordImportConsent({
        userId,
        ageBand: isMinor === true ? "minor_self" : "adult",
        minorTier: isMinor === true ? "minor_self" : "adult",
        locale: ko ? "ko" : "en",
        sourceKey: active.key,
        sensitive: active.tier !== "normal",
      });
      // P0①: hand the new source to automatic reasoning (a no-op when the
      // toggle is off or the auto allowance is spent). A later ratify stamps
      // the domain tag that lets this import brighten its star — the only
      // honest path (propose→ratify) from imported data to the constellation.
      // Health measurements are never sent to an AI provider (lib/wiki/ai-exclusion.ts).
      if (!chosen.some((p) => p.aiExcluded)) {
        enqueueAutoReasoningSource({
          userId,
          locale: ko ? "ko" : "en",
          minor: isMinor === true,
          tier: progression.tier,
          id: result.source.id,
          title: result.source.title,
        });
      }
      // P0③ (kakao only): pseudonymous per-person signals become star-alias
      // people ("새벽에 걷는 베텔게우스") in relation_people — the relation
      // star's real backing. Best-effort after the import itself landed.
      if (active.key === "kakao" && outcome.relationSignals?.length) {
        void upsertKakaoRelationPeople(userId, ko, outcome.relationSignals).catch(() => undefined);
      }

    } catch {
      // "surfaced by returning to hub" surfaced nothing. The four lines below sat outside
      // the try, so a failed import ended exactly like a successful one: back at the hub,
      // no message, nothing kept. The user had just walked a consent flow and picked a file
      // for it. Send them back to the hub only when the import actually landed.
      setImportErr(true);
      setBusy(false);
      return;
    }
    // 새 데이터가 기록에 들어왔다 — the delight beat.
    reactExpression("delight");
    if (landedNew) playImportCue();
    setBusy(false);
    setActive(null);
    setOutcome(null);
    setOutcomeKind(null);
    setStep("hub");
  };

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeHistory = async (id: string) => {
    // 철회 = full removal: delete the source rows this import created, THEN the
    // log entry. The history entry is the only pointer to those rows, so if the
    // delete fails we must KEEP it and surface an error — dropping it would
    // strand the imported rows as unrevokable while telling the user they were
    // withdrawn (the exact false-assurance this screen exists to prevent).
    setHistErr(null);
    setHistKept(null);
    let entry = history.find((h) => h.id === id);
    // med#30: signed out we cannot delete the server rows this import created —
    // wiping only the local log would LOOK like a withdrawal while the data
    // stays on the server (the exact false assurance documented above).
    if (entry && entry.sourceIds.length > 0 && !userId) {
      setHistErr(t("revokeNeedsSignIn"));
      return;
    }
    if (!userId) return;
    try {
      // The log is shared with /import, and the log decides, not this screen's list.
      // An entry logged before 2026-09-20 can point at a row another import created,
      // so only the rows that are provably this entry's own are deleted
      // (history-ownership.ts). One withdrawal runs at a time per account, across
      // tabs, from reading the log to removing the entry, in the session it started
      // in and within a deadline; a log that cannot be read, an account switch, or a
      // server that does not answer stops it and the entry stays (history.ts).
      const outcome = await withdrawImportHistoryEntry(
        userId,
        id,
        importWithdrawalJudge(userId, findSurvivingSourceIds),
        async (own) => {
          entry = own;
          const removed = await deleteSourcesByIds(userId, entry.sourceIds);
          // Same as the deep-space shell: a short delete is only a false assurance
          // if rows are still there, and the count cannot say. Ask when it is short.
          if (
            removed < entry.sourceIds.length &&
            (await findSurvivingSourceIds(userId, entry.sourceIds)).length > 0
          ) {
            return false;
          }
          // The entry leaves the log in history.ts, in one write with any promotion.
          return true;
        },
      );
      if (!outcome.withdrawn) {
        // A browser without Web Locks cannot line up two tabs' withdrawals, so it
        // withdraws nothing there and says so, rather than risk a row with no pointer.
        setHistErr(
          outcome.reason === "unserialized"
            ? i18n.t("deepspace:ds.import.revokeUnserialized")
            : t("revokeFailed"),
        );
        return;
      }
      setHistKept(outcome.kept);
    } catch {
      setHistErr(t("revokeFailed"));
      return;
    }
    // Imported data left the record — a sad beat on the head.
    reactExpression("sad");
    setHistory(await getImportHistory(userId));
  };

  // --- render -----------------------------------------------------------

  const back = () => (step === "hub" ? router.back() : setStep("hub"));

  // 하단 탭바를 공용 셸에서 받는다(2026-08-30). 이 화면은 자기 SafeAreaView 로
  // 프레임을 직접 세우느라 독이 통째로 없었다 — 레퍼런스 import-hub 프레임의
  // 미매칭 글자 5개가 정확히 그 독 라벨이었다(카피 문제가 아니었다).
  //
  // ⚠ active="capture" 는 하이라이트용이고 pathname 이 /capture 가 아니라서
  // DeepSpaceScreen 의 '루트 탭 → 홈' 하드웨어 뒤로가기 특례는 걸리지 않는다.
  // 단계 안의 뒤로(‹ → back())와 하드웨어 뒤로 동선은 그대로다.
  //
  // ownBack: 뒤로는 본문 제목 줄의 ‹ 하나다. 대시보드 폰 안에서 셸이 두 번째 뒤로를
  // 붙이지 않는다(뒤로는 한 곳에만 - O-7).
  return (
    <DeepSpaceScreen active="capture" header="none" ownBack>
      <View style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SecondbStatusHeader text={t("hubBubble")} tip={t("hubTip")} />
        <View style={[styles.titleRow, inPhone && styles.titleRowWrap]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={back} hitSlop={10} style={styles.backBtn}>
            <RNText style={styles.backIcon}>‹</RNText>
          </Pressable>
          <Text variant="heading" style={styles.title}>{step === "history" ? t("imported") : t("import")}</Text>
          {step === "hub" ? (
            <Pressable onPress={() => setStep("history")} hitSlop={8} style={{ marginLeft: "auto" }}>
              <Text variant="caption" style={styles.linkText}>{t("imported")} ›</Text>
            </Pressable>
          ) : null}
        </View>

        <SceneTransition transitionKey={step} kind={step === "hub" ? "back" : "push"} animateOnMount={false} style={{ gap: deepSpaceSpacing.md }}>
        {step === "hub" ? renderHub() : null}
        {step === "consent" && active ? renderConsent(active) : null}
        {step === "input" && active ? renderInput(active) : null}
        {step === "review" && outcome ? renderReview(outcome) : null}
        {step === "history" ? renderHistory() : null}
        </SceneTransition>
      </ScrollView>
    </DeepSpaceScreen>
  );

  function renderHub() {
    const tiers: Tier[] = ["critical", "sensitive", "normal"];
    return (
      <>
        {ledgerWarn ? (
          <OpsState
            variant="rate"
            title={t(ledgerWarn.inserted === 0 ? "ledgerWarnTitle" : "ledgerWarnPartTitle")}
            body={
              ledgerWarn.inserted === 0
                ? t("ledgerWarnBody")
                : t("ledgerWarnPartBody")
                    .replace("{failed}", String(ledgerWarn.failed))
                    .replace("{inserted}", String(ledgerWarn.inserted))
            }
          />
        ) : null}
        {ledgerSkipped > 0 ? (
          // 0224: a statement imported again books only what is new; say how many were already there.
          <View style={styles.noteCard}>
            <Text variant="body" style={styles.noteText}>
              {t("ledgerSkippedNote").replace("{skipped}", String(ledgerSkipped))}
            </Text>
          </View>
        ) : null}
        {alreadyImported > 0 ? (
          // The file import's result line for the same outcome: nothing added, N
          // duplicates. N is what the user chose - the hub bundles the choice into one
          // note, so "1 duplicate" would read as if only one of them were.
          <View style={styles.noteCard}>
            <Text variant="body" style={styles.noteText}>
              {`${i18n.t("deepspace:ds.import.resultAdded", { count: 0 })} · ${i18n.t("deepspace:ds.import.resultDuplicate", { count: alreadyImported })}`}
            </Text>
          </View>
        ) : null}
        {tiers.map((tier) => (
          <View key={tier} style={styles.section}>
            <Text variant="caption" pixelEn style={[styles.tierLabel, { color: TIER_COLOR[tier] }]}>{t(`tier_${tier}`)}</Text>
            {SOURCES.filter((s) => s.tier === tier).map((s) => {
              const locked = s.minorLocked && isMinor !== false;
              const tone: OpsChipTone = locked ? "muted" : s.tier === "critical" ? "warning" : "muted";
              const chip = locked ? t("locked") : s.mode === "connector" ? t("notLinked") : t("needsConsent");
              return (
                <Pressable
                  key={s.key}
                  onPress={() => openSource(s)}
                  hitSlop={4}
                  style={[
                    styles.sourceRow,
                    // Tier-tinted row (import-hub.dc.html): reinforce the
                    // sensitivity hierarchy beyond the status chip. Token-based
                    // tint of the existing TIER_COLOR (no raw hex).
                    {
                      backgroundColor: impAlpha(TIER_COLOR[s.tier], 0.05),
                      borderColor: impAlpha(TIER_COLOR[s.tier], 0.25),
                    },
                  ]}
                  disabled={locked}
                >
                  <RNText style={styles.sourceIcon}>{s.badge}</RNText>
                  <View style={{ flex: 1 }}>
                    <Text variant="heading" style={styles.sourceName}>{name(s)}</Text>
                    <Text variant="subtle" style={styles.sourceSub}>{sourceCopy(s, "sub")}</Text>
                  </View>
                  <OpsStatusChip tone={tone} label={chip} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </>
    );
  }

  function renderConsent(s: ImportSource) {
    return (
      <View style={styles.section}>
        <View style={styles.consentHead}>
          <RNText style={styles.consentIcon}>{s.badge}</RNText>
          <Text variant="heading" style={styles.consentTitle}>{name(s)}</Text>
        </View>
        <OpsStatusChip tone={s.tier === "critical" ? "danger" : "warning"} label={t(`tier_${s.tier}`)} />

        <View style={styles.block}>
          <Text variant="caption" pixelEn style={styles.blockLabel}>{t("what")}</Text>
          <Text variant="body" style={styles.blockText}>{sourceCopy(s, "what")}</Text>
        </View>
        <View style={styles.block}>
          <Text variant="caption" pixelEn style={styles.blockLabel}>{t("where")}</Text>
          <Text variant="body" style={styles.blockText}>
            {s.kind === "markdown" ? importT("markdownRetention.consent") : t("whereBody")}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <MetaChip label={importT("retention.chip")} />
          <MetaChip label={t("deleteAnytime")} />
          {/* Truthful STATIC fact, not a switch: buildProposals parses locally,
              so analysis really is on-device — but the old toggle here was read
              by nothing (analyze/ratify/chooseFile ignored it), a fake control
              on a privacy promise (audit: /import-hub dead switch). */}
          <MetaChip label={t("localAnalysis")} />
        </View>

        {s.googleKind ? (
          <>
            <View style={styles.noteCard}>
              <Text variant="body" style={styles.noteText}>{t("googleConnectorNote")}</Text>
            </View>
            {gErr ? <OpsState variant="error" title={t("errTitle")} body={gErr} /> : null}
            {googleClientId ? (
              <Pressable onPress={connectGoogle} hitSlop={6} style={[styles.primaryBtn, busy ? styles.disabled : null]} disabled={busy}>
                <Text variant="caption" style={[styles.primaryText, busy ? styles.disabledText : null]}>{busy ? t("connecting") : t("googleConnect")}</Text>
              </Pressable>
            ) : null}
            {s.googleKind === "calendar" ? (
              <Pressable onPress={() => setStep("input")} hitSlop={6} style={styles.secondaryBtn}>
                <Text variant="caption" style={styles.secondaryText}>{t("orImportFile")}</Text>
              </Pressable>
            ) : null}
          </>
        ) : s.mode === "connector" ? (
          <>
            <View style={styles.noteCard}>
              <Text variant="body" style={styles.noteText}>{t("connectorNote")}</Text>
            </View>
            <Pressable onPress={() => setStep("input")} hitSlop={6} style={styles.primaryBtn}>
              <Text variant="caption" style={styles.primaryText}>{t("orImportFile")}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => setStep("input")} hitSlop={6} style={styles.primaryBtn}>
            <Text variant="caption" style={styles.primaryText}>{t("consentPick")}</Text>
          </Pressable>
        )}
        <Text variant="subtle" style={styles.fine}>{t("consentFine")}</Text>
      </View>
    );
  }

  function renderInput(s: ImportSource) {
    return (
      <View style={styles.section}>
        <Text variant="caption" pixelEn style={styles.tierLabel}>{name(s)}</Text>
        {fileImportSupported() ? (
          <>
            <Pressable onPress={() => void chooseFile()} hitSlop={6} style={styles.primaryBtn}>
              <Text variant="caption" style={styles.primaryText}>{t("chooseFile")}</Text>
            </Pressable>
            <Text variant="subtle" style={[styles.fine, { marginTop: 2 }]}>{t("orPaste")}</Text>
          </>
        ) : null}
        <Text variant="body" style={styles.blockText}>{t("pasteHint")}</Text>
        <TextInput
          value={paste}
          onChangeText={setPaste}
          placeholder={t("pastePlaceholder")}
          placeholderTextColor={deepSpace.textLo}
          style={styles.pasteInput}
          multiline
          textAlignVertical="top"
        />
        {errored ? <OpsState variant="error" title={t("errTitle")} body={t("errBody")} /> : null}
        {/* A failed IMPORT (not a failed parse): the ratify write did not land, so we stay
            on review rather than bouncing to the hub as though it had. */}
        {importErr ? <OpsState variant="error" title={t("errTitle")} body={t("importFailed")} /> : null}
        <Pressable
          onPress={analyze}
          hitSlop={6}
          style={[styles.primaryBtn, paste.trim().length === 0 ? styles.disabled : null]}
          disabled={paste.trim().length === 0}
        >
          <Text variant="caption" style={[styles.primaryText, paste.trim().length === 0 ? styles.disabledText : null]}>{t("analyze")}</Text>
        </Pressable>
      </View>
    );
  }

  function renderReview(out: ImportOutcome) {
    const count = out.proposals.filter((p) => selected.has(p.id)).length;
    return (
      <View style={styles.section}>
        <View style={styles.progressRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={1} color={deepSpace.mint} />
          </View>
          <Text variant="caption" style={styles.doneText}>{t("done")}</Text>
        </View>
        <View style={styles.summaryRow}>
          {out.summary.notes > 0 ? <Summary n={out.summary.notes} label={t("notes")} /> : null}
          {/* P1 parsers (#1094) fill these two; each import kind fills only its
              own counter, so at most one of them joins the row. Without these
              a YouTube/finance import reviewed as "약속 0 · 장소 0 · 원문 0". */}
          {out.summary.watches > 0 ? <Summary n={out.summary.watches} label={t("watches")} /> : null}
          {out.summary.transactions > 0 ? <Summary n={out.summary.transactions} label={t("txns")} /> : null}
          <Summary n={out.summary.appointments} label={t("appts")} />
          <Summary n={out.summary.places + out.summary.events} label={t("places")} />
          {out.summary.notes === 0 ? <Summary n={0} label={t("raw")} dim /> : null}
        </View>
        {out.summary.notes > 0 ? (
          <Text variant="subtle" style={styles.fine}>{importT("markdownRetention.review")}</Text>
        ) : null}
        <Text variant="caption" pixelEn style={styles.tierLabel}>{t("pickToApply")}</Text>
        {out.proposals.map((p) => {
          const on = selected.has(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => toggleSel(p.id)}
              hitSlop={4}
              // 이 줄은 실행이 아니라 켜고 끄는 것이다. 역할이 없으면 스크린리더가
              // "체크박스" 라고도, 켜졌다고도 말하지 않고 - 웹에서는 한 단계 더
              // 나쁘다: React Native Web 의 PressResponder 는 button 계열이
              // 아니면 스페이스를 아예 처리하지 않고 역할 없는 View 는 포커스도
              // 받지 못한다. 그래서 역할이 키 배선보다 먼저다.
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: busy }}
              // 눈에 보이는 것과 같은 이름으로 읽히게 한다. 고정 문자열이면 열
              // 줄이 전부 같은 이름이 된다.
              accessibilityLabel={`${p.label} · ${p.sub}${p.sensitive ? ` · ${t("sensitiveExcluded")}` : ""}`}
              // 적용이 도는 동안 선택이 바뀌면 사용자가 고른 것과 실제로 적용되는
              // 것이 갈라진다. 적용 버튼은 이미 잠기는데 이 줄만 열려 있었다.
              disabled={busy}
              {...checkboxSpaceKeyProps(() => toggleSel(p.id), !busy)}
              style={[styles.proposalRow, on ? styles.proposalOn : null]}
            >
              <View style={[styles.check, on ? styles.checkOn : null]}>{on ? <RNText style={styles.checkMark}>✓</RNText> : null}</View>
              <View style={{ flex: 1 }}>
                <Text variant="body" style={styles.proposalLabel} numberOfLines={1}>{p.label}</Text>
                <Text variant="subtle" style={styles.proposalSub}>{p.sub}{p.sensitive ? ` · ${t("sensitiveExcluded")}` : ""}</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={ratify} hitSlop={6} style={[styles.primaryBtn, count === 0 || busy ? styles.disabled : null]} disabled={count === 0 || busy}>
          <Text variant="caption" style={[styles.primaryText, count === 0 || busy ? styles.disabledText : null]}>{t("applyN").replace("{n}", String(count))}</Text>
        </Pressable>
      </View>
    );
  }

  function renderHistory() {
    const kept = keptNotice(histKept);
    return (
      <View style={styles.section}>
        {histErr ? <OpsState variant="error" title={t("errTitle")} body={histErr} /> : null}
        {kept.length > 0 ? (
          // Outside the list: the entry that kept them may have been the last one.
          <View style={styles.noteCard}>
            <Text variant="body" style={styles.noteText}>
              {kept.map((line) => i18n.t(`deepspace:${line.key}`, { count: line.count })).join(" ")}
            </Text>
          </View>
        ) : null}
        {history.length === 0 ? (
          <OpsState variant="empty" title={t("emptyTitle")} body={t("emptyBody")} ctaLabel={t("pickSource")} onCta={() => setStep("hub")} />
        ) : (
          history.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <View style={styles.historyTop}>
                <Text variant="heading" style={styles.historyName}>{h.name}</Text>
                <Text variant="subtle" style={styles.historyTime}>{h.atIso.slice(0, 10)}</Text>
              </View>
              <View style={styles.historyBottom}>
                <Text variant="subtle" style={styles.historySummary}>{h.summary}</Text>
                <Pressable onPress={() => void removeHistory(h.id)} hitSlop={8} style={styles.deleteBtn}>
                  <Text variant="caption" style={styles.deleteText}>{t("delete")}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Text variant="subtle" style={styles.fine}>{t("historyFine")}</Text>
      </View>
    );
  }
}

function Summary({ n, label, dim }: { n: number; label: string; dim?: boolean }) {
  return (
    <View style={[styles.summaryBox, dim ? styles.summaryBoxDim : null]}>
      <Text variant="heading" style={[styles.summaryNum, dim ? styles.summaryNumDim : null]}>{n}</Text>
      <Text variant="subtle" style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ⚠ 상단 불빛은 **미리 합성한 색**이다(PIXEL-CLAY 규칙 4 — 정적 반투명 금지).
  //   이 띠는 화면 배경 위에 바로 앉으므로 바탕은 deepSpace.bg 다.
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 220, backgroundColor: flattenAlpha(deepSpace.bgGlow, 0.5, deepSpace.bg) },
  scroll: { padding: deepSpaceSpacing.lg, paddingBottom: 40, gap: deepSpaceSpacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm },
  titleRowWrap: { flexWrap: "wrap" },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: deepSpace.accentBright, fontSize: 24 },
  title: { fontSize: 18, color: deepSpace.accentBright },
  linkText: { fontSize: 12, color: deepSpace.accentSoft },

  section: { gap: deepSpaceSpacing.sm },
  tierLabel: { fontSize: 8, letterSpacing: 1, color: deepSpace.textLo, marginTop: deepSpaceSpacing.sm },

  sourceRow: {
    flexDirection: "row", alignItems: "center", gap: 11, minHeight: 56,
    padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.medium, backgroundColor: deepSpace.card,
  },
  sourceIcon: {
    minWidth: 28,
    textAlign: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: m3.shape.small,
    overflow: "hidden",
    backgroundColor: impAlpha(deepSpace.text, 0.1),
    color: deepSpace.text,
    fontSize: 11,
    fontFamily: fontFamilies.mono,
    letterSpacing: 0,
  },
  sourceName: { fontSize: 13, color: deepSpace.accentBright },
  sourceSub: { fontSize: 12, color: deepSpace.textLo, marginTop: 1 },

  consentHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  consentIcon: {
    minWidth: 28,
    textAlign: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: m3.shape.small,
    overflow: "hidden",
    backgroundColor: impAlpha(deepSpace.text, 0.1),
    color: deepSpace.text,
    fontSize: 11,
    fontFamily: fontFamilies.mono,
    letterSpacing: 0,
  },
  consentTitle: { fontSize: 16, color: deepSpace.textHi },
  block: { padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: m3.shape.medium, backgroundColor: deepSpace.card, gap: 6 },
  blockLabel: { fontSize: 7, letterSpacing: 1, color: deepSpace.accentSoft },
  blockText: { fontSize: 14, color: deepSpace.textMid },
  chipRow: { flexDirection: "row", gap: 6 },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: 48, paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1, borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg, borderRadius: m3.shape.medium,
  },
  toggleText: { flex: 1, fontSize: 14, color: deepSpace.accentBright },
  toggle: { width: 44, height: 26, borderRadius: m3.shape.none, justifyContent: "center", paddingHorizontal: 3 },
  toggleOn: { backgroundColor: deepSpace.mint, alignItems: "flex-end" },
  toggleOff: { backgroundColor: deepSpace.cardPressed, alignItems: "flex-start" },
  knob: { width: 20, height: 20, borderRadius: m3.shape.none },
  knobOn: { backgroundColor: deepSpace.onMint },
  knobOff: { backgroundColor: deepSpace.textLo },
  noteCard: { padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: m3.shape.medium, backgroundColor: deepSpace.card },
  noteText: { fontSize: 13, color: deepSpace.textLo },

  primaryBtn: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: m3.shape.medium, backgroundColor: deepSpace.mint, marginTop: 4 },
  primaryText: { fontSize: 14, color: deepSpace.onMint },
  // ⚠ 비활성은 **미리 합성한 색 한 쌍**이다(PIXEL-CLAY 규칙 4).
  //   바탕만 바꾸고 글자를 그대로 두면 비활성이 활성보다 또렷해진다.
  disabled: { backgroundColor: flattenAlpha(deepSpace.mint, 0.5, deepSpace.bg) },
  disabledText: { color: flattenAlpha(deepSpace.onMint, 0.5, flattenAlpha(deepSpace.mint, 0.5, deepSpace.bg)) },
  secondaryBtn: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: m3.shape.medium, borderWidth: 1, borderColor: deepSpace.cardLineStrong, backgroundColor: deepSpace.card, marginTop: 4 },
  secondaryText: { fontSize: 13, color: deepSpace.accentSoft },
  fine: { fontSize: 12, color: deepSpace.textLo, textAlign: "center" },

  pasteInput: {
    minHeight: 160, borderWidth: 1, borderColor: deepSpace.cardLineStrong, borderRadius: m3.shape.medium,
    padding: deepSpaceSpacing.md, color: deepSpace.textHi, fontFamily: fontFamilies.sans, fontSize: 13,
  },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  doneText: { fontSize: 12, color: deepSpace.mint },
  // wrap: with watches/txns the row can hold four boxes, which do not fit a
  // 320dp width single-line (review P2) -- minWidth keeps wrapped boxes even.
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryBox: { flex: 1, minWidth: 68, alignItems: "center", padding: 11, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: m3.shape.medium, backgroundColor: deepSpace.card },
  summaryBoxDim: { opacity: 0.7 },
  summaryNum: { fontSize: 20, color: deepSpace.accentBright },
  summaryNumDim: { color: deepSpace.textLo },
  summaryLabel: { fontSize: 12, color: deepSpace.textLo },

  proposalRow: {
    flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, padding: deepSpaceSpacing.sm,
    borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: m3.shape.medium, backgroundColor: deepSpace.card,
  },
  proposalOn: { borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg },
  check: { width: 22, height: 22, borderRadius: m3.shape.small, borderWidth: 1, borderColor: deepSpace.cardLineStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg },
  checkMark: { color: deepSpace.mint, fontSize: 13 },
  proposalLabel: { fontSize: 14, color: deepSpace.accentBright },
  proposalSub: { fontSize: 12, color: deepSpace.textLo, marginTop: 1 },

  historyRow: { padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: m3.shape.medium, backgroundColor: deepSpace.card, gap: 7 },
  historyTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyName: { flex: 1, fontSize: 13, color: deepSpace.accentBright },
  historyTime: { fontSize: 12, color: deepSpace.textLo },
  historyBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  historySummary: { flex: 1, fontSize: 12, color: deepSpace.textMid },
  deleteBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: deepSpace.dangerLine, borderRadius: m3.shape.small },
  deleteText: { fontSize: 12, color: deepSpace.dangerText },
});
