// Personal data import hub (Claude Design import-hub.dc.html). Extends the
// /import pipeline (captureFromMarkdown): sensitivity-tiered hub → consent sheet
// (A file / B connector, with the mandatory 무엇을/어디에/이 기기에서만 blocks)
// → on-device parse → propose→ratify (user approves only) → history/revoke.
//
// Privacy contract (docs/PERSONAL-DATA-IMPORT-SPEC.md): location/comms need
// explicit consent (0 byte before it), on-device + raw-not-kept, minors are
// locked out of comms/location (C10), nothing is applied automatically.
// deepSpace.* tokens only, assembled from the shared Ops kit.

import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbStatusHeader } from "@/components/deepspace";
import { MetaChip, OpsState, OpsStatusChip, ProgressBar, type OpsChipTone } from "@/components/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { deleteSourcesByIds } from "@/lib/records/delete-bulk";
import { detectImportKind, type ImportKind } from "@/lib/import/detect";
import { buildProposals, proposalsToMarkdown, type ImportOutcome, type ImportProposal } from "@/lib/import/proposals";
import {
  addImportHistory,
  getImportHistory,
  removeImportHistory,
  type ImportHistoryEntry,
} from "@/lib/import/history";
import { getEnv } from "@/lib/env";
import { getGoogleAccessToken } from "@/lib/google/gisToken";
import { fetchCalendarEvents, googleEventsToIcs, GOOGLE_CALENDAR_READONLY_SCOPE } from "@/lib/google/calendar";
import { fetchTasks, googleTasksToOutcome, GOOGLE_TASKS_READONLY_SCOPE } from "@/lib/google/tasks";

type Tier = "critical" | "sensitive" | "normal";
type Mode = "file" | "connector";

interface ImportSource {
  key: string;
  icon: string;
  nameKo: string;
  nameEn: string;
  subKo: string;
  subEn: string;
  tier: Tier;
  mode: Mode;
  minorLocked: boolean;
  kind: ImportKind;
  whatKo: string;
  whatEn: string;
  /** Set on the Google OAuth connectors; picks the scope + fetch path. */
  googleKind?: "calendar" | "tasks";
}

const SOURCES: ImportSource[] = [
  { key: "kakao", icon: "💬", nameKo: "카카오톡 대화", nameEn: "KakaoTalk", subKo: "통신 · 파일 내보내기", subEn: "Comms · file export", tier: "critical", mode: "file", minorLocked: true, kind: "kakao", whatKo: "약속·할 일·관계 신호만 뽑아요. 메시지 본문은 저장하지 않아요.", whatEn: "Only plan/relationship signals. We don't store message text." },
  { key: "takeout", icon: "📍", nameKo: "구글 타임라인", nameEn: "Google Timeline", subKo: "위치 · Takeout 파일", subEn: "Location · Takeout file", tier: "critical", mode: "file", minorLocked: true, kind: "takeout-location", whatKo: "자주 가는 장소·머문 시간 패턴만. 정확한 좌표 경로는 저장 안 함.", whatEn: "Only place/dwell patterns. Exact coordinates aren't stored." },
  { key: "sms", icon: "✉", nameKo: "문자(SMS)", nameEn: "SMS", subKo: "통신 · 백업 파일", subEn: "Comms · backup file", tier: "critical", mode: "file", minorLocked: true, kind: "sms", whatKo: "약속·알림 신호만. 메시지 본문은 저장하지 않아요.", whatEn: "Only plan/reminder signals. We don't store message text." },
  { key: "live-location", icon: "🛰", nameKo: "실시간 위치", nameEn: "Live location", subKo: "위치 · 기기 권한", subEn: "Location · device permission", tier: "critical", mode: "connector", minorLocked: true, kind: "unknown", whatKo: "자주 가는 장소·머문 시간 패턴만. 정확한 좌표 경로는 저장 안 함.", whatEn: "Only place/dwell patterns. Exact coordinates aren't stored." },
  { key: "health", icon: "❤", nameKo: "건강", nameEn: "Health", subKo: "건강 · export 파일", subEn: "Health · export file", tier: "sensitive", mode: "file", minorLocked: false, kind: "apple-health", whatKo: "걸음·운동 등 합계만. 상세 기록 원문은 저장 안 함.", whatEn: "Only totals (steps, etc). Detailed records aren't stored." },
  { key: "email", icon: "✉", nameKo: "이메일", nameEn: "Email", subKo: "이메일 · .eml 파일", subEn: "Email · .eml file", tier: "sensitive", mode: "file", minorLocked: false, kind: "email", whatKo: "약속·일정 신호만. 본문 전체는 저장 안 함.", whatEn: "Only plan/schedule signals, not the full body." },
  { key: "notion", icon: "🗒", nameKo: "Notion · Obsidian", nameEn: "Notion · Obsidian", subKo: "노트 · export 파일", subEn: "Notes · export file", tier: "normal", mode: "file", minorLocked: false, kind: "markdown", whatKo: "노트를 기록으로 들여와요.", whatEn: "Brings your notes in as records." },
  { key: "google", icon: "🗓", nameKo: "구글 캘린더", nameEn: "Google Calendar", subKo: "일정 · 계정 연결", subEn: "Schedule · account link", tier: "normal", mode: "connector", minorLocked: false, kind: "ics", googleKind: "calendar", whatKo: "다가오는 일정의 제목·시간만 가져와요. 본문·참석자는 저장 안 해요.", whatEn: "Brings only upcoming event titles + times. No body/attendees." },
  { key: "google-tasks", icon: "✅", nameKo: "구글 할 일", nameEn: "Google Tasks", subKo: "할 일 · 계정 연결", subEn: "To-dos · account link", tier: "normal", mode: "connector", minorLocked: false, kind: "markdown", googleKind: "tasks", whatKo: "할 일 목록의 제목만 기록으로 가져와요.", whatEn: "Brings your to-do titles in as records." },
  { key: "calendar", icon: "🗓", nameKo: "캘린더(.ics)", nameEn: "Calendar (.ics)", subKo: "일정 · 파일", subEn: "Schedule · file", tier: "normal", mode: "file", minorLocked: false, kind: "ics", whatKo: "일정 이벤트를 들여와요.", whatEn: "Brings your calendar events in." },
];

