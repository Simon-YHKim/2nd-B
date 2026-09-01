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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

import { PremiumAppShell, PremiumModal } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { CaptureView } from "@/components/deep-space/DeepSpaceViews";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PremiumCard, PremiumButton, PremiumLoadingState, TAB_BAR_HEIGHT } from "@/components/premium";
import { ShardArt } from "@/components/art/IslandArt";
import { Input } from "@/components/ui/Input";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, flattenAlpha, semantic, spacing, typography, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
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
import { pickFile, isAudioMime, MAX_AUDIO_FILE_BYTES, type PickedFile } from "@/lib/wiki/capture-file";
import {
  CAPTURE_MODES,
  createCaptureTransientDraft,
  DEFAULT_CAPTURE_DRAFT_MODE,
  isCaptureDraftMode,
  isCaptureTransientMode,
  loadCaptureDraftState,
  planCaptureParamConsumption,
  planSharedConsumption,
  saveCaptureDraftState,
  sharedDeliveryKey,
  type CaptureDraft,
  type CaptureDraftMode,
  type CaptureDrafts,
  type CaptureDraftState,
  type CaptureMode,
  type CaptureTransientDraft,
  type CaptureTransientDrafts,
  type CaptureTransientMode,
} from "@/lib/capture/draft";
import {
  mayApplyCompletionUi,
  mayFinalizeDurableCleanup,
  type SaveFinalizeState,
} from "@/lib/capture/save-finalize";
import { classifyRecordTextForCrisis, transcribeAudio } from "@/lib/llm/boundary";
import { discardRecording, recordingUriToBase64 } from "@/lib/audio/recording-uri";
import { classifyClipper, type WikiTrack } from "@/lib/wiki/classify-clipper";
import { proposeClipperTemplate, type ProposedClipperTemplate } from "@/lib/wiki/propose-template";
import { saveTemplate } from "@/lib/wiki/template-queries";
import type { SourceKind } from "@/lib/wiki/types";
import { classifyLinkOrClip, firstUrlIn } from "@/lib/wiki/link-or-clip";
import { normalizeSharedCaptureParams } from "@/lib/capture/share-params";
import { clipboardHasContent, readClipboardText } from "@/lib/capture/clipboard";
import { composeFourWBody, EMPTY_FOURW, FOURW_KEYS, fourWHasContent, type FourWFields } from "@/lib/capture/fourw";
import { composeStructured } from "@/lib/capture/structured";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { reactExpression } from "@/lib/companion/expression";
import { AdvisorFollowupNote } from "@/components/records/AdvisorFollowupNote";
import { createRecord } from "@/lib/records/create";
import { domainTagFor, isDomainTag, type DomainId } from "@/lib/persona/domain-stars";
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
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { DeepSpaceLinks } from "@/components/deep-space/DeepSpaceLinks";
import { enqueueAutoReasoningRecord, enqueueAutoReasoningSource } from "@/app/reasoning";
import { maybeAutoPromoteSource } from "@/lib/wiki/auto-promote";

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
// 사진(ocr)/음성(voice)/할 일(todo). Voice/todo/4W1H are not source-storage
// modes, but they do keep typed drafts in lib/capture/draft.ts. They save through
// createRecord(kind:"note") with a distinguishing tag — no new DB kind.
type StorageMode = CaptureDraftMode;
// 모드 목록·record/sources 분류·딥링크 소비 계획은 lib/capture/draft.ts 가
// 정본이다 — 렌더 없이 테스트하기 위해서다. 여기는 별칭만 둔다.
type Mode = CaptureMode;
type CaptureFeedbackModal = { title: string; body: string; retry?: () => void } | null;
// One row of the 최근 조각 recent list — a subset of listRecentRecords output.
type RecentRow = { id: string; kind: string; topic: string | null; body: string | null; created_at: string };

// This guard separates source/journal-shaped drafts from the typed transient
// record drafts. Both are persisted, but their schemas and save destinations differ.
const STORAGE_MODES: readonly StorageMode[] = ["journal", "memo", "linkclip", "ocr", "file"];
function isStorageMode(m: Mode): m is StorageMode {
  return (STORAGE_MODES as readonly string[]).includes(m);
}

const BASIC_CAPTURE_MODES: readonly Mode[] = ["journal"];

const TRACK_OPTIONS: WikiTrack[] = ["daily", "pro"];

type FrozenCaptureDraft = { generation: number; write: () => Promise<boolean> };
type FocusedCaptureOwner = { id: number; freeze: () => FrozenCaptureDraft | null };
type CaptureDraftHandoff = {
  id: number;
  generation: number;
  retry: () => Promise<boolean>;
  completion: Promise<boolean>;
};
let captureInstanceSequence = 0;
const focusedCaptureOwners = new Map<string, FocusedCaptureOwner>();

/**
 * 이 사용자의 초안 blob 을 마지막으로 발행한 capture 인스턴스.
 *
 * `focusedCaptureOwners` 와 짝이지만 **지워지지 않는다** — 그쪽은 blur 마다
 * delete 되므로 "지금 누가 보고 있나" 만 답하고, 화면을 떠난 뒤에는 아무도
 * 없는 것처럼 보인다. 그런데 초안 저장은 부분 삭제가 아니라 **전체 스냅샷
 * 발행**이라(persistDrafts → saveCaptureDraftState 는 단일 setItem), 낡은
 * 인스턴스가 자기 in-memory 스냅샷으로 다시 발행하면 그 사이 다른 화면이 쓴
 * 내용이 통째로 사라진다. "누가 마지막으로 썼나" 는 그래서 blur 로 잊으면
 * 안 되는 사실이고, 완주 정리의 안전 조건이 된다.
 */
const lastCaptureDraftWriters = new Map<string, number>();
const captureDraftHandoffs = new Map<string, Map<number, CaptureDraftHandoff>>();

function cloneCaptureDraftState(state: CaptureDraftState): CaptureDraftState {
  return JSON.parse(JSON.stringify(state)) as CaptureDraftState;
}

function removeSettledCaptureHandoff(userId: string, handoff: CaptureDraftHandoff): void {
  const handoffs = captureDraftHandoffs.get(userId);
  if (handoffs?.get(handoff.id) !== handoff) return;
  handoffs.delete(handoff.id);
  if (handoffs.size === 0) captureDraftHandoffs.delete(userId);
}

function registerCaptureDraftHandoff(
  userId: string,
  id: number,
  generation: number,
  retry: () => Promise<boolean>,
): CaptureDraftHandoff {
  let handoffs = captureDraftHandoffs.get(userId);
  if (!handoffs) {
    handoffs = new Map<number, CaptureDraftHandoff>();
    captureDraftHandoffs.set(userId, handoffs);
  }
  const existing = handoffs.get(id);
  if (existing && existing.generation > generation) return existing;
  const completion = Promise.resolve()
    .then(retry)
    .catch(() => false);
  const handoff = { id, generation, retry, completion };
  handoffs.set(id, handoff);
  // Successful blur writes need no retry and should not retain a mounted
  // screen's closure. Failed writes stay registered so the next hydration can
  // retry the exact in-memory snapshot instead of replacing it with old disk.
  void completion.then((durable) => {
    if (durable) removeSettledCaptureHandoff(userId, handoff);
  });
  return handoff;
}

function startCaptureDraftHandoff(
  userId: string,
  owner: FocusedCaptureOwner,
): CaptureDraftHandoff | null {
  const frozen = owner.freeze();
  return frozen === null
    ? null
    : registerCaptureDraftHandoff(userId, owner.id, frozen.generation, frozen.write);
}

async function settleCaptureDraftHandoffs(userId: string): Promise<boolean> {
  for (;;) {
    const handoffs = captureDraftHandoffs.get(userId);
    if (!handoffs || handoffs.size === 0) return true;
    const pending = [...handoffs.values()];
    for (const handoff of pending) {
      let durable = await handoff.completion;
      const current = captureDraftHandoffs.get(userId)?.get(handoff.id);
      if (current !== handoff) continue;
      if (!durable) {
        // One automatic retry handles a transient native-storage failure. If
        // it still fails, hydration remains closed and the retry UI repeats
        // this handoff without discarding the owner's live fields.
        const retry = registerCaptureDraftHandoff(
          userId,
          handoff.id,
          handoff.generation,
          handoff.retry,
        );
        durable = await retry.completion;
        const latest = captureDraftHandoffs.get(userId)?.get(retry.id);
        if (latest !== retry) continue;
        if (!durable) return false;
        removeSettledCaptureHandoff(userId, retry);
        continue;
      }
      removeSettledCaptureHandoff(userId, handoff);
    }
  }
}

// Voice recording phases drive the record/stop control + indicator.
type VoicePhase = "idle" | "recording" | "transcribing";

// recordingUriToBase64 now lives in src/lib/audio/recording-uri.ts (shared with
// the call-reflection recorder). Imported above.

// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
//
// ⚠ 이 파일의 아이콘은 **`/capture` 에서는 안 그려진다**(딥스페이스는 CaptureView
//   로 일찍 반환한다). 그런데 **`/capture-full` 이 `CaptureLegacy` 를 딥스페이스
//   셸 안에 넣어 재사용한다** — 그래서 화면에는 실제로 그려진다. 소스만 보고
//   "레거시라 안 그려진다"고 판단하면 틀린다(2026-08-26 에 실제로 틀렸다).

/** 담기 모드별 아이콘. */
const MODE_GLYPH: Record<Mode, string> = {
  journal: "bedtime",
  memo: "edit",
  linkclip: "link",
  ocr: "photo_camera",
  voice: "mic",
  todo: "task_alt",
  fourw: "grid",
  file: "description",
};

function ModeGlyph({ mode, color, label }: { mode: Mode; color: string; label: string }) {
  return (
    <View style={styles.modeGlyph} accessibilityLabel={label}>
      <PixelGlyph name={canonGlyph(MODE_GLYPH[mode])} color={color} size={24} />
    </View>
  );
}

function TrackGlyph({ id, color }: { id: WikiTrack; color: string }) {
  return (
    <View style={styles.trackGlyph}>
      <PixelGlyph name={id === "daily" ? "house" : "briefcase"} color={color} size={16} />
    </View>
  );
}

