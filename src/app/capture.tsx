// /capture v2 — multi-mode "자재 반입" screen.
//
// 5 input modes per user directive (2026-05-27):
//   ✍️  Memo    — free-form note (default)
//   🔗  Link    — URL + auto-scrape title (kept the v1 clipper detection)
//   📋  Clip    — paste markdown from Obsidian Web Clipper or similar
//   📸  OCR     — pick image (library/camera) → Gemini multimodal OCR
//   📄  File    — pick PDF/DOCX/.txt → upload + index
//
// Common UI:
//   - Top toggle: 일상 Wiki / Pro Wiki (the wiki_track tag).
//   - Mode tabs row.
//   - Mode-specific input area.
//   - "분류 결과" — after LLM classify (suggested tags + suggested track).
//     Editable chips, track toggle stays user-final.
//   - Submit: persists via captureFromMarkdown + tag updates.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  AppState,
} from "react-native";
import { Image } from "expo-image";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { useTranslation } from "react-i18next";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { PremiumAppShell, PremiumModal } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { CaptureView } from "@/components/deep-space/DeepSpaceViews";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PremiumCard, PremiumButton, PremiumLoadingState, TAB_BAR_HEIGHT } from "@/components/premium";
import { ShardArt } from "@/components/art/IslandArt";
import { Input } from "@/components/ui/Input";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, semantic, spacing, typography, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { isAbortError } from "@/lib/async/abort";
import { detectClipperKind } from "@/lib/wiki/clipper-kind";
import {
  pickImageAsset,
  ocrImageAsset,
  isImageOcrCrisisResultError,
  isImageOcrEmptyResultError,
  isImageCameraPermissionDeniedError,
  isImageOcrTooLargeError,
  isImageOcrUnsupportedTypeError,
  isImageOcrInvalidDataError,
  isImageOcrMissingDataError,
} from "@/lib/wiki/capture-image";
import { pickFile, type PickedFile } from "@/lib/wiki/capture-file";
import {
  DEFAULT_CAPTURE_DRAFT_MODE,
  clearCaptureDraft,
  isCaptureDraftMode,
  loadCaptureDraftState,
  saveCaptureDraftState,
  type CaptureDraft,
  type CaptureDraftMode,
  type CaptureDrafts,
} from "@/lib/capture/draft";
import { classifyRecordTextForCrisis, transcribeAudio } from "@/lib/llm/gemini";
import { discardRecording, recordingUriToBase64 } from "@/lib/audio/recording-uri";
import { classifyClipper, type WikiTrack } from "@/lib/wiki/classify-clipper";
import { proposeClipperTemplate, type ProposedClipperTemplate } from "@/lib/wiki/propose-template";
import { saveTemplate } from "@/lib/wiki/template-queries";
import type { SourceKind } from "@/lib/wiki/types";
import { classifyLinkOrClip, firstUrlIn } from "@/lib/wiki/link-or-clip";
import { consumeSharedIntoDrafts, normalizeSharedCaptureParams } from "@/lib/capture/share-params";
import { clipboardHasContent, readClipboardText } from "@/lib/capture/clipboard";
import { composeFourWBody, EMPTY_FOURW, FOURW_KEYS, fourWHasContent, type FourWFields } from "@/lib/capture/fourw";
import { composeStructured } from "@/lib/capture/structured";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { reactExpression } from "@/lib/companion/expression";
import { AdvisorFollowupNote } from "@/components/records/AdvisorFollowupNote";
import { createRecord } from "@/lib/records/create";
import type { RecordFollowup } from "@/lib/records/followup";
import { computeStreak } from "@/lib/journal/streak";
import { dailyPrompt } from "@/lib/journal/daily-prompts";
import { listRecentRecords, countRecordsByKind } from "@/lib/records/create";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import type { HotlineId } from "@/lib/safety/lexicon";
// Journal-mode (일기) entitlement: feature gate + free-tier use limit, ported
// from the retired /journal screen so the /journal→/capture redirect (Phase 3)
// doesn't bypass progression gating.
import { useProgression } from "@/lib/progression/useProgression";
import { checkGate } from "@/lib/progression/gates";
import { canUsePremium, checkUsage } from "@/lib/progression/entitlements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceLinks } from "@/components/deep-space/DeepSpaceLinks";

// Deep-space reads these four explicit pixel-font labels in Pretendard (the
// same build-constant swap as Text.tsx #667); the legacy track keeps pixelKo.
// This is what makes /capture-full read as the deep-space design instead of
// retro chrome (the gameboy/semantic tokens are already track-aware).
const CAPTURE_LABEL_FONT = isDeepSpaceUI() ? fontFamilies.readable : fontFamilies.pixelKo;

// Unified 담기 (menu restructure Phase 2): the journal (오늘의 조각) and the
// capture modes live on one screen. "일기" writes to `records` (createRecord —
// streak / reflection / optional Advisor); the rest write to `sources`
// (captureFromMarkdown). Reads were already unified via mergeEvidence.
// SCREEN_TREE_SPEC §3 /capture: the spec lists 5 modes — 글(memo)/링크(linkclip)/
// 사진(ocr)/음성(voice)/할 일(todo). "voice" and "todo" are NOT persisted draft
// modes (CaptureDraftMode lives in lib/capture/draft.ts and stays the 5 storage
// modes), so they are added here as a local superset. They are transient
// text-capture modes that save through createRecord(kind:"note") with a
// distinguishing tag — no new DB kind is introduced.
type StorageMode = CaptureDraftMode;
type Mode = CaptureDraftMode | "voice" | "todo" | "fourw";
type CaptureFeedbackModal = { title: string; body: string; retry?: () => void } | null;
// One row of the 최근 조각 recent list — a subset of listRecentRecords output.
type RecentRow = { id: string; kind: string; topic: string | null; body: string | null; created_at: string };

// Voice/todo are not draft-persisted, so they never feed the StorageMode-typed
// draft helpers. This guard narrows a Mode down to a StorageMode at those call
// sites and keeps the persistence path off for the two new modes.
const STORAGE_MODES: readonly StorageMode[] = ["journal", "memo", "linkclip", "ocr", "file"];
function isStorageMode(m: Mode): m is StorageMode {
  return (STORAGE_MODES as readonly string[]).includes(m);
}

const CAPTURE_MODES: Mode[] = ["journal", "memo", "fourw", "linkclip", "ocr", "voice", "todo", "file"];
const BASIC_CAPTURE_MODES: Mode[] = ["journal"];

const TRACK_OPTIONS: WikiTrack[] = ["daily", "pro"];
const X_PATH = "M 4 4 L 12 12 M 12 4 L 4 12";
const CHECK_PATH = "M 3 7 L 7 11 L 13 5";

// Voice recording phases drive the record/stop control + indicator.
type VoicePhase = "idle" | "recording" | "transcribing";

// recordingUriToBase64 now lives in src/lib/audio/recording-uri.ts (shared with
// the call-reflection recorder). Imported above.

function PathGlyph({ path, color, size = 16 }: { path: string; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessibilityElementsHidden>
      <Path
        d={path}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </Svg>
  );
}

function ModeGlyph({ mode, color, label }: { mode: Mode; color: string; label: string }) {
  const sw = 1.8;
  switch (mode) {
    case "journal":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Path d="M14 4 A8 8 0 1 0 14 20 A6 6 0 1 1 14 4 Z" fill={color} />
        </Svg>
      );
    case "memo":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Path d="M7 17 L8 13 L16 5 L19 8 L11 16 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Line x1="13.5" y1="7.5" x2="16.5" y2="10.5" stroke={color} strokeWidth={sw} />
          <Line x1="6" y1="20" x2="18" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case "linkclip":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Path d="M9.5 14.5 L14.5 9.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M10 8 L8.5 8 C6.5 8 5 9.5 5 11.5 C5 13.5 6.5 15 8.5 15 L10 15" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
          <Path d="M14 9 L15.5 9 C17.5 9 19 10.5 19 12.5 C19 14.5 17.5 16 15.5 16 L14 16" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "ocr":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Rect x="5" y="8" width="14" height="10" rx="1.5" stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M9 8 L10 6 L14 6 L15 8" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Circle cx="12" cy="13" r="2.4" stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M4 5 L4 3 L7 3 M17 3 L20 3 L20 5 M4 19 L4 21 L7 21 M17 21 L20 21 L20 19" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "voice":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Rect x="9.5" y="4" width="5" height="9" rx="2.5" stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M7 11.5 C7 14.5 9.2 16.5 12 16.5 C14.8 16.5 17 14.5 17 11.5" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
          <Line x1="12" y1="16.5" x2="12" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="9" y1="20" x2="15" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case "todo":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Rect x="5" y="5" width="14" height="14" rx="2" stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M8.5 12 L11 14.5 L15.5 9" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case "fourw":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} fill="none" />
          <Rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} fill="none" />
          <Rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} fill="none" />
          <Rect x="13" y="13" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} fill="none" />
        </Svg>
      );
    case "file":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph} accessibilityLabel={label}>
          <Path d="M7 4 L14 4 L18 8 L18 20 L7 20 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Path d="M14 4 L14 8 L18 8" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="9" y1="15" x2="14" y2="15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
  }
}