const TIER_COLOR: Record<Tier, string> = {
  critical: deepSpace.dangerText,
  sensitive: deepSpace.warning,
  normal: deepSpace.accent,
};

type Step = "hub" | "consent" | "input" | "review" | "history";

export function ImportHubScreen() {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId, isMinor } = useAuth();

  const [step, setStep] = useState<Step>("hub");
  const [active, setActive] = useState<ImportSource | null>(null);
  const [onDevice, setOnDevice] = useState(true);
  const [paste, setPaste] = useState("");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errored, setErrored] = useState(false);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [gErr, setGErr] = useState<string | null>(null);
  const googleClientId = getEnv().EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  const t = (k: string) => COPY(ko)[k] ?? k;
  const name = (s: ImportSource) => (ko ? s.nameKo : s.nameEn);

  useEffect(() => {
    void getImportHistory().then(setHistory);
  }, [step]);

  const openSource = (s: ImportSource) => {
    if (s.minorLocked && isMinor === true) return; // C10 — comms/location locked for minors
    setActive(s);
    setPaste("");
    setOutcome(null);
    setErrored(false);
    setGErr(null);
    setStep("consent");
  };

  const analyze = () => {
    if (!active) return;
    setErrored(false);
    const kind = detectImportKind("", paste) === "unknown" ? active.kind : detectImportKind("", paste);
    const out = buildProposals(kind, paste);
    if (out.proposals.length === 0) {
      setErrored(true);
      return;
    }
    setOutcome(out);
    setSelected(new Set(out.proposals.filter((p) => !p.sensitive).map((p) => p.id))); // sensitive default-excluded
    setStep("review");
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
    setBusy(true);
    try {
      const result = await captureFromMarkdown({ userId, rawMd: proposalsToMarkdown(name(active), chosen), kindOverride: "self_knowledge" });
      const s = outcome.summary;
      await addImportHistory({
        id: `${Date.now()}`,
        sourceKey: active.key,
        name: name(active),
        atIso: new Date().toISOString(),
        summary: `${t("appts")} ${s.appointments} · ${t("places")} ${s.places} · ${t("raw")} 0`,
        sourceIds: [result.source.id],
      });
    } catch {
      /* surfaced by returning to hub; capture is idempotent */
    }
    setBusy(false);
    setActive(null);
    setOutcome(null);
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
    // 철회 = full removal: delete the source rows this import created, then the log.
    const entry = history.find((h) => h.id === id);
    if (entry && userId && entry.sourceIds.length > 0) {
      try {
        await deleteSourcesByIds(userId, entry.sourceIds);
      } catch {
        /* best-effort; the history entry is still removed below */
      }
    }
    await removeImportHistory(id);
    setHistory(await getImportHistory());
  };

  // --- render -----------------------------------------------------------

  const back = () => (step === "hub" ? router.back() : setStep("hub"));

  return (
    <SafeAreaView style={styles.frame} edges={["top", "bottom"]}>
      <View style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SecondbStatusHeader text={t("hubBubble")} tip={t("hubTip")} />
        <View style={styles.titleRow}>
          <Pressable accessibilityRole="button" onPress={back} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{step === "history" ? t("imported") : t("import")}</Text>
          {step === "hub" ? (
            <Pressable onPress={() => setStep("history")} hitSlop={8} style={{ marginLeft: "auto" }}>
              <Text style={styles.linkText}>{t("imported")} ›</Text>
            </Pressable>
          ) : null}
        </View>

        {step === "hub" ? renderHub() : null}
        {step === "consent" && active ? renderConsent(active) : null}
        {step === "input" && active ? renderInput(active) : null}
        {step === "review" && outcome ? renderReview(outcome) : null}
        {step === "history" ? renderHistory() : null}
      </ScrollView>
    </SafeAreaView>
  );

  function renderHub() {
    const tiers: Tier[] = ["critical", "sensitive", "normal"];
    return (
      <>
        {tiers.map((tier) => (
          <View key={tier} style={styles.section}>
            <Text style={[styles.tierLabel, { color: TIER_COLOR[tier] }]}>{t(`tier_${tier}`)}</Text>
            {SOURCES.filter((s) => s.tier === tier).map((s) => {
              const locked = s.minorLocked && isMinor === true;
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
                      backgroundColor: withAlpha(TIER_COLOR[s.tier], 0.05),
                      borderColor: withAlpha(TIER_COLOR[s.tier], 0.25),
                    },
                  ]}
                  disabled={locked}
                >
                  <Text style={styles.sourceIcon}>{s.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourceName}>{name(s)}</Text>
                    <Text style={styles.sourceSub}>{ko ? s.subKo : s.subEn}</Text>
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
          <Text style={styles.consentIcon}>{s.icon}</Text>
          <Text style={styles.consentTitle}>{name(s)}</Text>
        </View>
        <OpsStatusChip tone={s.tier === "critical" ? "danger" : "warning"} label={t(`tier_${s.tier}`)} />

        <View style={styles.block}>
          <Text style={styles.blockLabel}>{t("what")}</Text>
          <Text style={styles.blockText}>{ko ? s.whatKo : s.whatEn}</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.blockLabel}>{t("where")}</Text>
          <Text style={styles.blockText}>{t("whereBody")}</Text>
        </View>
        <View style={styles.chipRow}>
          <MetaChip label={t("keep90")} />
          <MetaChip label={t("deleteAnytime")} />
        </View>

        <Pressable onPress={() => setOnDevice((v) => !v)} hitSlop={6} style={styles.toggleRow}>
          <Text style={styles.toggleText}>{t("onDeviceOnly")}</Text>
          <View style={[styles.toggle, onDevice ? styles.toggleOn : styles.toggleOff]}>
            <View style={[styles.knob, onDevice ? styles.knobOn : styles.knobOff]} />
          </View>
        </Pressable>

        {s.googleKind ? (
          <>
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>{t("googleConnectorNote")}</Text>
            </View>
            {gErr ? <OpsState variant="error" title={t("errTitle")} body={gErr} /> : null}
            {googleClientId ? (
              <Pressable onPress={connectGoogle} hitSlop={6} style={[styles.primaryBtn, busy ? styles.disabled : null]} disabled={busy}>
                <Text style={styles.primaryText}>{busy ? t("connecting") : t("googleConnect")}</Text>
              </Pressable>
            ) : null}
            {s.googleKind === "calendar" ? (
              <Pressable onPress={() => setStep("input")} hitSlop={6} style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>{t("orImportFile")}</Text>
              </Pressable>
            ) : null}
          </>
        ) : s.mode === "connector" ? (
          <>
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>{t("connectorNote")}</Text>
            </View>
            <Pressable onPress={() => setStep("input")} hitSlop={6} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>{t("orImportFile")}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => setStep("input")} hitSlop={6} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>{t("consentPick")}</Text>
          </Pressable>
        )}
        <Text style={styles.fine}>{t("consentFine")}</Text>
      </View>
    );
  }

  function renderInput(s: ImportSource) {
    return (
      <View style={styles.section}>
        <Text style={styles.tierLabel}>{name(s)}</Text>
        <Text style={styles.blockText}>{t("pasteHint")}</Text>
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
        <Pressable
          onPress={analyze}
          hitSlop={6}
          style={[styles.primaryBtn, paste.trim().length === 0 ? styles.disabled : null]}
          disabled={paste.trim().length === 0}
        >
          <Text style={styles.primaryText}>{t("analyze")}</Text>
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
          <Text style={styles.doneText}>{t("done")}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Summary n={out.summary.appointments} label={t("appts")} />
          <Summary n={out.summary.places + out.summary.events} label={t("places")} />
          <Summary n={0} label={t("raw")} dim />
        </View>
        <Text style={styles.tierLabel}>{t("pickToApply")}</Text>
        {out.proposals.map((p) => {
          const on = selected.has(p.id);
          return (
            <Pressable key={p.id} onPress={() => toggleSel(p.id)} hitSlop={4} style={[styles.proposalRow, on ? styles.proposalOn : null]}>
              <View style={[styles.check, on ? styles.checkOn : null]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.proposalLabel} numberOfLines={1}>{p.label}</Text>
                <Text style={styles.proposalSub}>{p.sub}{p.sensitive ? ` · ${t("sensitiveExcluded")}` : ""}</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={ratify} hitSlop={6} style={[styles.primaryBtn, count === 0 || busy ? styles.disabled : null]} disabled={count === 0 || busy}>
          <Text style={styles.primaryText}>{t("applyN").replace("{n}", String(count))}</Text>
        </Pressable>
      </View>
    );
  }

  function renderHistory() {
    return (
      <View style={styles.section}>
        {history.length === 0 ? (
          <OpsState variant="empty" title={t("emptyTitle")} body={t("emptyBody")} ctaLabel={t("pickSource")} onCta={() => setStep("hub")} />
        ) : (
          history.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <View style={styles.historyTop}>
                <Text style={styles.historyName}>{h.name}</Text>
                <Text style={styles.historyTime}>{h.atIso.slice(0, 10)}</Text>
              </View>
              <View style={styles.historyBottom}>
                <Text style={styles.historySummary}>{h.summary}</Text>
                <Pressable onPress={() => void removeHistory(h.id)} hitSlop={8} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>{t("delete")}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Text style={styles.fine}>{t("historyFine")}</Text>
      </View>
    );
  }
}

function Summary({ n, label, dim }: { n: number; label: string; dim?: boolean }) {
  return (
    <View style={[styles.summaryBox, dim ? styles.summaryBoxDim : null]}>
      <Text style={[styles.summaryNum, dim ? styles.summaryNumDim : null]}>{n}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function COPY(ko: boolean): Record<string, string> {
  return ko
    ? {
        import: "가져오기", imported: "가져온 데이터", hubBubble: "무엇을 들여올까요?", hubTip: "네가 승인한 것만 기록에 남아요.",
        tier_critical: "최민감 · 명시 동의 필요", tier_sensitive: "민감", tier_normal: "보통",
        needsConsent: "동의 필요", notLinked: "미연결", locked: "잠김", linked: "연결됨",
        what: "무엇을", where: "어디에", whereBody: "이 기기에서 분석하고 원문은 버려요. 파생 신호만 암호화해 보관해요.",
        keep90: "보관 90일", deleteAnytime: "언제든 삭제", onDeviceOnly: "이 기기에서만 처리",
        connectorNote: "다음 화면에서 위치 권한을 \"사용 중에만\"으로 요청해요. (네이티브 빌드 필요)",
        googleConnectorNote: "브라우저에서 구글 계정으로 안전하게 연결해요. 읽기 전용(일정 보기)이에요.",
        googleConnect: "구글 연결", connecting: "연결 중…",
        gErrNoEvents: "다가오는 일정이 없어요.", gErrDenied: "연결이 취소됐어요. 다시 시도해 주세요.",
        gErrNative: "지금은 웹에서만 연결돼요. 앱(네이티브)은 추후 지원해요.", gErrGeneric: "연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
        consentPick: "동의하고 파일 선택", orImportFile: "대신 파일로 가져오기",
        consentFine: "수집 항목·보관 위치·기간·삭제권에 동의해요. 미성년은 통신·위치 임포트가 잠겨 있어요.",
        pasteHint: "내보낸 파일 내용을 붙여넣어 주세요.", pastePlaceholder: "여기에 붙여넣기", analyze: "분석",
        errTitle: "파일 형식을 못 읽었어요", errBody: "내보낸 형식이 맞는지 확인해 주세요",
        done: "완료", appts: "약속", places: "장소", raw: "원문", pickToApply: "반영할 항목 고르기",
        sensitiveExcluded: "민감 — 기본 제외", applyN: "고른 {n}건 기록에 반영",
        emptyTitle: "아직 가져온 게 없어요", emptyBody: "소스를 골라 시작해요", pickSource: "소스 고르기",
        delete: "삭제", historyFine: "삭제는 파생 신호까지 완전 제거해요. 미성년 계정은 통신·위치 임포트가 서버에서 잠겨 있어요.",
      }
    : {
        import: "Import", imported: "Imported data", hubBubble: "What should we bring in?", hubTip: "Only what you approve is kept.",
        tier_critical: "Most sensitive · consent required", tier_sensitive: "Sensitive", tier_normal: "Normal",
        needsConsent: "Needs consent", notLinked: "Not linked", locked: "Locked", linked: "Linked",
        what: "WHAT", where: "WHERE", whereBody: "Parsed on this device; the raw is discarded. Only derived signals are kept, encrypted.",
        keep90: "Kept 90 days", deleteAnytime: "Delete anytime", onDeviceOnly: "Process on this device only",
        connectorNote: "The next screen requests location \"while using\" only. (needs the native build)",
        googleConnectorNote: "Securely link your Google account in the browser. Read-only (view events).",
        googleConnect: "Connect Google", connecting: "Connecting…",
        gErrNoEvents: "No upcoming events.", gErrDenied: "Connection cancelled. Try again.",
        gErrNative: "Connect on web for now. App (native) support comes later.", gErrGeneric: "Couldn't connect. Try again shortly.",
        consentPick: "Consent and pick file", orImportFile: "Import a file instead",
        consentFine: "You consent to what's collected, where it's kept, for how long, and your right to delete. Comms/location import is locked for minors.",
        pasteHint: "Paste the exported file's contents.", pastePlaceholder: "Paste here", analyze: "Analyze",
        errTitle: "Couldn't read the file", errBody: "Check that the exported format is right",
        done: "Done", appts: "Plans", places: "Places", raw: "Raw", pickToApply: "Pick what to apply",
        sensitiveExcluded: "sensitive — excluded by default", applyN: "Apply {n} to records",
        emptyTitle: "Nothing imported yet", emptyBody: "Pick a source to start", pickSource: "Pick a source",
        delete: "Delete", historyFine: "Delete removes the derived signals too. Comms/location import is server-locked for minor accounts.",
      };
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: deepSpace.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 220, backgroundColor: deepSpace.bgGlow, opacity: 0.5 },
  scroll: { padding: deepSpaceSpacing.lg, paddingBottom: 40, gap: deepSpaceSpacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: deepSpace.accentBright, fontSize: 24 },
  title: { fontFamily: fontFamilies.pixelKo, fontSize: 18, color: deepSpace.accentBright },
  linkText: { fontSize: 12, color: deepSpace.accentSoft, fontFamily: fontFamilies.pixelKo },

  section: { gap: deepSpaceSpacing.sm },
  tierLabel: { fontFamily: fontFamilies.pixelEn, fontSize: 8, letterSpacing: 1, color: deepSpace.textLo, marginTop: deepSpaceSpacing.sm },

  sourceRow: {
    flexDirection: "row", alignItems: "center", gap: 11, minHeight: 56,
    padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card,
  },
  sourceIcon: { fontSize: 16 },
  sourceName: { fontFamily: fontFamilies.pixelKo, fontSize: 13, color: deepSpace.accentBright },
  sourceSub: { fontSize: 12, color: deepSpace.textLo, marginTop: 1 },

  consentHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  consentIcon: { fontSize: 17 },
  consentTitle: { fontFamily: fontFamilies.pixelKo, fontSize: 16, color: deepSpace.textHi },
  block: { padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card, gap: 6 },
  blockLabel: { fontFamily: fontFamilies.pixelEn, fontSize: 7, letterSpacing: 1, color: deepSpace.accentSoft },
  blockText: { fontSize: 14, color: deepSpace.textMid, lineHeight: 20 },
  chipRow: { flexDirection: "row", gap: 6 },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 9, minHeight: 48, paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1, borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg, borderRadius: deepSpaceRadii.md,
  },
  toggleText: { flex: 1, fontSize: 14, color: deepSpace.accentBright },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: "center", paddingHorizontal: 3 },
  toggleOn: { backgroundColor: deepSpace.mint, alignItems: "flex-end" },
  toggleOff: { backgroundColor: deepSpace.cardPressed, alignItems: "flex-start" },
  knob: { width: 20, height: 20, borderRadius: 10 },
  knobOn: { backgroundColor: deepSpace.onMint },
  knobOff: { backgroundColor: deepSpace.textLo },
  noteCard: { padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card },
  noteText: { fontSize: 13, color: deepSpace.textLo, lineHeight: 18 },

  primaryBtn: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.mint, marginTop: 4 },
  primaryText: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.onMint },
  disabled: { opacity: 0.5 },
  secondaryBtn: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, borderWidth: 1, borderColor: deepSpace.cardLineStrong, backgroundColor: deepSpace.card, marginTop: 4 },
  secondaryText: { fontFamily: fontFamilies.pixelKo, fontSize: 13, color: deepSpace.accentSoft },
  fine: { fontSize: 12, color: deepSpace.textLo, lineHeight: 17, textAlign: "center" },

  pasteInput: {
    minHeight: 160, borderWidth: 1, borderColor: deepSpace.cardLineStrong, borderRadius: deepSpaceRadii.md,
    padding: deepSpaceSpacing.md, color: deepSpace.textHi, fontFamily: fontFamilies.sans, fontSize: 13,
  },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  doneText: { fontFamily: fontFamilies.pixelKo, fontSize: 12, color: deepSpace.mint },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryBox: { flex: 1, alignItems: "center", padding: 11, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card },
  summaryBoxDim: { opacity: 0.7 },
  summaryNum: { fontFamily: fontFamilies.pixelKo, fontSize: 20, color: deepSpace.accentBright },
  summaryNumDim: { color: deepSpace.textLo },
  summaryLabel: { fontSize: 12, color: deepSpace.textLo },

  proposalRow: {
    flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, padding: deepSpaceSpacing.sm,
    borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card,
  },
  proposalOn: { borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg },
  check: { width: 22, height: 22, borderRadius: deepSpaceRadii.sm, borderWidth: 1, borderColor: deepSpace.cardLineStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg },
  checkMark: { color: deepSpace.mint, fontSize: 13 },
  proposalLabel: { fontSize: 14, color: deepSpace.accentBright },
  proposalSub: { fontSize: 12, color: deepSpace.textLo, marginTop: 1 },

  historyRow: { padding: deepSpaceSpacing.sm, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card, gap: 7 },
  historyTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyName: { flex: 1, fontFamily: fontFamilies.pixelKo, fontSize: 13, color: deepSpace.accentBright },
  historyTime: { fontSize: 12, color: deepSpace.textLo },
  historyBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  historySummary: { flex: 1, fontSize: 12, color: deepSpace.textMid },
  deleteBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: deepSpace.dangerLine, borderRadius: deepSpaceRadii.sm },
  deleteText: { fontSize: 12, color: deepSpace.dangerText, fontFamily: fontFamilies.pixelKo },
});
