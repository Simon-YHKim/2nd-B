import { PhoneView as View, PhoneScrollView as ScrollView, PhonePressable as Pressable } from "@/components/phone/PhoneUIKit";
// 세컨비 chat screen (formerly "Jarvis"). Per handoff v3 §4.B —
// preview of how RAG transforms the experience. Calls into the single
// Gemini wrapper (so C1/C3/C9 hold) and pulls a compact wiki snapshot
// as system context.
//
// State lives in component-local memory; no chat-history persistence in v1.
// The chat_usage daily counter (server-side) is the persistent surface.
//
// First-entry guidance lives in the empty state (Simon, 2026-10-10).
// Retired intro storage values can remain on the device; this screen never reads them.

import { Fragment, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Platform, ActivityIndicator, Animated, useWindowDimensions } from "react-native";
import { KeyboardAvoidingArea } from "@/lib/ui/keyboard";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { useTranslation } from "react-i18next";
import { Redirect, usePathname } from "expo-router";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { beginRecordingAudioMode, endRecordingAudioMode, isRecordingAudioMode, restoreEffectsAfterRecording } from "@/lib/audio/audio-session";
import { RECORD_SAVE_CUE, SECONDB_REPLY_CUE, replyCueAllowed, saveCueAllowed } from "@/lib/audio/app-cues";
import { requestGlobalCue } from "@/lib/audio/global-cues";
import { useUiSound } from "@/lib/audio/use-ui-sound";