function TrackGlyph({ id, color }: { id: WikiTrack; color: string }) {
  const sw = 1.8;
  if (id === "daily") {
    return (
      <Svg width={16} height={16} viewBox="0 0 16 16" style={styles.trackGlyph}>
        <Path d="M3 7.4 L8 3.2 L13 7.4" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 7.2 L5 13 L11 13 L11 7.2" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" style={styles.trackGlyph}>
      <Path d="M5.3 6.1 L5.3 4.8 C5.3 4.1 5.8 3.6 6.5 3.6 L9.5 3.6 C10.2 3.6 10.7 4.1 10.7 4.8 L10.7 6.1" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
      <Rect x="3" y="6" width="10" height="6.8" rx="1.2" stroke={color} strokeWidth={sw} fill="none" />
      <Line x1="3" y1="9.1" x2="13" y2="9.1" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

export default function Capture() {
  // Deep-space build renders the design body inside the shared chrome; the legacy
  // capture screen stays for the legacy track. isDeepSpaceUI() is build-constant,
  // so this wrapper holds no hooks and the two paths never mix hook order.
  if (isDeepSpaceUI()) {
    return (
      <DeepSpaceScreen active="capture" variant="windowed">
        <CaptureView />
      </DeepSpaceScreen>
    );
  }
  return <CaptureLegacy />;
}

// Exported for /capture-full: the deep-space track reaches this full multi-mode
// intake (링크/클립/OCR/파일) through that route, reusing these proven pipes
// instead of reimplementing them in the design body (QA F1 follow-up).
export function CaptureLegacy() {
  const { t, i18n } = useTranslation("capture");
  const { userId, loading, isMinor, hasProfile } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const insets = useSafeAreaInsets();
  const keyboardBehavior = Platform.OS === "ios" ? "padding" : "height";
  const keyboardVerticalOffset = Platform.OS === "ios" ? insets.top : 0;
  const scrollBottomPadding = Math.max(
    styles.scroll.paddingBottom,
    insets.bottom + TAB_BAR_HEIGHT + spacing.xxl + spacing.md,
  );
  // KO eyebrows drop tracking to 0 (Hangul reads worse when tracked); EN keeps
  // the light caption tracking.
  const eyebrowTracking = { letterSpacing: locale === "ko" ? 0 : 0.3 };
  const modeLabel = (m: Mode) => t(`modes.${m}.label`);
  const modeHelp = (m: Mode) => t(`modes.${m}.help`);
  const trackLabel = (id: WikiTrack) => t(`tracks.${id}.label`);

  // J4: onboarding hands off with entry=firstRun; until now the param was
  // accepted and never read. First-run framing lowers the blank-page bar
  // ("one sentence is enough") for the journey's very first save.
  // url/text/title arrive from the Web Share Target (manifest.webmanifest):
  // sharing a page from another app opens /capture with the payload here.
  const { entry, url: sharedUrlParam, text: sharedTextParam, title: sharedTitleParam, mode: modeParam, tag: tagParam } =
    useLocalSearchParams<{ entry?: string; url?: string; text?: string; title?: string; mode?: string; tag?: string }>();
  const firstRun = entry === "firstRun";
  const shared = useMemo(
    () => normalizeSharedCaptureParams({ url: sharedUrlParam, text: sharedTextParam, title: sharedTitleParam }),
    [sharedUrlParam, sharedTextParam, sharedTitleParam],
  );

  const [mode, setMode] = useState<Mode>("journal");
  const [showAdvancedModes, setShowAdvancedModes] = useState(false);
  const [track, setTrack] = useState<WikiTrack>("daily");
  const [body, setBody] = useState("");
  const draftsRef = useRef<CaptureDrafts>({});
  const draftHydratedRef = useRef(false);
  // State mirror of draftHydratedRef so the shared-content effect below can
  // sequence itself AFTER hydration (refs don't re-run effects).
  const [draftHydrated, setDraftHydrated] = useState(false);
  const draftUserRef = useRef<string | null>(null);
  // Shared payload bookkeeping: consumed-once per params identity, plus a
  // pending flag the hydration callback reads so the lastMode restore doesn't
  // flash a different mode right before the share applies. The flag is synced
  // in an effect (not during render - a render-phase ref write would make the
  // React Compiler skip this whole screen) declared BEFORE the hydration
  // effect, so it is set by the time the hydration load is even started.
  const sharedConsumedRef = useRef<string | null>(null);
  const pendingSharedRef = useRef(false);
  // Set when hydration skipped its restore in favor of a pending share: the
  // live fields hold nothing then, and folding them back into the draft set
  // would DELETE the stored draft for the current mode (review finding #1).
  const shareSkippedRestoreRef = useRef(false);
  useEffect(() => {
    // A cleared shared param (post-consumption setParams strip, or leaving
    // the share context) also releases the consumed-once latch so re-sharing
    // the identical content later still applies.
    if (!shared) sharedConsumedRef.current = null;
    pendingSharedRef.current = !!shared && sharedConsumedRef.current !== shared.key;
  }, [shared]);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [pickedImage, setPickedImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [ocrReviewApproved, setOcrReviewApproved] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [tagsEditable, setTagsEditable] = useState<string[]>([]);
  // med#4: true once the user taps a 트랙 chip this visit — the AI classifier
  // then keeps its hands off the track (mirrors the user-hashtags-win rule).
  const trackTouchedRef = useRef(false);
  // Clipboard paste offer (⑥-b-i): availability comes from a presence-only
  // probe; the one-line empty note covers the probe-then-cleared race.
  const [clipboardAvailable, setClipboardAvailable] = useState(false);
  const [clipboardEmptyNote, setClipboardEmptyNote] = useState(false);
  // 루루 brief event moment on capture (companion pack §3: captureSaved → lulu).
  const companion = useCompanionMoment();
  // Title of the just-saved piece — drives the inline success panel.
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  // J1: where the saved piece actually lives drives the success CTA. A journal
  // entry lands in `records` (기록 보관소) and gains the graph nothing, so
  // pointing its CTA at the graph sent the very first save to an unchanged
  // screen; classified captures (`sources`) DO become graph nodes.
  const [savedKind, setSavedKind] = useState<"records" | "source" | null>(null);
  const [savedMode, setSavedMode] = useState<Mode | null>(null);
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null);
  const [savedFollowup, setSavedFollowup] = useState<RecordFollowup | null>(null);
  // True when the last capture saved its body inline because the Storage
  // upload failed (CaptureResult.storagePending) — surfaced as a one-line
  // note in the saved panel instead of a silent clean-success.
  const [savedPending, setSavedPending] = useState(false);
  // G3: AI-proposed new clipper format flow (opt-in, offered after an inbox capture).
  const [proposalCtx, setProposalCtx] = useState<{ content: string; url: string | null } | null>(null);
  const [proposal, setProposal] = useState<ProposedClipperTemplate | null>(null);
  const [proposing, setProposing] = useState(false);
  const [formatSavedMsg, setFormatSavedMsg] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<CaptureFeedbackModal>(null);
  const submitAbortRef = useRef<AbortController | null>(null);

  // Journal-mode (일기) state — ported from /journal. Writes to records.
  const progression = useProgression();
  const [journalCount, setJournalCount] = useState(0);
  const [topic, setTopic] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [askAdvisor, setAskAdvisor] = useState(false);
  // 할 일(todo) mode: a single done flag persisted into the saved note's tags.
  const [todoDone, setTodoDone] = useState(false);
  // 4W1H mode (rev2 P4a): five format boxes composed into one note body at
  // submit. Transient like voice/todo — no draft persistence.
  const [fourw, setFourw] = useState<FourWFields>(EMPTY_FOURW);
  // 음성(voice) mode: real on-device recording → transcription. The recorder
  // hook is always created (rules-of-hooks); web/permission/platform guards live
  // in the handlers. On web the recorder may be unavailable — the existing typed
  // transcript box stays as the fallback (handleStartRecording short-circuits).
  // DEVICE VERIFICATION PENDING: no microphone in this environment, so the
  // record→transcribe round-trip has not been run on hardware. Mock transcription
  // (transcribeAudio) is wired so the flow and tests work offline.
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [recentDates, setRecentDates] = useState<string[]>([]);
  // 최근 조각 (recent pieces): the records rows already fetched for the streak
  // double as a tappable recent list under the composer. Each row → /record/[id].
  const [recentRows, setRecentRows] = useState<RecentRow[]>([]);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });
  const streak = useMemo(() => computeStreak(recentDates), [recentDates]);

  // P1-5 (persona sim): capture drafts must survive app switches, tab remounts,
  // and accidental mode taps. Persist text-sized fields only; file/image blobs
  // stay in memory.
  function hasRestorableDraft(draft: CaptureDraft | undefined): draft is CaptureDraft {
    return !!draft && (
      draft.body.trim().length > 0 ||
      draft.topic.trim().length > 0 ||
      (draft.conclusion ?? "").trim().length > 0
    );
  }

  function draftFromFields(targetMode: StorageMode): CaptureDraft {
    return {
      body,
      topic: targetMode === "journal" ? topic : "",
      conclusion: targetMode === "journal" ? conclusion : "",
      ocrReviewApproved: targetMode === "ocr" && ocrReviewApproved,
    };
  }

  function storeDraftForMode(targetMode: StorageMode, draft: CaptureDraft): void {
    const next = { ...draftsRef.current };
    if (hasRestorableDraft(draft)) next[targetMode] = draft;
    else delete next[targetMode];
    draftsRef.current = next;
  }

  function rememberCurrentDraft(): void {
    // Voice/todo are not draft-persisted modes — nothing to remember for them.
    if (!isStorageMode(mode)) return;
    storeDraftForMode(mode, draftFromFields(mode));
  }

  function persistDrafts(lastMode: StorageMode): void {
    if (!userId || !draftHydratedRef.current || draftUserRef.current !== userId) return;
    saveCaptureDraftState(userId, { drafts: draftsRef.current, lastMode });
  }

  function applyDraftToFields(targetMode: StorageMode, draft: CaptureDraft | undefined): void {
    const conclusionDraft = targetMode === "journal" ? draft?.conclusion ?? "" : "";
    setBody(draft?.body ?? "");
    setTopic(targetMode === "journal" ? draft?.topic ?? "" : "");
    setConclusion(conclusionDraft);
    setShowExtras(targetMode === "journal" && conclusionDraft.trim().length > 0);
    setOcrReviewApproved(targetMode === "ocr" && draft?.ocrReviewApproved === true && (draft?.body ?? "").trim().length > 0);
  }
  // A fast first sentence typed before AsyncStorage hydration resolved used to
  // be silently overwritten by the restored draft (audit A-3) — track live
  // input so the restore only applies to untouched fields.
  const preHydrationDirtyRef = useRef(false);
  useEffect(() => {
    if (!draftHydratedRef.current && (body.length > 0 || topic.length > 0 || conclusion.length > 0)) {
      preHydrationDirtyRef.current = true;
    }
  }, [body, topic, conclusion]);
  useEffect(() => {
    if (!userId) {
      draftsRef.current = {};
      draftHydratedRef.current = false;
      setDraftHydrated(false);
      draftUserRef.current = null;
      preHydrationDirtyRef.current = false;
      shareSkippedRestoreRef.current = false;
      return;
    }
    if (draftUserRef.current === userId && draftHydratedRef.current) return;
    let cancelled = false;
    draftHydratedRef.current = false;
    setDraftHydrated(false);
    shareSkippedRestoreRef.current = false;
    draftUserRef.current = userId;
    void loadCaptureDraftState(userId).then((state) => {
      if (cancelled) return;
      draftsRef.current = state.drafts;
      draftHydratedRef.current = true;
      setDraftHydrated(true);
      // The user got here first — keep their live typing (and their mode);
      // the loaded drafts stay in the ref for the other modes.
      if (preHydrationDirtyRef.current) return;
      // An unconsumed share owns the first applied state (the effect below
      // runs right after hydration flips) — skip the lastMode restore so the
      // screen doesn't flash a different mode first. Record the skip: the
      // live fields stay unpopulated, and the consume effect must NOT fold
      // them back in (that would delete the stored draft they never showed).
      if (pendingSharedRef.current) {
        shareSkippedRestoreRef.current = true;
        return;
      }
      const restoredMode = isCaptureDraftMode(state.lastMode) ? state.lastMode : DEFAULT_CAPTURE_DRAFT_MODE;
      if (restoredMode !== "journal") setShowAdvancedModes(true);
      setMode(restoredMode);
      applyDraftToFields(restoredMode, state.drafts[restoredMode]);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  // Shared-content reception (O-R2 scrap track): apply the share-sheet payload
  // to the link-or-clip box once drafts are hydrated. Existing draft text is
  // never destroyed — the leaving mode's live fields are remembered (unless
  // the restore never populated them) and the payload appends below any
  // existing linkclip draft. The fold itself is pure + unit-tested.
  useEffect(() => {
    if (!shared || !userId || !draftHydrated) return;
    if (sharedConsumedRef.current === shared.key) return;
    sharedConsumedRef.current = shared.key;
    const restoreSkipped = shareSkippedRestoreRef.current;
    shareSkippedRestoreRef.current = false;
    // Voice/todo are transient (not draft-persisted): there is no live draft to
    // fold back in, and they have no StorageMode key. Treat the fold as having
    // no live source mode in that case so the share still lands in linkclip.
    const liveStorageMode: StorageMode = isStorageMode(mode) ? mode : "linkclip";
    const { drafts: nextDrafts, linkclipDraft } = consumeSharedIntoDrafts({
      drafts: draftsRef.current,
      liveDraft: isStorageMode(mode) ? draftFromFields(mode) : { body: "", topic: "", conclusion: "" },
      liveMode: liveStorageMode,
      restoreSkipped: restoreSkipped || !isStorageMode(mode),
      content: shared.content,
    });
    draftsRef.current = nextDrafts;
    resetTransientCaptureState();
    setShowAdvancedModes(true);
    setMode("linkclip");
    applyDraftToFields("linkclip", linkclipDraft);
    persistDrafts("linkclip");
    // Strip the consumed payload from the URL so a web refresh (or back/
    // forward) doesn't resurrect content the user may have since edited away.
    router.setParams({ url: undefined, text: undefined, title: undefined });
  }, [shared, userId, draftHydrated]);

  // Deep links can open a specific composer with a pre-attached tag:
  // /capture-full?mode=voice (사진·음성 quick buttons, /beyond mic — med#3/#24)
  // and ?tag=domain:career (별 화면의 담기 — med#1, so the piece lands on the
  // star it was captured from instead of wherever auto-classification guesses).
  // Consumed once after draft hydration, same sequencing as the share effect.
  const modeParamConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draftHydrated) return;
    const m = typeof modeParam === "string" && (CAPTURE_MODES as string[]).includes(modeParam) ? (modeParam as Mode) : null;
    const tg = typeof tagParam === "string" && tagParam.trim().length > 0 ? tagParam.trim() : null;
    if (!m && !tg) return;
    const key = `${m ?? ""}:${tg ?? ""}`;
    if (modeParamConsumedRef.current === key) return;
    modeParamConsumedRef.current = key;
    if (m) {
      setShowAdvancedModes(true);
      setMode(m);
    }
    if (tg) setTagsEditable((prev) => (prev.includes(tg) ? prev : [...prev, tg]));
    router.setParams({ mode: undefined, tag: undefined });
  }, [draftHydrated, modeParam, tagParam]);
  // Clipboard offer probe: presence-only (no content read, no OS notice) when
  // the user lands on the link box, re-run when the app returns to the
  // foreground — the headline flow is "copy in the browser, switch back here",
  // which never re-enters the mode. Native-only inside the helper; web stays
  // on its natural in-page paste.
  useEffect(() => {
    if (mode !== "linkclip") {
      setClipboardEmptyNote(false);
      return;
    }
    let cancelled = false;
    const probe = () => {
      void clipboardHasContent().then((has) => {
        if (!cancelled) setClipboardAvailable(has);
      });
    };
    probe();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") probe();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [mode]);
  useEffect(() => {
    if (!userId || !draftHydratedRef.current || draftUserRef.current !== userId) return;
    // Voice/todo bodies are transient (not persisted across remounts) — skip
    // the StorageMode-keyed draft store for them.
    if (!isStorageMode(mode)) return;
    storeDraftForMode(mode, draftFromFields(mode));
    const handle = setTimeout(() => persistDrafts(mode), 800);
    return () => clearTimeout(handle);
  }, [userId, mode, body, topic, conclusion, ocrReviewApproved]);

  // Load recent record dates (journal streak) + journal use count (free-tier
  // limit) once we have a user.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void Promise.all([
      listRecentRecords(userId),
      countRecordsByKind(userId, "journal"),
    ])
      .then(([rows, jc]) => {
        if (cancelled) return;
        setRecentDates((rows as { created_at: string }[]).map((r) => r.created_at));
        setRecentRows(rows as RecentRow[]);
        setJournalCount(jc);
      })
      .catch((e) => {
        if (typeof console !== "undefined") console.warn("[capture] streak load failed", (e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Link/Clip unified box lives in `body`. If it's a bare URL we detect the
  // clipper kind from it; otherwise it's pasted markdown. These useMemo hooks
  // MUST stay above the early returns below: a hook after a conditional return
  // violates rules-of-hooks, and a userId/loading flip on a later render would
  // skip them and blank the screen (React #300). rules-of-hooks now guards this.
  const linkClipKind = useMemo(() => classifyLinkOrClip(body), [body]);
  const detectedKind = useMemo(
    () => (linkClipKind === "url" ? detectClipperKind(body.trim()) : "inbox"),
    [linkClipKind, body],
  );
  const advancedModesExpanded = showAdvancedModes || mode !== "journal";
  const secondaryOpen = advancedModesExpanded;
  const visibleModes = advancedModesExpanded ? CAPTURE_MODES : BASIC_CAPTURE_MODES;
  const abortSubmitRequest = useCallback((): void => {
    const active = submitAbortRef.current;
    if (!active) return;
    active.abort();
    submitAbortRef.current = null;
    setSubmitting(false);
  }, []);

  useFocusEffect(
    useCallback(() => abortSubmitRequest, [abortSubmitRequest]),
  );

  if (loading) {
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
  // OAuth mints a session before the profile/DOB + PIPA consent exist; a
  // no-profile session must not reach the capture/OCR LLM path (C10 + consent).
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  // 일기(journal) entitlement — feature gate first, then the free tier allows a
  // fixed number of entries. Other modes write to `sources` and were never
  // gated, so this only constrains the journal mode.
  const journalGate = checkGate("journal", progression.totalXp);
  const journalUsage = checkUsage("journal", progression.tier, journalCount);
  // Brain entitlement for the opt-in Advisor follow-up (cycle-5 wiring of the
  // previously dead canUsePremium — the AI reflection is the marginal-cost
  // surface, mirroring the chat daily cap).
  const advisorUnlocked = canUsePremium("advisor", progression.tier);
  const streakMissingToday = streak.capturedToday ? "" : t("journal.streak.missingToday");

  function showFeedback(title: string, body: string, retry?: () => void): void {
    setFeedbackModal({ title, body, retry });
  }

  function submitIsCurrent(controller: AbortController): boolean {
    return submitAbortRef.current === controller && !controller.signal.aborted;
  }

  function retryFeedbackModal(): void {
    const current = feedbackModal;
    setFeedbackModal(null);
    current?.retry?.();
  }

  function resetTransientCaptureState() {
    setPickedFile(null);
    setPickedImage(null);
    setExtracting(false);
    setTagsEditable([]);
    setAskAdvisor(false);
    setProposalCtx(null);
    setProposal(null);
    setFormatSavedMsg(null);
    // Clear the WHOLE saved panel, not half of it: leaving savedTitle/Kind
    // while nulling savedMode degraded an OCR success panel to generic copy
    // and left a "see the graph" CTA whose highlight id was gone (audit A-2).
    setSavedMode(null);
    setSavedSourceId(null);
    setSavedTitle(null);
    setSavedKind(null);
    setSavedFollowup(null);
    setSavedPending(false);
  }

  function reset() {
    setBody("");
    setOcrReviewApproved(false);
    setTopic("");
    setConclusion("");
    setShowExtras(false);
    setTodoDone(false);
    setFourw(EMPTY_FOURW);
    resetTransientCaptureState();
  }

  function clearModeDraft(targetMode: Mode): void {
    // Only StorageMode modes have a persisted draft to clear.
    if (!isStorageMode(targetMode)) return;
    const next = { ...draftsRef.current };
    delete next[targetMode];
    draftsRef.current = next;
    if (userId) clearCaptureDraft(userId, targetMode);
  }

  function switchCaptureMode(nextMode: Mode): void {
    if (nextMode === mode) return;
    rememberCurrentDraft();
    resetTransientCaptureState();
    setMode(nextMode);
    if (nextMode !== "journal") setShowAdvancedModes(true);
    // Voice/todo are not draft-persisted: clear the live fields and skip the
    // StorageMode-keyed restore/persist so their content does not leak between
    // modes or hit the draft store.
    if (isStorageMode(nextMode)) {
      applyDraftToFields(nextMode, draftsRef.current[nextMode]);
      persistDrafts(nextMode);
    } else {
      setBody("");
      setTopic("");
      setConclusion("");
      setShowExtras(false);
      setOcrReviewApproved(false);
    }
    setTodoDone(false);
  }

  // Explicit user action — the OS paste notice firing here is the contract.
  async function pasteCopiedContent(): Promise<void> {
    const text = await readClipboardText();
    if (!text) {
      // Presence said yes but the read came back empty (cleared in between,
      // or an image-only clipboard) — say so instead of doing nothing.
      setClipboardAvailable(false);
      setClipboardEmptyNote(true);
      return;
    }
    setClipboardEmptyNote(false);
    setBody((prev) => {
      const current = prev.trim();
      return current.length === 0 ? text : `${prev.trimEnd()}\n\n${text}`;
    });
  }

  async function pickImage(source: "library" | "camera") {
    if (!userId) return;
    try {
      const img = await pickImageAsset(source);
      if (!img) return;
      setPickedImage(img);
      setOcrReviewApproved(false);
      setBody(""); // clear any prior extraction; the user presses 추출하기 to fill
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[capture] image pick failed", (e as Error).message);
      // P2-5: deterministic failures get their own copy — the generic "try
      // again in a moment" framing misdiagnoses them. Camera permission keeps
      // a retry (granting permission makes it succeed); an unsupported or
      // damaged file does NOT (the same file will fail forever — no retry
      // button, the user must pick a different image).
      if (isImageCameraPermissionDeniedError(e)) {
        showFeedback(t("alerts.cameraPermission.title"), t("alerts.cameraPermission.message"), () => void pickImage(source));
        return;
      }
      if (isImageOcrTooLargeError(e)) {
        showFeedback(t("alerts.ocrTooLarge.title"), t("alerts.ocrTooLarge.message"));
        return;
      }
      if (isImageOcrUnsupportedTypeError(e)) {
        showFeedback(t("alerts.ocrUnsupportedType.title"), t("alerts.ocrUnsupportedType.message"));
        return;
      }
      // C-2: missing data has its own accurate copy ("couldn't read the file
      // from the picker") — folding it into "damaged" misdiagnosed it.
      if (isImageOcrMissingDataError(e)) {
        showFeedback(t("alerts.ocrMissingData.title"), t("alerts.ocrMissingData.message"));
        return;
      }
      if (isImageOcrInvalidDataError(e)) {
        showFeedback(t("alerts.ocrInvalidData.title"), t("alerts.ocrInvalidData.message"));
        return;
      }
      showFeedback(
        t("alerts.imageOpen.title"),
        t("alerts.imageOpen.message"),
        () => void pickImage(source),
      );
    }
  }

  async function runExtract() {
    if (!userId || !pickedImage) return;
    setExtracting(true);
    try {
      const md = await ocrImageAsset(userId, locale, pickedImage, isMinor === true);
      setBody(md);
      setOcrReviewApproved(false);
      // 사진에서 글자를 읽어냈다 — fresh information, the delight beat.
      reactExpression("delight");
    } catch (e) {
      // Split-② guards turned the crisis output swap into a typed throw; the
      // generic "clearer photo" alert here would HIDE the hotline from a user
      // who just photographed crisis content and invite paid retries (review
      // blocking finding). Route to the crisis modal like the journal path.
      if (isImageOcrCrisisResultError(e)) {
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
        return;
      }
      if (isImageOcrEmptyResultError(e)) {
        // Honest empty state: a retry CAN help here (closer, better-lit photo),
        // unlike the generic read-failure framing.
        showFeedback(
          t("alerts.ocrEmptyResult.title"),
          t("alerts.ocrEmptyResult.message"),
          () => void runExtract(),
        );
        return;
      }
      // P2-5: the size/type/data guards can also fire at extract time (e.g. a
      // payload normalized past the cap). Same deterministic-failure rule: no
      // retry button when retrying the same image cannot succeed.
      if (isImageOcrTooLargeError(e)) {
        showFeedback(t("alerts.ocrTooLarge.title"), t("alerts.ocrTooLarge.message"));
        return;
      }
      if (isImageOcrUnsupportedTypeError(e)) {
        showFeedback(t("alerts.ocrUnsupportedType.title"), t("alerts.ocrUnsupportedType.message"));
        return;
      }
      if (isImageOcrMissingDataError(e)) {
        showFeedback(t("alerts.ocrMissingData.title"), t("alerts.ocrMissingData.message"));
        return;
      }
      if (isImageOcrInvalidDataError(e)) {
        showFeedback(t("alerts.ocrInvalidData.title"), t("alerts.ocrInvalidData.message"));
        return;
      }
      if (typeof console !== "undefined") console.warn("[capture] OCR extract failed", (e as Error).message);
      showFeedback(
        t("alerts.ocrRead.title"),
        t("alerts.ocrRead.message"),
        () => void runExtract(),
      );
    } finally {
      setExtracting(false);
    }
  }

  async function runFilePick() {
    try {
      const f = await pickFile();
      if (!f) return;
      setPickedFile(f);
      if (f.textContent) setBody(f.textContent);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[capture] file pick failed", (e as Error).message);
      showFeedback(
        t("alerts.fileOpen.title"),
        t("alerts.fileOpen.message"),
        () => void runFilePick(),
      );
    }
  }

  function removeTag(t: string) {
    setTagsEditable((prev) => prev.filter((x) => x !== t));
  }

  function addTagFromInput(input: string) {
    const norm = input.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
    if (norm.length === 0 || tagsEditable.includes(norm)) return;
    setTagsEditable((prev) => [...prev, norm].slice(0, 10));
  }

  function updateOcrBody(text: string) {
    setBody(text);
    setOcrReviewApproved(false);
  }

  const hasOcrDraft = mode === "ocr" && body.trim().length > 0;
  const savedIsOcr = savedKind === "source" && savedMode === "ocr";
  const openSavedGraph = () => {
    if (savedSourceId) {
      router.push({ pathname: "/", params: { highlightRecordId: savedSourceId } });
      return;
    }
    router.push("/");
  };
  // Post-save destination for records-path captures: open the just-saved
  // /record/[id] when we have its id (voice/todo notes carry it), otherwise the
  // records browser. Journal entries leave savedSourceId null → records list.
  const openSavedRecord = () => {
    if (savedSourceId) {
      router.push({ pathname: "/record/[id]", params: { id: savedSourceId } });
      return;
    }
    router.push("/records");
  };

  const canSubmit = !!userId && !submitting && (
    (mode === "journal" && journalGate.unlocked && journalUsage.allowed && body.trim().length > 0) ||
    (mode === "memo" && body.trim().length > 0) ||
    (mode === "linkclip" && body.trim().length > 0) ||
    (mode === "ocr" && hasOcrDraft && ocrReviewApproved) ||
    (mode === "voice" && body.trim().length > 0) ||
    (mode === "todo" && body.trim().length > 0) ||
    (mode === "fourw" && fourWHasContent(fourw)) ||
    (mode === "file" && (!!pickedFile || body.trim().length > 0))
  );
  const submitAccessibilityHint = canSubmit
    ? undefined
    : submitting
      ? t("submitHints.saving")
      : mode === "journal" && !journalGate.unlocked
        ? t("submitHints.journalLocked", { level: journalGate.requiredLevel })
        : mode === "journal" && !journalUsage.allowed
          ? t("submitHints.journalLimit")
          : mode === "ocr" && hasOcrDraft && !ocrReviewApproved
            ? t("ocrReview.submitHint")
            : mode === "ocr"
              ? t("submitHints.ocrRequired")
              : mode === "file"
                ? t("submitHints.fileRequired")
                : mode === "voice"
                  ? t("submitHints.voiceRequired")
                  : mode === "todo"
                    ? t("submitHints.todoRequired")
                    : mode === "fourw"
                      ? t("submitHints.fourwRequired")
                      : t("submitHints.writeFirst");

  // 일기(journal) mode writes to `records` via createRecord: streak, optional
  // topic/conclusion, and an opt-in Advisor reply. Crisis routing is honoured.
  async function handleJournalSubmit() {
    if (!userId || !body.trim()) return;
    setSubmitting(true);
    try {
      const res = await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "journal",
        body: body.trim(),
        topic: topic.trim().length > 0 ? topic.trim() : undefined,
        tags: tagsEditable.length > 0 ? tagsEditable : undefined,
        conclusion: conclusion.trim().length > 0 ? conclusion.trim() : undefined,
        withFollowup: askAdvisor && advisorUnlocked,
        tier: progression.tier,
      });
      if (res.followup?.zone === "red") {
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
      }
      const savedTopic = topic.trim();
      reset();
      companion.fire("journalSaved");
      // The entry is in records now — the persisted draft has served its
      // purpose and must not resurrect on the next visit.
      clearModeDraft("journal");
      setSavedTitle(savedTopic.length > 0 ? savedTopic : t("savedTitleFallback"));
      setSavedKind("records");
      setSavedMode("journal");
      setSavedSourceId(null);
      setSavedFollowup(res.followup ?? null);
      setSavedPending(false);
      // Refresh streak + journal use count (free-tier limit) + XP (the entry
      // earns progression, mirroring the retired /journal screen).
      void progression.refresh();
      void Promise.all([
        listRecentRecords(userId),
        countRecordsByKind(userId, "journal"),
      ])
        .then(([rows, jc]) => {
          setRecentDates((rows as { created_at: string }[]).map((r) => r.created_at));
          setRecentRows(rows as RecentRow[]);
          setJournalCount(jc);
        })
        .catch((e) => {
          // Post-save streak/count refresh is best-effort, but swallowing it left
          // stale streak + journal-usage numbers on screen. Log and leave the
          // prior values rather than masking the failure entirely.
          if (typeof console !== "undefined") console.warn("[capture] streak refresh failed", (e as Error).message);
        });
    } catch (e) {
      reactExpression("negative");
      if (typeof console !== "undefined") console.warn("[capture] journal save failed", (e as Error).message);
      showFeedback(
        t("alerts.journalSave.title"),
        t("alerts.journalSave.message"),
        () => void handleJournalSubmit(),
      );
    } finally {
      setSubmitting(false);
    }
  }

  // 음성(voice) / 할 일(todo) modes write to `records` via createRecord(kind:
  // "note") — the same store as 메모/일기, so they get a /record/[id] page and
  // count toward the daily-capture streak. A distinguishing tag keeps the kind
  // alive end-to-end (voice → #voice, todo → #todo plus #done when finished).
  // createRecord runs the safety classifier (C9) + audit log (C3) on this path.
  // Voice mode now records real on-device audio (expo-audio) and transcribes it
  // (transcribeAudio) into `body` for review/edit before this save runs; the
  // typed-transcript box stays as the fallback (web / permission denied).
  async function handleNoteLikeSubmit(noteMode: "voice" | "todo" | "fourw") {
    // 4W1H composes its five boxes into the note body; voice/todo use the box.
    const noteBody = noteMode === "fourw" ? composeFourWBody(fourw, locale) : body.trim();
    if (!userId || !noteBody) return;
    setSubmitting(true);
    try {
      const baseTag = noteMode;
      const tags = [
        baseTag,
        ...(noteMode === "todo" && todoDone ? ["done"] : []),
        ...tagsEditable,
      ];
      const res = await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "note",
        body: noteBody,
        tags,
        tier: progression.tier,
        // 0066: 4W1H keeps the machine-readable payload beside the flattened body.
        structured: noteMode === "fourw" ? composeStructured("fourw", fourw) ?? undefined : undefined,
      });
      // Crisis routing parity with journal (:934): voice/todo/4W1H are the
      // user's own words on the SAME createRecord path, but this handler used
      // to drop res.followup on the floor (setSavedFollowup(null)) — a red-zone
      // save wrote the safety ledger and showed the user NOTHING. Same hotline
      // modal, same followup card.
      if (res.followup?.zone === "red") {
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
      }
      const savedBody = noteBody;
      reset();
      companion.fire("captureSaved");
      setSavedTitle(savedBody.length > 0 ? savedBody : t("savedTitleFallback"));
      setSavedKind("records");
      setSavedMode(noteMode);
      // Reuse savedSourceId as the just-saved record id so the success CTA can
      // open /record/[id] for note-like captures too.
      setSavedSourceId(res.id);
      setSavedFollowup(res.followup ?? null);
      setSavedPending(false);
      void progression.refresh();
      void Promise.all([
        listRecentRecords(userId),
        countRecordsByKind(userId, "journal"),
      ])
        .then(([rows, jc]) => {
          setRecentDates((rows as { created_at: string }[]).map((r) => r.created_at));
          setRecentRows(rows as RecentRow[]);
          setJournalCount(jc);
        })
        .catch((e) => {
          if (typeof console !== "undefined") console.warn("[capture] recent refresh failed", (e as Error).message);
        });
    } catch (e) {
      reactExpression("negative");
      if (typeof console !== "undefined") console.warn("[capture] note-like save failed", (e as Error).message);
      showFeedback(
        t("alerts.pieceSave.title"),
        t("alerts.pieceSave.message"),
        () => void handleNoteLikeSubmit(noteMode),
      );
    } finally {
      setSubmitting(false);
    }
  }

  // 음성(voice) recording: request mic permission on first record, then capture
  // on-device audio. Web (or any platform where the recorder is unavailable)
  // falls back to the existing typed-transcript box with a brief notice — never
  // crashes. propose->ratify: the transcript lands in `body` for review/edit
  // BEFORE the user presses 담기 to save.
  async function handleStartRecording() {
    if (!userId || voicePhase !== "idle") return;
    setVoiceNotice(null);
    // Web recording is unreliable across browsers; keep the typed fallback.
    if (Platform.OS === "web") {
      setVoiceNotice(t("voice.webFallback"));
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        // Permission denied → fall back to the typed transcript box.
        setVoiceNotice(t("voice.permissionDenied"));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoicePhase("recording");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[capture] start recording failed", (e as Error).message);
      setVoicePhase("idle");
      setVoiceNotice(t("voice.recordFailed"));
    }
  }

  async function handleStopRecording() {
    if (!userId || voicePhase !== "recording") return;
    setVoicePhase("transcribing");
    let recordingUri: string | null = null;
    try {
      await audioRecorder.stop();
      recordingUri = audioRecorder.uri;
      if (!recordingUri) {
        setVoicePhase("idle");
        setVoiceNotice(t("voice.recordFailed"));
        return;
      }
      const { base64, mimeType } = await recordingUriToBase64(recordingUri);
      const reply = await transcribeAudio({
        userId,
        locale,
        base64,
        mimeType,
        minor: isMinor === true,
      });
      // C9: a red-zone transcript was swapped server-side for the fixed crisis
      // template — route to the hotline instead of populating the body with it.
      if (reply.safety?.zone === "red") {
        setVoicePhase("idle");
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
        return;
      }
      const transcript = reply.text.trim();
      if (transcript.length === 0) {
        setVoicePhase("idle");
        setVoiceNotice(t("voice.transcriptEmpty"));
        return;
      }
      // 받아쓰기 성공 — a happy beat as the words land in the box.
      reactExpression("happy");
      // propose->ratify: fill the body so the user reviews/edits before saving.
      setBody((prev) => {
        const current = prev.trim();
        return current.length === 0 ? transcript : `${prev.trimEnd()}\n\n${transcript}`;
      });
      setVoicePhase("idle");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[capture] transcription failed", (e as Error).message);
      setVoicePhase("idle");
      setVoiceNotice(t("voice.transcribeFailed"));
    } finally {
      // Privacy parity with call-reflection: drop the temp audio once the text
      // has been extracted (runs on the crisis / empty / error paths too).
      await discardRecording(recordingUri);
    }
  }

  async function handleSubmit() {
    if (!userId) return;
    // In-flight guard must precede the journal/note-like delegations. Those
    // handlers manage `submitting` themselves but were reached *before* this
    // check, so a double-tap fired two paid callAdvisor calls + inserted a
    // duplicate record. Guarding at entry blocks re-entry for every mode.
    if (submitting) return;
    if (mode === "journal") return handleJournalSubmit();
    if (mode === "voice" || mode === "todo" || mode === "fourw") return handleNoteLikeSubmit(mode);
    const submittedMode = mode;
    submitAbortRef.current?.abort();
    const submitController = new AbortController();
    submitAbortRef.current = submitController;
    const submitSignal = submitController.signal;
    setSubmitting(true);
    try {
      // Compose the body that captureFromMarkdown will index.
      // memo / ocr already have body. linkclip: a bare URL becomes a titled
      // stub; pasted markdown is used as-is. file falls back to filename.
      const isBareLink = mode === "linkclip" && linkClipKind === "url";
      // fallbackUrl: the bare URL, or the first URL found inside clipped md.
      const fallbackUrl =
        mode === "linkclip"
          ? (isBareLink ? body.trim() : firstUrlIn(body))
          : null;

      let finalBody = body.trim();
      if (isBareLink) {
        finalBody = `# ${body.trim()}\n\n${body.trim()}`;
      }
      if (mode === "file" && pickedFile && finalBody.length === 0) {
        finalBody = `# ${pickedFile.name}\n\nFile attachment - ${pickedFile.mimeType}, ${pickedFile.size} bytes.`;
      }

      // AI clipper classification on toss (2026-06-01 directive): one call
      // reads the content, picks the clipper kind, and fills the semantic
      // frontmatter (target-category / simon-relevance / actionable-takeaway /
      // kind-specific props). User-curated hashtags win; failure never blocks
      // the save (degrades to the URL-derived kind + no extra frontmatter).
      let finalTags = tagsEditable;
      let suggestedTrack: WikiTrack = track;
      const trackChosenByUser = trackTouchedRef.current;
      // OCR is user-authored knowledge → keep self_knowledge; else let the AI pick.
      let kindOverride: SourceKind | null = mode === "ocr" ? "self_knowledge" : null;
      let extraFrontmatter: Record<string, unknown> | undefined;
      let simonRelevance: number | null = null;
      if (finalBody.length > 0) {
        try {
          const cls = await classifyClipper(userId, finalBody, fallbackUrl, locale, isMinor === true, submitSignal);
          if (!submitIsCurrent(submitController)) return;
          if (tagsEditable.length === 0) finalTags = cls.tags;
          // audit med#4: the AI used to overwrite the user's explicit 트랙 pick
          // unconditionally — the chip only "worked" when the AI failed. Same
          // rule as hashtags one line up: the user's curation wins.
          if (!trackChosenByUser) suggestedTrack = cls.track;
          if (mode !== "ocr") kindOverride = cls.kind;
          extraFrontmatter = {
            ...cls.props,
            "target-category": cls.targetCategory,
            "actionable-takeaway": cls.actionableTakeaway,
            summary: cls.summary,
          };
          simonRelevance = cls.simonRelevance;
        } catch (e) {
          if (isAbortError(e) || !submitIsCurrent(submitController)) return;
          if (typeof console !== "undefined") console.warn("[capture] auto-classify failed", (e as Error).message);
        }
      }
      if (!submitIsCurrent(submitController)) return;

      const result = await captureFromMarkdown({
        userId,
        rawMd: finalBody,
        fallbackUrl,
        kindOverride,
        userTags: finalTags,
        track: suggestedTrack,
        extraFrontmatter,
        simonRelevance,
        signal: submitSignal,
      });
      if (!submitIsCurrent(submitController)) return;

      // Memo is self-authored text like journal, but it lands on the sources
      // path which never ran crisis classification — a red-zone memo surfaced
      // NO hotline while journal (records path) and OCR both protect (same
      // gap class as persona-sim P1-1). Reuse the local classifier + audited
      // routing; the save above already succeeded and stays untouched.
      // linkclip/file stay excluded: clipped web articles about a tragedy are
      // not the user's own words (false-positive surface).
      if (submittedMode === "memo") {
        try {
          if (!submitIsCurrent(submitController)) return;
          const crisis = await classifyRecordTextForCrisis(finalBody, locale, userId, isMinor === true);
          if (!submitIsCurrent(submitController)) return;
          if (crisis) {
            setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
          }
        } catch (e) {
          if (!submitIsCurrent(submitController)) return;
          if (typeof console !== "undefined") console.warn("[capture] memo crisis classify failed", (e as Error).message);
        }
      }
      if (!submitIsCurrent(submitController)) return;

      reset();
      clearModeDraft(submittedMode);
      // 루루 carries the shard home; an imported link gets the "success" beat.
      companion.fire(isBareLink ? "linkImported" : "captureSaved");
      // Inline success panel (journal-capture pack §3/§7) replaces the alert.
      setSavedTitle(result.source.title);
      setSavedKind("source");
      setSavedMode(submittedMode);
      setSavedSourceId(result.source.id);
      setSavedFollowup(null);
      setSavedPending(result.storagePending);
      // G3: a capture that landed as "inbox" (no specific format fit) is the
      // signal to offer an AI-proposed new format. Gate on body length so
      // trivial memos don't prompt. Opt-in: nothing runs until the user taps.
      if (result.source.kind === "inbox" && finalBody.trim().length >= 120) {
        setProposalCtx({ content: finalBody, url: fallbackUrl });
      }
    } catch (e) {
      if (isAbortError(e) || !submitIsCurrent(submitController)) return;
      reactExpression("negative");
      if (typeof console !== "undefined") console.warn("[capture] capture save failed", (e as Error).message);
      showFeedback(
        t("alerts.pieceSave.title"),
        t("alerts.pieceSave.message"),
        () => void handleSubmit(),
      );
    } finally {
      if (submitAbortRef.current === submitController) {
        submitAbortRef.current = null;
        setSubmitting(false);
      }
    }
  }

  // G3: AI proposes a new clipper format for material that fit no existing one.
  // Opt-in — only runs when the user taps. Never blocks; a null proposal (mock
  // mode, bad reply, or C-vocabulary filtered) just tells the user there's none.
  async function runPropose() {
    if (!userId || !proposalCtx || proposing) return;
    setProposing(true);
    try {
      const p = await proposeClipperTemplate(userId, proposalCtx.content, proposalCtx.url, locale, isMinor === true);
      if (!p) {
        setProposalCtx(null);
        showFeedback(
          t("alerts.proposeEmpty.title"),
          t("alerts.proposeEmpty.message"),
        );
        return;
      }
      setProposal(p);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[capture] format propose failed", (e as Error).message);
      showFeedback(
        t("alerts.proposeFailed.title"),
        t("alerts.proposeFailed.message"),
        () => void runPropose(),
      );
    } finally {
      setProposing(false);
    }
  }

  // Save the proposed format to the user's own library; `share` opts it in to
  // the community (clipper_templates.is_shared, so every user can read it).
  async function saveProposed(share: boolean) {
    if (!userId || !proposal) return;
    try {
      await saveTemplate({
        ownerId: userId,
        slug: proposal.slug,
        baseKind: proposal.baseKind,
        name: proposal.name,
        what: proposal.what,
        defaultTags: proposal.defaultTags,
        targetCategory: proposal.targetCategory,
        aiProperties: proposal.aiProperties,
        shared: share,
      });
      setProposal(null);
      setProposalCtx(null);
      setFormatSavedMsg(
        share ? t("formatSaved.shared") : t("formatSaved.personal"),
      );
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[capture] format save failed", (e as Error).message);
      showFeedback(
        t("alerts.formatSave.title"),
        t("alerts.formatSave.message"),
        () => void saveProposed(share),
      );
    }
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding }]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={styles.primaryHeader}
            accessible
            accessibilityLabel={
              // P2-12: the firstRun hint renders INSIDE this accessible
              // container, so the fixed label swallowed it — TalkBack users
              // never heard "one sentence is enough" on their very first
              // capture. Fold it into the spoken label while it is visible.
              firstRun && !savedTitle && mode === "journal"
                ? `${t("hero.title")} ${t("hero.subtitle")} ${t("firstRun.hint")}`
                : `${t("hero.title")} ${t("hero.subtitle")}`
            }
            accessibilityHint={
              // J1: the spoken hint must match where the piece actually went —
              // the old graph promise on a journal save re-broke the journey
              // for screen-reader users right above the corrected CTA.
              savedTitle
                ? savedKind === "records"
                  ? t("hero.speechSavedRecords")
                  : savedIsOcr
                    ? t("hero.speechSavedOcr")
                  : t("hero.speechSaved")
                : t("hero.speechIdle")
            }
          >
            <ShardArt id="capture_mint" size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
                {t("hero.eyebrow")}
              </Text>
              <Text variant="heading" numberOfLines={2}>
                {savedTitle ? (savedIsOcr ? t("saved.ocrTitle") : t("saved.title")) : t("hero.title")}
              </Text>
              {firstRun && !savedTitle && mode === "journal" ? (
                // J4: first-run framing under the hero — one quiet line that
                // lowers the blank-page bar for the journal default. Hidden in
                // the other modes ("one sentence" reads wrong over a PDF pick)
                // and once a save lands.
                <Text variant="subtle" color="textMuted" style={{ marginTop: 2 }}>
                  {t("firstRun.hint")}
                </Text>
              ) : null}
            </View>
          </View>

          {/* O-31 Stage③ (nav-contract §3): in deep-space mode, surface the
              담기 second-tier so 형식 /formats, 가져오기 /import, 받은항목 /inbox
              and 수동입력 /manual are reachable directly from 담기 (누락 0).
              Legacy mode renders nothing here — its 형식 entry is the inline
              manage-formats link below. */}
          {isDeepSpaceUI() ? (
            <DeepSpaceLinks
              groups={[
                {
                  title: t("captureTab"),
                  items: [
                    // med#11: this entry means the clipper FORMAT MANAGER, not
                    // the export screen the bare route renders in deep-space.
                    { key: "formats", label: t("formatsTab"), route: "/formats?view=manager" },
                    { key: "import", label: t("importTab"), route: "/import" },
                    { key: "inbox", label: t("inboxTab"), route: "/inbox" },
                    { key: "manual", label: t("manualTab"), route: "/manual" },
                  ],
                },
              ]}
            />
          ) : null}

          {/* Import success → graph link (journal-capture pack §3/§7) */}
          {savedTitle ? (
            <PremiumCard style={styles.savedPanel}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <ShardArt id="capture_mint" size={48} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" color="brand" style={{ fontWeight: "600" }}>
                    {savedIsOcr ? t("saved.ocrTitle") : t("saved.title")}
                  </Text>
                  <Text variant="subtle" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
                    {savedIsOcr ? t("saved.ocrBody") : savedTitle}
                  </Text>
                  {savedPending ? (
                    <Text variant="subtle" color="textSubtle" style={{ marginTop: 2 }}>
                      {t("saved.storagePending")}
                    </Text>
                  ) : null}
                  {savedKind === "records" ? (
                    <View style={styles.savedRecordTruth}>
                      <Text variant="subtle" color="textMuted">
                        {t("saved.recordsOwnership")}
                      </Text>
                      <Text variant="subtle" color="textSubtle">
                        {t("saved.recordsAiOptIn")}
                      </Text>
                    </View>
                  ) : null}
                  {savedKind === "records" && savedFollowup ? (
                    <AdvisorFollowupNote
                      followup={savedFollowup}
                      labels={{
                        heading: t("saved.advisor.heading"),
                        sources: t("saved.advisor.sources"),
                        whyThis: t("saved.advisor.whyThis"),
                        evidenceFallback: t("saved.advisor.evidenceFallback"),
                      }}
                      style={styles.savedAdvisorNote}
                      testID="capture-advisor-followup"
                    />
                  ) : null}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                {/* J1: send the user where the piece actually IS — a journal
                    save opens 기록 보관소 (it adds no graph node), a classified
                    capture opens the graph it just lit up. */}
                {savedKind === "records" ? (
                  <PremiumButton
                    label={t("saved.seeRecords")}
                    variant="secondary"
                    onPress={openSavedRecord}
                    accessibilityHint={t("saved.seeRecordsHint")}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <PremiumButton
                    label={savedIsOcr ? t("saved.seeOcrGraph") : t("saved.seeGraph")}
                    variant="secondary"
                    onPress={openSavedGraph}
                    accessibilityHint={savedIsOcr ? t("saved.seeOcrGraphHint") : t("saved.seeGraphHint")}
                    style={{ flex: 1 }}
                  />
                )}
                <PremiumButton label={t("saved.captureMore")} variant="ghost" onPress={() => { setSavedTitle(null); setSavedKind(null); setSavedMode(null); setSavedSourceId(null); setSavedFollowup(null); setSavedPending(false); }} style={{ flex: 1 }} />
              </View>
            </PremiumCard>
          ) : null}

          {/* G3: after an "inbox" capture (no format fit), offer an AI-proposed
              new clipper format. Opt-in: nothing runs until the user taps. */}
          {proposalCtx || proposal || formatSavedMsg ? (
            <PremiumCard style={styles.proposalPanel}>
              {formatSavedMsg ? (
                <Text variant="body" color="brand">{formatSavedMsg}</Text>
              ) : proposal ? (
                <View style={{ gap: spacing.xs }}>
                  <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
                    {t("proposal.heading")}
                  </Text>
                  <Text variant="body" style={{ fontWeight: "600" }}>
                    {(locale === "ko" ? proposal.name.ko : proposal.name.en) || proposal.name.en || proposal.name.ko}
                  </Text>
                  <Text variant="subtle" color="textMuted">
                    {(locale === "ko" ? proposal.what.ko : proposal.what.en) || proposal.what.en}
                  </Text>
                  <Text variant="subtle" color="textSubtle">
                    {t("proposal.baseKind", { kind: proposal.baseKind })}
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                    <PremiumButton
                      label={t("proposal.saveMine")}
                      variant="secondary"
                      onPress={() => saveProposed(false)}
                      style={{ flex: 1 }}
                    />
                    <PremiumButton
                      label={t("proposal.saveShare")}
                      variant="primary"
                      onPress={() => saveProposed(true)}
                      style={{ flex: 1 }}
                    />
                  </View>
                  <Pressable
                    hitSlop={14}
                    onPress={() => { setProposal(null); setProposalCtx(null); }}
                    style={styles.proposalDismissLink}
                    accessibilityRole="button"
                    accessibilityLabel={t("proposal.dismissLabel")}
                  >
                    <Text variant="caption" color="textSubtle">{t("proposal.notNow")}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  <Text variant="subtle" color="textMuted">
                    {t("proposal.prompt")}
                  </Text>
                  <PremiumButton
                    label={proposing ? t("proposal.drafting") : t("proposal.action")}
                    variant="secondary"
                    onPress={runPropose}
                  />
                </View>
              )}
            </PremiumCard>
          ) : null}

          {/* Entry to the format-manager (/formats): list, share, edit, or delete
              the clipper formats — including any just proposed above. */}
          {secondaryOpen ? (
            <Pressable
              onPress={() => router.push({ pathname: "/formats", params: { view: "manager" } })}
              hitSlop={14}
              style={styles.manageFormatsLink}
              accessibilityRole="button"
              accessibilityLabel={t("sections.manageFormats.accessibilityLabel")}
            >
              <Text variant="caption" color="brand">
                {t("sections.manageFormats.link")}
              </Text>
            </Pressable>
          ) : null}

          {/* Track toggle: 일상 / Pro — only for capture modes (not journal). */}
          {secondaryOpen && mode !== "journal" ? (
          <View style={styles.trackCard}>
            <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
              {t("sections.track.eyebrow")}
            </Text>
            <View
              style={styles.trackRow}
              accessibilityRole="tablist"
              accessibilityLabel={t("sections.track.accessibilityLabel")}
            >
              {TRACK_OPTIONS.map((option) => {
                const active = track === option;
                const color = active ? semantic.background : semantic.textMuted;
                const label = trackLabel(option);
                return (
                  <Pressable
                    key={option}
                    style={[styles.trackChip, active && styles.trackChipActive]}
                    onPress={() => {
                      // An explicit pick means the AI must not override it (med#4).
                      trackTouchedRef.current = true;
                      setTrack(option);
                    }}
                    hitSlop={14}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={label}
                  >
                    <TrackGlyph id={option} color={color} />
                    <Text style={[styles.trackChipText, active && styles.trackChipTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          ) : null}

          {secondaryOpen ? (
            <>
              {/* Mode tabs */}
              <View
                style={styles.modeRow}
                accessibilityRole="tablist"
                accessibilityLabel={t("sections.mode.accessibilityLabel")}
              >
                {visibleModes.map((m) => {
                  const active = mode === m;
                  const color = active ? semantic.background : semantic.textMuted;
                  const label = modeLabel(m);
                  const help = modeHelp(m);
                  return (
                    <Pressable
                      key={m}
                      style={[styles.modeTab, active && styles.modeTabActive]}
                      onPress={() => {
                        switchCaptureMode(m);
                      }}
                      hitSlop={14}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${label}. ${help}`}
                      accessibilityHint={help}
                    >
                      <ModeGlyph mode={m} color={color} label={label} />
                      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  key="advanced-toggle"
                  style={[styles.modeTab, styles.modeMoreTab, advancedModesExpanded && styles.modeMoreTabExpanded]}
                  onPress={() => {
                    if (advancedModesExpanded) {
                      setShowAdvancedModes(false);
                      if (mode !== "journal") {
                        switchCaptureMode("journal");
                      }
                    } else {
                      setShowAdvancedModes(true);
                    }
                  }}
                  hitSlop={14}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: advancedModesExpanded }}
                  accessibilityLabel={advancedModesExpanded ? t("sections.mode.less") : t("sections.mode.more")}
                  accessibilityHint={advancedModesExpanded ? t("sections.mode.lessHint") : t("sections.mode.moreHint")}
                >
                  <Text style={styles.modeMoreLabel}>
                    {advancedModesExpanded ? t("sections.mode.less") : t("sections.mode.more")}
                  </Text>
                </Pressable>
              </View>

              <Text variant="subtle" color="textMuted" style={styles.modeHelp} numberOfLines={2}>
                {t(`modes.${mode}.help`)}
              </Text>
            </>
          ) : null}

          {/* Journal (일기) gate — feature unlock then free-tier use limit, ported
              from the retired /journal screen so the redirect can't bypass it. */}
          {mode === "journal" && progression.loading ? (
            <View style={styles.gateCard}>
              {/* Same wait as everywhere else. This file already used
                  PremiumLoadingState twice; only this gate had a bare spinner. */}
              <PremiumLoadingState />
            </View>
          ) : null}
          {mode === "journal" && !progression.loading && !journalGate.unlocked ? (
            <View style={styles.gateCard}>
              <Text variant="subtle" color="brand" style={[styles.gateEyebrow, eyebrowTracking]}>
                {t("journal.locked.title")}
              </Text>
              <Text variant="body" style={{ marginTop: spacing.xs }}>
                {t("journal.locked.body", { level: journalGate.requiredLevel })}
              </Text>
              <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
                {t("journal.locked.status", { current: journalGate.currentLevel, required: journalGate.requiredLevel })}
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label={t("journal.locked.start")}
                  variant="secondary"
                  onPress={() => router.push("/audit")}
                />
              </View>
            </View>
          ) : null}
          {mode === "journal" && !progression.loading && journalGate.unlocked && !journalUsage.allowed ? (
            <View style={styles.limitCard}>
              <Text variant="subtle" color="warning" style={[styles.gateEyebrow, eyebrowTracking]}>
                {t("journal.limit.title")}
              </Text>
              <Text variant="body" style={{ marginTop: spacing.xs }}>
                {t("journal.limit.body", { limit: journalUsage.limit })}
              </Text>
              <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
                {t("journal.limit.helper")}
              </Text>
            </View>
          ) : null}

          {/* Journal (일기) mode — streak, reflection prompt, topic, body,
              optional conclusion, opt-in Advisor. Writes to records. Only shown
              when unlocked and within the free-tier limit. */}
          {mode === "journal" && !progression.loading && journalGate.unlocked && journalUsage.allowed ? (
            <View style={styles.fieldGroup}>
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={t("journal.fields.bodyPlaceholder")}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                style={styles.textarea}
              />
              {secondaryOpen ? (
                <>
              {streak.current > 0 ? (
                <View style={styles.streakRow}>
                  <View style={[styles.streakDot, streak.capturedToday && styles.streakDotOn]} />
                  <Text variant="subtle" color="textMuted">
                    {t("journal.streak.label", { count: streak.current, suffix: streakMissingToday })}
                  </Text>
                </View>
              ) : null}
              <View style={styles.dailyPromptCard}>
                <Text variant="caption" color="brand" style={{ letterSpacing: locale === "ko" ? 0.3 : 1.2 }}>
                  {t("journal.prompt.heading")}
                </Text>
                <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs, lineHeight: 22 }} selectable>
                  {dailyPrompt(locale)}
                </Text>
                {topic.length === 0 ? (
                  <Pressable
                    hitSlop={14}
                    onPress={() => setTopic(dailyPrompt(locale))}
                    style={styles.useTopicLink}
                    accessibilityRole="button"
                    accessibilityLabel={t("journal.prompt.useAsTopicLabel")}
                  >
                    <Text variant="caption" color="brand">
                      {t("journal.prompt.useAsTopicAction")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Input
                value={topic}
                onChangeText={setTopic}
                placeholder={t("journal.fields.topicPlaceholder")}
                autoCapitalize="sentences"
              />
              <Pressable
                hitSlop={14}
                onPress={() => setShowExtras((v) => !v)}
                style={styles.extrasToggleLink}
                accessibilityRole="button"
                accessibilityState={{ expanded: showExtras }}
                accessibilityLabel={t("journal.conclusion.toggleLabel")}
              >
                <Text variant="caption" color="brand">
                  {showExtras ? t("journal.conclusion.hide") : t("journal.conclusion.show")}
                </Text>
              </Pressable>
              {showExtras ? (
                <Input
                  value={conclusion}
                  onChangeText={setConclusion}
                  placeholder={t("journal.conclusion.placeholder")}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              ) : null}
              {advisorUnlocked ? (
                <Pressable
                  onPress={() => setAskAdvisor((v) => !v)}
                  hitSlop={14}
                  style={styles.advisorRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: askAdvisor }}
                  accessibilityLabel={t("journal.advisor.label")}
                >
                  <View style={[styles.advisorCheck, askAdvisor && styles.advisorCheckOn]}>
                    {askAdvisor ? <PathGlyph path={CHECK_PATH} color={semantic.background} size={16} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="subtle" color={askAdvisor ? "brand" : "textMuted"}>
                      {t("journal.advisor.label")}
                    </Text>
                    <Text variant="subtle" color="textSubtle">
                      {t("journal.advisor.helper")}
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.push("/plans?from=advisor_lock")}
                  hitSlop={14}
                  style={styles.advisorRow}
                  accessibilityRole="button"
                  accessibilityLabel={t("journal.advisor.lockedLabel")}
                  accessibilityHint={t("journal.advisor.lockedHint")}
                >
                  <View style={styles.advisorCheck} />
                  <View style={{ flex: 1 }}>
                    <Text variant="subtle" color="textMuted">
                      {t("journal.advisor.lockedLabel")}
                    </Text>
                    <Text variant="subtle" color="textSubtle">
                      {t("journal.advisor.lockedHelper")}
                    </Text>
                  </View>
                </Pressable>
              )}
                </>
              ) : null}
            </View>
          ) : null}

          {/* Mode-specific inputs. Each mode renders ONLY its own field block
              inside a bordered group so the URL/body boxes never read as one
              shared field across modes (2026-05-31 directive). */}
          {mode === "linkclip" ? (
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {t("linkClip.label")}
              </Text>
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={t("linkClip.placeholder")}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                style={styles.textarea}
              />
              {linkClipKind === "url" ? (
                <Text variant="subtle" color="textSubtle">
                  {t("linkClip.detected", { kind: detectedKind })}
                </Text>
              ) : linkClipKind === "markdown" ? (
                <Text variant="subtle" color="textSubtle">
                  {t("linkClip.savedAsClip")}
                </Text>
              ) : clipboardAvailable ? (
                <Pressable
                  onPress={() => void pasteCopiedContent()}
                  accessibilityRole="button"
                  accessibilityLabel={t("linkClip.pasteOffer")}
                  accessibilityHint={t("linkClip.pasteOfferHint")}
                  hitSlop={14}
                  style={styles.pasteOfferRow}
                >
                  <Text variant="subtle" color="brand">
                    {t("linkClip.pasteOffer")}
                  </Text>
                </Pressable>
              ) : clipboardEmptyNote ? (
                <Text variant="subtle" color="textSubtle">
                  {t("linkClip.pasteOfferEmpty")}
                </Text>
              ) : null}
            </View>
          ) : null}

          {(mode === "memo" || mode === "ocr") ? (
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {mode === "ocr" ? t("inputs.extractedLabel") : t("inputs.bodyLabel")}
              </Text>
              <Input
                value={body}
                onChangeText={mode === "ocr" ? updateOcrBody : setBody}
                placeholder={mode === "ocr" ? t("inputs.imagePlaceholder") : t("inputs.memoPlaceholder")}
                multiline
                numberOfLines={mode === "memo" ? 6 : 12}
                textAlignVertical="top"
                style={styles.textarea}
                accessibilityLabel={mode === "ocr" ? t("inputs.extractedLabel") : t("inputs.bodyLabel")}
              />
            </View>
          ) : null}

          {/* 음성(voice): real on-device recording → transcription. The record
              control captures audio, transcribes it (transcribeAudio), and drops
              the transcript into the body for review/edit BEFORE 담기 saves it
              (propose->ratify). The text box stays as the fallback when recording
              is unavailable (web / permission denied) or for manual edits. */}
          {mode === "voice" ? (
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {t("voice.label")}
              </Text>
              <View style={styles.voiceControlRow}>
                {voicePhase === "recording" ? (
                  <Button
                    label={t("voice.stop")}
                    variant="primary"
                    onPress={() => void handleStopRecording()}
                    accessibilityHint={t("voice.stopHint")}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <Button
                    label={t("voice.record")}
                    variant="secondary"
                    onPress={() => void handleStartRecording()}
                    disabled={voicePhase === "transcribing"}
                    accessibilityHint={t("voice.recordHint")}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
              {voicePhase !== "idle" ? (
                <View style={styles.voiceStatusRow} accessibilityLiveRegion="polite">
                  {voicePhase === "recording" ? (
                    <>
                      <View style={styles.voiceRecDot} />
                      <Text variant="subtle" color="brand">{t("voice.recording")}</Text>
                    </>
                  ) : (
                    <>
                      <ActivityIndicator color={semantic.brand} />
                      <Text variant="subtle" color="textMuted">{t("voice.transcribing")}</Text>
                    </>
                  )}
                </View>
              ) : null}
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={t("voice.placeholder")}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                style={styles.textarea}
                accessibilityLabel={t("voice.label")}
              />
              <Text variant="subtle" color="textSubtle" style={{ marginTop: 6 }}>
                {voiceNotice ?? t("voice.note")}
              </Text>
            </View>
          ) : null}

          {/* 할 일(todo): a task line plus a done flag, saved as a #todo note. */}
          {mode === "todo" ? (
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {t("todo.label")}
              </Text>
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={t("todo.placeholder")}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={styles.textarea}
                accessibilityLabel={t("todo.label")}
              />
              <Pressable
                onPress={() => setTodoDone((v) => !v)}
                hitSlop={14}
                style={styles.advisorRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: todoDone }}
                accessibilityLabel={t("todo.doneToggle")}
              >
                <View style={[styles.advisorCheck, todoDone && styles.advisorCheckOn]}>
                  {todoDone ? <PathGlyph path={CHECK_PATH} color={semantic.background} size={16} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subtle" color={todoDone ? "brand" : "textMuted"}>
                    {t("todo.doneToggle")}
                  </Text>
                  <Text variant="subtle" color="textSubtle">
                    {t("todo.doneHelper")}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}

          {/* 4W1H (rev2 P4a): five format boxes — 누가/언제/어디서/무엇을/어떻게.
              무엇을 is the one required box; the rest sharpen the piece. Composed
              into a single #fourw note at submit (composeFourWBody). */}
          {mode === "fourw" ? (
            <View style={styles.fieldGroup}>
              {FOURW_KEYS.map((key) => (
                <View key={key}>
                  <Text variant="caption" color={key === "what" ? "brand" : "textMuted"}>
                    {t(`fourw.fields.${key}`)}
                  </Text>
                  <Input
                    value={fourw[key]}
                    onChangeText={(text) => setFourw((prev) => ({ ...prev, [key]: text }))}
                    placeholder={t(`fourw.placeholders.${key}`)}
                    multiline={key === "what" || key === "how"}
                    numberOfLines={key === "what" || key === "how" ? 3 : 1}
                    textAlignVertical={key === "what" || key === "how" ? "top" : "center"}
                    style={key === "what" || key === "how" ? styles.textarea : undefined}
                    accessibilityLabel={t(`fourw.fields.${key}`)}
                  />
                </View>
              ))}
              <Text variant="subtle" color="textSubtle">
                {t("fourw.note")}
              </Text>
            </View>
          ) : null}

          {mode === "ocr" ? (
            <View style={styles.ocrDisclosureCard}>
              <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
                {t("ocrReview.heading")}
              </Text>
              <Text variant="subtle" color="textMuted" style={styles.ocrDisclosureText}>
                {t("ocrReview.disclosure")}
              </Text>
              <Text variant="subtle" color="textSubtle" style={styles.ocrDisclosureText}>
                {t("ocrReview.privateAfterApprove")}
              </Text>
              {hasOcrDraft ? (
                <>
                  {/* liveRegion: the approve button disables itself on tap, so
                      without this announce a screen-reader user only hears
                      "disabled" and never the approved confirmation. */}
                  <Text
                    variant="subtle"
                    color="textSubtle"
                    style={styles.ocrDisclosureText}
                    accessibilityLiveRegion="polite"
                  >
                    {ocrReviewApproved ? t("ocrReview.approved") : t("ocrReview.body")}
                  </Text>
                  <Button
                    label={t("ocrReview.approve")}
                    variant={ocrReviewApproved ? "secondary" : "primary"}
                    onPress={() => setOcrReviewApproved(true)}
                    disabled={ocrReviewApproved}
                    accessibilityHint={t("ocrReview.approveHint")}
                    style={{ marginTop: spacing.xs }}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          {mode === "ocr" ? (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.actionRow}>
                <Button
                  label={t("image.camera")}
                  variant="secondary"
                  onPress={() => pickImage("camera")}
                />
                <Button
                  label={t("image.library")}
                  variant="secondary"
                  onPress={() => pickImage("library")}
                />
              </View>
              <Text variant="caption" color="textSubtle" style={{ textAlign: "center", paddingHorizontal: spacing.md }}>
                {t("image.dataUsageHint")}
              </Text>
            </View>
          ) : null}

          {mode === "ocr" && pickedImage ? (
            <View style={styles.previewCard}>
              <Text variant="caption" color="brand">{t("image.preview")}</Text>
              <Image
                source={{ uri: pickedImage.uri }}
                style={styles.imagePreview}
                contentFit="contain"
                accessibilityRole="image"
                accessibilityLabel={t("image.preview")}
              />
              <Button
                label={t("image.extract")}
                variant="primary"
                onPress={runExtract}
                loading={extracting}
                disabled={extracting}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ) : null}

          {mode === "file" ? (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.actionRow}>
                <Button
                  label={t("file.pick")}
                  variant="secondary"
                  onPress={runFilePick}
                />
              </View>
              <Text variant="caption" color="textSubtle" style={{ textAlign: "center", paddingHorizontal: spacing.md }}>
                {t("file.dataUsageHint")}
              </Text>
            </View>
          ) : null}

          {mode === "file" && pickedFile ? (
            <View style={styles.previewCard}>
              <Text variant="caption" color="brand">{t("file.selected")}</Text>
              <Text variant="subtle" color="textMuted">{pickedFile.name}</Text>
              <Text variant="subtle" color="textSubtle">
                {pickedFile.mimeType} · {(pickedFile.size / 1024).toFixed(1)} KB
              </Text>
              {pickedFile.textContent ? (
                <Text variant="subtle" color="textMuted" style={{ marginTop: 6 }}>
                  {t("file.textExtracted")}
                </Text>
              ) : (
                <Text variant="subtle" color="textSubtle" style={{ marginTop: 6 }}>
                  {t("file.attachedNoPreview")}
                </Text>
              )}
            </View>
          ) : null}

          {/* Secondary hashtag controls stay behind disclosure. Tossing still
              auto-classifies when the user leaves these empty. */}
          {secondaryOpen ? (
            <View style={styles.classifiedCard}>
              <Text variant="caption" color="brand">
                {t("tags.title")}
              </Text>
              <View style={styles.tagRow}>
                {tagsEditable.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => removeTag(tag)}
                    style={styles.tagChip}
                    accessibilityRole="button"
                    accessibilityLabel={t("tags.removeLabel", { tag })}
                  >
                    <View style={styles.tagChipContent}>
                      <Text style={styles.tagChipText}>#{tag}</Text>
                      <PathGlyph path={X_PATH} color={semantic.brand} size={14} />
                    </View>
                  </Pressable>
                ))}
                <HashtagAdder onAdd={addTagFromInput} />
              </View>
              <Text variant="subtle" color="textSubtle" style={{ marginTop: 6 }}>
                {tagsEditable.length === 0 ? t("tags.emptyHelper") : t("tags.removeHelper")}
              </Text>
            </View>
          ) : null}

          <View style={styles.submitRow}>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={
                !canSubmit
                  ? [styles.tossBtn, styles.tossBtnDisabled]
                  : ({ pressed }) => [styles.tossBtn, pressed && styles.tossBtnPressed]
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
              accessibilityHint={submitAccessibilityHint}
            >
              <Text style={[styles.tossBtnText, !canSubmit && styles.tossBtnTextDisabled]}>
                {submitting
                  ? t("submitting")
                  : t("submit")}
              </Text>
            </Pressable>
          </View>

          {/* 최근 조각 (recent pieces): the already-fetched records rows as a
              tappable list. Each row opens /record/[id]. */}
          {recentRows.length > 0 ? (
            <View style={styles.recentCard}>
              <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
                {t("recent.title")}
              </Text>
              {recentRows.slice(0, 6).map((row) => {
                const primary = (row.topic && row.topic.trim().length > 0)
                  ? row.topic.trim()
                  : (row.body && row.body.trim().length > 0)
                    ? row.body.trim()
                    : t("savedTitleFallback");
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => router.push({ pathname: "/record/[id]", params: { id: row.id } })}
                    style={styles.recentRow}
                    accessibilityRole="button"
                    accessibilityLabel={primary}
                    accessibilityHint={t("recent.openHint")}
                  >
                    <Text variant="subtle" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
                      {primary}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!secondaryOpen ? (
            <Pressable
              onPress={() => setShowAdvancedModes(true)}
              hitSlop={14}
              style={styles.secondaryDisclosure}
              accessibilityRole="button"
              accessibilityState={{ expanded: false }}
              accessibilityLabel={t("sections.mode.more")}
              accessibilityHint={t("sections.mode.moreHint")}
            >
              <Text variant="caption" color="brand">
                {t("sections.mode.more")}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {/* 루루 appears briefly to carry the new shard (companion pack §3) */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.captureFlash} />
      ) : null}
      <PremiumModal
        visible={feedbackModal !== null}
        onClose={() => setFeedbackModal(null)}
        accessibilityLabel={t("feedback.accessibilityLabel")}
      >
        <Text variant="heading">{feedbackModal?.title}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {feedbackModal?.body}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={t("alerts.common.dismiss")}
            variant="secondary"
            onPress={() => setFeedbackModal(null)}
            style={styles.modalButton}
            accessibilityHint={t("feedback.dismissHint")}
          />
          {feedbackModal?.retry ? (
            <Button
              label={t("alerts.common.retry")}
              variant="primary"
              onPress={retryFeedbackModal}
              loading={extracting || submitting || proposing}
              style={styles.modalButton}
              accessibilityHint={t("feedback.retryHint")}
            />
          ) : null}
        </View>
      </PremiumModal>
      {/* Crisis routing for journal-mode entries (C9). */}
      <CrisisRouter
        visible={crisis.visible}
        hotline={crisis.hotline}
        onClose={() => setCrisis((c) => ({ ...c, visible: false }))}
      />
    </PremiumAppShell>
  );
}

// Hashtag adder: a "+" chip that expands into a small inline input, so tags
// are entered one at a time at the hashtag location rather than in one big
// shared box (2026-05-31 directive). Confirming a tag keeps the input open
// for the next one; blur/empty-submit collapses it back to the "+" chip.
function HashtagAdder({ onAdd }: { onAdd: (s: string) => void }) {
  const { t } = useTranslation("capture");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");

  function commit() {
    const next = v.trim();
    if (next.length > 0) {
      onAdd(next);
      setV("");
      // keep open so the user can add another hashtag in one flow
    } else {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.tagAddChip}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel={t("tags.addLabel")}
      >
        <Text style={styles.tagAddChipText}>+</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.tagAddInputWrap}>
      <Text style={styles.tagAddHash}>#</Text>
      <Input
        value={v}
        onChangeText={setV}
        placeholder={t("tags.placeholder")}
        onSubmitEditing={commit}
        onBlur={() => { if (v.trim().length === 0) setOpen(false); }}
        autoFocus
        style={styles.tagAddInput}
        returnKeyType="done"
        blurOnSubmit={false}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  captureFlash: { position: "absolute", bottom: 40, right: 20 },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  // Journal-mode (일기) bits, ported from /journal.
  streakRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  streakDot: {
    width: 8,
    height: 8,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.border,
    backgroundColor: "transparent",
  },
  streakDotOn: {
    borderColor: semantic.brand,
    backgroundColor: semantic.brand,
  },
  dailyPromptCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: gameboy.radius,
    padding: spacing.sm,
    borderStartWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    ...pixelShadowStyle(),
  },
  advisorRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  pasteOfferRow: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  voiceControlRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  voiceStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  voiceRecDot: {
    width: 10,
    height: 10,
    borderRadius: gameboy.radius,
    backgroundColor: semantic.brand,
  },
  advisorCheck: {
    width: 22,
    height: 22,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  advisorCheckOn: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  // 일기 gate cards (feature lock / free-tier limit), ported from /journal.
  // Tracking is applied per-locale (eyebrowTracking) so KO is not over-spaced.
  gateEyebrow: { fontWeight: "700" },
  gateCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderStartWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    borderRadius: gameboy.radius,
    padding: spacing.lg,
    ...pixelShadowStyle(),
  },
  limitCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.warning,
    borderWidth: gameboy.borderWidth,
    borderStartWidth: gameboy.borderWidth,
    borderStartColor: semantic.warning,
    borderRadius: gameboy.radius,
    padding: spacing.lg,
    ...pixelShadowStyle(semantic.warning),
  },
  // O-12 Phase C P1-4: keep GB sharp corners (radius 0, 2px) so PremiumCard's
  // PixelCorner brackets align — a rounded override left the markers floating.
  savedPanel: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.success,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
    ...pixelShadowStyle(semantic.success),
  },
  savedRecordTruth: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  savedAdvisorNote: { marginTop: spacing.sm },
  proposalPanel: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    borderStartWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
    ...pixelShadowStyle(),
  },
  scroll: { paddingBottom: spacing.xl, gap: spacing.md },
  primaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
    ...pixelShadowStyle(),
  },
  proposalDismissLink: {
    alignSelf: "flex-start",
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    marginTop: 4,
    paddingHorizontal: spacing.xs,
  },
  manageFormatsLink: {
    alignSelf: "flex-end",
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  trackCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.sm,
    gap: spacing.xs,
    ...pixelShadowStyle(),
  },
  // Tracking is applied per-locale (eyebrowTracking) so KO is not over-spaced.
  eyebrow: { fontWeight: "700" },
  trackRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  trackChip: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.border,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  trackChipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  trackGlyph: { width: 16, height: 16 },
  trackChipText: { color: semantic.textMuted, fontSize: typography.sizes.sm, fontWeight: "600", fontFamily: CAPTURE_LABEL_FONT },
  trackChipTextActive: { color: semantic.background, fontWeight: "700" },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.xs,
    ...pixelShadowStyle(),
  },
  modeTab: {
    flex: 1,
    minWidth: 72,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: gameboy.radius,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  modeTabActive: { backgroundColor: semantic.brand },
  modeMoreTab: {
    // O-11 P2: GB language is solid 2px sharp corners, not dashed 1px.
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.border,
    borderRadius: gameboy.radius,
    minHeight: 48,
  },
  modeMoreTabExpanded: { borderColor: semantic.brand },
  modeGlyph: { width: 24, height: 24 },
  modeLabel: { color: semantic.textMuted, fontSize: typography.sizes.xs, fontWeight: "600", fontFamily: CAPTURE_LABEL_FONT },
  modeLabelActive: { color: semantic.background, fontWeight: "700" },
  modeMoreLabel: { color: semantic.brand, fontSize: typography.sizes.sm, fontWeight: "700", fontFamily: CAPTURE_LABEL_FONT },
  modeHelp: { lineHeight: 18, marginTop: -spacing.xs },
  fieldGroup: {
    gap: spacing.xs,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
    ...pixelShadowStyle(),
  },
  textarea: {
    minHeight: 160,
    paddingTop: spacing.md,
    fontFamily: fontFamilies.readable,
    fontSize: typography.sizes.sm,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  ocrDisclosureCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    borderStartWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
    gap: spacing.xs,
    ...pixelShadowStyle(),
  },
  ocrDisclosureText: { lineHeight: 20 },
  useTopicLink: {
    alignSelf: "flex-start",
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  extrasToggleLink: {
    alignSelf: "flex-start",
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  previewCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.sm,
    gap: 4,
    ...pixelShadowStyle(),
  },
  imagePreview: { width: "100%", height: 200, borderRadius: gameboy.radius, marginTop: spacing.xs },
  classifiedCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    borderStartWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
    gap: spacing.xs,
    ...pixelShadowStyle(),
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  tagChip: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.brand,
    backgroundColor: semantic.surfaceAlt,
  },
  tagChipContent: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tagChipText: { color: semantic.brand, fontSize: typography.sizes.xs, fontWeight: "600" },
  // "+" chip that opens the inline hashtag input (sits in the tag row).
  tagAddChip: {
    width: 28,
    height: 28,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  tagAddChipText: { color: semantic.brand, fontSize: typography.sizes.md, fontWeight: "700", lineHeight: 18 },
  tagAddInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.brand,
    borderRadius: gameboy.radius,
    paddingHorizontal: spacing.xs,
    minWidth: 96,
  },
  tagAddHash: { color: semantic.brand, fontSize: typography.sizes.sm, fontWeight: "700" },
  tagAddInput: { flex: 1, fontSize: typography.sizes.sm, paddingVertical: 2, minWidth: 64 },
  submitRow: { gap: spacing.sm, marginTop: spacing.sm },
  recentCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    borderStartWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
    gap: spacing.xs,
    ...pixelShadowStyle(),
  },
  recentRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderTopWidth: gameboy.borderWidth,
    borderTopColor: semantic.border,
  },
  secondaryDisclosure: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  // Save button: solid primary with a clear pressed beat (scale, no
  // bounce per DESIGN.md) so the action feels deliberate.
  tossBtn: {
    alignSelf: "stretch",
    backgroundColor: semantic.brand,
    borderWidth: gameboy.borderWidth,
    borderColor: semantic.brand,
    borderRadius: gameboy.radius,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    ...pixelShadowStyle(semantic.brand),
  },
  tossBtnPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  tossBtnDisabled: {
    backgroundColor: withAlpha(cosmic.space900, 0.86),
    borderColor: withAlpha(cosmic.mistGray, 0.36),
  },
  tossBtnText: { color: semantic.background, fontSize: typography.sizes.md, fontWeight: "700", fontFamily: CAPTURE_LABEL_FONT },
  tossBtnTextDisabled: { color: withAlpha(cosmic.moonWhite, 0.72) },
});