export default function Capture() {
  // Deep-space build renders the design body inside the shared chrome; the legacy
  // capture screen stays for the legacy track. isDeepSpaceUI() is build-constant,
  // and the two hooks below run identically on every path so hook order is stable.
  // Web Share Target(manifest.webmanifest share_target.action=/capture)은
  // 딥스페이스에서도 이 라우트로 들어오는데 CaptureView 는 share 파라미터를
  // 소비하지 않는다 — share/mode/tag/first-run 파라미터가 하나라도 있으면 소비
  // 배선을 가진 full intake 를 딥스페이스 셸 안에 렌더한다. 최초 프레임은 현재
  // 파라미터로 즉시 고르고, effect 소유 state latch 가 URL strip 뒤에도 이 mount
  // 를 유지한다. render 중 ref write 는 React Compiler purity 를 깨므로 쓰지 않는다.
  const captureParams = useLocalSearchParams<{
    entry?: string;
    url?: string;
    text?: string;
    title?: string;
    mode?: string;
    tag?: string;
  }>();
  const hasFullCaptureParams =
    normalizeSharedCaptureParams({
      url: captureParams.url,
      text: captureParams.text,
      title: captureParams.title,
    }) !== null ||
    (typeof captureParams.mode === "string" &&
      (CAPTURE_MODES as readonly string[]).includes(captureParams.mode)) ||
    (typeof captureParams.tag === "string" && captureParams.tag.trim().length > 0) ||
    captureParams.entry === "firstRun";
  const [fullCaptureActive, setFullCaptureActive] = useState(hasFullCaptureParams);
  useEffect(() => {
    if (hasFullCaptureParams) setFullCaptureActive(true);
  }, [hasFullCaptureParams]);
  if (isDeepSpaceUI()) {
    if (hasFullCaptureParams || fullCaptureActive) {
      return (
        <DeepSpaceScreen active="capture" variant="windowed">
          <CaptureLegacy />
        </DeepSpaceScreen>
      );
    }
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
  const { userId } = useAuth();
  return <CaptureLegacySession key={userId ?? "signed-out"} />;
}

function CaptureLegacySession() {
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
  const [captureInstanceId] = useState(() => ++captureInstanceSequence);
  const activeModeRef = useRef<Mode>("journal");
  const freezeDraftOnBlurRef = useRef<() => FrozenCaptureDraft | null>(() => null);
  const [showAdvancedModes, setShowAdvancedModes] = useState(false);
  const [track, setTrack] = useState<WikiTrack>("daily");
  const [body, setBody] = useState("");
  const draftsRef = useRef<CaptureDrafts>({});
  const transientDraftsRef = useRef<CaptureTransientDrafts>({});
  const draftHydratedRef = useRef(false);
  // State mirror of draftHydratedRef so the shared-content effect below can
  // sequence itself AFTER hydration (refs don't re-run effects).
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftHydrationError, setDraftHydrationError] = useState(false);
  const [draftHydrationRetry, setDraftHydrationRetry] = useState(0);
  const [draftFocusRefresh, setDraftFocusRefresh] = useState(0);
  const hasFocusedOnceRef = useRef(false);
  const draftUserRef = useRef<string | null>(null);
  const draftLoadedUserRef = useRef<string | null>(null);
  const focusDraftHydratedRef = useRef(false);
  const lastHydratedModeRef = useRef<Mode>(DEFAULT_CAPTURE_DRAFT_MODE);
  // Shared payload bookkeeping: consumed-once per params identity, plus a
  // pending flag the hydration callback reads so the lastMode restore doesn't
  // flash a different mode right before the share applies. The flag is synced
  // in an effect (not during render - a render-phase ref write would make the
  // React Compiler skip this whole screen) declared BEFORE the hydration
  // effect, so it is set by the time the hydration load is even started.
  const sharedConsumedRef = useRef<string | null>(null);
  const modeParamConsumedRef = useRef<string | null>(null);
  const sharedAckGenerationRef = useRef(0);
  const paramAckGenerationRef = useRef(0);
  const sessionActiveRef = useRef(true);
  const pendingSharedRef = useRef(false);
  // Set when hydration skipped its restore in favor of a pending share: the
  // live fields hold nothing then, and folding them back into the draft set
  // would DELETE the stored draft for the current mode (review finding #1).
  const shareSkippedRestoreRef = useRef(false);
  const [shareRestoreSkipped, setShareRestoreSkipped] = useState(false);
  const routeApplyPendingCommitRef = useRef(false);
  const [routeCommitGeneration, setRouteCommitGeneration] = useState(0);
  useLayoutEffect(() => {
    // A route planner mutates draft refs in a passive effect, then schedules
    // this committed render. Only now may the debounce fold live fields again.
    routeApplyPendingCommitRef.current = false;
  }, [routeCommitGeneration]);
  // 배달 identity 는 content 만이 아니라 mode+tag 조합이다 — 같은 텍스트가
  // 파라미터만 바꿔 곧바로(A→B, 중간 공백 없이) 재배달돼도 새 배달로 소비한다.
  const sharedDelivery = shared ? sharedDeliveryKey(shared.key, modeParam, tagParam) : null;
  const sharedDeliveryRef = useRef<string | null>(sharedDelivery);
  useLayoutEffect(() => {
    // Focus callbacks must see the latest committed URL identity without
    // depending on it: putting sharedDelivery in useFocusEffect dependencies
    // makes a successful setParams ACK look like a blur/refocus cycle.
    sharedDeliveryRef.current = sharedDelivery;
  }, [sharedDelivery]);
  const paramDeliveryIdentity = JSON.stringify([
    typeof modeParam === "string" ? modeParam : null,
    typeof tagParam === "string" ? tagParam : null,
  ]);
  const [sharedDurableAck, setSharedDurableAck] = useState<{
    delivery: string;
    generation: number;
    clearMode: boolean;
    clearTag: boolean;
  } | null>(null);
  const [paramDurableAck, setParamDurableAck] = useState<{
    key: string;
    identity: string;
    generation: number;
  } | null>(null);
  useEffect(() => {
    sessionActiveRef.current = true;
    return () => {
      sessionActiveRef.current = false;
      // Invalidate pending router side effects without aborting their durable
      // writes. A keyed account/session remount must not let old ACKs edit the
      // new route's params.
      sharedAckGenerationRef.current += 1;
      paramAckGenerationRef.current += 1;
    };
  }, []);
  useEffect(() => {
    // A cleared shared param (post-consumption setParams strip, or leaving
    // the share context) also releases the consumed-once latch so re-sharing
    // the identical content later still applies.
    if (sharedDelivery === null) sharedConsumedRef.current = null;
    pendingSharedRef.current = sharedDelivery !== null && sharedConsumedRef.current !== sharedDelivery;
  }, [shared, modeParam, tagParam, sharedDelivery]);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  // Status line under the picked-file card. Audio files take a round trip to
  // Gemini, so the card has to say something other than "no preview available"
  // while that runs and after it lands.
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [ocrReviewApproved, setOcrReviewApproved] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  // Pressed state for the submit CTA. It lives here, not in a function-form
  // `style` prop: Fabric Android drops function-form Pressable props at runtime
  // (#680), and the enabled branch of this button used to be exactly that - so
  // the moment the button became tappable it lost styles.tossBtn (padding,
  // height, background) and the target collapsed under the finger.
  const [submitPressed, setSubmitPressed] = useState(false);
  const [tagsEditable, setTagsEditable] = useState<string[]>([]);
  // 별 담기(/star/<id> → ?tag=domain:<id>)의 domain 의도. URL 파라미터라 누구나
  // 만들 수 있는 값이므로 신뢰 경계가 아니다 — 사용자가 자기 기록의 분류를 직접
  // 고르는 **허용된 UX** 이고, 게이트는 isDomainId 런타임 허용목록이다.
  // createRecord 는 raw domain:* 문자열 태그를 계속 걷어내므로, 허용목록을
  // 통과한 값만 typed 인자로 승격해 전달한다.
  const [domainIntent, setDomainIntent] = useState<DomainId | null>(null);
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
  const proposalGenerationRef = useRef(0);
  const [formatSavedMsg, setFormatSavedMsg] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<CaptureFeedbackModal>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  // React state is not a same-tick mutex: two taps can observe submitting=false
  // before the rerender. This ref claims every submit synchronously.
  const submitBusyRef = useRef(false);
  // 날아가는 저장(A) 뒤에 온 변경(B: 사용자 수정·모드 전환·share 소비)을 A 의
  // 완주 정리가 지우지 못하게 하는 revision fence. 제출 시작 때 값을 캡처하고,
  // 완료 때 달라져 있으면 reset/clearModeDraft/saved 패널을 건너뛴다 — 저장
  // 자체(레코드·크라이시스 안내·enqueue)는 그대로 유효하다.
  const captureRevisionRef = useRef(0);
  const draftWriteGenerationRef = useRef(0);
  const storageMutationEpochRef = useRef<Record<CaptureDraftMode, number>>({
    journal: 0,
    memo: 0,
    linkclip: 0,
    ocr: 0,
    file: 0,
  });
  const transientMutationEpochRef = useRef<Record<CaptureTransientMode, number>>({
    voice: 0,
    todo: 0,
    fourw: 0,
  });
  const storageCleanupEpochRef = useRef<Partial<Record<CaptureDraftMode, number>>>({});
  const transientCleanupEpochRef = useRef<Partial<Record<CaptureTransientMode, number>>>({});
  const asyncProducerGenerationRef = useRef(0);
  const captureFocusedRef = useRef(false);
  const [captureFocused, setCaptureFocused] = useState(false);

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
  // submit. Voice/todo/4W1H each keep a typed, per-mode draft so switching,
  // sharing, or restarting cannot flatten or discard their structure.
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
  const voicePhaseRef = useRef<VoicePhase>("idle");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const updateVoicePhase = useCallback((next: VoicePhase): void => {
    voicePhaseRef.current = next;
    setVoicePhase(next);
  }, []);
  const stopVoiceCaptureForModeExit = useCallback((nextMode: Mode): void => {
    if (activeModeRef.current !== "voice" || nextMode === "voice") return;
    const phase = voicePhaseRef.current;
    updateVoicePhase("idle");
    setVoiceNotice(null);
    if (phase !== "recording") return;
    // A recorder is an owned native resource, not just a stale UI producer.
    // Stop and discard it when its controls are about to disappear.
    void (async () => {
      try {
        await audioRecorder.stop();
        await discardRecording(audioRecorder.uri);
      } catch (e) {
        if (typeof console !== "undefined") {
          console.warn("[capture] recording cleanup on mode exit failed", (e as Error).message);
        }
      }
    })();
  }, [audioRecorder, updateVoicePhase]);
  const stopVoiceCaptureForModeExitRef = useRef(stopVoiceCaptureForModeExit);
  useLayoutEffect(() => {
    stopVoiceCaptureForModeExitRef.current = stopVoiceCaptureForModeExit;
  }, [stopVoiceCaptureForModeExit]);
  useFocusEffect(
    useCallback(() => {
      focusDraftHydratedRef.current = false;
      if (userId) {
        const previous = focusedCaptureOwners.get(userId);
        // /capture and /capture-full can coexist in one stack. Flush the old
        // owner before the new one may publish a full-state snapshot.
        if (previous && previous.id !== captureInstanceId) {
          startCaptureDraftHandoff(userId, previous);
        }
        // A mounted /capture and /capture-full each retain their own React
        // state. On refocus, that local snapshot may be older than the other
        // route's just-flushed draft. Close every persistence path
        // synchronously, invalidate pre-blur submit cleanup, then make the
        // hydration effect reload the queued durable state before editing.
        const needsFocusRefresh = hasFocusedOnceRef.current ||
          draftLoadedUserRef.current === userId ||
          (previous !== undefined && previous.id !== captureInstanceId);
        if (needsFocusRefresh) {
          draftHydratedRef.current = false;
          setDraftHydrated(false);
          setDraftHydrationError(false);
          // Unacked URL input must be replayed on top of the reloaded durable
          // snapshot. The planners dedupe already-durable share paragraphs;
          // retaining these latches instead can leave URL mode=voice while the
          // normalized store correctly falls back to journal.
          sharedConsumedRef.current = null;
          modeParamConsumedRef.current = null;
          pendingSharedRef.current = sharedDeliveryRef.current !== null;
          sharedAckGenerationRef.current += 1;
          paramAckGenerationRef.current += 1;
          setSharedDurableAck(null);
          setParamDurableAck(null);
          invalidateAllDraftMutationEpochs();
          setDraftFocusRefresh((visit) => visit + 1);
        }
        hasFocusedOnceRef.current = true;
        focusedCaptureOwners.set(userId, {
          id: captureInstanceId,
          freeze: () => freezeDraftOnBlurRef.current(),
        });
      }
      captureFocusedRef.current = true;
      setCaptureFocused(true);
      // Leaving the screen revokes unfinished input producers and releases an
      // active recorder. Accepted submits and durable ACK evidence keep running;
      // route mutation waits until this capture route is focused again.
      return () => {
        if (userId) {
          const owner = focusedCaptureOwners.get(userId);
          if (owner?.id === captureInstanceId) {
            startCaptureDraftHandoff(userId, owner);
            focusedCaptureOwners.delete(userId);
          }
        }
        focusDraftHydratedRef.current = false;
        captureFocusedRef.current = false;
        setCaptureFocused(false);
        asyncProducerGenerationRef.current += 1;
        setExtracting(false);
        stopVoiceCaptureForModeExitRef.current(DEFAULT_CAPTURE_DRAFT_MODE);
      };
    }, [captureInstanceId, userId]),
  );
  useEffect(() => {
    if (!userId) return;
    let previousState = AppState.currentState;
    const sub = AppState.addEventListener("change", (nextState) => {
      const owner = focusedCaptureOwners.get(userId);
      if (owner?.id !== captureInstanceId) {
        previousState = nextState;
        return;
      }
      if (previousState === "active" && nextState !== "active") {
        // Route focus often remains true while the native app backgrounds.
        // Freeze immediately instead of trusting an 800ms timer that the OS
        // may suspend before it fires.
        startCaptureDraftHandoff(userId, owner);
      } else if (
        nextState === "active" &&
        captureDraftHandoffs.get(userId)?.has(captureInstanceId)
      ) {
        // Retry a failed background write with the latest committed snapshot.
        // A mid-hydration owner freezes null, preserving the original handoff.
        startCaptureDraftHandoff(userId, owner);
      }
      previousState = nextState;
    });
    return () => sub.remove();
  }, [captureInstanceId, userId]);
  const [recentDates, setRecentDates] = useState<string[]>([]);
  // 최근 조각 (recent pieces): the records rows already fetched for the streak
  // double as a tappable recent list under the composer. Each row → /record/[id].
  const [recentRows, setRecentRows] = useState<RecentRow[]>([]);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });
  const streak = useMemo(() => computeStreak(recentDates), [recentDates]);

  /**
   * Composer mutation B를 state setter보다 먼저 기록한다. passive effect는
   * 빠른 promise continuation보다 늦을 수 있어 stale submit A의 reset을 막지
   * 못한다. 이 함수는 event/async completion/route effect에서만 호출한다.
   */
  function advanceCaptureRevision(): void {
    captureRevisionRef.current += 1;
    // Retry callbacks close over the failed snapshot. Any newer composer
    // mutation invalidates that snapshot, so remove the retry surface too.
    setFeedbackModal((current) => (current?.retry ? null : current));
  }

  function commitComposerMutation(): void {
    const activeMode = activeModeRef.current;
    if (isCaptureTransientMode(activeMode)) {
      transientMutationEpochRef.current[activeMode] += 1;
    } else {
      storageMutationEpochRef.current[activeMode] += 1;
    }
    advanceCaptureRevision();
  }

  function markStorageMutation(targetMode: CaptureDraftMode): void {
    storageMutationEpochRef.current[targetMode] += 1;
  }

  function markTransientMutation(targetMode: CaptureTransientMode): void {
    transientMutationEpochRef.current[targetMode] += 1;
  }

  function invalidateAllDraftMutationEpochs(): void {
    for (const targetMode of Object.keys(storageMutationEpochRef.current) as CaptureDraftMode[]) {
      storageMutationEpochRef.current[targetMode] += 1;
    }
    for (const targetMode of Object.keys(transientMutationEpochRef.current) as CaptureTransientMode[]) {
      transientMutationEpochRef.current[targetMode] += 1;
    }
    advanceCaptureRevision();
  }

  function captureOwnsFocusedSession(): boolean {
    return !!userId &&
      sessionActiveRef.current &&
      captureFocusedRef.current &&
      focusedCaptureOwners.get(userId)?.id === captureInstanceId;
  }

  /**
   * 저장 A 완주 시점의 상태 스냅샷. 판정 자체는 lib/capture/save-finalize.ts 가
   * 순수 함수로 내린다 — 그래야 "완주와 blur 가 어느 순서로 도착했는가" 를
   * 렌더 없이 테스트할 수 있다(이 저장소는 컴포넌트 렌더 테스트가 막혀 있다).
   */
  function saveFinalizeSnapshot(submittedMode: Mode, startEpoch: number): SaveFinalizeState {
    const currentEpoch = isCaptureTransientMode(submittedMode)
      ? transientMutationEpochRef.current[submittedMode]
      : storageMutationEpochRef.current[submittedMode as StorageMode];
    return {
      sessionActive: sessionActiveRef.current,
      userId: userId ?? null,
      instanceId: captureInstanceId,
      focusedOwnerId: (userId ? focusedCaptureOwners.get(userId)?.id : undefined) ?? null,
      lastWriterId: (userId ? lastCaptureDraftWriters.get(userId) : undefined) ?? null,
      focused: captureFocusedRef.current,
      startEpoch,
      currentEpoch,
      submittedMode,
      activeMode: activeModeRef.current,
    };
  }

  /**
   * 내구 초안 삭제를 마쳐도 되는가. **포커스를 요구하지 않는다** — blur 는
   * 작성기 변경이 아니고, 여기서 멈추면 이미 저장된 글이 초안으로 되살아나
   * 사용자가 중복 저장한다(#1551 회귀). 막는 것은 세션 종료와 인스턴스 인계뿐.
   */
  function captureMayFinalizeSave(submittedMode: Mode, startEpoch: number): boolean {
    return mayFinalizeDurableCleanup(saveFinalizeSnapshot(submittedMode, startEpoch));
  }

  /** 완주 UI(작성기 reset · 성공 패널 · 컴패니언)를 적용해도 되는가. 포커스 필요. */
  function captureMayApplyCompletionUi(submittedMode: Mode, startEpoch: number): boolean {
    return mayApplyCompletionUi(saveFinalizeSnapshot(submittedMode, startEpoch));
  }

  function beginAsyncProducer(): { generation: number; revision: number } {
    // A newer producer owns the loading surface. This also releases a stale
    // OCR/audio spinner when the replacement action is a picker or paste that
    // does not set extracting=true itself.
    setExtracting(false);
    advanceCaptureRevision();
    asyncProducerGenerationRef.current += 1;
    return {
      generation: asyncProducerGenerationRef.current,
      revision: captureRevisionRef.current,
    };
  }

  function asyncProducerIsCurrent(
    ticket: { generation: number; revision: number },
    expectedMode: Mode,
    requireUnchangedComposer = true,
  ): boolean {
    return (
      sessionActiveRef.current &&
      asyncProducerGenerationRef.current === ticket.generation &&
      activeModeRef.current === expectedMode &&
      (!requireUnchangedComposer || captureRevisionRef.current === ticket.revision)
    );
  }

  function changeBody(text: string): void {
    commitComposerMutation();
    setBody(text);
  }

  function changeTopic(text: string): void {
    commitComposerMutation();
    setTopic(text);
  }

  function changeConclusion(text: string): void {
    commitComposerMutation();
    setConclusion(text);
  }

  function changeFourwField(key: (typeof FOURW_KEYS)[number], text: string): void {
    commitComposerMutation();
    setFourw((prev) => ({ ...prev, [key]: text }));
  }

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
      // 별 담기 intent 는 journal 초안과 함께 산다 — 재마운트·재시작 뒤에도
      // 저장이 키워드 분류로 조용히 되돌아가지 않게 (본문 없는 초안은 draft
      // 스토어가 버리므로, 빈 화면만 남긴 intent 는 함께 사라진다).
      ...(targetMode === "journal" && domainIntent !== null ? { domainIntent } : {}),
      // 일반 칩(라우트 tag 포함)도 초안과 함께 산다. domain 칩은 저장하지
      // 않는다 — domainIntent 가 단일 원천이고 복원이 정본 칩을 파생한다.
      ...(tagsEditable.some((x) => !isDomainTag(x))
        ? { tags: tagsEditable.filter((x) => !isDomainTag(x)) }
        : {}),
    };
  }

  function transientDraftFromFields(targetMode: CaptureTransientMode): CaptureTransientDraft | null {
    return createCaptureTransientDraft({
      mode: targetMode,
      body,
      fourw: targetMode === "fourw" ? fourw : null,
      todoDone,
      tags: tagsEditable,
      domainIntent,
    });
  }

  function storeDraftForMode(targetMode: StorageMode, draft: CaptureDraft): void {
    const next = { ...draftsRef.current };
    if (hasRestorableDraft(draft)) next[targetMode] = draft;
    else delete next[targetMode];
    draftsRef.current = next;
  }

  function storeTransientDraftForMode(
    targetMode: CaptureTransientMode,
    draft: CaptureTransientDraft | null,
  ): void {
    const next = { ...transientDraftsRef.current };
    if (targetMode === "voice" && draft?.mode === "voice") next.voice = draft;
    else if (targetMode === "todo" && draft?.mode === "todo") next.todo = draft;
    else if (targetMode === "fourw" && draft?.mode === "fourw") next.fourw = draft;
    else delete next[targetMode];
    transientDraftsRef.current = next;
  }

  function rememberCurrentDraft(): void {
    if (isStorageMode(mode)) {
      storeDraftForMode(mode, draftFromFields(mode));
      return;
    }
    storeTransientDraftForMode(mode, transientDraftFromFields(mode));
  }

  function persistDrafts(lastMode: Mode): Promise<boolean> {
    if (!userId || !draftHydratedRef.current || draftUserRef.current !== userId) {
      return Promise.resolve(false);
    }
    const snapshot = cloneCaptureDraftState({
      drafts: draftsRef.current,
      transientDrafts: transientDraftsRef.current,
      lastMode,
    });
    const writeGeneration = ++draftWriteGenerationRef.current;
    // 발행을 예약하는 순간 이 인스턴스를 마지막 writer 로 기록한다. 완료를
    // 기다리지 않는 이유는 이 표시의 쓸모가 "내 스냅샷이 아직 최신인가" 이지
    // "쓰기가 끝났는가" 가 아니기 때문이다 — 다른 인스턴스가 발행을 예약한
    // 순간부터 내 스냅샷은 낡은 것으로 취급해야 안전하다.
    lastCaptureDraftWriters.set(userId, captureInstanceId);
    return registerCaptureDraftHandoff(
      userId,
      captureInstanceId,
      writeGeneration,
      () => saveCaptureDraftState(userId, snapshot),
    ).completion;
  }

  useLayoutEffect(() => {
    // Freeze the last committed render before leaving. Failed writes retry this
    // immutable value; they never call back into a refocused instance whose
    // fields may now be stale or mid-hydration.
    freezeDraftOnBlurRef.current = () => {
      if (
        !userId ||
        !focusDraftHydratedRef.current ||
        draftLoadedUserRef.current !== userId
      ) return null;
      const activeMode = activeModeRef.current;
      const restoreWasSkipped = shareRestoreSkipped;
      const routeApplyPendingCommit = routeApplyPendingCommitRef.current;
      if (!restoreWasSkipped && !routeApplyPendingCommit && isStorageMode(activeMode)) {
        // Once a successful submit has begun deleting A, a blur must not fold
        // the still-visible A fields back into storage behind that clear. A
        // real edit increments the mode epoch and is therefore preserved.
        if (storageCleanupEpochRef.current[activeMode] !== storageMutationEpochRef.current[activeMode]) {
          storeDraftForMode(activeMode, draftFromFields(activeMode));
        }
      } else if (
        !restoreWasSkipped &&
        !routeApplyPendingCommit &&
        isCaptureTransientMode(activeMode)
      ) {
        if (transientCleanupEpochRef.current[activeMode] !== transientMutationEpochRef.current[activeMode]) {
          storeTransientDraftForMode(activeMode, transientDraftFromFields(activeMode));
        }
      }
      // Draft payloads are JSON-shaped. Clone now so a later retry cannot see
      // map/object mutations from a refocused screen.
      const snapshot = cloneCaptureDraftState({
        drafts: draftsRef.current,
        transientDrafts: transientDraftsRef.current,
        lastMode: restoreWasSkipped ? lastHydratedModeRef.current : activeMode,
      });
      const generation = ++draftWriteGenerationRef.current;
      // freeze 는 persistDrafts 를 거치지 않고 곧장 발행한다 — 그래서 마지막
      // 발행자 표시도 여기서 직접 남긴다. 빠뜨리면 다른 화면이 편집한 뒤
      // 디바운스 전에 떠났을 때 그 쓰기가 장부에 안 남아, 낡은 인스턴스가
      // 아직 자기가 마지막 writer 인 줄 알고 그 초안을 덮어쓴다.
      lastCaptureDraftWriters.set(userId, captureInstanceId);
      return {
        generation,
        write: () => saveCaptureDraftState(userId, snapshot),
      };
    };
  });
  useLayoutEffect(() => {
    focusDraftHydratedRef.current = !!userId &&
      draftHydrated &&
      captureFocused &&
      captureFocusedRef.current &&
      focusedCaptureOwners.get(userId)?.id === captureInstanceId;
  }, [captureFocused, captureInstanceId, draftHydrated, userId]);

  function applyDraftToFields(targetMode: StorageMode, draft: CaptureDraft | undefined): void {
    // Hydration can finish while a submit is in flight. Restored state is a B
    // event too, so the older completion may not clear it.
    advanceCaptureRevision();
    const conclusionDraft = targetMode === "journal" ? draft?.conclusion ?? "" : "";
    setBody(draft?.body ?? "");
    setTopic(targetMode === "journal" ? draft?.topic ?? "" : "");
    setConclusion(conclusionDraft);
    setShowExtras(targetMode === "journal" && conclusionDraft.trim().length > 0);
    setOcrReviewApproved(targetMode === "ocr" && draft?.ocrReviewApproved === true && (draft?.body ?? "").trim().length > 0);
    setFourw(EMPTY_FOURW);
    setTodoDone(false);
    // 초안의 칩과 별 intent 를 함께 복원한다(칩 = 저장될 별·태그). 스토어
    // 로드는 normalizeDraft 가 isDomainId·sanitizeChips 로 이미 걸렀다. 딥링크
    // 집행과 같은 교체 계약: 이전 화면의 칩을 물려받지 않고 초안이 정본이다 —
    // intent 없는 초안은 domain 칩 0개로 복원된다.
    const restoredIntent = targetMode === "journal" ? draft?.domainIntent ?? null : null;
    setDomainIntent(restoredIntent);
    setTagsEditable(() => {
      const base = draft?.tags ?? [];
      return restoredIntent === null ? [...base] : [...base, domainTagFor(restoredIntent)];
    });
  }

  function applyTransientDraftToFields(
    targetMode: CaptureTransientMode,
    draft: CaptureTransientDraft | undefined,
  ): void {
    advanceCaptureRevision();
    const matching = draft?.mode === targetMode ? draft : undefined;
    setBody(matching && matching.mode !== "fourw" ? matching.body : "");
    setTopic("");
    setConclusion("");
    setShowExtras(false);
    setOcrReviewApproved(false);
    setFourw(matching?.mode === "fourw" ? matching.fourw : EMPTY_FOURW);
    setTodoDone(matching?.mode === "todo" ? matching.todoDone : false);
    const restoredIntent = matching?.domainIntent ?? null;
    setDomainIntent(restoredIntent);
    setTagsEditable([
      ...(matching?.tags ?? []),
      ...(restoredIntent === null ? [] : [domainTagFor(restoredIntent)]),
    ]);
  }
  // Composer UI is gated until hydration below, so an empty pre-hydration
  // render can never overwrite the user's loaded draft.
  useEffect(() => {
    if (!userId) {
      draftsRef.current = {};
      transientDraftsRef.current = {};
      draftHydratedRef.current = false;
      setDraftHydrated(false);
      setDraftHydrationError(false);
      draftUserRef.current = null;
      draftLoadedUserRef.current = null;
      lastHydratedModeRef.current = DEFAULT_CAPTURE_DRAFT_MODE;
      shareSkippedRestoreRef.current = false;
      setShareRestoreSkipped(false);
      return;
    }
    if (draftUserRef.current === userId && draftHydratedRef.current) return;
    let cancelled = false;
    if (draftUserRef.current !== userId) draftLoadedUserRef.current = null;
    draftHydratedRef.current = false;
    setDraftHydrated(false);
    setDraftHydrationError(false);
    shareSkippedRestoreRef.current = false;
    setShareRestoreSkipped(false);
    draftUserRef.current = userId;
    void settleCaptureDraftHandoffs(userId)
      .then((durable) => {
        if (!durable) throw new Error("capture draft handoff was not durable");
        return loadCaptureDraftState(userId);
      })
      .then((state) => {
        if (cancelled) return;
        draftsRef.current = state.drafts;
        transientDraftsRef.current = state.transientDrafts ?? {};
        draftLoadedUserRef.current = userId;
        lastHydratedModeRef.current = state.lastMode;
        draftHydratedRef.current = true;
        setDraftHydrated(true);
        // An unconsumed share owns the first applied state (the effect below
        // runs right after hydration flips) — skip the lastMode restore so the
        // screen doesn't flash a different mode first. Record the skip: the
        // live fields stay unpopulated, and the consume effect must NOT fold
        // them back in (that would delete the stored draft they never showed).
        if (pendingSharedRef.current) {
          shareSkippedRestoreRef.current = true;
          setShareRestoreSkipped(true);
          return;
        }
        const restoredMode = (CAPTURE_MODES as readonly string[]).includes(state.lastMode)
          ? state.lastMode
          : DEFAULT_CAPTURE_DRAFT_MODE;
        if (restoredMode !== "journal") setShowAdvancedModes(true);
        activeModeRef.current = restoredMode;
        setMode(restoredMode);
        if (isCaptureDraftMode(restoredMode)) {
          applyDraftToFields(restoredMode, state.drafts[restoredMode]);
        } else {
          applyTransientDraftToFields(restoredMode, transientDraftsRef.current[restoredMode]);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        // Keep the composer and every persistence effect closed. A failed read
        // is unknown state, never permission to replace storage with emptiness.
        draftHydratedRef.current = false;
        setDraftHydrated(false);
        setDraftHydrationError(true);
        if (typeof console !== "undefined") {
          console.warn("[capture] draft hydration failed", (e as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, draftHydrationRetry, draftFocusRefresh]);
  // Shared-content reception (O-R2 scrap track): apply the share-sheet payload
  // once drafts are hydrated. Existing draft text is never destroyed — the
  // leaving mode's live fields are remembered (unless the restore never
  // populated them: restoreSkipped 면 폴드하지 않는다 — 빈 live 를 접으면
  // 저장돼 있던 journal 초안이 지워진다).
  //
  // mode 파라미터가 함께 배달되면 **여기서 한 번에** 소비한다(원자 소비,
  // planSharedConsumption): payload 가 요청된 composer 로 실려 가고, param
  // effect 는 latch 로 이중 소비가 막힌다. 전환·폴드를 두 effect 가 나누면
  // 전환이 빈 target 초안을 복원해 공유 텍스트가 화면에서 사라진다.
  useEffect(() => {
    if (
      !captureFocused ||
      !captureFocusedRef.current ||
      !shared ||
      sharedDelivery === null ||
      !userId ||
      focusedCaptureOwners.get(userId)?.id !== captureInstanceId ||
      !draftHydrated
    ) return;
    if (sharedConsumedRef.current === sharedDelivery) return;
    routeApplyPendingCommitRef.current = true;
    setRouteCommitGeneration((generation) => generation + 1);
    sharedConsumedRef.current = sharedDelivery;
    const ackGeneration = ++sharedAckGenerationRef.current;
    // A share supersedes any older param-only ACK, even when mode/tag happen
    // to be textually identical. The share has its own delivery identity.
    paramAckGenerationRef.current += 1;
    setParamDurableAck(null);
    // 배달 소비 = B 사건이다: 날아가는 저장 A 가 완주해도 결과 정리(reset·
    // clear·saved 패널)가 B 를 덮어쓰면 안 된다. 저장 A 자체는 끝까지 보내고
    // revision으로 UI 정리 권한만 회수한다.
    advanceCaptureRevision();
    const restoreSkipped = shareSkippedRestoreRef.current;
    shareSkippedRestoreRef.current = false;
    // Keep the render-captured state true for every later effect in this
    // commit. The next render contains the share plan's actual composer fields.
    setShareRestoreSkipped(false);
    // Voice/todo/4W1H use their own typed draft map rather than StorageMode.
    // The planner receives the live fields as well so a share cannot lose edits
    // that have not reached the debounce yet.
    const plan = planSharedConsumption({
      drafts: draftsRef.current,
      transientDrafts: transientDraftsRef.current,
      liveDraft: isStorageMode(mode) ? draftFromFields(mode) : { body: "", topic: "", conclusion: "" },
      liveMode: isStorageMode(mode) ? mode : "linkclip",
      restoreSkipped,
      content: shared.content,
      modeParam,
      tagParam,
      currentMode: mode,
      liveBody: body,
      liveTodoDone: todoDone,
      liveFourw: mode === "fourw" ? fourw : null,
      liveTags: tagsEditable,
      liveDomainIntent: domainIntent,
    });
    if (isCaptureTransientMode(plan.mode)) markTransientMutation(plan.mode);
    else markStorageMutation(plan.mode);
    stopVoiceCaptureForModeExit(plan.mode);
    // A share can switch modes without going through switchCaptureMode. Revoke
    // any picker/clipboard/transcription completion owned by the old composer.
    if (activeModeRef.current !== plan.mode) asyncProducerGenerationRef.current += 1;
    draftsRef.current = plan.drafts;
    transientDraftsRef.current = plan.transientDrafts;
    resetTransientCaptureState();
    setShowAdvancedModes(true);
    activeModeRef.current = plan.mode;
    setMode(plan.mode);
    if (isStorageMode(plan.mode)) {
      applyDraftToFields(plan.mode, plan.drafts[plan.mode]);
    } else if (plan.liveFourw !== null) {
      // 4W1H 은 body 가 아니라 다섯 칸 state 만 읽고 저장한다 — payload 는
      // 계획이 필수 칸(무엇을)에 실어 보이는 곳과 저장되는 곳을 일치시킨다.
      setFourw(plan.liveFourw);
      setBody("");
      setTopic("");
      setConclusion("");
      setShowExtras(false);
      setOcrReviewApproved(false);
    } else {
      // voice/todo payload 를 composer 에 직접 싣는다. 같은 typed draft가
      // 이미 durable snapshot에 있으므로 linkclip을 백업 칸으로 오염시키지 않는다.
      setBody(plan.liveBody);
      setTopic("");
      setConclusion("");
      setShowExtras(false);
      setOcrReviewApproved(false);
      setFourw(EMPTY_FOURW);
    }
    // tag/domain intent 도 body·mode 와 같은 delivery 계획의 결과다. 별도
    // effect 에 남기면 persist와 URL strip 사이에 crash window가 다시 생긴다.
    setTagsEditable(plan.liveTags);
    setDomainIntent(plan.liveDomainIntent);
    setTodoDone(plan.liveTodoDone);
    const durableWrite = persistDrafts(plan.persistMode);
    if (plan.consumedModeParam !== null || plan.consumedTagParam !== null) {
      // param effect 가 같은 조합을 다시 소비하지 않게 latch 를 건다.
      modeParamConsumedRef.current = `${plan.consumedModeParam ?? ""}:${plan.consumedTagParam ?? ""}`;
    }
    if (plan.starConflict !== null) {
      // 서로 다른 별은 병합·재분류하지 않았다 — 어디에 담겼는지 알린다.
      // (capture 네임스페이스에 이 케이스의 키가 없어 인라인 이중언어로 둔다.)
      showFeedback(
        locale === "ko" ? "쓰던 기록 초안의 별을 지켰어요" : "Kept your record draft intact",
        locale === "ko"
          ? "쓰던 기록 초안은 원래 별에 그대로 두고, 공유된 내용은 다른 자리에 담았어요."
          : "Your existing record draft kept its original star. The shared content was placed separately so nothing was refiled.",
      );
    }
    // Strip the consumed payload from the URL so a web refresh (or back/
    // forward) doesn't resurrect content the user may have since edited away.
    void durableWrite.then((durable) => {
      if (
        !durable ||
        !sessionActiveRef.current ||
        sharedAckGenerationRef.current !== ackGeneration ||
        sharedConsumedRef.current !== sharedDelivery
      ) return;
      // Do not mutate the router from this promise. A newer delivery can have
      // rendered but not run its passive effect yet; the ACK effect below
      // compares against that render identity before stripping anything.
      setSharedDurableAck({
        delivery: sharedDelivery,
        generation: ackGeneration,
        clearMode: plan.consumedModeParam !== null,
        clearTag: plan.consumedTagParam !== null,
      });
    });
  }, [
    shared,
    userId,
    draftHydrated,
    modeParam,
    tagParam,
    sharedDelivery,
    mode,
    fourw,
    todoDone,
    tagsEditable,
    domainIntent,
    body,
    topic,
    conclusion,
    ocrReviewApproved,
    locale,
    stopVoiceCaptureForModeExit,
    captureFocused,
  ]);

  // Deep links can open a specific composer with a pre-attached tag:
  // /capture-full?mode=voice (사진·음성 quick buttons, /beyond mic — med#3/#24)
  // and ?tag=domain:career (별 화면의 담기 — med#1, so the piece lands on the
  // star it was captured from instead of wherever auto-classification guesses).
  //
  // 소비 규칙(latch 해제·별 intent 의 record 모드 강제·칩 교체)은 전부
  // planCaptureParamConsumption(lib/capture/draft.ts)이 순수 함수로 정하고,
  // 여기는 그 계획을 집행만 한다 — 상태 전이를 렌더 없이 테스트하기 위해서다.
  // 라우트발 모드 변경도 손 전환과 같은 계약(switchCaptureMode)을 탄다: draft
  // 보존·복원과 transient reset 을 건너뛰지 않고, intent·칩은 그 뒤에 놓는다.
  useEffect(() => {
    if (
      !captureFocused ||
      !captureFocusedRef.current ||
      !userId ||
      focusedCaptureOwners.get(userId)?.id !== captureInstanceId ||
      !draftHydrated
    ) return;
    // 미소비 share 가 있으면 그쪽(원자 소비)이 먼저다 — 같은 flush 에서 여기가
    // 낡은 closure(mode·live)로 전환을 걸면 폴드 전 상태를 접어 넣게 된다.
    if (pendingSharedRef.current) return;
    const plan = planCaptureParamConsumption({
      modeParam,
      tagParam,
      currentMode: mode,
      consumedKey: modeParamConsumedRef.current,
      drafts: draftsRef.current,
      currentDraft: isStorageMode(mode) ? draftFromFields(mode) : null,
      transientDrafts: transientDraftsRef.current,
      currentTransient: isCaptureTransientMode(mode) ? transientDraftFromFields(mode) : null,
    });
    if (plan.releaseLatch) {
      // setParams 가 파라미터를 비운 직후 — latch 를 풀어야 같은 별 담기가
      // 같은 mount 에 다시 와도 새 배달로 소비된다.
      modeParamConsumedRef.current = null;
      return;
    }
    if (plan.consumeKey === null) return;
    routeApplyPendingCommitRef.current = true;
    setRouteCommitGeneration((generation) => generation + 1);
    const consumeKey = plan.consumeKey;
    modeParamConsumedRef.current = consumeKey;
    const ackGeneration = ++paramAckGenerationRef.current;
    // 파라미터 소비도 B 사건이다 — 날아가는 저장의 완주 정리가 이 결과를 덮지
    // 않게 revision 을 올린다. 저장 A 자체는 취소하지 않는다.
    advanceCaptureRevision();
    if (plan.showAdvanced) setShowAdvancedModes(true);
    if (plan.targetMode !== null) switchCaptureMode(plan.targetMode);
    // intent 집행은 계획이 가른 원인을 따른다 (IntentTransition 문서):
    //   preserve·defer-to-draft — 손대지 않는다 (defer 는 전환의 reset+초안
    //   복원이 수명을 소유한다; 초안이 되살린 칩+intent pair 는 stale 이 아니다).
    //   set·clear — 전환을 가로질러도 domain 칩을 전부 걷고 집행한다. clear 를
    //   defer 와 뭉개면 mode+일반tag 배달이 초안의 별을 못 지운다 (P2).
    const intent = plan.intent;
    if (intent.kind === "set" || intent.kind === "clear") {
      const chip = plan.appendChip;
      setTagsEditable((prev) => {
        // Stored chips are capped at ten ordinary tags. Apply the same cap
        // before rendering so a route tag cannot appear as an unsaved 11th tag.
        const base = prev.filter((x) => !isDomainTag(x)).slice(0, 10);
        if (chip === null) return base;
        if (isDomainTag(chip)) return [...base, chip];
        return base.includes(chip) || base.length >= 10 ? base : [...base, chip];
      });
      setDomainIntent(intent.kind === "set" ? intent.domain : null);
    }
    let durableWrite: Promise<boolean> = Promise.resolve(false);
    if (plan.durableDraftUpdate !== null) {
      const { mode: draftMode, draft } = plan.durableDraftUpdate;
      markStorageMutation(draftMode);
      draftsRef.current = { ...draftsRef.current, [draftMode]: draft };
      // URL은 이 snapshot이 localStorage에 쓰이거나 native write queue에
      // 안전하게 도착한 뒤에만 걷는다. 즉시 종료/재마운트가 intent/tag를
      // 잃는 800ms debounce 창을 닫는다.
      durableWrite = persistDrafts(draftMode);
    }
    if (plan.durableTransientUpdate !== null) {
      const { mode: draftMode, draft } = plan.durableTransientUpdate;
      markTransientMutation(draftMode);
      transientDraftsRef.current = { ...transientDraftsRef.current, [draftMode]: draft };
      durableWrite = persistDrafts(draftMode);
    }
    if (plan.journalConflict !== null) {
      showFeedback(
        locale === "ko" ? "쓰던 별 초안을 그대로 지켰어요" : "Kept your star draft intact",
        locale === "ko"
          ? "기존 초안을 저장하거나 비운 뒤 다른 별에서 다시 담아 주세요. 내용과 별은 바꾸지 않았어요."
          : "Save or clear the existing draft before capturing from another star. Its text and star were not changed.",
      );
      // 충돌 억제는 "이 파라미터로 바꿀 durable 상태가 없다" 는 **확정 판정**이라
      // 기다릴 내구 증거가 없다. durable ACK 만 기다리면 URL 의 tag 가 영영 안
      // 걷히고, 재포커스가 소비 latch 를 풀 때마다 같은 충돌을 다시 계획해
      // 이 모달이 영구히 재생된다. 판정 자체를 소비 완료로 친다.
      setParamDurableAck({
        key: consumeKey,
        identity: paramDeliveryIdentity,
        generation: ackGeneration,
      });
    }
    void durableWrite.then((durable) => {
      if (
        !durable ||
        !sessionActiveRef.current ||
        paramAckGenerationRef.current !== ackGeneration ||
        modeParamConsumedRef.current !== consumeKey
      ) return;
      setParamDurableAck({
        key: consumeKey,
        identity: paramDeliveryIdentity,
        generation: ackGeneration,
      });
    });
    // `shared` 가 deps 에 있는 이유: share+tag 동시 배달에서 share 소비가 mode 를
    // 안 바꾸면 이 effect 를 다시 깨울 다른 신호가 없다 — shared 가 null 로
    // 바뀌는 순간(위 guard 해제) 남은 tag 를 소비한다.
  }, [
    draftHydrated,
    modeParam,
    tagParam,
    mode,
    shared,
    body,
    topic,
    conclusion,
    ocrReviewApproved,
    domainIntent,
    tagsEditable,
    locale,
    paramDeliveryIdentity,
    captureFocused,
    captureInstanceId,
    userId,
  ]);
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
    if (
      !captureFocused ||
      !captureFocusedRef.current ||
      !userId ||
      focusedCaptureOwners.get(userId)?.id !== captureInstanceId ||
      shareRestoreSkipped ||
      routeApplyPendingCommitRef.current ||
      !draftHydratedRef.current ||
      draftUserRef.current !== userId
    ) return;
    let hasDurableComposerSnapshot = false;
    if (isStorageMode(mode)) {
      const draft = draftFromFields(mode);
      hasDurableComposerSnapshot = hasRestorableDraft(draft);
      storeDraftForMode(mode, draft);
    } else {
      const draft = transientDraftFromFields(mode);
      hasDurableComposerSnapshot = draft !== null;
      storeTransientDraftForMode(mode, draft);
    }
    // A slow first share/param write must not suppress edits made while it is
    // pending. The debounce retries the latest full snapshot and may ACK the
    // still-current delivery only after that snapshot is durable.
    const sharedAck =
      sharedDelivery !== null && sharedConsumedRef.current === sharedDelivery
        ? { delivery: sharedDelivery, generation: sharedAckGenerationRef.current }
        : null;
    const paramAckKey = modeParamConsumedRef.current;
    const hasTagParam = typeof tagParam === "string" && tagParam.trim().length > 0;
    const requestedTransientMode =
      typeof modeParam === "string" && isCaptureTransientMode(modeParam);
    const paramCanAck =
      paramAckKey !== null &&
      (hasDurableComposerSnapshot || (!hasTagParam && !requestedTransientMode));
    const paramAckGeneration = paramAckGenerationRef.current;
    const handle = setTimeout(() => {
      if (!captureOwnsFocusedSession()) return;
      void persistDrafts(mode).then((durable) => {
        if (!durable || !captureOwnsFocusedSession()) return;
        if (
          sharedAck !== null &&
          sharedAckGenerationRef.current === sharedAck.generation &&
          sharedConsumedRef.current === sharedAck.delivery
        ) {
          setSharedDurableAck({
            delivery: sharedAck.delivery,
            generation: sharedAck.generation,
            clearMode: true,
            clearTag: true,
          });
          return;
        }
        if (
          paramCanAck &&
          paramAckGenerationRef.current === paramAckGeneration &&
          modeParamConsumedRef.current === paramAckKey
        ) {
          setParamDurableAck({
            key: paramAckKey,
            identity: paramDeliveryIdentity,
            generation: paramAckGeneration,
          });
        }
      });
    }, 800);
    return () => clearTimeout(handle);
    // domainIntent·칩도 초안의 일부다 — 본문 변경 없이 그것만 바뀌어도(설정·
    // 해제·라우트 tag) 저장된 초안이 따라가야 복원이 화면과 어긋나지 않는다.
  }, [
    userId,
    draftHydrated,
    mode,
    body,
    fourw,
    todoDone,
    topic,
    conclusion,
    ocrReviewApproved,
    domainIntent,
    tagsEditable,
    sharedDelivery,
    modeParam,
    tagParam,
    paramDeliveryIdentity,
    captureFocused,
    captureInstanceId,
    shareRestoreSkipped,
    routeCommitGeneration,
  ]);

  // Durable writes publish ACK evidence into state. Router mutation happens
  // only from the latest committed render and only while this route is focused,
  // closing both render→effect replacement and background-route races.
  useEffect(() => {
    if (
      sharedDurableAck === null ||
      !captureFocused ||
      !captureFocusedRef.current ||
      !sessionActiveRef.current ||
      !userId ||
      focusedCaptureOwners.get(userId)?.id !== captureInstanceId ||
      sharedDelivery !== sharedDurableAck.delivery ||
      sharedAckGenerationRef.current !== sharedDurableAck.generation ||
      sharedConsumedRef.current !== sharedDurableAck.delivery
    ) return;
    router.setParams({
      url: undefined,
      text: undefined,
      title: undefined,
      ...(sharedDurableAck.clearMode ? { mode: undefined } : {}),
      ...(sharedDurableAck.clearTag ? { tag: undefined } : {}),
    });
  }, [captureFocused, captureInstanceId, sharedDelivery, sharedDurableAck, userId]);

  useEffect(() => {
    if (
      paramDurableAck === null ||
      !captureFocused ||
      !captureFocusedRef.current ||
      !sessionActiveRef.current ||
      !userId ||
      focusedCaptureOwners.get(userId)?.id !== captureInstanceId ||
      paramDeliveryIdentity !== paramDurableAck.identity ||
      paramAckGenerationRef.current !== paramDurableAck.generation ||
      modeParamConsumedRef.current !== paramDurableAck.key
    ) return;
    router.setParams({ mode: undefined, tag: undefined });
  }, [captureFocused, captureInstanceId, paramDeliveryIdentity, paramDurableAck, userId]);

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
  if (!draftHydrated) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          {draftHydrationError ? (
            <>
              <Text variant="heading">
                {locale === "ko" ? "초안을 불러오지 못했어요" : "Couldn't load your draft"}
              </Text>
              <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
                {locale === "ko"
                  ? "기존 초안을 보호하기 위해 입력 화면을 열지 않았어요. 저장소를 확인한 뒤 다시 시도해 주세요."
                  : "The editor stayed closed to protect your existing draft. Check storage and try again."}
              </Text>
              <Button
                label={locale === "ko" ? "다시 시도" : "Try again"}
                onPress={() => setDraftHydrationRetry((attempt) => attempt + 1)}
                accessibilityHint={locale === "ko" ? "초안 불러오기를 다시 시도합니다" : "Retries loading your draft"}
              />
            </>
          ) : (
            <PremiumLoadingState message={t("loading")} />
          )}
        </View>
      </PremiumAppShell>
    );
  }

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

  function beginSubmit(): boolean {
    if (submitBusyRef.current) return false;
    submitBusyRef.current = true;
    setSubmitting(true);
    return true;
  }

  function finishSubmit(): void {
    submitBusyRef.current = false;
    setSubmitting(false);
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
    proposalGenerationRef.current += 1;
    setPickedFile(null);
    setFileNotice(null);
    setPickedImage(null);
    setExtracting(false);
    setTagsEditable([]);
    // 저장 성공(reset)·모드 전환이 지나간 뒤에도 typed intent 가 남으면 다음
    // 저장이 보이지 않는 의도에 좌우된다 — 태그 칩과 같은 수명으로 지운다.
    setDomainIntent(null);
    setAskAdvisor(false);
    setProposalCtx(null);
    setProposal(null);
    setProposing(false);
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

  function clearModeDraft(targetMode: StorageMode): Promise<boolean> {
    const next = { ...draftsRef.current };
    delete next[targetMode];
    draftsRef.current = next;
    // Publish a full snapshot, not a partial storage RMW. If an older failed
    // handoff also contains another mode, a journal-only clear must not erase
    // that unrelated unsaved draft from the retry ledger.
    const lastMode = activeModeRef.current === targetMode
      ? DEFAULT_CAPTURE_DRAFT_MODE
      : activeModeRef.current;
    return persistDrafts(lastMode);
  }

  async function clearSubmittedStorageDraft(
    targetMode: StorageMode,
    startModeEpoch: number,
  ): Promise<boolean> {
    if (!captureMayFinalizeSave(targetMode, startModeEpoch)) return false;
    storageCleanupEpochRef.current[targetMode] = startModeEpoch;
    try {
      let durable = await clearModeDraft(targetMode);
      // A mode switch or an older debounce may have folded submitted A back into
      // the full-state blob behind clear #1. If this mode still has no semantic
      // B, queue one final clear after that write.
      if (
        captureMayFinalizeSave(targetMode, startModeEpoch) &&
        (draftsRef.current[targetMode] !== undefined || !durable)
      ) {
        durable = await clearModeDraft(targetMode);
      }
      return durable;
    } finally {
      if (storageCleanupEpochRef.current[targetMode] === startModeEpoch) {
        delete storageCleanupEpochRef.current[targetMode];
      }
    }
  }

  function showDraftCleanupFailure(): void {
    if (!captureOwnsFocusedSession()) return;
    showFeedback(
      locale === "ko" ? "저장은 끝났지만 초안을 정리하지 못했어요" : "Saved, but draft cleanup failed",
      locale === "ko"
        ? "기록은 안전하게 저장됐어요. 앱을 다시 열면 같은 초안이 보일 수 있으니 다시 저장하지 말고 비워 주세요."
        : "Your record is safe. If the same draft reappears after restart, clear it instead of saving it again.",
    );
  }

  function clearTransientModeDraft(targetMode: CaptureTransientMode): Promise<boolean> {
    const next = { ...transientDraftsRef.current };
    delete next[targetMode];
    transientDraftsRef.current = next;
    // If the user moved elsewhere while this save was in flight, preserve that
    // active mode as lastMode. A just-cleared active transient has no restorable
    // envelope, so journal is its safe reload landing.
    const lastMode = activeModeRef.current === targetMode
      ? DEFAULT_CAPTURE_DRAFT_MODE
      : activeModeRef.current;
    return persistDrafts(lastMode);
  }

  async function clearSubmittedTransientDraft(
    targetMode: CaptureTransientMode,
    startModeEpoch: number,
  ): Promise<boolean> {
    if (!captureMayFinalizeSave(targetMode, startModeEpoch)) return false;
    transientCleanupEpochRef.current[targetMode] = startModeEpoch;
    try {
      let durable = await clearTransientModeDraft(targetMode);
      if (
        captureMayFinalizeSave(targetMode, startModeEpoch) &&
        (transientDraftsRef.current[targetMode] !== undefined || !durable)
      ) {
        durable = await clearTransientModeDraft(targetMode);
      }
      return durable;
    } finally {
      if (transientCleanupEpochRef.current[targetMode] === startModeEpoch) {
        delete transientCleanupEpochRef.current[targetMode];
      }
    }
  }

  function switchCaptureMode(nextMode: Mode): void {
    if (nextMode === mode) return;
    // 저장 A는 사용자가 이미 확정한 snapshot이라 끝까지 보낸다. 모드 전환은
    // revision만 올려 A의 UI 정리 권한을 회수한다(Storage upload orphan 방지).
    advanceCaptureRevision();
    asyncProducerGenerationRef.current += 1;
    stopVoiceCaptureForModeExit(nextMode);
    rememberCurrentDraft();
    resetTransientCaptureState();
    activeModeRef.current = nextMode;
    setMode(nextMode);
    if (nextMode !== "journal") setShowAdvancedModes(true);
    if (isStorageMode(nextMode)) {
      applyDraftToFields(nextMode, draftsRef.current[nextMode]);
      void persistDrafts(nextMode);
    } else {
      applyTransientDraftToFields(nextMode, transientDraftsRef.current[nextMode]);
      void persistDrafts(nextMode);
    }
  }

  // Explicit user action — the OS paste notice firing here is the contract.
  async function pasteCopiedContent(): Promise<void> {
    const ticket = beginAsyncProducer();
    const text = await readClipboardText();
    // Clipboard paste is append-safe across edits, but never across a mode
    // switch or a newer producer action.
    if (!asyncProducerIsCurrent(ticket, "linkclip", false)) return;
    if (!text) {
      // Presence said yes but the read came back empty (cleared in between,
      // or an image-only clipboard) — say so instead of doing nothing.
      setClipboardAvailable(false);
      setClipboardEmptyNote(true);
      return;
    }
    commitComposerMutation();
    setClipboardEmptyNote(false);
    setBody((prev) => {
      const current = prev.trim();
      return current.length === 0 ? text : `${prev.trimEnd()}\n\n${text}`;
    });
  }

  async function pickImage(source: "library" | "camera") {
    if (!userId) return;
    const ticket = beginAsyncProducer();
    try {
      const img = await pickImageAsset(source);
      if (!img) return;
      if (!asyncProducerIsCurrent(ticket, "ocr")) return;
      commitComposerMutation();
      setPickedImage(img);
      setOcrReviewApproved(false);
      setBody(""); // clear any prior extraction; the user presses 추출하기 to fill
    } catch (e) {
      if (!asyncProducerIsCurrent(ticket, "ocr")) return;
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
    if (!userId || !pickedImage || extracting) return;
    const ticket = beginAsyncProducer();
    setExtracting(true);
    try {
      const md = await ocrImageAsset(userId, locale, pickedImage, isMinor === true);
      if (!asyncProducerIsCurrent(ticket, "ocr")) return;
      commitComposerMutation();
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
        if (!sessionActiveRef.current) return;
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
        return;
      }
      if (!asyncProducerIsCurrent(ticket, "ocr")) return;
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
      if (sessionActiveRef.current && asyncProducerGenerationRef.current === ticket.generation) {
        setExtracting(false);
      }
    }
  }

  // H5: an audio file dropped into 담기 goes down the SAME road as the in-app
  // recorder — transcribe, C9-gate the transcript, then fill the body so the user
  // reviews it before saving (propose->ratify). Before this, picking an m4a stored
  // the string "File attachment - audio/mp4, 812345 bytes." and nothing else, so
  // the recording the user cared about was never actually captured.
  //
  // One deliberate difference from the recorder: the file is NOT deleted
  // afterwards. discardRecording exists because the recorder writes a temp file
  // the app owns; this one is the user's own file and deleting it would be a
  // capture tool destroying the thing it was pointed at.
  async function transcribePickedAudio(file: PickedFile) {
    if (!userId) return;
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      setFileNotice(t("file.audioTooLarge", { mb: Math.floor(MAX_AUDIO_FILE_BYTES / 1_000_000) }));
      return;
    }
    const ticket = beginAsyncProducer();
    setExtracting(true);
    setFileNotice(t("file.transcribing"));
    try {
      const { base64, mimeType } = await recordingUriToBase64(file.uri);
      const reply = await transcribeAudio({
        userId,
        locale,
        base64,
        // Trust the picker's normalized MIME over the blob's: DocumentPicker
        // reports a real type, while a file:// blob often comes back as
        // application/octet-stream, which the proxy allowlist rejects.
        mimeType: isAudioMime(file.mimeType) ? file.mimeType : mimeType,
        minor: isMinor === true,
      });
      // C9 parity with the recorder: a red-zone transcript was swapped
      // server-side for the crisis template, so route to the hotline instead of
      // pasting that template into the note.
      if (reply.safety?.zone === "red") {
        if (!sessionActiveRef.current) return;
        setFileNotice(null);
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
        return;
      }
      // Appending is safe across body edits, but not across a mode switch or a
      // newer producer operation.
      if (!asyncProducerIsCurrent(ticket, "file", false)) return;
      commitComposerMutation();
      const transcript = reply.text.trim();
      if (transcript.length === 0) {
        setFileNotice(t("file.transcriptEmpty"));
        return;
      }
      reactExpression("happy");
      setBody((prev) => {
        const current = prev.trim();
        return current.length === 0 ? transcript : `${prev.trimEnd()}

${transcript}`;
      });
      setFileNotice(t("file.transcribed"));
    } catch (e) {
      if (!asyncProducerIsCurrent(ticket, "file", false)) return;
      if (typeof console !== "undefined") console.warn("[capture] file transcription failed", (e as Error).message);
      setFileNotice(t("file.transcribeFailed"));
    } finally {
      if (sessionActiveRef.current && asyncProducerGenerationRef.current === ticket.generation) {
        setExtracting(false);
      }
    }
  }

  async function runFilePick() {
    const ticket = beginAsyncProducer();
    try {
      const f = await pickFile();
      if (!f) return;
      if (!asyncProducerIsCurrent(ticket, "file")) return;
      commitComposerMutation();
      setPickedFile(f);
      setFileNotice(null);
      if (f.textContent) setBody(f.textContent);
      if (isAudioMime(f.mimeType)) await transcribePickedAudio(f);
    } catch (e) {
      if (!asyncProducerIsCurrent(ticket, "file")) return;
      if (typeof console !== "undefined") console.warn("[capture] file pick failed", (e as Error).message);
      showFeedback(
        t("alerts.fileOpen.title"),
        t("alerts.fileOpen.message"),
        () => void runFilePick(),
      );
    }
  }

  function removeTag(t: string) {
    commitComposerMutation();
    setTagsEditable((prev) => prev.filter((x) => x !== t));
    // 칩은 지웠는데 typed intent 만 살아 있으면 화면에 안 보이는 의도가 저장을
    // 좌우한다 — 같은 별의 칩 제거는 intent 도 함께 지운다.
    setDomainIntent((prev) => (prev !== null && domainTagFor(prev) === t ? null : prev));
  }

  function addTagFromInput(input: string) {
    const norm = input.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
    const ordinaryTags = tagsEditable.filter((tag) => !isDomainTag(tag));
    // domain:* is an internal typed-intent namespace. Accepting it as a manual
    // hashtag would render a star chip without setting domainIntent, then the
    // serializer would silently strip it.
    if (
      norm.length === 0 ||
      isDomainTag(norm) ||
      ordinaryTags.includes(norm) ||
      ordinaryTags.length >= 10
    ) return;
    commitComposerMutation();
    setTagsEditable((prev) => [
      ...prev.filter((tag) => !isDomainTag(tag)),
      norm,
      ...prev.filter((tag) => isDomainTag(tag)).slice(0, 1),
    ]);
  }

  function updateOcrBody(text: string) {
    changeBody(text);
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

  const canSubmit = !!userId && !submitting && !extracting && !proposing && voicePhase === "idle" && (
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
    if (!userId || !body.trim() || !beginSubmit()) return;
    const startModeEpoch = storageMutationEpochRef.current.journal;
    try {
      const res = await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "journal",
        body: body.trim(),
        topic: topic.trim().length > 0 ? topic.trim() : undefined,
        tags: tagsEditable.length > 0 ? tagsEditable : undefined,
        domainIntent: domainIntent ?? undefined,
        conclusion: conclusion.trim().length > 0 ? conclusion.trim() : undefined,
        withFollowup: askAdvisor && advisorUnlocked,
        tier: progression.tier,
      });
      if (res.followup?.zone === "red") {
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
      } else {
        enqueueAutoReasoningRecord({
          userId,
          locale,
          minor: isMinor === true,
          tier: progression.tier,
          id: res.id,
          body: body.trim(),
          title: topic.trim() || undefined,
          tags: tagsEditable,
        });
      }
      // Cleanup ownership is per mode: a plain mode switch does not make saved
      // A new, while an edit/tag/advisor/share mutation of journal does.
      if (captureMayFinalizeSave("journal", startModeEpoch)) {
        const savedTopic = topic.trim();
        const draftClearDurable = await clearSubmittedStorageDraft("journal", startModeEpoch);
        if (captureMayApplyCompletionUi("journal", startModeEpoch)) {
          reset();
          companion.fire("journalSaved");
          setSavedTitle(savedTopic.length > 0 ? savedTopic : t("savedTitleFallback"));
          setSavedKind("records");
          setSavedMode("journal");
          setSavedSourceId(null);
          setSavedFollowup(res.followup ?? null);
          setSavedPending(false);
        }
        if (!draftClearDurable) showDraftCleanupFailure();
      }
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
      if (
        !captureOwnsFocusedSession() ||
        storageMutationEpochRef.current.journal !== startModeEpoch ||
        activeModeRef.current !== "journal"
      ) {
        if (typeof console !== "undefined") console.warn("[capture] stale journal save failed", (e as Error).message);
        return;
      }
      reactExpression("negative");
      if (typeof console !== "undefined") console.warn("[capture] journal save failed", (e as Error).message);
      showFeedback(
        t("alerts.journalSave.title"),
        t("alerts.journalSave.message"),
        () => void handleJournalSubmit(),
      );
    } finally {
      finishSubmit();
    }
  }

  // 음성(voice) / 할 일(todo) / 4W1H modes write to `records` via createRecord(kind:
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
    if (!userId || !noteBody || !beginSubmit()) return;
    const startModeEpoch = transientMutationEpochRef.current[noteMode];
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
        domainIntent: domainIntent ?? undefined,
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
      } else {
        enqueueAutoReasoningRecord({
          userId,
          locale,
          minor: isMinor === true,
          tier: progression.tier,
          id: res.id,
          body: noteBody,
          tags,
        });
      }
      // Cleanup ownership is per transient mode. Switching away changes the
      // global screen revision but does not make the already-saved A draft new;
      // editing/re-sharing that mode does, and then it must survive as B.
      if (captureMayFinalizeSave(noteMode, startModeEpoch)) {
        const savedBody = noteBody;
        const draftClearDurable = await clearSubmittedTransientDraft(noteMode, startModeEpoch);
        // The clear ACK can itself take long enough for a same-mode B to arrive.
        // Its queued write follows this clear; never reset that newer composer.
        if (captureMayApplyCompletionUi(noteMode, startModeEpoch)) {
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
        }
        if (!draftClearDurable && captureOwnsFocusedSession()) {
          showFeedback(
            locale === "ko" ? "저장은 끝났지만 초안을 정리하지 못했어요" : "Saved, but draft cleanup failed",
            locale === "ko"
              ? "기록은 안전하게 저장됐어요. 앱을 다시 열면 같은 초안이 보일 수 있으니 다시 저장하지 말고 비워 주세요."
              : "Your record is safe. If the same draft reappears after restart, clear it instead of saving it again.",
          );
        }
      }
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
      if (
        !captureOwnsFocusedSession() ||
        transientMutationEpochRef.current[noteMode] !== startModeEpoch ||
        activeModeRef.current !== noteMode
      ) {
        if (typeof console !== "undefined") console.warn("[capture] stale note-like save failed", (e as Error).message);
        return;
      }
      reactExpression("negative");
      if (typeof console !== "undefined") console.warn("[capture] note-like save failed", (e as Error).message);
      showFeedback(
        t("alerts.pieceSave.title"),
        t("alerts.pieceSave.message"),
        () => void handleNoteLikeSubmit(noteMode),
      );
    } finally {
      finishSubmit();
    }
  }

  // 음성(voice) recording: request mic permission on first record, then capture
  // on-device audio. Web (or any platform where the recorder is unavailable)
  // falls back to the existing typed-transcript box with a brief notice — never
  // crashes. propose->ratify: the transcript lands in `body` for review/edit
  // BEFORE the user presses 담기 to save.
  async function handleStartRecording() {
    if (!userId || voicePhaseRef.current !== "idle") return;
    const ticket = beginAsyncProducer();
    setVoiceNotice(null);
    // Web recording is unreliable across browsers; keep the typed fallback.
    if (Platform.OS === "web") {
      setVoiceNotice(t("voice.webFallback"));
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!asyncProducerIsCurrent(ticket, "voice")) return;
      if (!perm.granted) {
        // Permission denied → fall back to the typed transcript box.
        setVoiceNotice(t("voice.permissionDenied"));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      if (!asyncProducerIsCurrent(ticket, "voice")) return;
      audioRecorder.record();
      updateVoicePhase("recording");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[capture] start recording failed", (e as Error).message);
      updateVoicePhase("idle");
      setVoiceNotice(t("voice.recordFailed"));
    }
  }

  async function handleStopRecording() {
    if (!userId || voicePhaseRef.current !== "recording") return;
    const ticket = beginAsyncProducer();
    updateVoicePhase("transcribing");
    let recordingUri: string | null = null;
    try {
      await audioRecorder.stop();
      recordingUri = audioRecorder.uri;
      if (!recordingUri) {
        updateVoicePhase("idle");
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
        if (!sessionActiveRef.current) return;
        updateVoicePhase("idle");
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
        return;
      }
      // Appending is safe across newer voice text, but not across a mode switch
      // or a newer producer operation.
      if (!asyncProducerIsCurrent(ticket, "voice", false)) {
        if (sessionActiveRef.current) updateVoicePhase("idle");
        return;
      }
      commitComposerMutation();
      const transcript = reply.text.trim();
      if (transcript.length === 0) {
        updateVoicePhase("idle");
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
      updateVoicePhase("idle");
    } catch (e) {
      if (!asyncProducerIsCurrent(ticket, "voice", false)) {
        if (sessionActiveRef.current) updateVoicePhase("idle");
        return;
      }
      if (typeof console !== "undefined") console.warn("[capture] transcription failed", (e as Error).message);
      updateVoicePhase("idle");
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
    if (submitBusyRef.current || extracting || proposing || voicePhaseRef.current !== "idle") return;
    if (mode === "journal") return handleJournalSubmit();
    if (mode === "voice" || mode === "todo" || mode === "fourw") return handleNoteLikeSubmit(mode);
    const submittedMode = mode;
    if (!beginSubmit()) return;
    const submitController = new AbortController();
    submitAbortRef.current = submitController;
    const submitSignal = submitController.signal;
    // Accepted A always finishes. Its mode epoch distinguishes a harmless mode
    // switch from a semantic B edit that cleanup must preserve.
    const startModeEpoch = storageMutationEpochRef.current[submittedMode];
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
      let memoCrisisDetected = false;
      if (submittedMode === "memo") {
        try {
          if (!submitIsCurrent(submitController)) return;
          const crisis = await classifyRecordTextForCrisis(finalBody, locale, userId, isMinor === true);
          if (!submitIsCurrent(submitController)) return;
          if (crisis) {
            memoCrisisDetected = true;
            setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
          }
        } catch (e) {
          if (!submitIsCurrent(submitController)) return;
          if (typeof console !== "undefined") console.warn("[capture] memo crisis classify failed", (e as Error).message);
        }
      }
      if (!submitIsCurrent(submitController)) return;

      if (!memoCrisisDetected && !result.storagePending) {
        enqueueAutoReasoningSource({
          userId,
          locale,
          minor: isMinor === true,
          tier: progression.tier,
          id: result.source.id,
          title: result.source.title,
        });
        // Turn the capture into a wiki page too, but ONLY if the user asked for
        // that to be automatic (settings > 기능; OFF by default). Promotion is
        // not free — it embeds the new page, one paid call per capture — so the
        // default keeps it on the manual button in the source's detail screen.
        // Fire-and-forget: the capture is already saved, and a promotion that
        // fails must never cost the user their piece or hold the success panel.
        void maybeAutoPromoteSource(userId, result.source.id);
      }

      if (captureMayFinalizeSave(submittedMode, startModeEpoch)) {
        const draftClearDurable = await clearSubmittedStorageDraft(submittedMode, startModeEpoch);
        if (captureMayApplyCompletionUi(submittedMode, startModeEpoch)) {
          reset();
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
            proposalGenerationRef.current += 1;
            setProposalCtx({ content: finalBody, url: fallbackUrl });
          }
        }
        if (!draftClearDurable) showDraftCleanupFailure();
      }
    } catch (e) {
      if (isAbortError(e) || !submitIsCurrent(submitController)) return;
      if (
        !captureOwnsFocusedSession() ||
        storageMutationEpochRef.current[submittedMode] !== startModeEpoch ||
        activeModeRef.current !== submittedMode
      ) {
        if (typeof console !== "undefined") console.warn("[capture] stale source save failed", (e as Error).message);
        return;
      }
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
        finishSubmit();
      }
    }
  }

  // G3: AI proposes a new clipper format for material that fit no existing one.
  // Opt-in — only runs when the user taps. Never blocks; a null proposal (mock
  // mode, bad reply, or C-vocabulary filtered) just tells the user there's none.
  async function runPropose() {
    if (!userId || !proposalCtx || proposing) return;
    const context = proposalCtx;
    const generation = ++proposalGenerationRef.current;
    setProposing(true);
    try {
      const p = await proposeClipperTemplate(userId, context.content, context.url, locale, isMinor === true);
      if (!sessionActiveRef.current || proposalGenerationRef.current !== generation) return;
      advanceCaptureRevision();
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
      if (!sessionActiveRef.current || proposalGenerationRef.current !== generation) return;
      if (typeof console !== "undefined") console.warn("[capture] format propose failed", (e as Error).message);
      showFeedback(
        t("alerts.proposeFailed.title"),
        t("alerts.proposeFailed.message"),
        () => void runPropose(),
      );
    } finally {
      if (sessionActiveRef.current && proposalGenerationRef.current === generation) {
        setProposing(false);
      }
    }
  }

  // Save the proposed format to the user's own library; `share` opts it in to
  // the community (clipper_templates.is_shared, so every user can read it).
  async function saveProposed(share: boolean) {
    if (!userId || !proposal) return;
    const proposalToSave = proposal;
    const generation = ++proposalGenerationRef.current;
    try {
      await saveTemplate({
        ownerId: userId,
        slug: proposalToSave.slug,
        baseKind: proposalToSave.baseKind,
        name: proposalToSave.name,
        what: proposalToSave.what,
        defaultTags: proposalToSave.defaultTags,
        targetCategory: proposalToSave.targetCategory,
        aiProperties: proposalToSave.aiProperties,
        shared: share,
      });
      if (!sessionActiveRef.current || proposalGenerationRef.current !== generation) return;
      advanceCaptureRevision();
      setProposal(null);
      setProposalCtx(null);
      setFormatSavedMsg(
        share ? t("formatSaved.shared") : t("formatSaved.personal"),
      );
    } catch (e) {
      if (!sessionActiveRef.current || proposalGenerationRef.current !== generation) return;
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
                    onPress={() => {
                      proposalGenerationRef.current += 1;
                      setProposal(null);
                      setProposalCtx(null);
                      setProposing(false);
                    }}
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
                      advanceCaptureRevision();
                      // Track participates only in source-mode submissions.
                      // The shared UI is also visible in typed record modes.
                      if (isStorageMode(mode)) markStorageMutation(mode);
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
                  onPress={() => router.push("/audit?screener=1")}
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
                onChangeText={changeBody}
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
                    onPress={() => changeTopic(dailyPrompt(locale))}
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
                onChangeText={changeTopic}
                placeholder={t("journal.fields.topicPlaceholder")}
                autoCapitalize="sentences"
              />
              <Pressable
                hitSlop={14}
                onPress={() => {
                  advanceCaptureRevision();
                  setShowExtras((v) => !v);
                }}
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
                  onChangeText={changeConclusion}
                  placeholder={t("journal.conclusion.placeholder")}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              ) : null}
              {advisorUnlocked ? (
                <Pressable
                  onPress={() => {
                    commitComposerMutation();
                    setAskAdvisor((v) => !v);
                  }}
                  hitSlop={14}
                  style={styles.advisorRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: askAdvisor }}
                  accessibilityLabel={t("journal.advisor.label")}
                >
                  <View style={[styles.advisorCheck, askAdvisor && styles.advisorCheckOn]}>
                    {askAdvisor ? <PixelGlyph name="check" color={semantic.background} size={16} /> : null}
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
                onChangeText={changeBody}
                placeholder={t("linkClip.placeholder")}
                accessibilityLabel={t("linkClip.label")}
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
                onChangeText={mode === "ocr" ? updateOcrBody : changeBody}
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
                onChangeText={changeBody}
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
                onChangeText={changeBody}
                placeholder={t("todo.placeholder")}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={styles.textarea}
                accessibilityLabel={t("todo.label")}
              />
              <Pressable
                onPress={() => {
                  commitComposerMutation();
                  setTodoDone((v) => !v);
                }}
                hitSlop={14}
                style={styles.advisorRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: todoDone }}
                accessibilityLabel={t("todo.doneToggle")}
              >
                <View style={[styles.advisorCheck, todoDone && styles.advisorCheckOn]}>
                  {todoDone ? <PixelGlyph name="check" color={semantic.background} size={16} /> : null}
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
                    onChangeText={(text) => changeFourwField(key, text)}
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
                    onPress={() => {
                      commitComposerMutation();
                      setOcrReviewApproved(true);
                    }}
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
                  disabled={extracting}
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
              {fileNotice ? (
                <Text variant="subtle" color="textMuted" style={{ marginTop: 6 }}>
                  {fileNotice}
                </Text>
              ) : pickedFile.textContent ? (
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
                      <PixelGlyph name="close" color={semantic.brand} size={14} />
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
              onPressIn={() => setSubmitPressed(true)}
              onPressOut={() => setSubmitPressed(false)}
              style={[
                styles.tossBtn,
                !canSubmit && styles.tossBtnDisabled,
                canSubmit && submitPressed && styles.tossBtnPressed,
              ]}
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
            {/* 버튼이 꺼진 **이유**를 눈에도 보여준다(2026-08-30).
                여태 이 문장은 accessibilityHint 로만 있었다 — 스크린리더는 듣는데
                보는 사람은 회색 버튼만 보고 왜 안 눌리는지 알 길이 없었다.
                새 문구를 만들지 않는다: 위 submitAccessibilityHint 가 이미 모드별로
                맞는 문장을 5개 로케일에서 고르고 있으므로 그것을 그대로 그린다.
                눌리는 상태에서는 undefined 라 아무것도 그려지지 않는다. */}
            {submitAccessibilityHint ? (
              <Text variant="caption" color="textMuted" style={styles.submitReason}>
                {submitAccessibilityHint}
              </Text>
            ) : null}
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

// 저장 버튼의 상태색 (PIXEL-CLAY 절대 규칙 4).
//
// ⚠ **바탕 선언**: 이 버튼은 자기 배경이 없는 행(`submitRow`) 안에 있어서
//   화면 바닥 위에 바로 앉는다. 딥스페이스 트랙에서 그 바닥은 M3 표면이다
//   (`DeepSpaceScreen` 이 본문에 칠하는 값). `flattenAlpha` 는 바탕이 틀리면
//   알파를 그냥 두는 것보다 나쁘므로, 바꾸는 사람은 여기부터 다시 잴 것.
//
// ⚠ 이 파일은 `/capture`(레거시 본문)와 `/capture-full`(딥스페이스 셸) **둘 다**
//   그린다. 배포되는 것은 딥스페이스 쪽이라 그 바닥을 기준으로 삼았다.
const CAPTURE_BTN_GROUND = m3.color.surface;
const CAPTURE_BTN_DISABLED_BG = flattenAlpha(cosmic.space900, 0.86, CAPTURE_BTN_GROUND);
const CAPTURE_BTN_DISABLED_BORDER = flattenAlpha(cosmic.mistGray, 0.36, CAPTURE_BTN_GROUND);
// 비활성 글자는 화면 바닥이 아니라 **비활성 버튼의 배경** 위에 앉는다. 한 겹 더 들어간다.
const CAPTURE_BTN_DISABLED_INK = flattenAlpha(cosmic.moonWhite, 0.72, CAPTURE_BTN_DISABLED_BG);
// 눌림: 옛 `opacity: 0.9` 가 내던 값을 색으로. 버튼 자신이 semantic.brand 로 차 있다.
const CAPTURE_BTN_PRESSED = flattenAlpha(semantic.brand, 0.9, CAPTURE_BTN_GROUND);

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
  // 버튼이 꺼진 이유 한 줄. 버튼 바로 아래, 가운데.
  submitReason: { textAlign: "center" },
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
  //
  // 상태색은 미리 합성한다 (PIXEL-CLAY 절대 규칙 4: 정적 불투명도 금지).
  // 바탕 선언은 이 시트 위쪽 CAPTURE_BTN_GROUND 에 있다.
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
  // 눌림은 **크기**로 남기고 흐림은 색으로 바꾼다. 눌림 상태에서 글자까지
  // 함께 흐려지던 것이 옛 `opacity` 였으므로 전경도 같이 낸다.
  tossBtnPressed: { transform: [{ scale: 0.97 }], backgroundColor: CAPTURE_BTN_PRESSED, borderColor: CAPTURE_BTN_PRESSED },
  tossBtnDisabled: {
    backgroundColor: CAPTURE_BTN_DISABLED_BG,
    borderColor: CAPTURE_BTN_DISABLED_BORDER,
  },
  tossBtnText: { color: semantic.background, fontSize: typography.sizes.md, fontWeight: "700", fontFamily: CAPTURE_LABEL_FONT },
  tossBtnTextDisabled: { color: CAPTURE_BTN_DISABLED_INK },
});