import { Text } from "@/components/ui/Text";
import { ScreenModal } from "@/components/ui/ScreenModal";
import { gameboy } from "@/lib/theme/gameboy-tokens";
import { deepSpace, deepSpaceSpacing, flattenAlpha, semantic, spacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { canShowRewardedAds } from "@/lib/ads/policy";
import { canCompleteRewardedWatch } from "@/lib/ads/rewarded";
import { fetchPrivacyPrefs } from "@/lib/supabase/privacy";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAppRouter, useScreenParams } from "@/lib/nav/phone-embed";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  beginAccountSessionLease,
  type PendingAccountSessionLease,
} from "@/lib/auth/account-session-lease";
import { captureAccountOwnerLease, subscribeAccountTransition } from "@/lib/auth/account-epoch";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { chatAutosaveAllowed } from "@/lib/chat/autosave";
import { getExchangeExpression, getReplyActions, getWikiSuggestion, isCurrentWikiSuggestion, type ChatFollowUp } from "@/lib/chat/presentation-policy";
import { createChatAutosaveSession } from "@/lib/chat/autosave-session";
import { shouldShowChatSaveNotice, useChatSaveNoticeDismissed } from "@/lib/chat/save-notice";
import { classifyInputAnyLocale } from "@/lib/safety/classifier";
import { currentDisplayName } from "@/lib/persona/use-address";
import {
  CHAT_KEEP_TAG,
  composeExchangeBody,
  exchangeMarkdown,
  exchangeTopic,
  findPrompt,
  findPromptIndex,
  isKeepable,
} from "@/lib/chat/keep-exchange";
import { useProgression } from "@/lib/progression/useProgression";
import { sendChatMessage } from "@/lib/chat/conversation";
import { retryableMessage } from "@/lib/chat/retry-failed";
import { writeClipboardText } from "@/lib/capture/clipboard";
import { useCitedWikiPage } from "@/lib/chat/use-cited-wiki-page";
import { LlmConsentError, transcribeAudio } from "@/lib/llm/boundary";
import { ServiceConsentLink } from "@/components/consent/ServiceConsentLink";
import { MdButton } from "@/components/m3";
import { shouldShowChatAiNotice, useChatAiNoticeSeen } from "@/lib/chat/ai-first-notice";
import { isModelAnswer, withAiCopyTail } from "@/lib/chat/ai-mark";
import { topicParticle } from "@/lib/i18n/josa";
import { isAbortError } from "@/lib/async/abort";
import {
  createRecorderLifecycle,
  discardRecording,
  recordingUriToBase64,
  type RecordingTempLease,
} from "@/lib/audio/recording-uri";
import { publishCrisisNotice } from "@/lib/safety/crisis-notice";
import { DomainDashboard } from "@/components/secondb/DomainDashboard";
import { ChatTextInput } from "@/components/secondb/ChatTextInput";
import { chatComposerAlignment, chatStatusMaxLines } from "@/components/secondb/chat-font-layout";
import { ChatActionBar, type ChatAction } from "@/components/secondb/ChatActionBar";
import { ChatPlanSheet } from "@/components/secondb/ChatPlanSheet";
import { useChatPlans } from "@/components/secondb/useChatPlans";
import type { ChatTurn, ChatMode } from "@/lib/chat/session-types";
import { ChatMessageAvatar, useChatUserAvatar } from "@/components/secondb/ChatMessageAvatar";
import { ChatModeLine } from "@/components/secondb/ChatModeLine";
import { HustleKPortrait } from "@/components/character/HustleKPortrait";
import { holdExpression, reactExpression } from "@/lib/companion/expression";
import {
  REV2_PERSONA_IDS,
  rev2PersonaAccent,
  rev2PersonaHint,
  rev2PersonaMode,
  rev2PersonaOnSoft,
  rev2PersonaSoftBg,
  type Rev2PersonaId,
} from "@/lib/chat/rev2-personas";
import { m3 } from "@/lib/theme/m3";
import { formatSourceCitationLabel, parseSourceCitations, sourceCitationDisplay } from "@/lib/chat/sources";
import { chatDisplayText } from "@/lib/chat/display-text";
import { parseTwiBranches } from "@/lib/chat/twi-branches";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { ProfileProbeRetryScreen } from "@/components/deep-space/ProfileProbeRetry";
import { ChatRewardCapReachedError, grantChatAdBonus, readChatUsageDetail } from "@/lib/chat/usage";
import { CHAT_DAILY_LIMIT, chatAllowance } from "@/lib/chat/limits";
import { RewardedSheet, type RewardedEarnOutcome } from "@/components/deepspace/RewardedSheet";
import { personaAllowed } from "@/lib/entitlements/tiers";
import { PUBLIC_TIER_BY_DB } from "@/lib/entitlements/tier-map";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SubscriptionTier } from "@/lib/progression/entitlements";
import { captureEvent, secondBSession, aiLimitHit } from "@/lib/analytics";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.color.surfaceContainerLow` — 대화 화면 카드 배경.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const sbAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.color.surfaceContainerLow);
/**
 * 입력 알약(`ds.inputPill`) 안의 반투명 색. 그 바닥은 `surfaceContainerHigh` 다.
 * sbAlpha 로 합성하면 바닥이 틀려 색이 어긋난다(QA R2B-08, 2026-10-05: 자리표시자가
 * 그렇게 2.41:1 이었다).
 */
const pillAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.color.surfaceContainerHigh);

// Quick-action chips offered under an answer (chat pack §8). Each prefills
// the composer with a short follow-up in the village voice; the user sends.
const QUICK_ACTIONS: { kind: ChatFollowUp; ko: string; en: string; mode?: "divergent"; prompt: { ko: string; en: string } }[] = [
  { kind: "next-step", ko: "다음 한 걸음", en: "Next step", prompt: { ko: "지금 할 수 있는 다음 한 걸음으로 줄여줘.", en: "Narrow this to one next step I can take today." } },
  { kind: "new-angle", ko: "새 관점으로", en: "New angle", mode: "divergent", prompt: { ko: "이 생각을 전혀 다른 관점에서 펼쳐줘.", en: "Unfold this from a completely different angle." } },
  { kind: "explain", ko: "왜 이렇게 봤어?", en: "Why this?", prompt: { ko: "왜 그렇게 봤는지 참고한 별가루를 들어 설명해줘.", en: "Explain why you saw it that way, citing the pieces you used." } },
  { kind: "shorter", ko: "다시 짧게", en: "Shorter", prompt: { ko: "더 짧게 한 문장으로 말해줘.", en: "Say that again, shorter. One sentence." } },
];

// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
// 원래 Material Symbols 기하(viewBox 0 -960 960 960)를 그대로 옮긴 곡선 셋이었다.
function IconSend({ color, size = 22 }: { color: string; size?: number }) {
  return <PixelGlyph name="send" color={color} size={size} />;
}
function IconMic({ color, size = 22 }: { color: string; size?: number }) {
  return <PixelGlyph name="mic" color={color} size={size} />;
}
function IconCite({ color, size = 13 }: { color: string; size?: number }) {
  return <PixelGlyph name="link" color={color} size={size} />;
}

// 잠긴 페르소나 칩 — 옛 `opacity: 0.6` 이 테두리와 글자 둘을 함께 덮었다.
// 컨테이너만 흐리면 글자가 그대로 남아 **잠긴 것이 안 잠긴 것보다 또렷해진다.**
// 바탕은 칩이 앉는 딥스페이스 본문 바닥이다 (PIXEL-CLAY 규칙 4).
const LOCKED_CHIP_GROUND = m3.accent.stageFloor;
const LOCKED_CHIP_BORDER = flattenAlpha(m3.color.outlineVariant, 0.6, LOCKED_CHIP_GROUND);
const LOCKED_CHIP_INK = flattenAlpha(m3.color.onSurfaceVariant, 0.6, LOCKED_CHIP_GROUND);

// One chat ENGINE, one chrome (deep-space frame + deepSpace.* tokens). The
// legacy PremiumAppShell village skin that once shared this engine left with
// the `EXPO_PUBLIC_UI=legacy` lever on 2026-10-05 (Simon decision Q-261004-11).
// The send handler, RAG/citation parsing, C9 -> C3 -> crisis path (callLlm via
// sendChatMessage), modes, auth gates, analytics, and daily-limit logic did not
// fork between the two, so nothing in them changed.

interface ChatComposerHandle {
  /** Push text into the composer (quick-action / branch / node-entry prefill). */
  prefill: (text: string) => void;
}

interface ChatComposerProps {
  /** A send is in flight — drives the send-button spinner and blocks re-send. */
  sending: boolean;
  /** Ordinary sends require this gate; device-red drafts can bypass the cap. */
  sendEnabled: boolean;
  /** Commit a message. Returns true when accepted (composer clears its draft),
   *  false when the send was refused (e.g. reasoning cap) so the draft is kept. */
  onSend: (text: string) => boolean;
  /** Node-entry seed (?fromNode=): pre-fills the draft once on first mount. */
  fromNode?: string | null;
  /** Screen-reader name of the input. It names who is being asked (Z85). */
  askLabel: string;
  /** deep-space lens tint. */
  lensAccent?: string;
  inkOnAccent?: string;
}

// The chat composer owns its own draft so a keystroke re-renders ONLY this
// subtree. Previously draft lived in SecondBChatBody, whose deep-space branch
// returns the whole DeepSpaceScreen, so every character re-reconciled the
// starfield, status header, dock, and every message bubble. Prefill from
// quick-actions / branches / node entry comes in through the imperative handle;
// onSend is a stable useCallback so this memo holds across parent renders.
const ChatComposer = memo(
  forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
    {
      sending,
      sendEnabled,
      onSend,
      fromNode,
      askLabel,
      // The chat body always passes these; the defaults only satisfy the type.
      lensAccent = deepSpace.accent,
      inkOnAccent = m3.accent.onAccentInk,
    },
    ref,
  ) {
    const { t, i18n } = useTranslation("secondb");
    // Node entry seeds the composer once (mirrors the old seeding effect); the
    // initializer runs only on mount, so a later param change never re-seeds.
    const [draft, setDraft] = useState(() => (fromNode ? t("aboutNode", { node: fromNode }) : ""));
    const { fontScale } = useWindowDimensions();
    const [inputHeight, setInputHeight] = useState(0);
    const composerAlignment = chatComposerAlignment(Platform.OS, fontScale, draft.length === 0 ? 0 : inputHeight);
    useImperativeHandle(ref, () => ({ prefill: (text: string) => setDraft(text) }), []);
    const { userId, isMinor } = useAuth();
    const voiceLocale = i18n.language === "ko" ? ("ko" as const) : ("en" as const);
    // Q-261015-82: a reached AI cap must not disable the path to fixed crisis guidance.
    // This is only a button gate; the engine still owns routing, audit and quota checks.
    const canSend = draft.trim().length > 0 && !sending && (sendEnabled ||
      classifyInputAnyLocale(draft, voiceLocale, { minor: isMinor === true }).zone === "red");
    const submit = () => {
      if (!canSend) return;
      // The send handler publishes device-red guidance before any await.
      // Clear only when the send was accepted, so a cap-blocked send keeps the
      // typed text (the old handleSend returned before clearing on a cap hit).
      if (onSend(draft.trim())) setDraft("");
    };

    // Voice input (queue E) — the /capture-full dictation chain, retargeted at
    // the DRAFT. Recorder created unconditionally (rules of hooks); the
    // transcript is proposed into the draft for review, never auto-sent
    // (propose -> ratify). transcribeAudio holds C1/C3/C9: a red-zone
    // transcript never reaches the draft — it routes to the crisis surface.
    const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recorderLifecycle = useMemo(
      () => createRecorderLifecycle(audioRecorder, { onIdle: restoreEffectsAfterRecording }),
      [audioRecorder],
    );
    const [voicePhase, setVoicePhase] = useState<"idle" | "recording" | "transcribing">("idle");
    const voicePhaseRef = useRef<"idle" | "recording" | "transcribing">("idle");
    const voiceStartInFlightRef = useRef(false);
    const voiceAccountLeaseRef = useRef<PendingAccountSessionLease | null>(null);
    const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
    useEffect(() => {
      if (!voiceNotice) return;
      const timeout = setTimeout(() => setVoiceNotice(null), 3200);
      return () => clearTimeout(timeout);
    }, [voiceNotice]);
    const updateVoicePhase = useCallback((next: "idle" | "recording" | "transcribing"): void => {
      voicePhaseRef.current = next;
      setVoicePhase(next);
    }, []);
    useLayoutEffect(() => () => {
      // Beat expo-audio's passive hook release: abort egress and synchronously
      // begin the recorder-owned stop while its native object is still valid.
      voiceAccountLeaseRef.current?.abort();
      voicePhaseRef.current = "idle";
      recorderLifecycle.dispose();
    }, [recorderLifecycle]);

    async function handleMicPress(): Promise<void> {
      if (voicePhaseRef.current === "transcribing") return;
      if (voicePhaseRef.current === "recording") {
        await stopAndTranscribe();
        return;
      }
      if (voiceStartInFlightRef.current) return;
      if (!userId) return;
      if (Platform.OS === "web") {
        setVoiceNotice(t("voice.webFallback"));
        return;
      }
      voiceStartInFlightRef.current = true;
      voiceAccountLeaseRef.current?.abort();
      const ownerGuard = beginAccountSessionLease(userId);
      voiceAccountLeaseRef.current = ownerGuard;
      let prepared = false;
      try {
        ownerGuard.assertCurrent();
        await recorderLifecycle.waitForIdle();
        ownerGuard.assertCurrent();
        const perm = await requestRecordingPermissionsAsync();
        ownerGuard.assertCurrent();
        if (!perm.granted) {
          setVoiceNotice(t("voice.permissionDenied"));
          return;
        }
        await beginRecordingAudioMode();
        ownerGuard.assertCurrent();
        await audioRecorder.prepareToRecordAsync();
        prepared = true;
        ownerGuard.assertCurrent();
        audioRecorder.record();
        if (!recorderLifecycle.begin(userId)) throw new Error("voice_recorder_owner_stale");
        updateVoicePhase("recording");
      } catch (error) {
        // Native prepare allocates its output path before it may reject.
        if (prepared || audioRecorder.uri) {
          recorderLifecycle.begin(userId);
          await recorderLifecycle.cancel();
        }
        // A start that failed before any session began still left the recording mode on.
        void endRecordingAudioMode();
        if (isAbortError(error) || ownerGuard.signal.aborted) return;
        try {
          ownerGuard.assertCurrent();
        } catch {
          return;
        }
        setVoiceNotice(t("voice.recordFailed"));
      } finally {
        ownerGuard.release();
        if (voiceAccountLeaseRef.current === ownerGuard) voiceAccountLeaseRef.current = null;
        voiceStartInFlightRef.current = false;
      }
    }

    async function stopAndTranscribe(): Promise<void> {
      if (!userId || voicePhaseRef.current !== "recording") return;
      voiceAccountLeaseRef.current?.abort();
      const accountLease = beginAccountSessionLease(userId);
      const noticeOwner = captureAccountOwnerLease(userId);
      voiceAccountLeaseRef.current = accountLease;
      updateVoicePhase("transcribing");
      let recordingLease: RecordingTempLease | null = null;
      try {
        accountLease.assertCurrent();
        const output = await recorderLifecycle.stopForTranscription(accountLease.signal);
        accountLease.assertCurrent();
        recordingLease = output.lease;
        const authenticated = await accountLease.authenticate();
        authenticated.assertCurrent();
        const { base64, mimeType } = await recordingUriToBase64(
          output.uri,
          undefined,
          undefined,
          authenticated.signal,
        );
        authenticated.assertCurrent();
        const reply = await transcribeAudio({
          userId,
          session: authenticated,
          locale: voiceLocale,
          base64,
          mimeType,
          minor: isMinor !== false,
        });
        authenticated.assertCurrent();
        if (reply.safety?.zone === "red") {
          // C9: the transcript was crisis-swapped server-side; surface the
          // hotline, never the text.
          updateVoicePhase("idle");
          publishCrisisNotice(noticeOwner, reply.safety.crisisRouting?.hotline ?? (voiceLocale === "ko" ? (isMinor !== false ? "KR_1388" : "KR_109") : "GLOBAL_988"));
          return;
        }
        const transcript = reply.text.trim();
        if (transcript.length === 0) {
          updateVoicePhase("idle");
          setVoiceNotice(t("voice.transcriptEmpty"));
          return;
        }
        reactExpression("happy");
        setDraft((prev) => (prev.trim().length === 0 ? transcript : `${prev.trimEnd()} ${transcript}`));
        updateVoicePhase("idle");
      } catch (error) {
        if (isAbortError(error) || accountLease.signal.aborted) return;
        try {
          accountLease.assertCurrent();
        } catch {
          return;
        }
        updateVoicePhase("idle");
        setVoiceNotice(t("voice.transcribeFailed"));
      } finally {
        // Privacy: the temp audio file never outlives its transcription.
        await discardRecording(recordingLease);
        accountLease.release();
        if (voiceAccountLeaseRef.current === accountLease) voiceAccountLeaseRef.current = null;
      }
    }

    return (
      <View>
        {voiceNotice ? (
          <Text variant="caption" style={ds.voiceNotice} accessibilityLiveRegion="polite">
            {voiceNotice}
          </Text>
        ) : null}
        <View style={[ds.composer, { alignItems: composerAlignment }]}>
        <View style={[ds.inputPill, { alignItems: composerAlignment }]}>
          <ChatTextInput
            value={draft}
            onChangeText={setDraft}
            onLayout={event => setInputHeight(event.nativeEvent.layout.height)}
            placeholder={t("composerPlaceholder")}
            // AA on the pill (4.54:1), the same token as the other placeholders (QA R2B-08).
            placeholderTextColor={m3.color.onSurfaceVariant}
            style={ds.pillInput}
            accessibilityLabel={askLabel}
            onSubmit={submit}
          />
          {/* med#22 follow-through: the mic is BACK, and this time it does
              something — the live /capture-full dictation chain, proposing
              the transcript into the draft. */}
          <Pressable
            onPress={() => void handleMicPress()}
            disabled={voicePhase === "transcribing"}
            style={[ds.micBtn, voicePhase === "recording" && { backgroundColor: pillAlpha(lensAccent, 0.18) }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={voicePhase === "recording" ? t("voice.stop") : t("voiceInput")}
            accessibilityState={{ disabled: voicePhase === "transcribing", busy: voicePhase === "transcribing" }}
          >
            {voicePhase === "transcribing" ? (
              <ActivityIndicator size="small" color={lensAccent} />
            ) : (
              <IconMic color={voicePhase === "recording" ? lensAccent : pillAlpha(deepSpace.text, 0.6)} size={22} />
            )}
          </Pressable>
        </View>
        <Pressable
          onPress={submit}
          disabled={!canSend}
          style={[
            ds.sendBtn,
            { borderColor: lensAccent, backgroundColor: canSend ? lensAccent : "transparent" },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("send")}
          accessibilityState={{ disabled: !canSend }}
        >
          {sending ? (
            <ActivityIndicator color={inkOnAccent} />
          ) : (
            <IconSend color={canSend ? inkOnAccent : lensAccent} size={22} />
          )}
        </Pressable>
        </View>
      </View>
    );
  }),
);

export default function SecondBChat() {
  return <SecondBChatBody />;
}

function SecondBChatBody() {
  const { fontScale } = useWindowDimensions();
  // Phone-aware: inside the dashboard phone, links open in the phone and the
  // query (?fromNode= / ?mode= / ?panel=) comes from the phone route.
  const router = useAppRouter();
  const { t, i18n } = useTranslation("secondb");
  const { t: consentT } = useTranslation("consent");
  const { userId, loading: authLoading, isMinor, hasProfile, profileProbeFailed, refresh } = useAuth();
  const progression = useProgression();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const insets = useSafeAreaInsets();
  // Keyboard: <KeyboardAvoidingArea> below (src/lib/ui/keyboard.tsx) is the one
  // rule every screen shares. iOS keeps behavior="padding" with this top offset.
  // Android used to stay inert and wait for adjustResize, but the edge-to-edge
  // window (RN 0.85 + Expo 56, targetSdk 36) never shrinks for the IME, so the
  // composer sat under the keyboard (vc59 API 36 emulator, 2026-10-05). The area
  // now pads by the measured overlap instead.
  const messageListBottomPadding = Math.max(styles.scroll.paddingBottom, insets.bottom + spacing.md);

  // nodeContext entry (chat pack §3/§7): a graph node passed its label.
  // ?character= 는 읽지 않는다(2026-10-05, Simon 결정 Q-261004-14 A · 15 A). 옛 캐릭터
  // 다섯(아치·가디·루루·모모·루미)의 목소리로 여는 길이었고, 링크 하나로 유료 LLM
  // 프롬프트에 그 캐릭터 지시가 들어갔다. 명부는 E:/Legacy/2ndB 로 갔다.
  const params = useScreenParams<{ fromNode?: string; mode?: string; panel?: string }>();
  const fromNode = typeof params.fromNode === "string" && params.fromNode.length > 0 ? params.fromNode : null;
  // 머리 탭으로 들어오면(?panel=dashboard) 대시보드를 펴고 시작한다.
  const [showDashboard, setShowDashboard] = useState(params.panel === "dashboard");

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const conversationId = useRef(0);
  const chatMounted = useRef(true);
  useEffect(() => {
    chatMounted.current = true;
    return () => { chatMounted.current = false; };
  }, []);
  const activeConversationId = conversationId.current;
  const userAvatar = useChatUserAvatar(userId);
  // useTranslation also observes addressVariablesChanged after the root's
  // lookup, so the owner-checked nickname refreshes without a second fetch.
  const userDisplayName = (userId ? currentDisplayName(userId)?.trim() : null) || t("deepspace:graph.me");

  // 대화를 위키로 보내는 길 (1순위 결함). 지금까지 대화는 아무것도 남기지 않았고,
  // 유일한 경로는 LLM 에게 요약을 시킨 뒤 손으로 /capture 에 옮기는 것이었다.
  // 이 버튼은 오간 말 **그대로**를 기록으로 남긴다 - LLM 호출 없음.
  //
  // ⚠ 여기 원래 "자동 저장하지 않는다" 고 적혀 있었다. 근거는 propose->ratify
  // 불변식이었다 - 사용자가 누르는 그 탭이 비준이고, 그래서 "결정 주체는
  // 정보주체" 라는 법적 위치(§37-2 비해당 논거)가 유지된다는 것이었다.
  //
  // Simon 이 2026-08-18 에 자동 저장 방향을 승인했고, 위 논거는 **버려진 것이
  // 아니라 한 층 위로 옮겨졌다.** 비준의 단위가 "이 답변 하나" 에서 "대화를
  // 저장하겠다는 설정" 으로 바뀐 것이다. 그 설정은:
  //
  //   - 기본값이 OFF 다 (privacy/prefs.ts 의 규율).
  //   - 사용자가 /privacy 에서 직접 켠다. 그 행위가 비준이다.
  //   - 언제든 끌 수 있고, 이미 담긴 것은 /wiki 에서 지울 수 있다.
  //
  // 즉 앱이 사용자 대신 정한 것은 여전히 없다. 켜지 않으면 아래 자동 경로는
  // 돌지 않고 담기 칩만 남는다 - 예전과 같은 동작이다.
  //
  // 페르소나 파생(제안->비준)은 이 변경과 무관하게 그대로다. 여기서 바뀌는 것은
  // **보관**이지 앱이 사용자를 대신해 내리는 결정이 아니다.
  const [keptIdx, setKeptIdx] = useState<Set<number>>(new Set());
  const [keeping, setKeeping] = useState<number | null>(null);
  const keepInFlight = useRef(false);
  // 담기 실패는 복사 실패와 같은 자세로 화면에 남긴다. 복사와 달리 타이머로
  // 지우지 않는다 - "확인해 보라"는 안내라서 사용자가 다시 누를 때까지 보여야
  // 한다.
  const [keepNotice, setKeepNotice] = useState<{ i: number; ok: boolean } | null>(null);
  // 저장 경로에도 위기 안내가 필요하다. 이 화면의 C9 는 지금까지 전송 경로
  // (sendChatMessage -> callLlm)에만 있었는데, createRecord 도 저장할 때마다
  // 로컬 렉시콘 분류를 돌리고 레드존을 followup 으로 알려준다. 다른 저장 화면
  // (northstar, capture)은 그때 핫라인을 띄운다. 여기만 조용히 저장하면
  // 저장 경로가 안내 없는 유일한 구멍이 된다.
  const playSaveCue = useUiSound(RECORD_SAVE_CUE.source, RECORD_SAVE_CUE);

  // 담겼는지를 호출자에게 돌려준다. 자동 담기가 실패를 알아야 표시를 되돌릴 수
  // 있고, 그래야 한 번의 일시적 실패로 그 턴이 영구히 빠지지 않는다.
  async function keepExchange(index: number, signal?: AbortSignal): Promise<boolean> {
    if (activeConversationId !== conversationId.current) return false;
    if (!userId || keepInFlight.current || keeping !== null || keptIdx.has(index)) return false;
    const lease = captureAccountOwnerLease(userId);
    if (!lease || signal?.aborted) return false;
    const reply = turns[index];
    if (!reply || !isKeepable(reply)) return false;
    keepInFlight.current = true;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort);
    const unsubscribe = subscribeAccountTransition(() => { if (!lease.isCurrent()) abort(); });
    setKeeping(index);
    // 이 턴의 지난 실패만 지운다. 무조건 null 로 밀면 자동 담기가 다른 턴을
    // 성공시키는 순간 아직 읽지도 않은 실패 안내가 사라진다 - 이번 회차가
    // 없애려는 바로 그 조용함이다.
    setKeepNotice((prev) => (prev?.i === index ? null : prev));
    try {
      const prompt = findPrompt(turns, index);
      const speaker = t("title");
      const topic = exchangeTopic(prompt, reply.text);
      const body = composeExchangeBody({ prompt, reply: reply.text, speaker }, locale);
      // 위키 클립으로 저장한다(records 가 아니라). 그래야 exportUserWiki 를 타고
      // 다음 대화와 비서 제안이 이걸 읽는다 - keep-exchange.ts 의 설명 참조.
      // captureFromMarkdown 은 LLM 을 부르지 않고, 중복 담기는 dedup 이 흡수한다.
      await captureFromMarkdown({
        userId,
        signal: controller.signal,
        rawMd: exchangeMarkdown(topic, body),
        // 사용자가 남긴 자기 지식이다. URL 에서 유추한 종류로 떨어지면 안 된다.
        kindOverride: "self_knowledge",
        // domain: 태그를 붙이지 않는다. 대화를 담았다고 그 영역을 더 아는 것은
        // 아니므로 별 밝기를 건드리면 안 된다 (정직한 밝기 규칙).
        userTags: [CHAT_KEEP_TAG],
      });
      if (!lease.isCurrent() || controller.signal.aborted) return false;
      setKeptIdx((prev) => new Set(prev).add(index));
      // C9: 이 경로는 LLM 을 안 타므로 서버 분류가 걸리지 않는다. 로컬 렉시콘
      // 분류기를 직접 돌린다(비용 0). 다른 저장 화면과 같은 자세를 유지한다 -
      // 안내 없는 저장 경로를 하나 만들지 않기 위해서다.
      const keptSafety = classifyInputAnyLocale(body, locale, { minor: isMinor !== false });
      const crisis = keptSafety.zone === "red";
      // 저장 소리(Q-261006-03)는 사람이 '담기'를 눌렀을 때만. 자동 담기(signal 이 있는 호출)는
      // 답장 소리 바로 뒤에 겹치므로 무음이다.
      if (saveCueAllowed({ crisis, recording: isRecordingAudioMode(), automatic: signal !== undefined })) playSaveCue();
      if (crisis && !(signal && reply.crisisNotice)) {
        publishCrisisNotice(lease, keptSafety.crisisRouting?.hotline ?? (locale === "ko" ? (isMinor !== false ? "KR_1388" : "KR_109") : "GLOBAL_988"));
      }
      return true;
    } catch (e) {
      if (!lease.isCurrent() || controller.signal.aborted) return false;
      // 조용히 넘기지 않는다. 쓰기가 어디까지 갔는지 우리는 모르므로 "담기지
      // 않았다"고 단정하지 않고, 확인할 자리를 알려 준다 (Round21 가져오기와
      // 같은 규율).
      setKeepNotice({ i: index, ok: false });
      AccessibilityInfo.announceForAccessibility(t("keepFailed"));
      if (typeof console !== "undefined") console.warn("[secondb] keep failed", (e as Error).message);
      return false;
    } finally {
      keepInFlight.current = false;
      unsubscribe();
      signal?.removeEventListener("abort", abort);
      if (lease.isCurrent()) setKeeping(null);
    }
  }
  // The draft now lives inside ChatComposer (keystroke isolation); the parent
  // reaches it only to prefill (quick-actions / branches) via this handle.
  const composerRef = useRef<ChatComposerHandle>(null);

  // Long-press copy used to be navigator.clipboard-only — a silent no-op on
  // native, with an empty catch on web, and no feedback either way (flow-map
  // /secondb). expo-clipboard covers both runtimes; the transient caption +
  // screen-reader announcement says whether it actually worked.
  const [copyNotice, setCopyNotice] = useState<{ i: number; ok: boolean } | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTurn = useCallback(
    (i: number, text: string) => {
      // A model answer that leaves the app says it is AI-made in its last line (Simon 2026-10-13).
      const copied = isModelAnswer(turns[i]) ? withAiCopyTail(text, t("aiCopyTail")) : text;
      void writeClipboardText(copied).then((ok) => {
        setCopyNotice({ i, ok });
        AccessibilityInfo.announceForAccessibility(t(ok ? "copied" : "copyFailed"));
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopyNotice(null), 1800);
      });
    },
    [t, turns],
  );
  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );
  const [sending, setSending] = useState(false);
  const [sendingPersona, setSendingPersona] = useState<Rev2PersonaId | null>(null);
  const [usedToday, setUsedToday] = useState<number | null>(null);
  // TODAY's rewarded-ad bonus. The screen used to not know this existed, so it
  // gated on the bare tier cap while the engine and the server both accept
  // `used < cap + adBonus` -- a user who watched an ad still found the composer
  // locked. 0 is the honest default: no bonus until the read says otherwise.
  const [adBonusToday, setAdBonusToday] = useState(0);
  // SecondB conversation mode (worldview v-final). Analytic = data-grounded
  // analysis; Divergent = data-grounded but explores radically different angles.
  // Seeded from ?mode=divergent (e.g. a graph node's "새 관점으로 펼치기").
  const [chatMode, setChatMode] = useState<ChatMode>(
    params.mode === "divergent" ? "divergent" : "analytic",
  );
  // rev2 세컨비 personas (main deep-space chat only): ONE character, three
  // personas sharing this conversation. 트위비 owns the Divergent engine mode
  // (구체화 — ?mode=divergent seeds 트위비). The default 2nd-B keeps the shipped
  // voice (hint = null — no behavior change).
  const [rev2Persona, setRev2Persona] = useState<Rev2PersonaId>(
    params.mode === "divergent" ? "twi" : "secondb",
  );
  function selectRev2Persona(id: Rev2PersonaId): void {
    citedWiki.closeDrawer();
    setRev2Persona(id);
    setChatMode(rev2PersonaMode(id));
  }
  // Phase 4 paid personas: effective tier for the client gate. Judges comp to
  // pro (C6) — the 0088 server rule mirrored; the RPCs stay authoritative.
  const effectiveTier = progression.judge ? "pro" : PUBLIC_TIER_BY_DB[progression.tier];
  // A persisted/deep-linked paid persona must not survive into a free session
  // (e.g. ?mode=divergent seeding 트위비, or a lapsed subscription): fall back
  // to 2nd-B once the tier is known.
  useEffect(() => {
    if (progression.loading || rev2Persona === "secondb") return;
    if (!personaAllowed(effectiveTier, rev2Persona as "meta" | "twi")) {
      selectRev2Persona("secondb");
    }
  }, [progression.loading, effectiveTier, rev2Persona]);
  // Divergent pulse: a soft soulViolet2 pulse while a
  // Divergent turn is in flight. Holds at rest otherwise; static under reduced
  // motion. (Replaces the old dreamPink "벨라 신호" now that Divergent is a mode.)
  const divergentPulse = useRef(new Animated.Value(0.6)).current;
  // Funnel: fire ai_limit_hit at most once per mount when the daily cap is hit.
  const limitHitFiredRef = useRef(false);
  // The tier the server says to upgrade to (from a blocked turn). Falls back to
  // "cortex" in the limit-hit effect when no blocked turn has set it yet.
  const [pendingUpgrade, setPendingUpgrade] = useState<SubscriptionTier | null>(null);
  // A send the daily limit refused. Its bubble always comes with 요금제 보기 (Simon 2026-10-14,
  // Q-261014-24), also when the server's cap refused it while the local count is still under
  // the wall (atLimit false). A reply that goes through, or a granted ad bonus, clears it.
  const [limitRefused, setLimitRefused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const followingLatest = useRef(true);

  // Phase 4 (0090): free adults can top up the chat DAILY cap (+2 sends today).
  const [chatRewardVisible, setChatRewardVisible] = useState(false);

  // Rewarded-entry gate inputs (policy.canShowRewardedAds; every null fails
  // closed): users.privacy_prefs.ads resolves async, route from the live
  // pathname, tier/minor from context.
  const pathname = usePathname();
  const citedWiki = useCitedWikiPage(userId, { conversation: conversationId, key: JSON.stringify([
    rev2Persona, chatMode, pathname, params.fromNode, params.mode, params.panel,
  ]) }, (pageId) => router.push({ pathname: "/wiki", params: { focusPageId: pageId } }));
  const refDrawer = citedWiki.slugs;
  const [adsConsent, setAdsConsent] = useState<boolean | null>(null);
  // 대화 자동 저장 동의 (chat_autosave). 같은 fetch 로 읽는다 - 왕복을 하나 더
  // 만들 이유가 없다. null 은 "아직 모른다" 이고, 그 상태에서는 자동 저장이
  // 돌지 않는다(fail-closed). 광고 동의와 같은 자세다.
  const [autosaveConsent, setAutosaveConsent] = useState<boolean | null>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const autosaveSessionRef = useRef<ReturnType<typeof createChatAutosaveSession> | null>(null);
  // 대화가 남지 않는다는 사실을 한 번만 알린다 (Simon 결정 B1).
  const { dismissed: saveNoticeDismissed, dismiss: dismissSaveNotice } = useChatSaveNoticeDismissed();
  // The chat says once that its answers are AI-made; the line under the input keeps saying it.
  // Sending the first message closes the card for good, the same as pressing its button.
  const { seen: aiNoticeSeen, markSeen: markAiNoticeSeen } = useChatAiNoticeSeen(userId ?? null);
  useEffect(() => {
    if (aiNoticeSeen === false && turns.length > 0) markAiNoticeSeen();
  }, [aiNoticeSeen, turns.length, markAiNoticeSeen]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setAutosaveConsent(false);
    const session = createChatAutosaveSession(userId, () => turnsRef.current.length, setAutosaveConsent);
    autosaveSessionRef.current = session;
    void session.hydrate();
    fetchPrivacyPrefs(userId)
      .then((prefs) => {
        if (cancelled) return;
        setAdsConsent(prefs.ads === true);
      })
      .catch(() => {
        if (cancelled) return;
        setAdsConsent(false); // fetch failure = no rewarded entry
      });
    return () => {
      cancelled = true;
      session.stop();
      if (autosaveSessionRef.current === session) autosaveSessionRef.current = null;
    };
  }, [userId, activeConversationId]);

  // 자동 저장: 동의가 켜져 있으면 새로 도착한 답변을 담는다.
  //
  // keepExchange 를 그대로 재사용한다 - 수동 경로와 자동 경로가 다른 코드를 타면
  // 위기 안내(C9)나 dedup 같은 것이 한쪽에만 붙는 사고가 난다. 여기서는 "무엇을
  // 담을지" 만 정하고 담는 방법은 하나로 둔다.
  //
  // 마지막 담을 수 있는 턴 하나만 본다. 화면에 남아 있는 과거 대화까지 소급해서
  // 담지 않는다 - 동의를 켜기 **전에** 오간 말은 사용자가 사라질 거라 생각하고
  // 한 말이다. 그걸 소급 저장하면 동의의 의미가 없어진다.
  useEffect(() => {
    if (!chatAutosaveAllowed(autosaveConsent)) return;
    if (!userId || keeping !== null) return;
    const idx = turns.length - 1;
    const last = turns[idx];
    if (!last || !isKeepable(last)) return;
    if (keptIdx.has(idx)) return;
    // 실패하면 표시를 되돌린다. 되돌리지 않으면 일시적인 실패 한 번에 그 턴이
    // 영구히 빠지고, 동의를 명시적으로 켠 사용자가 정확히 손해를 본다. 되돌림이
    // 자동 재시도를 보장하지는 않는다 - 수동 담기 칩이 다시 열릴 뿐이다.
    void autosaveSessionRef.current?.save(idx, (signal) => keepExchange(idx, signal), findPromptIndex(turns, idx) ?? idx);
    // keepExchange 는 setState 로 keptIdx 를 갱신하므로 의존성에 넣으면 루프가
    // 된다. The session owns duplicate suppression and consent/account fences.
  }, [turns, autosaveConsent, userId]);

  // Capability first (Simon B-decision): a build that cannot complete a watch
  // renders no CTA at all -- policy answers WHO may watch, capability answers
  // whether THIS build can deliver.
  const rewardedAllowed =
    canCompleteRewardedWatch() &&
    canShowRewardedAds({
      tier: progression.loading ? null : progression.tier,
      isMinor,
      adsConsent,
      route: pathname ?? "/",
    });
  // handleSend is a stable useCallback; mirror the gate through a ref so the
  // blocked-turn branch never reads a stale value.
  const rewardedAllowedRef = useRef(rewardedAllowed);
  rewardedAllowedRef.current = rewardedAllowed;

  // 대화는 빈 채로 열린다. 옛 캐릭터 인사말을 첫 턴으로 심던 자리는 ?character= 와
  // 함께 걷었다(2026-10-05, Q-261004-14 A). fromNode 초안은 ChatComposer 의 초기
  // 상태가 맡는다(fromNode prop 을 읽어 인증 관문 뒤에 마운트돼도 살아남는다).

  // `limit` stays the TIER CAP -- it is what the paywall copy and the funnel
  // event mean by "your limit". `allowance` is the wall the user actually hits
  // today, and every gate below uses that one.
  const limit = useMemo(() => CHAT_DAILY_LIMIT[progression.tier], [progression.tier]);
  const allowance = useMemo(
    () => chatAllowance(progression.tier, adBonusToday),
    [progression.tier, adBonusToday],
  );
  // Under today's limit (null = the count is still loading, so allow until we know). The
  // ordinary composer sends and [다시 시도] share this gate; device-red drafts are the exception.
  const underLimit = usedToday === null || usedToday < allowance;

  useEffect(() => {
    // Re-probe while the profile answer is "unknown" (a FAILED probe, not a
    // confirmed missing row). The guard below holds the loader instead of
    // ejecting to /complete-profile; without this retry it would sit forever.
    if (authLoading || !userId || hasProfile !== false || !profileProbeFailed) return;
    const timer = setTimeout(() => {
      void refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [authLoading, userId, hasProfile, profileProbeFailed, refresh]);

  // One reader for used + today's bonus. The rewarded flow has to re-run it:
  // granting the bonus moves the allowance on the SERVER, and until the client
  // re-reads it the composer stays locked at the old wall.
  const refreshChatUsage = useCallback(async () => {
    if (!userId) return;
    await readChatUsageDetail(userId)
      .then((d) => {
        setUsedToday(d.used);
        setAdBonusToday(d.adBonus);
      })
      .catch((e) => {
        // Unknown is not zero: a fake 0/5 told capped users they had sends
        // left. null renders as "..." and the server still enforces the cap.
        // The bonus falls back to 0 rather than to a guess -- understating the
        // allowance keeps the client stricter than the server, never looser.
        if (typeof console !== "undefined") console.warn("[secondb] readChatUsageDetail failed", (e as Error).message);
        setUsedToday(null);
        setAdBonusToday(0);
      });
  }, [userId]);

  useEffect(() => {
    void refreshChatUsage();
  }, [refreshChatUsage]);

  // Funnel: the AI cap is the conversion gate. Fire ai_limit_hit once per mount
  // the moment usage reaches the tier limit (whether hit by a sent turn or
  // already at the cap on entry). Scalars only - tier/limit/upgrade target.
  useEffect(() => {
    if (limitHitFiredRef.current) return;
    // Trigger on the real wall, not the bare cap: firing while the user still
    // has bonus sends would report a paywall hit that did not happen. The
    // payload keeps `limit` as the TIER cap so the event schema and its
    // cross-tier comparisons stay what they were.
    if (usedToday === null || usedToday < allowance) return;
    limitHitFiredRef.current = true;
    captureEvent(
      aiLimitHit({
        tier: progression.tier,
        limit,
        upgrade_to: pendingUpgrade ?? "cortex",
      }),
    );
  }, [usedToday, allowance, limit, progression.tier, pendingUpgrade]);

  useEffect(() => {
    // Scroll to bottom after each new turn, and after a keep failure notice
    // appears. The notice is rendered at the end of the transcript, so without
    // this it lands below the scroll clip and the user never sees it - measured
    // at 320/390/1440, where 4 to 5 of 5 sample points fell outside the
    // scroller. Announcing it was not enough; sighted users read nothing.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [turns, keepNotice]);

  useEffect(() => {
    if (chatMode === "divergent" && sending && !prefersReducedMotion()) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(divergentPulse, { toValue: 1, duration: 300, easing: pixelStepsFor(300), useNativeDriver: true }),
          Animated.timing(divergentPulse, { toValue: 0.6, duration: 300, easing: pixelStepsFor(300), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    divergentPulse.setValue(0.6);
  }, [chatMode, sending, divergentPulse]);

  // The composer owns the draft now, so it hands the trimmed text to onSend.
  // Returns true when the send is committed (composer clears the draft) and
  // false when the message is empty or there is no signed-in user.
  // Stable across renders (useCallback) so the memoized ChatComposer holds.
  // Kept ABOVE the early returns so this hook always runs (rules-of-hooks).
  const playReplyCue = useUiSound(SECONDB_REPLY_CUE.source, SECONDB_REPLY_CUE);
  const handleSend = useCallback(
    (message: string, retry?: { failedIndex: number }): boolean => {
      if (!userId) return false;
      const msg = message.trim();
      if (msg.length === 0) return false;
      const owner = captureAccountOwnerLease(userId);
      if (!owner) return false;
      const requestConversation = conversationId.current;
      const canUpdate = () => owner.isCurrent() && chatMounted.current && requestConversation === conversationId.current;
      const localSafety = classifyInputAnyLocale(msg, locale, { minor: isMinor !== false });
      // Fixed guidance must not wait for usage, model, audit or network. The
      // completed local-red result must not reopen a notice the person closed.
      const localRed = localSafety.zone === "red";
      if (localRed) publishCrisisNotice(owner, localSafety.crisisRouting?.hotline ?? (locale === "ko" ? (isMinor !== false ? "KR_1388" : "KR_109") : "GLOBAL_988"));

      const requestPersona = rev2Persona;
      // A retry replaces the failed pair (the message and the line that said it failed) instead
      // of adding the message a second time, on the screen and in what the model is told.
      const keep = retry ? Math.max(0, retry.failedIndex - 1) : null;
      const earlier = keep === null ? turns : turns.slice(0, keep);
      setSendingPersona(requestPersona);
      setSending(true);
      setTurns((prev) => [...(keep === null ? prev : prev.slice(0, keep)), { role: "user", persona: requestPersona, text: msg, ...(localRed ? { safetyZone: "red" as const } : {}) }]);
      void (async () => {
        // AI 응답 대기: every mounted head holds the thinking face (eyes drift
        // up-side) until the reply lands — released in finally either way.
        const releaseThinking = holdExpression("thinking");
        // Whether the send itself came back. An error thrown after that (a sound, an analytics
        // call) lands in the same catch, and that line must not offer to send again.
        let answered = false;
        try {
          const result = await sendChatMessage({
            userId,
            message: msg,
            locale,
            tier: progression.tier,
            // 이름으로 부르게 한다. 화면은 이미 "허슬케이님" 이라 부른다.
            displayName: currentDisplayName(userId),
            personaHint: rev2PersonaHint(requestPersona, locale),
            // D-26 A1: last turns for thread continuity (engine clips to 6 + drops
            // red-zone turns). Synthetic lines (limit/error) are not model
            // replies, so they're excluded here.
            history: earlier
              .filter((t) => !t.synthetic && t.safetyZone !== "red")
              .map((t) => ({ role: t.role === "user" ? ("user" as const) : ("assistant" as const), text: t.text })),
            mode: chatMode,
            minor: isMinor !== false,
          });
          answered = true;
          if (result.status === "ok" && result.reply.safety?.zone === "red" && !localRed) {
            // Same-owner safety guidance survives navigation; a stale account
            // result is rejected by the notice store before publication.
            publishCrisisNotice(owner, result.reply.safety.crisisRouting?.hotline ?? (locale === "ko" ? (isMinor !== false ? "KR_1388" : "KR_109") : "GLOBAL_988"));
          }
          if (!canUpdate()) return;
          if (result.status === "blocked") {
            setTurns((prev) => [...prev, { role: "secondb", persona: requestPersona, text: result.hint, synthetic: true }]);
            setUsedToday(result.used);
            setLimitRefused(true);
            if (result.upgradeTo) setPendingUpgrade(result.upgradeTo);
            // 0090: free adults can widen TODAY's allowance by +2 via a
            // rewarded watch - only when the FULL rewarded gate passes
            // (build flag + free tier + confirmed non-minor + explicit ads
            // consent + rewarded route allow-list).
            if (rewardedAllowedRef.current) {
              setChatRewardVisible(true);
            }
            captureEvent(
              secondBSession({
                action: "message_sent",
                mode: chatMode,
                outcome: "blocked",
                used: result.used,
                limit,
                tier: progression.tier,
              }),
            );
            // 멈춤은 글로만 알린다(위 result.hint). 옛 가디 그림 순간은 2026-10-05 에
            // 걷었다(Simon 결정 Q-261004-15 A).
          } else {
            if (result.reply.safety?.zone === "red") {
              // Keep the boundary's fixed guidance in the in-memory transcript
              // so existing explicitly opted-in autosave retains its behavior.
              // The modal is its sole visible copy, actions remain suppressed,
              // and neither this turn nor its paired input reenters model history.
              setTurns((prev) => [
                ...prev.map((turn, index) => index === earlier.length ? { ...turn, safetyZone: "red" as const } : turn),
                { role: "secondb", persona: requestPersona, text: result.reply.text, safetyZone: "red", crisisNotice: true },
              ]);
              if (result.used !== null) {
                setUsedToday(result.used);
                setLimitRefused(false);
              }
              return;
            }
            const { display, chips } = parseSourceCitations(result.reply.text);
            // 트위비 3-branch (P5f): Divergent replies on the main chat end with up
            // to three '→ ' next-step lines — lift them into tappable chips.
            const twi =
              chatMode === "divergent"
                ? parseTwiBranches(display)
                : { display, branches: [] as string[] };
            setTurns((prev) => [
              ...prev,
              { role: "secondb", persona: requestPersona, text: twi.display, chips, branches: twi.branches, safetyZone: result.reply.safety?.zone,
                citationText: chatMode === "divergent" ? parseTwiBranches(result.reply.text).display : result.reply.text },
            ]);
            // 답장 소리(Q-261006-04): 위기 응답도 status "ok" 로 오므로 구역을 따로 본다.
            if (replyCueAllowed({ zone: result.reply.safety?.zone, recording: isRecordingAudioMode() })) playReplyCue();
            if (result.used !== null) {
              setUsedToday(result.used);
              setLimitRefused(false);
            }
            captureEvent(
              secondBSession({
                action: "message_sent",
                mode: chatMode,
                outcome: "ok",
                turn_count: earlier.length + 1,
                used: result.used ?? undefined,
                limit,
                tier: progression.tier,
              }),
            );
          }
        } catch (e) {
          if (!canUpdate()) return;
          if (localRed) return; // fixed guidance was already delivered synchronously
          const consentError = e instanceof LlmConsentError ? e.code : undefined;
          const failText = consentError ? consentT(`serviceControl.${consentError}`) : t("replyFailed");
          setTurns((prev) => [...prev, {
            role: "secondb", persona: requestPersona, text: failText, synthetic: true, consentError,
            ...(consentError || answered ? {} : { retryText: msg }),
          }]);
          reactExpression("negative");
          if (typeof console !== "undefined") console.warn("[secondb] sendChatMessage error", (e as Error).message);
        } finally {
          releaseThinking();
          if (canUpdate()) {
            setSending(false);
            setSendingPersona(null);
          }
        }
      })();
      return true;
    },
    [
      userId,
      progression.tier,
      isMinor,
      locale,
      chatMode,
      rev2Persona,
      turns,
      limit,
      t,
      consentT,
      playReplyCue,
    ],
  );

  // [다시 시도] under a reply that failed (Z40 · Simon 2026-10-13 20:43: the sentence already used
  // when no answer came, plus a way to try again). Only the last turn offers it, and only while
  // nothing is being sent, so the pair it replaces is always the end of the conversation. It goes
  // through handleSend, the same path and the same checks as typing the message again, and it is
  // offered under the same gate as the composer's send (not sending, under today's limit).
  // A second press before the first one has drawn `sending` would send the message twice, so the
  // press is remembered at once and forgotten when that send is over (the turns change with it, so
  // a send that began and ended inside one render is still seen).
  const retrying = useRef(false);
  useEffect(() => {
    if (!sending) retrying.current = false;
  }, [sending, turns]);
  const retryFailed = useCallback(
    (i: number) => {
      const message = retryableMessage(turns, i);
      if (message === null || retrying.current || sending || !underLimit) return;
      retrying.current = handleSend(message, { failedIndex: i });
    },
    [turns, sending, underLimit, handleSend],
  );

  const chatPlans = useChatPlans(userId, { turns, conversationId: conversationId.current, sending });

  if (authLoading || progression.loading) return <InlineLoader />;
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }
  // A FAILED probe is not a missing profile: ejecting to /complete-profile on
  // a network blip stranded real accounts (flow-map /secondb). Unknown still
  // never reaches this LLM surface (C10), but it is not a loader either: the
  // effect above re-probes once after 2s, and when that failed too nothing lifted
  // the loader (the T1a item 2 shape). Show the retryable error, with no dock.
  if (hasProfile === false && profileProbeFailed) return <ProfileProbeRetryScreen />;
  // OAuth mints a session before the profile/DOB + PIPA consent exist. A
  // no-profile session must not reach an LLM/crisis surface: route it to
  // /complete-profile (C10 age gate + consent; also fixes minor crisis-routing,
  // which keys off isMinor that is null until the birth date is on file).
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  // The ordinary-message half of the composer's send gate: not already sending and
  // under the daily AI limit (server also rejects via ChatLimitExceededError,
  // but the UI should not look actionable). usedToday===null means the count is
  // still loading, so allow until we know. ChatComposer ANDs this with a
  // non-empty draft, with a device-red exception for fixed crisis guidance.
  const sendEnabled = !sending && underLimit;
  const hasTurns = turns.length > 0;

  // Citations carry slugs, not page IDs. The owned drawer resolves the chosen
  // slug before navigation and keeps missing/failed reads visible for the user.
  const openCitedPage = (slug: string) => citedWiki.openCitedPage(slug);


  // ── Deep-space chrome (real composer + real answers + citations + states) ──
  // Crisis/C9/C3 live entirely inside sendChatMessage -> callLlm, untouched here.
  const dsUsage = usedToday === null ? "..." : String(usedToday);
  const atLimit = usedToday !== null && usedToday >= allowance;
  // Per-lens recolor (reference CHAT_MODES): the whole chat surface tints to
  // the selected persona's accent / soft fill / on-soft ink / glow.
  const lensAccent = rev2PersonaAccent(rev2Persona);
  const lensSoftBg = rev2PersonaSoftBg(rev2Persona);
  const lensOnSoft = rev2PersonaOnSoft(rev2Persona);
  const pendingLensName = t(`rev2.${sendingPersona ?? rev2Persona}.lensName`);
  // The AI line and the first-time card name whoever is answering now. Korean attaches its
  // particle here, not in the string, so a name with or without a final consonant reads right.
  const aiNoticeName = t(`rev2.${rev2Persona}.lensName`);
  const aiNoticeWords = { name: aiNoticeName, particle: topicParticle(aiNoticeName) };
  const inkOnAccent = m3.accent.onAccentInk; // reference send/mic glyph ink on the accent fill
  const suggestionState = {
    turns, conversationId: conversationId.current, sending, keptIndices: keptIdx, keepingIndex: keeping,
  };
  const wikiSuggestion = getWikiSuggestion(suggestionState);
  const retryIndex = keepNotice && !keepNotice.ok && !keptIdx.has(keepNotice.i) ? keepNotice.i : null;
  const saveIndex = keeping ?? retryIndex ?? wikiSuggestion?.replyIndex ?? null;
  const replyActions = getReplyActions({ turns, sending });
  const chatActions: ChatAction[] = [];
  if (saveIndex !== null) {
    chatActions.push({
      id: "keep-wiki", label: t(keeping !== null ? "keeping" : "keepToWiki"),
      hint: t("keepSuggestionHint"), recommended: keeping === null,
      disabled: keeping !== null || sending, busy: keeping !== null,
      onPress: () => {
        if (keepInFlight.current || sending) return;
        if (retryIndex !== null || wikiSuggestion && isCurrentWikiSuggestion(wikiSuggestion, {
          ...suggestionState, turns: turnsRef.current, conversationId: conversationId.current,
        })) void keepExchange(saveIndex);
      },
    });
  }
  chatActions.push(...chatPlans.actions);
  for (const [index, branch] of replyActions.branches.entries()) {
    chatActions.push({ id: `branch-${index}`, label: branch, hint: t("fillsComposer"),
      onPress: () => composerRef.current?.prefill(branch) });
    chatActions.push({ id: `branch-save-${index}`, label: t("keep"), hint: t("captureBranch", { branch }),
      onPress: () => router.push({ pathname: "/capture", params: { text: branch } }) });
  }
  chatActions.push(...QUICK_ACTIONS.flatMap((qa, index) => replyActions.followUps.includes(qa.kind) ? [{
    id: `follow-up-${index}`, label: locale === "ko" ? qa.ko : qa.en, hint: t("fillsComposer"),
    onPress: () => {
      if (qa.mode === "divergent") selectRev2Persona("twi");
      composerRef.current?.prefill(locale === "ko" ? qa.prompt.ko : qa.prompt.en);
    },
  }] : []));
  return (
    <DeepSpaceScreen active="chat" variant="windowed" header="none">
      <KeyboardAvoidingArea
        style={{ flex: 1 }}
        iosKeyboardVerticalOffset={insets.top}
      >
        {/* The lens selector is the first thing in the chat window. 옛 캐릭터 대화의
            분석/새 관점 토글은 ?character= 와 함께 걷었다(2026-10-05, Q-261004-14 A). */}
        <View style={ds.toggleRow} accessibilityLabel={t("rev2.selectorA11y")}>
          {REV2_PERSONA_IDS.map((id) => {
            const on = rev2Persona === id;
            const accent = rev2PersonaAccent(id);
            const locked = id !== "secondb" && !personaAllowed(effectiveTier, id as "meta" | "twi");
            const lockPlan = id === "meta" ? t("rev2.lockVoyager") : t("rev2.lockNorthstar");
            return (
              <Pressable
                key={id}
                onPress={() => (locked ? router.push(`/plans?from=persona_${id}`) : selectRev2Persona(id))}
                style={[
                  ds.lensBtn,
                  { borderColor: on ? accent : m3.color.outlineVariant },
                  on ? { backgroundColor: rev2PersonaSoftBg(id) } : null,
                  locked ? { borderColor: LOCKED_CHIP_BORDER } : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: locked }}
                aria-pressed={on}
                accessibilityLabel={
                  locked
                    ? `${t(`rev2.${id}.lensName`)} · ${t(`rev2.${id}.role`)} · ${t("rev2.lockedA11y", { plan: lockPlan })}`
                    : `${t(`rev2.${id}.lensName`)} · ${t(`rev2.${id}.role`)}`
                }
              >
                <Text style={[ds.lensName, { color: locked ? LOCKED_CHIP_INK : on ? rev2PersonaOnSoft(id) : m3.color.onSurfaceVariant }]}>
                  {t(`rev2.${id}.lensName`)}
                </Text>
                <Text style={[ds.lensRole, { color: locked ? LOCKED_CHIP_INK : on ? accent : m3.color.onSurfaceVariant }]}>
                  {t(`rev2.${id}.role`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Large text can use a second line; usage and clear keep their width. */}
        <View testID="chat-status" style={[ds.banner, { backgroundColor: lensSoftBg }]}>
          <Text style={ds.bannerDesc} numberOfLines={chatStatusMaxLines(fontScale)} ellipsizeMode="tail">
            {t(`rev2.${rev2Persona}.desc`)}
          </Text>
          <Text style={[ds.bannerUsage, atLimit ? ds.headerMetaDanger : null]} numberOfLines={1}>
            <Text style={[ds.bannerUsageWord, atLimit ? ds.headerMetaDanger : null]}>{t("rev2.usageToday")} </Text>{dsUsage}/{limit}
          </Text>
          {hasTurns ? (
            <Pressable
              onPress={() => {
                if (sending || keeping !== null || keepInFlight.current || chatPlans.busy) return;
                autosaveSessionRef.current?.stop();
                autosaveSessionRef.current = null;
                citedWiki.closeDrawer();
                conversationId.current += 1;
                setTurns([]);
                setKeptIdx(new Set());
                setKeepNotice(null);
                setCopyNotice(null);
              }}
              disabled={sending || keeping !== null || chatPlans.busy}
              accessibilityState={{ disabled: sending || keeping !== null || chatPlans.busy }}
              hitSlop={14}
              style={ds.clearLink}
              accessibilityRole="button"
              accessibilityLabel={t("clearChatA11y")}
              accessibilityHint={t("clearChatHint")}
            >
              <Text style={ds.clearLinkText}>{t("clearChat")}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* nodeContext pill */}
        {fromNode ? (
          <View style={ds.contextPillWrap}>
            <View style={ds.contextPill}>
              <Text style={ds.contextPillText} numberOfLines={1}>{fromNode}</Text>
            </View>
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          testID="chat-transcript"
          style={{ flex: 1 }}
          contentContainerStyle={[ds.scroll, turns.length === 0 && ds.scrollEmpty, { paddingBottom: messageListBottomPadding }]}
          onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
            followingLatest.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 32;
          }}
          scrollEventThrottle={16}
          onLayout={() => { if (followingLatest.current) scrollRef.current?.scrollToEnd({ animated: false }); }}
          onContentSizeChange={() => { if (followingLatest.current) scrollRef.current?.scrollToEnd({ animated: false }); }}
          // RNW's on-drag also blurs on the automatic scroll after the draft
          // grows. Keep web typing focused; native drag dismissal stays intact.
          keyboardDismissMode={Platform.OS === "web" ? "none" : Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* [Simon 결정 6 = B] 세컨비 머리를 터치해서 들어오면 생활 여섯
              영역의 지금 상태가 대화 위에 펴진다. 세컨비가 말을 걸기 전에
              자기가 뭘 알고 있는지 보이는 자리다. 접으면 그 세션 동안 안 뜬다. */}
          {showDashboard && userId ? (
            <DomainDashboard userId={userId} onDismiss={() => setShowDashboard(false)} />
          ) : null}

        {/* 대화가 남지 않는다는 안내. 자동 저장이 꺼져 있고, 아직 닫지 않았고,
            오간 말이 있을 때만 한 번 뜬다. 기본값을 뒤집지 않고 선택지가
            있다는 사실만 알린다 — 매번 띄우면 안내가 아니라 압박이다. */}
        {shouldShowChatSaveNotice({
          autosaveConsent,
          dismissed: saveNoticeDismissed,
          turnCount: turns.length,
        }) ? (
          <View testID="chat-save-notice" style={ds.saveNotice} accessibilityRole="alert">
            <Text style={ds.saveNoticeTitle} numberOfLines={2} ellipsizeMode="tail">{t("chatSaveNotice")}</Text>
              <Pressable
                onPress={() => {
                  dismissSaveNotice();
                  router.push("/privacy");
                }}
                accessibilityRole="button"
                accessibilityLabel={t("chatSaveNoticeOpenLabel")}
                style={ds.saveNoticeBtn}
              >
                <Text style={ds.saveNoticeBtnText} numberOfLines={1}>{t("chatSaveNoticeOpen")}</Text>
              </Pressable>
              <Pressable
                onPress={dismissSaveNotice}
                accessibilityRole="button"
                accessibilityLabel={t("chatSaveNoticeDismiss")}
                style={ds.saveNoticeClose}
              >
                <PixelGlyph name="close" size={16} color={semantic.textMuted} />
              </Pressable>
          </View>
        ) : null}


          {turns.length === 0 ? (
            <View testID="chat-empty" style={ds.empty}>
              {shouldShowChatAiNotice({ seen: aiNoticeSeen, turnCount: turns.length }) ? (
                <View testID="chat-ai-notice" style={ds.aiNotice} accessibilityRole="alert">
                  <Text style={ds.aiNoticeBody}>{t("aiNotice.body", aiNoticeWords)}</Text>
                  <Pressable onPress={markAiNoticeSeen} accessibilityRole="button" accessibilityLabel={t("aiNotice.confirm")} style={ds.aiNoticeBtn}>
                    <Text style={ds.aiNoticeBtnText}>{t("aiNotice.confirm")}</Text>
                  </Pressable>
                </View>
              ) : null}
              {/* All three personas share the untinted portrait. Static also in reduced motion. */}
              <View key={rev2Persona} testID={`chat-empty-portrait-${rev2Persona}`} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <HustleKPortrait expression="A01" size={96} />
              </View>
              <Text style={ds.emptyBody}>{t("empty")}</Text>
            </View>
          ) : (
            turns.map((turn, i) => (
              <Fragment key={i}>
                <ChatModeLine previousPersona={turns[i - 1]?.persona} persona={turn.persona} />
                {turn.crisisNotice ? null : (
                  <View
                    testID={`chat-message-${turn.role}-${i}`}
                    style={[ds.bubbleRow, turn.role === "user" ? ds.userRow : ds.aiRow]}
                  >
                    <View style={[ds.messageHeader, turn.role === "user" && ds.userMessageHeader]} testID={`chat-message-header-${turn.role}-${i}`}>
                      <ChatMessageAvatar role={turn.role} userAvatar={userAvatar}
                        expression={turn.role === "secondb" ? getExchangeExpression(turns, i) : undefined}
                        label={turn.role === "user" ? userDisplayName : t(`rev2.${turn.persona ?? "secondb"}.lensName`)} />
                      <Text style={[ds.messageName, turn.role === "user" && ds.userMessageName]} testID={`chat-message-name-${turn.role}-${i}`}>
                        {turn.role === "user" ? userDisplayName : t(`rev2.${turn.persona ?? "secondb"}.lensName`)}
                      </Text>
                    </View>
                    <View style={ds.bubbleCol}>
                      <Pressable
                        onLongPress={() => copyTurn(i, turn.text)}
                        style={turn.role === "user" ? ds.userBubble : [ds.aiBubble, { borderLeftColor: lensAccent }]}
                        accessibilityRole="button"
                        accessibilityLabel={
                          turn.role === "user"
                            ? t("yourMessage")
                            : t("secondbAnswer", { name: t(`rev2.${turn.persona ?? "secondb"}.lensName`) })
                        }
                        accessibilityHint={t("longPressCopy")}
                      >
                        <Text style={turn.role === "user" ? ds.userText : ds.aiText} selectable>
                          {turn.role === "secondb" ? sourceCitationDisplay(chatDisplayText(turn.citationText ?? turn.text), t("deepspace:time.recordFallback")) : turn.text}
                        </Text>
                      </Pressable>
                      {turn.consentError ? <ServiceConsentLink /> : null}
                      {turn.retryText && sendEnabled && retryableMessage(turns, i) !== null ? (
                        <MdButton variant="outlined" label={t("common:actions.retry")} onPress={() => retryFailed(i)} />
                      ) : null}
                      {copyNotice?.i === i ? (
                        <Text variant="caption" color="textSubtle" accessibilityLiveRegion="polite">
                          {t(copyNotice.ok ? "copied" : "copyFailed")}
                        </Text>
                      ) : null}
                      {/* 근거(citation) chip -> reference drawer -> /records. One
                          summary chip (reference "근거 · 기록 N건") tinted by the lens. */}
                      {turn.role === "secondb" && turn.chips && turn.chips.length > 0 ? (
                        <Pressable
                          style={ds.chipRow}
                          onPress={() => citedWiki.openDrawer(turn.chips ?? [])}
                          accessibilityRole="button"
                          accessibilityLabel={
                            t("drewOnPieces", { n: turn.chips.length })
                          }
                        >
                          <View style={[ds.citeChip, { backgroundColor: lensSoftBg }]}>
                            <IconCite color={lensOnSoft} size={13} />
                            <Text style={[ds.citeChipText, { color: lensOnSoft }]}>
                              {t("nSources", { n: turn.chips.length })}
                            </Text>
                          </View>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                )}
              </Fragment>
            ))
          )}
          {sending ? (
            <View style={[ds.bubbleRow, ds.aiRow, ds.thinking]}>
              <View style={ds.messageHeader}>
                <ChatMessageAvatar role="secondb" userAvatar={userAvatar}
                  expression={getExchangeExpression(turns, turns.length - 1, { loading: true })} label={pendingLensName} />
                <Text style={ds.messageName}>{pendingLensName}</Text>
              </View>
              <ActivityIndicator color={lensAccent} />
            </View>
          ) : null}
          {/* A pending reply still belongs before the selected mode's trailing line. */}
          <ChatModeLine previousPersona={turns[turns.length - 1]?.persona} persona={rev2Persona} />
        </ScrollView>

        {atLimit || limitRefused ? (
          <Pressable
            onPress={() => router.push("/plans?from=ai_limit")}
            hitSlop={14}
            style={ds.limitLink}
            accessibilityRole="button"
            accessibilityLabel={t("viewPlans")}
            accessibilityHint={t("viewPlansHint")}
          >
            <Text style={ds.limitLinkText}>{t("viewPlans")}</Text>
          </Pressable>
        ) : null}

        {/* input bar (reference ChatScreen): a rounded pill holding the text
            field + inline mic, then a separate 48px round send button that
            fills with the lens accent when there is something to send. Draft
            state lives inside ChatComposer so a keystroke re-renders only the
            composer, not this whole DeepSpaceScreen (starfield/header/dock). */}
        <View testID="chat-composer-dock" style={ds.composerDock}>
          {keepNotice && !keepNotice.ok ? (
            <Text variant="caption" style={ds.keepFeedback} accessibilityLiveRegion="polite">{t("keepFailed")}</Text>
          ) : keptIdx.has(turns.length - 1) ? (
            <Text variant="caption" style={ds.keepFeedback} accessibilityLiveRegion="polite">{t("keptToWiki")}</Text>
          ) : null}
          {chatPlans.notice ? <Text variant="caption" style={ds.keepFeedback} accessibilityLiveRegion="polite">{chatPlans.notice}</Text> : null}
          <ChatActionBar actions={chatActions} />
        <ChatComposer
          ref={composerRef}
          sending={sending}
          sendEnabled={sendEnabled}
          onSend={handleSend}
          fromNode={fromNode}
          askLabel={t("inputA11y", { name: t(`rev2.${rev2Persona}.lensName`) })}
          lensAccent={lensAccent}
          inkOnAccent={inkOnAccent}
        />
          {/* Always in view, under the input: the answers here are AI-made (Simon 2026-10-13).
              It names whoever is answering now, the same way the input's spoken name does. */}
          <Text testID="chat-ai-line" style={ds.aiLine} accessibilityRole="text">{t("aiLine", aiNoticeWords)}</Text>
        </View>
      </KeyboardAvoidingArea>

      {chatPlans.sheetProps.suggestion ? <ChatPlanSheet key={chatPlans.sheetKey} {...chatPlans.sheetProps} /> : null}

      {/* reference drawer — pieces the answer drew on (ScreenModal: same R2A-03 rule) */}
      <ScreenModal
        visible={refDrawer !== null}
        transparent
        animationType="slide"
        onRequestClose={citedWiki.closeDrawer}
      >
        {/* Scrim: not a button (avoid nesting the drawer buttons in a web button). */}
        <Pressable
          style={ds.modalBackdrop}
          onPress={citedWiki.closeDrawer}
          accessibilityLabel={t("closeReferenced")}
          accessibilityHint={t("closeReferencedHint")}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <PixelScrim style={ds.modalScrimImage} />
          </View>
          <Pressable
            style={ds.drawer}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
            accessibilityLabel={t("piecesReferenced")}
          >
            <View style={ds.drawerHandle} />
            <Text style={ds.drawerTitle}>{t("piecesReferenced")}</Text>
            <Text style={ds.drawerSubtle}>
              {t("piecesReferencedBody")}
            </Text>
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={ds.drawerList}
              showsVerticalScrollIndicator={false}
            >
              {(refDrawer ?? []).map((slug) => (
                <Pressable
                  key={slug}
                  style={ds.drawerCard}
                  onPress={() => openCitedPage(slug)}
                  accessibilityRole="button"
                  accessibilityLabel={formatSourceCitationLabel(slug, t("deepspace:time.recordFallback"))}
                >
                  <Text style={ds.drawerCardTitle}>{formatSourceCitationLabel(slug, t("deepspace:time.recordFallback"))}</Text>
                  <Text style={ds.drawerCardMeta}>{t("reference_piece_meta")}</Text>
                  {citedWiki.slug === slug ? <Text style={ds.drawerCardMeta} accessibilityLiveRegion="polite">
                    {citedWiki.status === "loading" ? "..." : t(citedWiki.status === "missing" ? "recordDetail:state.missingTitle"
                      : citedWiki.status === "timeout" ? "common:errors.network" : "common:errors.unknown")}
                  </Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            {citedWiki.status === "error" || citedWiki.status === "timeout" ? <Pressable
              onPress={citedWiki.retry}
              style={ds.drawerClose}
              accessibilityRole="button"
              accessibilityLabel={t("common:actions.retry")}
            ><Text style={ds.drawerCloseText}>{t("common:actions.retry")}</Text></Pressable> : null}
            <Pressable
              onPress={citedWiki.closeDrawer}
              style={ds.drawerClose}
              accessibilityRole="button"
              accessibilityLabel={t("closeChip")}
            >
              <Text style={ds.drawerCloseText}>{t("closeChip")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </ScreenModal>

      {/* 0090: chat daily-cap top-up (+2 sends today, monthly earn cap). The
          grant RPC enforces day/month/ceiling server-side.

          (This used to say "on success the user just sends again". They
          could not: the composer was gated on the bare tier cap, so after
          earning the bonus there was nothing to send WITH. The grant now
          re-reads usage, so the wall moves right away.) */}
      <RewardedSheet
        kind="chat"
        visible={chatRewardVisible && rewardedAllowed}
        onClose={() => setChatRewardVisible(false)}
        remaining={Math.max(0, allowance - (usedToday ?? 0))}
        onEarned={async () => {
          // 광고를 끝까지 본 사용자에게 결과를 알려 주기 위해 실패를 분류해서
          // 시트에 돌려준다. 여기서 "적립되지 않았다"고 단정하지는 않는다 -
          // SSV 모드에서는 서버가 적립의 유일한 주체라 클라이언트 실패가 곧
          // 미적립은 아니다. Round22 담기 실패 문구와 같은 규율이다.
          let outcome: RewardedEarnOutcome = process.env.EXPO_PUBLIC_REWARD_SSV === "true" ? "processing" : "granted";
          if (userId) {
            try {
              await grantChatAdBonus(userId);
              // 보상 소리(Q-261006-13)는 앱이 직접 적립에 성공했을 때만. SSV 모드면 서버가 나중에
              // 적립하므로("processing") 무음이다.
              if (outcome === "granted") {
                requestGlobalCue("rewardCredited");
                setLimitRefused(false);
              }
            } catch (e) {
              outcome = e instanceof ChatRewardCapReachedError ? "capped" : "unconfirmed";
              if (typeof console !== "undefined") {
                console.warn("[secondb] grantChatAdBonus", outcome === "capped" ? "monthly cap reached" : (e as Error).message);
              }
            }
            // Re-read even when the grant threw: a monthly-cap rejection
            // still means the server number is the truth, and a stale
            // allowance is exactly what this change exists to remove.
            await refreshChatUsage();
          }
          // 닫는 일은 이제 시트가 한다 - 적립됐을 때만 닫히도록.
          return outcome;
        }}
        locale={locale}
      />
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomColor: gameboy.border,
    borderBottomWidth: gameboy.borderWidth,
  },
  headerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meter: { alignItems: "flex-end", gap: 2 },
  usagePanel: {
    alignItems: "flex-end",
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomColor: gameboy.border,
    borderBottomWidth: gameboy.borderWidth,
  },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopColor: gameboy.border,
    borderTopWidth: gameboy.borderWidth,
  },
});

// Deep-space chat chrome. deepSpace.* tokens only (no hex literals, no
// glassmorphism, no pill chips, no em-dash in strings). Matches the prototype's
// bubble/composer language from DeepSpaceViews while hosting the REAL engine.
const ds = StyleSheet.create({
  // A row at every scale; only the description can grow to two lines.
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: deepSpaceSpacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerDesc: {
    flex: 1,
    minWidth: 0,
    color: m3.color.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontFamilies.readable,
  },
  bannerUsage: {
    flexShrink: 0,
    color: deepSpace.textLo,
    fontSize: 11,
    fontFamily: fontFamilies.mono,
  },
  headerMetaDanger: { color: deepSpace.dangerText },
  // "Today" in front of the count (Z32): body font (the count's pixel font is Latin only). A nested text does not inherit here, so size and colour are set.
  bannerUsageWord: { color: deepSpace.textLo, fontSize: 12, fontFamily: fontFamilies.readable },
  clearLink: { flexShrink: 0, minHeight: 44, justifyContent: "center", paddingHorizontal: deepSpaceSpacing.xs },
  clearLinkText: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.readable },

  // lens toggle (reference ChatScreen persona toggle): 3 equal buttons, name +
  // role; border/fill accent set inline per selected lens.
  toggleRow: {
    flexDirection: "row",
    gap: deepSpaceSpacing.sm,
    paddingHorizontal: 12,
    paddingTop: deepSpaceSpacing.sm,
  },
  lensBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: m3.shape.medium,
    borderWidth: 1.5,
  },
  lensName: { fontSize: 13, fontWeight: "700", fontFamily: fontFamilies.readable },
  lensRole: { fontSize: 12, lineHeight: 18, fontFamily: fontFamilies.readable, marginTop: 1 },

  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: deepSpaceSpacing.sm,
    paddingHorizontal: 18,
    paddingBottom: deepSpaceSpacing.sm,
  },
  modeChip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: m3.shape.small,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  modeChipOnAccent: { backgroundColor: deepSpace.accent, borderColor: deepSpace.accent },
  modeChipOnSoul: { backgroundColor: deepSpace.soul, borderColor: deepSpace.soul },
  modeChipText: { color: deepSpace.textMid, fontSize: 12, fontFamily: fontFamilies.readable },
  modeChipTextOn: { color: deepSpace.onAccent, fontWeight: "700" },
  modeChipTextOnSoul: { color: deepSpace.bgEdge, fontWeight: "700" },
  modeDot: { width: 8, height: 8, borderRadius: m3.shape.none, backgroundColor: deepSpace.soul },
  // rev2 persona chips: same metrics as modeChip; the accent border/fill comes
  // from m3.persona via rev2PersonaAccent (inline), never a literal here.
  personaChip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: m3.shape.small,
    borderWidth: 1,
    backgroundColor: deepSpace.card,
  },
  personaChipTextOn: { color: deepSpace.bgEdge, fontWeight: "700" },
  personaRole: {
    flex: 1,
    minWidth: 0,
    color: deepSpace.textMid,
    fontSize: 11,
    fontFamily: fontFamilies.readable,
    textAlign: "right",
  },
  // 대화 저장 안내 (Simon 결정 B1). 경고색을 쓰지 않는다 — 잘못한 것이 아니라
  // 선택지를 알리는 자리다.
  saveNotice: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: deepSpaceSpacing.xs,
    paddingLeft: deepSpaceSpacing.sm,
    gap: deepSpaceSpacing.xs,
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  saveNoticeTitle: { flex: 1, minWidth: 0, color: semantic.text, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  saveNoticeBtn: {
    // 44px 터치 타깃 (PRD 불변식)
    minHeight: 44,
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.sm,
  },
  saveNoticeBtnText: { color: semantic.deepSpaceAccent, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  saveNoticeClose: { width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  contextPillWrap: { paddingHorizontal: 18, paddingBottom: deepSpaceSpacing.sm },
  contextPill: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: m3.shape.small,
    borderWidth: 1,
    borderColor: sbAlpha(deepSpace.soul, 0.3),
    backgroundColor: sbAlpha(deepSpace.soul, 0.07),
  },
  contextPillText: { color: deepSpace.textHi, fontSize: 11, fontFamily: fontFamilies.readable },

  scroll: { paddingHorizontal: 18, paddingTop: deepSpaceSpacing.sm, gap: 10 },
  scrollEmpty: { flexGrow: 1 },
  empty: { flex: 1, justifyContent: "center", paddingVertical: 32, alignItems: "center", gap: 20 },
  emptyBody: {
    color: sbAlpha(deepSpace.text, 0.6),
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: fontFamilies.readable,
  },

  bubbleRow: { flexDirection: "column", maxWidth: "84%", alignItems: "flex-start", gap: 6 },
  userRow: { alignSelf: "flex-end" },
  aiRow: { alignSelf: "flex-start" },
  messageHeader: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" },
  userMessageHeader: { flexDirection: "row-reverse", alignSelf: "flex-end", width: "100%" },
  messageName: { minWidth: 0, flexShrink: 1, color: deepSpace.textMid, fontSize: 12, lineHeight: 18, paddingBottom: 2, fontFamily: fontFamilies.readable },
  userMessageName: { textAlign: "right" },
  // The answer's name row may wrap: the spelled-out AI sentence drops under the name on a narrow screen.
  aiLine: { paddingHorizontal: 12, paddingTop: 4, color: deepSpace.textMid, fontSize: 11, lineHeight: 16, textAlign: "center", fontFamily: fontFamilies.readable },
  aiNotice: {
    alignSelf: "stretch",
    padding: deepSpaceSpacing.sm,
    gap: deepSpaceSpacing.xs,
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  aiNoticeBody: { color: semantic.text, fontSize: 12, lineHeight: 19, fontFamily: fontFamilies.readable },
  // 44px 터치 타깃 (PRD 불변식)
  aiNoticeBtn: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: semantic.border },
  aiNoticeBtnText: { color: semantic.deepSpaceAccent, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  bubbleCol: { maxWidth: "100%", alignSelf: "stretch", flexShrink: 1, gap: 6, alignItems: "flex-start" },
  // user bubble: M3 primary fill, radius 16/16/4/16 (reference).
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "100%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopLeftRadius: m3.shape.medium,
    borderTopRightRadius: m3.shape.medium,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: m3.shape.medium,
    backgroundColor: m3.color.primary,
  },
  userText: { color: m3.color.onPrimary, fontSize: 13, lineHeight: 19, fontFamily: fontFamilies.readable },
  // SB bubble: surface-container-high, 3px lens accent left border (set inline),
  // radius 4/16/16/16 (reference).
  aiBubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopLeftRadius: 0,
    borderTopRightRadius: m3.shape.medium,
    borderBottomRightRadius: m3.shape.medium,
    borderBottomLeftRadius: m3.shape.medium,
    borderLeftWidth: 3,
    backgroundColor: m3.color.surfaceContainerHigh,
  },
  aiText: { color: m3.color.onSurface, fontSize: 13, lineHeight: 19, fontFamily: fontFamilies.readable },

  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  // citation chip (reference: soft lens fill, bubble_chart glyph + label).
  citeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: m3.shape.small,
  },
  citeChipText: { fontSize: 12, fontWeight: "600", fontFamily: fontFamilies.readable },

  thinking: { paddingVertical: deepSpaceSpacing.md },

  limitLink: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", paddingHorizontal: 18 },
  limitLinkText: { color: deepSpace.accentSoft, fontSize: 12, fontFamily: fontFamilies.readable },

  composerDock: { flexGrow: 0, flexShrink: 0 },
  keepFeedback: { paddingHorizontal: 12, paddingVertical: 4, color: deepSpace.textMuted },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: deepSpaceSpacing.sm,
    paddingHorizontal: 12,
    paddingTop: deepSpaceSpacing.sm,
    paddingBottom: 12,
  },
  // rounded input pill (reference): surface-container-high, mic inline right.
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: deepSpaceSpacing.sm,
    minHeight: 48,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surfaceContainerHigh,
  },
  pillInput: {
    flex: 1,
    minWidth: 0,
    color: m3.color.onSurface,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamilies.readable,
    padding: 0,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: m3.shape.none,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  // one-line voice status above the composer (permission / fallback / failure)
  voiceNotice: {
    paddingHorizontal: 16,
    paddingTop: 4,
    color: sbAlpha(deepSpace.text, 0.75),
  },
  // separate 48px round send button (reference): accent fill when canSend.
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: m3.shape.none,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // 배경색 없음: 가리는 것은 자식 PixelScrim 디더다. 여기에 sbAlpha(…) 를 두면
  // 미리 합성된 불투명 단색이 돼 대화 화면이 통째로 사라진다(W-09, f8bd9336 회귀).
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: deepSpaceSpacing.lg,
  },
  // RN Web 은 디더 타일을 고유 크기(4×4)로만 반복한다. 전면을 덮으려면 크기를 명시한다.
  modalScrimImage: { width: "100%", height: "100%" },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "62%",
    padding: deepSpaceSpacing.lg,
    gap: deepSpaceSpacing.sm,
    borderTopLeftRadius: m3.shape.large,
    borderTopRightRadius: m3.shape.large,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.bg,
  },
  drawerHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: m3.shape.none, backgroundColor: deepSpace.cardLine, marginBottom: deepSpaceSpacing.sm },
  drawerTitle: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.pixelKo },
  drawerSubtle: { color: deepSpace.textMid, fontSize: 12, lineHeight: 18, marginTop: 4, fontFamily: fontFamilies.readable },
  drawerList: { marginTop: deepSpaceSpacing.md, gap: deepSpaceSpacing.sm, paddingBottom: deepSpaceSpacing.sm },
  drawerCard: {
    paddingVertical: deepSpaceSpacing.md,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  drawerCardTitle: { color: deepSpace.accentBright, fontSize: 13, fontFamily: fontFamilies.readable },
  drawerCardMeta: { color: deepSpace.textLo, fontSize: 11, marginTop: 4, fontFamily: fontFamilies.readable },
  drawerClose: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    marginTop: deepSpaceSpacing.sm,
  },
  drawerCloseText: { color: deepSpace.accentSoft, fontSize: 13, fontFamily: fontFamilies.readable },
});
