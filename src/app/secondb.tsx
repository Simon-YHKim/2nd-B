// 세컨비 chat screen (formerly "Jarvis"). Per handoff v3 §4.B —
// preview of how RAG transforms the experience. Calls into the single
// Gemini wrapper (so C1/C3/C9 hold) and pulls a compact wiki snapshot
// as system context.
//
// State lives in component-local memory; no chat-history persistence in v1.
// The chat_usage daily counter (server-side) is the persistent surface.
//
// 2026-05-27 (user directive):
//   - Renamed Jarvis → "세컨비" / "SecondB" (locale-routed via secondb.json).
//   - "What I'm good at" card moved out of the chat panel into a
//     one-time intro modal with [알았어요 / 오늘은 그만 볼래요]
//     buttons. The modal is dismissed via localStorage so it doesn't
//     reappear every session.

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Modal, View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable, Animated, Easing, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, deepSpace, deepSpaceRadii, deepSpaceSpacing, semantic, spacing, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { adsConfigured } from "@/lib/ads/policy";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { sendChatMessage } from "@/lib/chat/conversation";
import { getWikiPage } from "@/lib/wiki/queries";
import { holdExpression, reactExpression } from "@/lib/companion/expression";
import { getPersona, PERSONAS } from "@/lib/chat/personas";
import {
  REV2_PERSONA_IDS,
  rev2PersonaAccent,
  rev2PersonaDesc,
  rev2PersonaGlow,
  rev2PersonaHint,
  rev2PersonaLensName,
  rev2PersonaMode,
  rev2PersonaOnSoft,
  rev2PersonaRole,
  rev2PersonaSoftBg,
  rev2PersonaTag,
  type Rev2PersonaId,
} from "@/lib/chat/rev2-personas";
import { m3 } from "@/lib/theme/m3";
import Svg, { Path } from "react-native-svg";
import { formatSourceCitationLabel, parseSourceCitations } from "@/lib/chat/sources";
import { parseTwiBranches } from "@/lib/chat/twi-branches";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { PremiumAppShell, ContextPill, ReferenceShardCard, SceneHero } from "@/components/premium";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { readChatUsage } from "@/lib/chat/usage";
import { CHAT_DAILY_LIMIT, kstDateToday } from "@/lib/chat/limits";
import { RewardedSheet } from "@/components/deepspace/RewardedSheet";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { getReasoningUsage, incrementReasoningUsage, addRewardCredits } from "@/lib/entitlements/usage";
import { CORE_VILLAGE_UI, VILLAGE_UI } from "@/lib/village-ui";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SubscriptionTier } from "@/lib/progression/entitlements";
import { captureEvent, secondBSession, aiLimitHit } from "@/lib/analytics";
import { keepAllKo } from "@/lib/i18n/keep-all";

// Quick-action chips offered under an answer (chat pack §8). Each prefills
// the composer with a short follow-up in the village voice; the user sends.
const QUICK_ACTIONS: { ko: string; en: string; mode?: "divergent"; prompt: { ko: string; en: string } }[] = [
  { ko: "다음 한 걸음", en: "Next step", prompt: { ko: "지금 할 수 있는 다음 한 걸음으로 줄여줘.", en: "Narrow this to one next step I can take today." } },
  { ko: "새 관점으로", en: "New angle", mode: "divergent", prompt: { ko: "이 생각을 전혀 다른 관점에서 펼쳐줘.", en: "Unfold this from a completely different angle." } },
  { ko: "위키에 저장", en: "Save to wiki", prompt: { ko: "이 답을 위키에 저장할 수 있게 한 단락으로 정리해줘.", en: "Sum this up in one paragraph I can save to my wiki." } },
  { ko: "왜 이렇게 봤어?", en: "Why this?", prompt: { ko: "왜 그렇게 봤는지 참고한 별가루를 들어 설명해줘.", en: "Explain why you saw it that way, citing the pieces you used." } },
  { ko: "다시 짧게", en: "Shorter", prompt: { ko: "더 짧게 한 문장으로 말해줘.", en: "Say that again, shorter. One sentence." } },
];

// M3 glyphs (Material Symbols geometry, viewBox 0 -960 960 960) used by the
// reference ChatScreen input bar + citation chips. Kept as tiny static SVGs
// (ANDROID_QA: no animated SVG, low node count) so the round send / mic / cite
// affordances match the prototype without a font-icon dependency.
function IconSend({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z" fill={color} />
    </Svg>
  );
}
function IconMic({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path
        d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm-40 320v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-360q83 0 141.5-58.5T680-560h80q0 105-68 184t-172 93v123h-80Z"
        fill={color}
      />
    </Svg>
  );
}
function IconCite({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path
        d="M280-240q-83 0-141.5-58.5T80-440q0-83 58.5-141.5T280-640q83 0 141.5 58.5T480-440q0 83-58.5 141.5T280-240Zm400-160q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM560-40q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Z"
        fill={color}
      />
    </Svg>
  );
}

interface ChatTurn {
  role: "user" | "secondb";
  text: string;
  /** Slugs the reply cited — rendered as small source chips. */
  chips?: string[];
  /** 트위비 next-step candidates (P5f) — trailing → lines lifted from the reply. */
  branches?: string[];
  /** Client-generated line (greeting, limit hint, error) — NOT a model reply.
   *  Excluded from the conversation history sent back to the model so it isn't
   *  mis-grounded as something SecondB actually said. */
  synthetic?: boolean;
}

type ChatMode = "analytic" | "divergent";

const INTRO_DISMISS_KEY = "secondB_intro_dismissed_v1";

function readIntroDismissed(): "off" | "today" | "permanent" {
  try {
    if (typeof localStorage === "undefined") return "off";
    const v = localStorage.getItem(INTRO_DISMISS_KEY);
    if (v === "permanent") return "permanent";
    if (v && v.startsWith("today:")) {
      const day = v.slice("today:".length);
      const today = kstDateToday();
      if (day === today) return "today";
    }
    return "off";
  } catch {
    return "off";
  }
}

function writeIntroDismissed(kind: "today" | "permanent"): void {
  try {
    if (typeof localStorage === "undefined") return;
    const v = kind === "permanent" ? "permanent" : `today:${kstDateToday()}`;
    localStorage.setItem(INTRO_DISMISS_KEY, v);
  } catch {
    // ignore — private mode, native
  }
}

// One chat ENGINE, two chromes (Frame pattern — the same port the interview
// screen used). isDeepSpaceUI() only swaps the VISUAL shell (deep-space frame +
// deepSpace.* tokens vs the legacy PremiumAppShell village skin). The send
// handler, RAG/citation parsing, C9 -> C3 -> crisis path (callGemini via
// sendChatMessage), modes, auth gates, analytics, and daily-limit logic are
// byte-identical for both variants — there is NO logic fork.
type ChatVariant = "deep-space" | "legacy";

interface ChatComposerHandle {
  /** Push text into the composer (quick-action / branch / node-entry prefill). */
  prefill: (text: string) => void;
}

interface ChatComposerProps {
  variant: ChatVariant;
  /** A send is in flight — drives the send-button spinner and blocks re-send. */
  sending: boolean;
  /** The non-draft half of canSend: not sending and under the daily cap. */
  sendEnabled: boolean;
  /** Commit a message. Returns true when accepted (composer clears its draft),
   *  false when the send was refused (e.g. reasoning cap) so the draft is kept. */
  onSend: (text: string) => boolean;
  /** Node-entry seed (?fromNode=): pre-fills the draft once on first mount. */
  fromNode?: string | null;
  /** deep-space lens tint + placeholder subject (unused by the legacy chrome). */
  lensAccent?: string;
  lensName?: string;
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
      variant,
      sending,
      sendEnabled,
      onSend,
      fromNode,
      // Deep-space always passes these; the defaults only satisfy the type for
      // the legacy chrome (which never reads them).
      lensAccent = deepSpace.accent,
      lensName = "",
      inkOnAccent = m3.accent.onAccentInk,
    },
    ref,
  ) {
    const { t } = useTranslation("secondb");
    // Node entry seeds the composer once (mirrors the old seeding effect); the
    // initializer runs only on mount, so a later param change never re-seeds.
    const [draft, setDraft] = useState(() => (fromNode ? t("aboutNode", { node: fromNode }) : ""));
    useImperativeHandle(ref, () => ({ prefill: (text: string) => setDraft(text) }), []);
    const canSend = draft.trim().length > 0 && sendEnabled;
    const submit = () => {
      if (!canSend) return;
      // Clear only when the send was accepted, so a cap-blocked send keeps the
      // typed text (the old handleSend returned before clearing on a cap hit).
      if (onSend(draft.trim())) setDraft("");
    };

    if (variant === "deep-space") {
      return (
        <View style={ds.composer}>
          <View style={ds.inputPill}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("askLens", { lens: lensName })}
              placeholderTextColor={withAlpha(deepSpace.text, 0.45)}
              style={ds.pillInput}
              accessibilityLabel={t("inputA11y")}
              onSubmitEditing={submit}
              returnKeyType="send"
              onKeyPress={(e) => {
                // Web: Enter sends, Shift+Enter inserts a newline.
                if (Platform.OS !== "web") return;
                const we = e as unknown as {
                  key?: string;
                  shiftKey?: boolean;
                  nativeEvent: { key: string; shiftKey?: boolean };
                  preventDefault?: () => void;
                };
                const key = we.nativeEvent?.key ?? we.key;
                const shift = we.shiftKey ?? we.nativeEvent?.shiftKey ?? false;
                if (key === "Enter" && !shift) {
                  we.preventDefault?.();
                  submit();
                }
              }}
            />
            {/* med#22: the mic Pressable had NO onPress — a button-role control
                that did nothing. Removed until chat voice input is actually
                built (transcription itself is live now via the proxy, so this
                is a wiring task, not a platform gap). */}
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
      );
    }

    return (
      <View style={styles.composerPrimary}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder={t("placeholder")}
          multiline
          style={styles.composerInput}
          accessibilityLabel={t("inputA11y")}
        />
        <Button label={t("send")} variant="primary" onPress={submit} disabled={!canSend} loading={sending} />
      </View>
    );
  }),
);

export default function SecondBChat() {
  return <SecondBChatBody variant={isDeepSpaceUI() ? "deep-space" : "legacy"} />;
}

function SecondBChatBody({ variant }: { variant: ChatVariant }) {
  const isDeepSpace = variant === "deep-space";
  const { t, i18n } = useTranslation("secondb");
  const { userId, loading: authLoading, isMinor, hasProfile } = useAuth();
  const progression = useProgression();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const insets = useSafeAreaInsets();
  // iOS uses "padding"; Android relies on native adjustResize (app.json
  // softwareKeyboardLayoutMode="resize"), so the KAV must stay inert — layering
  // behavior="height" on top of adjustResize double-shrinks the composer and
  // opens a dead gap above the keyboard. Matches jot/settings/dds-auth.
  const keyboardBehavior = Platform.OS === "ios" ? "padding" : undefined;
  const keyboardVerticalOffset = Platform.OS === "ios" ? insets.top : 0;
  const messageListBottomPadding = Math.max(styles.scroll.paddingBottom, insets.bottom + spacing.md);

  // nodeContext entry (chat pack §3/§7): a graph node passed its label.
  // character (2026-05-31): tapping a village companion opens chat in that
  // character's voice (src/lib/chat/personas.ts).
  const params = useLocalSearchParams<{ fromNode?: string; character?: string; mode?: string }>();
  const fromNode = typeof params.fromNode === "string" && params.fromNode.length > 0 ? params.fromNode : null;
  const characterParam = typeof params.character === "string" && params.character.length > 0 ? params.character : null;
  const persona = useMemo(() => getPersona(characterParam), [characterParam]);
  // Only treat it as a character chat when a real worker was passed.
  const isCharacterChat = characterParam != null && characterParam in PERSONAS;

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  // The draft now lives inside ChatComposer (keystroke isolation); the parent
  // reaches it only to prefill (quick-actions / branches) via this handle.
  const composerRef = useRef<ChatComposerHandle>(null);
  const [sending, setSending] = useState(false);
  const [usedToday, setUsedToday] = useState<number | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  // SecondB conversation mode (worldview v-final). Analytic = data-grounded
  // analysis; Divergent = data-grounded but explores radically different angles.
  // Seeded from ?mode=divergent (e.g. a graph node's "새 관점으로 펼치기").
  const [chatMode, setChatMode] = useState<ChatMode>(
    params.mode === "divergent" ? "divergent" : "analytic",
  );
  // rev2 세컨비 personas (main deep-space chat only): ONE character, three
  // personas sharing this conversation. 트위비 owns 공상, so selecting it engages
  // the Divergent engine mode (and ?mode=divergent seeds 트위비). The default
  // 2nd-B keeps the shipped voice (hint = null — no behavior change).
  const [rev2Persona, setRev2Persona] = useState<Rev2PersonaId>(
    params.mode === "divergent" ? "twi" : "secondb",
  );
  function selectRev2Persona(id: Rev2PersonaId): void {
    setRev2Persona(id);
    setChatMode(rev2PersonaMode(id));
  }
  // Divergent signature motion (DESIGN.md): a soft soulViolet2 pulse while a
  // Divergent turn is in flight. Holds at rest otherwise; static under reduced
  // motion. (Replaces the old dreamPink "벨라 신호" now that 공상 is a mode.)
  const divergentPulse = useRef(new Animated.Value(0.6)).current;
  // Reference drawer (chat pack §6): the cited pieces of a tapped answer.
  const [refDrawer, setRefDrawer] = useState<string[] | null>(null);
  const companion = useCompanionMoment();
  // Tracks whether the last turn was safety-blocked, so 가디 can give the
  // "clear" beat the first time the conversation flows freely again.
  const wasBlockedRef = useRef(false);
  // Funnel: fire ai_limit_hit at most once per mount when the daily cap is hit.
  const limitHitFiredRef = useRef(false);
  // The tier the server says to upgrade to (from a blocked turn). Falls back to
  // "soma" in the limit-hit effect when no blocked turn has set it yet.
  const [pendingUpgrade, setPendingUpgrade] = useState<SubscriptionTier | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Reasoning cap (monthly) — each chat send = one "깊이 묻기" reasoning use.
  // This is the COUNT-only gate (same-quality principle: we limit how many,
  // never the quality). reasoningUsed/rewardCredits come from getReasoningUsage
  // (fail-open). reasoningRemaining = Infinity for unlimited tiers (북극성/brain),
  // which are never gated. rewardVisible drives the RewardedSheet for free adults.
  const [reasoningUsed, setReasoningUsed] = useState(0);
  const [rewardCredits, setRewardCredits] = useState(0);
  const [rewardVisible, setRewardVisible] = useState(false);
  const [capNotice, setCapNotice] = useState(false);
  const reasoningRemaining = remainingReasoning(progression.tier, reasoningUsed, rewardCredits);
  const reasoningUnlimited = reasoningRemaining === Infinity;

  // Seed once on entry: a character chat opens with that companion's greeting
  // as the first turn; a node entry pre-fills the composer with the context.
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (isCharacterChat) {
      setTurns([{ role: "secondb", text: persona.greeting[locale], synthetic: true }]);
    }
    // The fromNode draft seed is now the ChatComposer's initial state (it reads
    // the fromNode prop), so it survives the composer mounting after the auth
    // gates resolve.
  }, [fromNode, locale, isCharacterChat, persona]);

  const limit = useMemo(() => CHAT_DAILY_LIMIT[progression.tier], [progression.tier]);

  useEffect(() => {
    // Intro modal opens on first entry only — guarded by localStorage.
    if (readIntroDismissed() === "off") setIntroOpen(true);
  }, []);

  useEffect(() => {
    if (!userId) return;
    void readChatUsage(userId)
      .then((n) => setUsedToday(n))
      .catch((e) => {
        if (typeof console !== "undefined") console.warn("[secondb] readChatUsage failed", (e as Error).message);
        setUsedToday(0);
      });
  }, [userId]);

  // Reasoning usage (monthly cap) — load on mount, refreshed after each send.
  // getReasoningUsage is fail-open, so a failure leaves the user unblocked.
  useEffect(() => {
    if (!userId) return;
    void getReasoningUsage(userId)
      .then(({ used, rewardCredits: rc }) => {
        setReasoningUsed(used);
        setRewardCredits(rc);
      })
      .catch((e) => {
        if (typeof console !== "undefined") console.warn("[secondb] getReasoningUsage failed", (e as Error).message);
      });
  }, [userId]);

  // Funnel: the AI cap is the conversion gate. Fire ai_limit_hit once per mount
  // the moment usage reaches the tier limit (whether hit by a sent turn or
  // already at the cap on entry). Scalars only - tier/limit/upgrade target.
  useEffect(() => {
    if (limitHitFiredRef.current) return;
    if (usedToday === null || usedToday < limit) return;
    limitHitFiredRef.current = true;
    captureEvent(
      aiLimitHit({
        tier: progression.tier,
        limit,
        upgrade_to: pendingUpgrade ?? "soma",
      }),
    );
  }, [usedToday, limit, progression.tier, pendingUpgrade]);

  useEffect(() => {
    // Scroll to bottom after each new turn.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [turns]);

  useEffect(() => {
    if (chatMode === "divergent" && sending && !prefersReducedMotion()) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(divergentPulse, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(divergentPulse, { toValue: 0.6, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    divergentPulse.setValue(0.6);
  }, [chatMode, sending, divergentPulse]);

  // The composer owns the draft now, so it hands the trimmed text to onSend.
  // Returns true when the send is committed (composer clears the draft) and
  // false when the reasoning-cap gate refuses it (composer keeps the draft).
  // Stable across renders (useCallback) so the memoized ChatComposer holds.
  // Kept ABOVE the early returns so this hook always runs (rules-of-hooks).
  const handleSend = useCallback(
    (message: string): boolean => {
      if (!userId) return false;
      const msg = message.trim();
      if (msg.length === 0) return false;

      // Pre-send reasoning-cap gate (count-only — never a quality gate). Each send
      // is one "깊이 묻기" reasoning use. Unlimited tiers (북극성/brain → Infinity)
      // are never gated. On cap: free adults get the rewarded sheet ONLY when ads
      // are actually configured (adsConfigured() — watch-to-earn needs a real ad to
      // watch); otherwise, and for everyone else, we route to the paywall. This
      // stops the placeholder ad from paying out reasoning credits while ads are
      // OFF by default (ads/policy.ts). The chat engine / C9 / C3 path below is
      // untouched — we only decide whether to reach it.
      if (!reasoningUnlimited && reasoningRemaining <= 0) {
        setCapNotice(true);
        if (progression.tier === "free" && isMinor !== true && adsConfigured()) {
          setRewardVisible(true);
        } else {
          router.push("/plans?from=ai_limit");
        }
        return false;
      }
      setCapNotice(false);

      setSending(true);
      setTurns((prev) => [...prev, { role: "user", text: msg }]);
      void (async () => {
        // AI 응답 대기: every mounted head holds the thinking face (eyes drift
        // up-side) until the reply lands — released in finally either way.
        const releaseThinking = holdExpression("thinking");
        try {
          const result = await sendChatMessage({
            userId,
            message: msg,
            locale,
            tier: progression.tier,
            personaHint: isCharacterChat ? persona.systemHint[locale] : rev2PersonaHint(rev2Persona, locale),
            // D-26 A1: last turns for thread continuity (engine clips to 6 + drops
            // red-zone turns). Synthetic lines (greeting/limit/error) are not model
            // replies, so they're excluded here.
            history: turns
              .filter((t) => !t.synthetic)
              .map((t) => ({ role: t.role === "user" ? ("user" as const) : ("assistant" as const), text: t.text })),
            mode: chatMode,
            minor: isMinor === true,
          });
          if (result.status === "blocked") {
            setTurns((prev) => [...prev, { role: "secondb", text: result.hint, synthetic: true }]);
            setUsedToday(result.used);
            if (result.upgradeTo) setPendingUpgrade(result.upgradeTo);
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
            // 가디 steps in with a soft stop (companion pack §3 / C9).
            companion.fire("safetySoftStop");
            wasBlockedRef.current = true;
          } else {
            const { display, chips } = parseSourceCitations(result.reply.text);
            // 트위비 3-branch (P5f): Divergent replies on the main chat end with up
            // to three '→ ' next-step lines — lift them into tappable chips.
            const twi =
              !isCharacterChat && chatMode === "divergent"
                ? parseTwiBranches(display)
                : { display, branches: [] as string[] };
            setTurns((prev) => [
              ...prev,
              { role: "secondb", text: twi.display, chips, branches: twi.branches },
            ]);
            setUsedToday(result.used);
            // SUCCESS only (not blocked / not crisis): this send consumed one
            // reasoning use. Count it (count-only, never quality). Optimistically
            // bump local used so the gate is live before the server round-trip
            // resolves; still increment unlimited tiers for analytics (they never
            // block). Fail-open: a failed increment must not break the answer.
            setReasoningUsed((u) => u + 1);
            void incrementReasoningUsage(userId).catch((e) => {
              if (typeof console !== "undefined") console.warn("[secondb] incrementReasoningUsage failed", (e as Error).message);
            });
            captureEvent(
              secondBSession({
                action: "message_sent",
                mode: chatMode,
                outcome: "ok",
                turn_count: turns.length + 1,
                used: result.used,
                limit,
                tier: progression.tier,
              }),
            );
            // 가디 gives the all-clear the first time we flow freely after a stop.
            if (wasBlockedRef.current) {
              companion.fire("safetyClear");
              wasBlockedRef.current = false;
            }
          }
        } catch (e) {
          const failText = t("replyFailed");
          setTurns((prev) => [...prev, { role: "secondb", text: failText, synthetic: true }]);
          reactExpression("negative");
          if (typeof console !== "undefined") console.warn("[secondb] sendChatMessage error", (e as Error).message);
        } finally {
          releaseThinking();
          setSending(false);
        }
      })();
      return true;
    },
    [
      userId,
      reasoningUnlimited,
      reasoningRemaining,
      progression.tier,
      isMinor,
      locale,
      chatMode,
      rev2Persona,
      isCharacterChat,
      persona,
      turns,
      limit,
      companion,
      t,
    ],
  );

  if (authLoading || progression.loading) return <InlineLoader />;
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }
  // OAuth mints a session before the profile/DOB + PIPA consent exist. A
  // no-profile session must not reach an LLM/crisis surface: route it to
  // /complete-profile (C10 age gate + consent; also fixes minor crisis-routing,
  // which keys off isMinor that is null until the birth date is on file).
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  // The non-draft half of the composer's send gate: not already sending and
  // under the daily AI limit (server also rejects via ChatLimitExceededError,
  // but the UI should not look actionable). usedToday===null means the count is
  // still loading, so allow until we know. ChatComposer ANDs this with a
  // non-empty draft.
  const sendEnabled = !sending && (usedToday === null || usedToday < limit);
  const usedDisplay = usedToday === null ? "..." : String(usedToday);
  const chatUiByWorker = {
    secondb: CORE_VILLAGE_UI,
    archi: VILLAGE_UI.work,
    gadi: VILLAGE_UI.relation,
    lulu: VILLAGE_UI.knowledge,
    momo: VILLAGE_UI.records,
    lumi: VILLAGE_UI.taste,
  } as const;
  // vela is dormant (공상 → Divergent mode); fall back to the Soul Core UI for
  // any worker without a Pattern Core mapping.
  const chatWorker = (
    isCharacterChat && persona.id in chatUiByWorker ? persona.id : "secondb"
  ) as keyof typeof chatUiByWorker;
  const chatUi = chatUiByWorker[chatWorker];
  const hasTurns = turns.length > 0;
  // Near-limit warning threshold scales down with small caps so the free
  // tier (limit 2, monetization v2) still has a reachable neutral state.
  const warnAt = Math.min(2, limit - 1);
  const usageColor: keyof typeof semantic =
    usedToday !== null && usedToday >= limit
      ? "danger"
      : usedToday !== null && limit - usedToday <= warnAt
        ? "warning"
        : "textMuted";
  const compactModeLabel = chatMode === "divergent" ? "New angle" : "Analysis";

  // ── Deep-space chrome (real composer + real answers + citations + states) ──
  // Same engine (turns / handleSend / sendChatMessage / parseSourceCitations /
  // canSend) as the legacy branch; only the visual shell differs. Crisis/C9/C3
  // live entirely inside sendChatMessage -> callGemini, untouched here.
  if (isDeepSpace) {
    const dsUsage = usedToday === null ? "..." : String(usedToday);
    const atLimit = usedToday !== null && usedToday >= limit;
    // Per-lens recolor (reference CHAT_MODES): the whole chat surface tints to
    // the selected persona's accent / soft fill / on-soft ink / glow. Character
    // chat (legacy roster) keeps the canonical cyan.
    const lensAccent = isCharacterChat ? deepSpace.accent : rev2PersonaAccent(rev2Persona);
    const lensSoftBg = isCharacterChat ? withAlpha(deepSpace.accent, 0.16) : rev2PersonaSoftBg(rev2Persona);
    const lensOnSoft = isCharacterChat ? deepSpace.accentBright : rev2PersonaOnSoft(rev2Persona);
    const lensGlow = isCharacterChat ? withAlpha(deepSpace.accent, 0.5) : rev2PersonaGlow(rev2Persona);
    const lensName = isCharacterChat ? persona.name[locale] : rev2PersonaLensName(rev2Persona, locale);
    const inkOnAccent = m3.accent.onAccentInk; // reference send/mic glyph ink on the accent fill
    return (
      <DeepSpaceScreen active="chat" variant="windowed" personaTint={isCharacterChat ? undefined : rev2Persona}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={keyboardBehavior}
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          {/* persona banner (reference ChatScreen header): status dot + mono tag +
              one-line lens description, tinted by the selected lens. Usage counter
              and clear affordance ride the right edge. */}
          <View style={[ds.banner, { backgroundColor: lensSoftBg }]}>
            <View style={[ds.bannerDot, { backgroundColor: lensAccent, shadowColor: lensGlow }]} />
            <Text style={[ds.bannerTag, { color: lensOnSoft }]} numberOfLines={1}>
              {isCharacterChat ? t("title") : rev2PersonaTag(rev2Persona, locale)}
            </Text>
            <Text style={ds.bannerDesc} numberOfLines={1}>
              {isCharacterChat ? persona.role[locale] : rev2PersonaDesc(rev2Persona, locale)}
            </Text>
            <Text style={[ds.bannerUsage, atLimit ? ds.headerMetaDanger : null]} numberOfLines={1}>
              {dsUsage}/{limit}
            </Text>
            {hasTurns ? (
              <Pressable
                onPress={() => setTurns([])}
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
            style={{ flex: 1 }}
            contentContainerStyle={[ds.scroll, { paddingBottom: messageListBottomPadding }]}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {turns.length === 0 ? (
              <View style={ds.empty}>
                <Text style={ds.emptyTitle}>
                  {isCharacterChat ? persona.name[locale] : t("title")}
                </Text>
                <Text style={ds.emptyBody}>{t("empty")}</Text>
              </View>
            ) : (
              turns.map((turn, i) => (
                <View
                  key={i}
                  style={[ds.bubbleRow, turn.role === "user" ? ds.userRow : ds.aiRow]}
                >
                  <View style={ds.bubbleCol}>
                    <Pressable
                      onLongPress={async () => {
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                          try {
                            await navigator.clipboard.writeText(turn.text);
                          } catch {
                            // ignore — fall back to user selection
                          }
                        }
                      }}
                      style={turn.role === "user" ? ds.userBubble : [ds.aiBubble, { borderLeftColor: lensAccent }]}
                      accessibilityRole="button"
                      accessibilityLabel={
                        turn.role === "user"
                          ? t("yourMessage")
                          : t("secondbAnswer")
                      }
                      accessibilityHint={t("longPressCopy")}
                    >
                      <Text style={turn.role === "user" ? ds.userText : ds.aiText} selectable>
                        {turn.text}
                      </Text>
                    </Pressable>
                    {/* 근거(citation) chip -> reference drawer -> /records. One
                        summary chip (reference "근거 · 기록 N건") tinted by the lens. */}
                    {turn.role === "secondb" && turn.chips && turn.chips.length > 0 ? (
                      <Pressable
                        style={ds.chipRow}
                        onPress={() => setRefDrawer(turn.chips ?? [])}
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
                    {/* 트위비 3-branch (P5f): next-step candidates. Tap = prefill
                        the composer; 담기 = hand the branch to /capture (?text=,
                        the share-consume path). */}
                    {turn.role === "secondb" && turn.branches && turn.branches.length > 0 ? (
                      <View style={ds.branchCol}>
                        {turn.branches.map((branch) => (
                          <View key={branch} style={ds.branchRow}>
                            <Pressable
                              style={ds.branchChip}
                              onPress={() => composerRef.current?.prefill(branch)}
                              accessibilityRole="button"
                              accessibilityLabel={branch}
                              accessibilityHint={t("fillsComposer")}
                            >
                              <Text style={ds.branchChipText} numberOfLines={2}>
                                {branch}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={ds.branchSave}
                              onPress={() => router.push({ pathname: "/capture", params: { text: branch } })}
                              hitSlop={10}
                              accessibilityRole="button"
                              accessibilityLabel={t("captureBranch", { branch })}
                            >
                              <Text style={ds.branchSaveText}>{t("keep")}</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
            {sending ? (
              <View style={ds.thinking}>
                <ActivityIndicator color={lensAccent} />
              </View>
            ) : null}
          </ScrollView>

          {/* quick-action chips after an answer */}
          {turns.length > 0 && turns[turns.length - 1].role === "secondb" && !sending ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={ds.quickRow}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_ACTIONS.map((qa) => (
                <Pressable
                  key={qa.en}
                  style={ds.quickChip}
                  onPress={() => {
                    if (qa.mode === "divergent" && !isCharacterChat) selectRev2Persona("twi");
                    else if (qa.mode) setChatMode(qa.mode);
                    composerRef.current?.prefill(locale === "ko" ? qa.prompt.ko : qa.prompt.en);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={locale === "ko" ? qa.ko : qa.en}
                >
                  <Text style={ds.quickChipText}>{locale === "ko" ? qa.ko : qa.en}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {/* reasoning-cap inline notice (count-only — NOT a quality message).
              "다 썼어요, 더 하려면" framing; no implication of lower quality. */}
          {capNotice && !reasoningUnlimited && reasoningRemaining <= 0 ? (
            <Text style={ds.limitLinkText} accessibilityLiveRegion="polite">
              {t("usedDeepQuestions")}
            </Text>
          ) : null}

          {atLimit ? (
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

          {/* persona toggle (reference ChatScreen): 3 equal lenses. Selecting one
              recolors the whole surface and switches who answers next. Character
              chat (legacy roster) keeps the 분석/새 관점 mode toggle instead. */}
          {!isCharacterChat ? (
            <View style={ds.toggleRow} accessibilityLabel={t("rev2.selectorA11y")}>
              {REV2_PERSONA_IDS.map((id) => {
                const on = rev2Persona === id;
                const accent = rev2PersonaAccent(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => selectRev2Persona(id)}
                    style={[
                      ds.lensBtn,
                      { borderColor: on ? accent : m3.color.outlineVariant },
                      on ? { backgroundColor: rev2PersonaSoftBg(id) } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${rev2PersonaLensName(id, locale)} · ${rev2PersonaRole(id, locale)}`}
                  >
                    <Text style={[ds.lensName, { color: on ? rev2PersonaOnSoft(id) : m3.color.onSurfaceVariant }]}>
                      {rev2PersonaLensName(id, locale)}
                    </Text>
                    <Text style={[ds.lensTag, { color: on ? accent : m3.color.onSurfaceVariant }]}>
                      {rev2PersonaTag(id, locale)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={ds.toggleRow}>
              <Pressable
                onPress={() => setChatMode("analytic")}
                style={[
                  ds.lensBtn,
                  { borderColor: chatMode === "analytic" ? lensAccent : m3.color.outlineVariant },
                  chatMode === "analytic" ? { backgroundColor: lensSoftBg } : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: chatMode === "analytic" }}
                accessibilityLabel={t("analysisMode")}
              >
                <Text style={[ds.lensName, { color: chatMode === "analytic" ? lensOnSoft : m3.color.onSurfaceVariant }]}>
                  {t("analysisChip")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setChatMode("divergent")}
                style={[
                  ds.lensBtn,
                  { borderColor: chatMode === "divergent" ? lensAccent : m3.color.outlineVariant },
                  chatMode === "divergent" ? { backgroundColor: lensSoftBg } : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: chatMode === "divergent" }}
                accessibilityLabel={t("newAngleMode")}
              >
                <Text style={[ds.lensName, { color: chatMode === "divergent" ? lensOnSoft : m3.color.onSurfaceVariant }]}>
                  {t("newAngleChip")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* input bar (reference ChatScreen): a rounded pill holding the text
              field + inline mic, then a separate 48px round send button that
              fills with the lens accent when there is something to send. Draft
              state lives inside ChatComposer so a keystroke re-renders only the
              composer, not this whole DeepSpaceScreen (starfield/header/dock). */}
          <ChatComposer
            ref={composerRef}
            variant="deep-space"
            sending={sending}
            sendEnabled={sendEnabled}
            onSend={handleSend}
            fromNode={fromNode}
            lensAccent={lensAccent}
            lensName={lensName}
            inkOnAccent={inkOnAccent}
          />
        </KeyboardAvoidingView>

        {/* 첫 진입 인사 모달 */}
        <Modal visible={introOpen} transparent animationType="fade" onRequestClose={() => setIntroOpen(false)}>
          {/* Scrim: NOT a button — on web an accessibilityRole="button" backdrop
              renders as <button> and nests the modal's real <button>s inside it
              (hydration error, parity finding S1). Tap-to-dismiss stays; the
              labeled close affordances are the modal's own buttons. */}
          <Pressable
            style={ds.modalBackdrop}
            onPress={() => setIntroOpen(false)}
            accessibilityLabel={t("closeIntro")}
            accessibilityHint={t("closeIntroHint")}
          >
            <Pressable style={ds.modalCard} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
              <Text style={ds.modalEyebrow}>{t("intro_title")}</Text>
              {/* keepAllKo joins Hangul words with U+2060 so they wrap at spaces; the
                  screen reader gets the untouched string (joiners disorient braille and
                  character-by-character review). */}
              <Text style={ds.modalBody} accessibilityLabel={t("intro_body")}>{keepAllKo(t("intro_body"))}</Text>
              <View style={ds.modalActions}>
                <Pressable
                  onPress={() => { writeIntroDismissed("today"); setIntroOpen(false); }}
                  style={ds.modalBtnGhost}
                  hitSlop={14}
                  accessibilityRole="button"
                  accessibilityLabel={t("intro_mute")}
                >
                  <Text style={ds.modalBtnGhostText}>{t("intro_mute")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setIntroOpen(false); }}
                  style={ds.modalBtnPrimary}
                  hitSlop={14}
                  accessibilityRole="button"
                  accessibilityLabel={t("intro_ok")}
                >
                  <Text style={ds.modalBtnPrimaryText}>{t("intro_ok")}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* reference drawer — pieces the answer drew on */}
        <Modal
          visible={refDrawer !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setRefDrawer(null)}
        >
          {/* Scrim: not a button (same web nesting rationale as the intro modal). */}
          <Pressable
            style={ds.modalBackdrop}
            onPress={() => setRefDrawer(null)}
            accessibilityLabel={t("closeReferenced")}
            accessibilityHint={t("closeReferencedHint")}
          >
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
                    onPress={() => {
                      // med#23: citations are wiki-page slugs — resolve to the
                      // page id (getWikiPage) and deep-link it via the same
                      // /wiki?focusPageId mechanism the digest fix uses. A
                      // failed resolve still lands on the wiki list.
                      setRefDrawer(null);
                      if (!userId) {
                        router.push("/wiki");
                        return;
                      }
                      void getWikiPage(userId, slug)
                        .then((page) => {
                          if (page) router.push({ pathname: "/wiki", params: { focusPageId: page.id } });
                          else router.push("/wiki");
                        })
                        .catch(() => router.push("/wiki"));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={formatSourceCitationLabel(slug)}
                  >
                    <Text style={ds.drawerCardTitle}>{formatSourceCitationLabel(slug)}</Text>
                    <Text style={ds.drawerCardMeta}>{t("reference_piece_meta")}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setRefDrawer(null)}
                style={ds.drawerClose}
                accessibilityRole="button"
                accessibilityLabel={t("closeChip")}
              >
                <Text style={ds.drawerCloseText}>{t("closeChip")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        {/* 가디 safety beat (companion pack §3) — same crisis-clear signal as legacy */}
        {companion.moment ? (
          <CompanionMoment moment={companion.moment} style={styles.companionFlash} />
        ) : null}

        {/* Rewarded watch-to-earn — free adults top up reasoning COUNTS only
            (never quality). onEarned: persist credits, refresh remaining, close;
            the user can send again. onClose: just close. */}
        <RewardedSheet
          visible={rewardVisible}
          onClose={() => setRewardVisible(false)}
          remaining={reasoningUnlimited ? 0 : reasoningRemaining}
          onEarned={async (credits) => {
            if (userId) {
              try {
                await addRewardCredits(userId, credits);
              } catch (e) {
                if (typeof console !== "undefined") console.warn("[secondb] addRewardCredits failed", (e as Error).message);
              }
            }
            setRewardCredits((c) => c + credits);
            setCapNotice(false);
            setRewardVisible(false);
          }}
          locale={locale}
        />
      </DeepSpaceScreen>
    );
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={styles.compactHeader}>
          {hasTurns ? (
            <SecondBSprite
              state="chat"
              size={28}
              label={isCharacterChat ? persona.name[locale] : t("title")}
            />
          ) : null}
          <Text variant="caption" color="brand" numberOfLines={1} style={styles.compactTitle}>
            {isCharacterChat ? persona.name[locale] : t("title")}
          </Text>
          <Text variant="caption" color={usageColor} numberOfLines={1} style={{ flexShrink: 0 }}>
            {usedDisplay}/{limit}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 0 }}>
            {compactModeLabel}
          </Text>
          {hasTurns ? (
            <Pressable
              onPress={() => setTurns([])}
              style={styles.clearChatLink}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={t("clearChatA11y")}
              accessibilityHint={t("clearChatHint")}
            >
              <Text variant="caption" color="brand">
                {t("clearChat")}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <ChatComposer
          ref={composerRef}
          variant="legacy"
          sending={sending}
          sendEnabled={sendEnabled}
          onSend={handleSend}
          fromNode={fromNode}
        />

        {/* reasoning-cap inline notice (count-only — NOT a quality message). */}
        {capNotice && !reasoningUnlimited && reasoningRemaining <= 0 ? (
          <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite" style={{ textAlign: "right", paddingHorizontal: spacing.md }}>
            {t("usedDeepQuestions")}
          </Text>
        ) : null}

        {usedToday !== null && usedToday >= limit ? (
          <Pressable
            onPress={() => router.push("/plans?from=ai_limit")}
            hitSlop={14}
            style={styles.limitLink}
            accessibilityRole="button"
            accessibilityLabel={t("viewPlans")}
            accessibilityHint={t("viewPlansHint")}
          >
            <Text variant="caption" color="brand">
              {t("viewPlans")}
            </Text>
          </Pressable>
        ) : null}

        {!hasTurns ? (
        <SceneHero
          eyebrow={t("eyebrow")}
          title={isCharacterChat ? persona.name[locale] : t("title")}
          subtitle={isCharacterChat ? persona.role[locale] : t("subtitle")}
          island={chatUi.island}
          worker={chatUi.worker}
          accent={chatUi.accent}
          speech={
            sending
              ? t("heroSpeech.sending")
              : chatMode === "divergent"
                ? t("heroSpeech.divergent")
                : t("heroSpeech.default")
          }
        />
        ) : null}

        {/* SecondB mode toggle (worldview v-final): Analytic / Divergent. Both
            run the same C9 -> C3 -> gemini.ts path; only the prompt shifts. */}
        <View style={styles.modeRow}>
            <Pressable
              onPress={() => setChatMode("analytic")}
              style={[styles.modeChip, chatMode === "analytic" ? styles.modeChipAnalytic : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: chatMode === "analytic" }}
            accessibilityLabel={t("analysisMode")}
          >
            <Text variant="caption" color={chatMode === "analytic" ? "background" : "textMuted"}>
              {t("analysisChip")}
            </Text>
          </Pressable>
            <Pressable
              onPress={() => setChatMode("divergent")}
              style={[styles.modeChip, chatMode === "divergent" ? styles.modeChipDivergent : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: chatMode === "divergent" }}
            accessibilityLabel={t("newAngleMode")}
          >
            <Text variant="caption" color={chatMode === "divergent" ? "text" : "textMuted"}>
              {t("newAngleChip")}
            </Text>
          </Pressable>
          {chatMode === "divergent" ? (
            <>
              <Animated.View style={[styles.divergentPulseDot, { opacity: divergentPulse as never }]} />
              <Text variant="caption" color="textSubtle" style={styles.modeHint} numberOfLines={1}>
                {t("newPerspectives")}
              </Text>
            </>
          ) : null}
        </View>

        {/* nodeContext pill — entered from a graph node (chat pack §7) */}
        {fromNode ? (
          <View style={styles.contextPillWrap}>
            <ContextPill label={fromNode} />
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: messageListBottomPadding }]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {turns.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptySecondB}>
                {/* O-12 Phase C P1-2: SceneHero already carries the hero graphic,
                    so the empty-state mascot is smaller (one dominant graphic per
                    screen). Kept labeled for a11y. */}
                <SecondBSprite
                  state="chat"
                  size={56}
                  float
                  label={t("readyToChat")}
                />
              </View>
              <Text variant="body" color="textMuted" style={{ textAlign: "center", marginTop: spacing.md }}>
                {t("empty")}
              </Text>
            </View>
          ) : (
            turns.map((turn, i) => (
              <View
                key={i}
                style={[styles.bubbleRow, turn.role === "user" ? styles.userRow : styles.secondbRow]}
              >
                <View style={styles.bubbleCol}>
                  <Pressable
                    onLongPress={async () => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        try {
                          await navigator.clipboard.writeText(turn.text);
                        } catch {
                          // ignore — fall back to selection by the user
                        }
                      }
                    }}
                    style={[
                      styles.bubble,
                      turn.role === "user" ? styles.userBubble : styles.secondbBubble,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      turn.role === "user"
                        ? t("yourMessage")
                        : t("secondbAnswer")
                    }
                    accessibilityHint={
                      t("longPressCopyThis")
                    }
                  >
                    <Text
                      variant="body"
                      color={turn.role === "user" ? "background" : "text"}
                      selectable
                    >
                      {turn.text}
                    </Text>
                  </Pressable>
                  {/* Grounding strip — "이 답변은 참고한 별가루 N개를 봤어요"; tap to
                      open the reference drawer (chat pack §5/§6). */}
                  {turn.role === "secondb" && turn.chips && turn.chips.length > 0 ? (
                    <Pressable
                      style={styles.chipRow}
                      onPress={() => setRefDrawer(turn.chips ?? [])}
                      accessibilityRole="button"
                      accessibilityLabel={
                        t("drewOnPieces", { n: turn.chips.length })
                      }
                    >
                      <Text variant="caption" color="textSubtle">
                        {t("nPieces", { n: turn.chips.length })}
                      </Text>
                      {turn.chips.slice(0, 3).map((slug) => (
                        <View key={slug} style={styles.chip}>
                          <Text variant="caption" color="brand">{formatSourceCitationLabel(slug)}</Text>
                        </View>
                      ))}
                      {turn.chips.length > 3 ? (
                        <Text variant="caption" color="textSubtle">
                          {locale === "ko" ? `+${turn.chips.length - 3}` : `+${turn.chips.length - 3}`}
                        </Text>
                      ) : null}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
          {sending ? (
            <View style={styles.thinking}>
              <ActivityIndicator color={semantic.brand} />
            </View>
          ) : null}
        </ScrollView>

        {/* Quick-action chips (chat pack §8) — appear once SecondB has
            answered; each prefills the composer with a short follow-up. */}
        {turns.length > 0 && turns[turns.length - 1].role === "secondb" && !sending ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_ACTIONS.map((qa) => (
              <Pressable
                key={qa.en}
                style={styles.quickChip}
                onPress={() => {
                  if (qa.mode) setChatMode(qa.mode);
                  composerRef.current?.prefill(locale === "ko" ? qa.prompt.ko : qa.prompt.en);
                }}
                accessibilityRole="button"
                accessibilityLabel={locale === "ko" ? qa.ko : qa.en}
              >
                <Text variant="caption" color="brand">{locale === "ko" ? qa.ko : qa.en}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

      </KeyboardAvoidingView>

      {/* 첫 진입 인사 모달 — 알았어요 / 오늘은 그만 볼래요 */}
      <Modal visible={introOpen} transparent animationType="fade" onRequestClose={() => setIntroOpen(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIntroOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t("closeIntro")}
          accessibilityHint={t("closeIntroHint")}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
            accessible={false}
            accessibilityViewIsModal
          >
            <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
              {t("intro_title")}
            </Text>
            <Text variant="body" color="text" style={{ marginTop: spacing.sm, lineHeight: 20 }} accessibilityLabel={t("intro_body")}>
              {keepAllKo(t("intro_body"))}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => { writeIntroDismissed("today"); setIntroOpen(false); }}
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={t("intro_mute")}
              >
                <Text variant="body" color="textMuted">{t("intro_mute")}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setIntroOpen(false); }}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={t("intro_ok")}
              >
                <Text variant="body" color="background" style={{ fontWeight: "700" }}>
                  {t("intro_ok")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reference drawer (chat pack §6) — the pieces an answer drew on. */}
      <Modal
        visible={refDrawer !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRefDrawer(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setRefDrawer(null)}
          accessibilityRole="button"
          accessibilityLabel={t("closeReferenced")}
          accessibilityHint={t("closeReferencedHint")}
        >
          <Pressable
            style={styles.drawer}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
            accessibilityLabel={t("piecesReferenced")}
          >
            <View style={styles.drawerHandle} />
            <Text variant="heading">{t("piecesReferenced")}</Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 4 }}>
              {t("piecesReferencedBody")}
            </Text>
            {/* List scrolls within the capped (62%) drawer so the Close button
                below stays reachable even with many referenced pieces or on a
                short / landscape screen (was a plain View: long lists pushed
                Close off-screen). */}
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ marginTop: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm }}
              showsVerticalScrollIndicator={false}
            >
              {(refDrawer ?? []).map((slug) => (
                <ReferenceShardCard
                  key={slug}
                  title={formatSourceCitationLabel(slug)}
                  meta={t("reference_piece_meta")}
                  onPress={() => {
                    // Citations are wiki-page slugs. Route to the 위키 tab (which
                    // lists the wiki pages) rather than /records, so the user lands
                    // where the cited page actually lives.
                    // TODO: once a slug->page resolver exists, deep-link the page.
                    setRefDrawer(null);
                    router.push("/wiki");
                  }}
                />
              ))}
            </ScrollView>
            <Button
              label={t("closeChip")}
              variant="secondary"
              onPress={() => setRefDrawer(null)}
            />
          </Pressable>
        </Pressable>
      </Modal>
      {/* 가디 appears briefly on a safety soft-stop / all-clear (companion pack §3) */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.companionFlash} />
      ) : null}

      {/* Rewarded watch-to-earn — count-only top up; same wiring as deep-space. */}
      <RewardedSheet
        visible={rewardVisible}
        onClose={() => setRewardVisible(false)}
        remaining={reasoningUnlimited ? 0 : reasoningRemaining}
        onEarned={async (credits) => {
          if (userId) {
            try {
              await addRewardCredits(userId, credits);
            } catch (e) {
              if (typeof console !== "undefined") console.warn("[secondb] addRewardCredits failed", (e as Error).message);
            }
          }
          setRewardCredits((c) => c + credits);
          setCapNotice(false);
          setRewardVisible(false);
        }}
        locale={locale}
      />
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  companionFlash: { position: "absolute", bottom: 90, right: 20 },
  compactHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomColor: gameboy.border,
    borderBottomWidth: gameboy.borderWidth,
  },
  compactTitle: { flex: 1, minWidth: 0 },
  composerPrimary: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    backgroundColor: semantic.surface,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    ...pixelShadowStyle(),
  },
  limitLink: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
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
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomColor: gameboy.border,
    borderBottomWidth: gameboy.borderWidth,
  },
  modeChip: {
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: semantic.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44,
    justifyContent: "center",
    ...pixelShadowStyle(),
  },
  modeChipAnalytic: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  modeChipDivergent: { backgroundColor: cosmic.soulViolet2, borderColor: cosmic.soulViolet2 },
  modeHint: { flex: 1, minWidth: 0, marginStart: spacing.xs },
  clearChatLink: { minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  divergentPulseDot: { width: 8, height: 8, borderRadius: gameboy.radius, backgroundColor: cosmic.soulViolet2 },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  empty: { paddingVertical: spacing.xl, alignItems: "center", gap: spacing.md },
  emptySecondB: {
    width: 140,
    height: 140,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: withAlpha(cosmic.soulViolet, 0.14),
    alignItems: "center",
    justifyContent: "center",
    ...pixelShadowStyle(cosmic.signalMint),
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: semantic.backdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: semantic.surface,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.lg,
    maxWidth: 420,
    width: "100%",
    ...pixelShadowStyle(),
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: "flex-end",
  },
  modalBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: gameboy.radius,
  },
  modalBtnPrimary: { backgroundColor: semantic.brand },
  modalBtnSecondary: { backgroundColor: "transparent" },
  bubbleRow: { flexDirection: "row" },
  userRow: { justifyContent: "flex-end" },
  secondbRow: { justifyContent: "flex-start" },
  bubbleCol: { maxWidth: "85%", gap: spacing.xs, alignItems: "flex-start" },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  chip: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    ...pixelShadowStyle(),
  },
  contextPillWrap: { marginTop: spacing.sm },
  quickRow: { gap: spacing.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  quickChip: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: semantic.surfaceAlt,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...pixelShadowStyle(),
  },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "62%",
    backgroundColor: semantic.surface,
    borderTopLeftRadius: gameboy.radius,
    borderTopRightRadius: gameboy.radius,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    padding: spacing.lg,
    gap: spacing.sm,
    ...pixelShadowStyle(),
  },
  drawerHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: gameboy.radius,
    backgroundColor: semantic.border,
    marginBottom: spacing.sm,
  },
  bubble: {
    maxWidth: "100%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: gameboy.radius,
    borderWidth: gameboy.borderWidth,
    ...pixelShadowStyle(),
  },
  userBubble: {
    backgroundColor: semantic.brand,
    borderColor: semantic.brand,
  },
  secondbBubble: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
  },
  thinking: { paddingVertical: spacing.md, alignItems: "center" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopColor: gameboy.border,
    borderTopWidth: gameboy.borderWidth,
  },
  composerInput: { flex: 1, maxHeight: 120 },
});

// Deep-space chat chrome. deepSpace.* tokens only (no hex literals, no
// glassmorphism, no pill chips, no em-dash in strings). Matches the prototype's
// bubble/composer language from DeepSpaceViews while hosting the REAL engine.
const ds = StyleSheet.create({
  // persona banner (reference ChatScreen header row): dot + mono tag + desc,
  // over the lens soft fill (set inline). Usage + clear ride the right edge.
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: deepSpaceSpacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
    elevation: 2,
  },
  bannerTag: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: "700",
    fontFamily: fontFamilies.mono,
  },
  bannerDesc: {
    flex: 1,
    minWidth: 0,
    color: m3.color.onSurfaceVariant,
    fontSize: 12,
    fontFamily: fontFamilies.readable,
  },
  bannerUsage: {
    flexShrink: 0,
    color: deepSpace.textLo,
    fontSize: 11,
    fontFamily: fontFamilies.mono,
  },
  headerMetaDanger: { color: deepSpace.dangerText },
  clearLink: { flexShrink: 0, minHeight: 44, justifyContent: "center", paddingHorizontal: deepSpaceSpacing.xs },
  clearLinkText: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.readable },

  // lens toggle (reference ChatScreen persona toggle): 3 equal buttons, name +
  // mono tag; border/fill accent set inline per selected lens.
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
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1.5,
  },
  lensName: { fontSize: 13, fontWeight: "700", fontFamily: fontFamilies.readable },
  lensTag: { fontSize: 9, fontFamily: fontFamilies.mono, marginTop: 1 },

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
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  modeChipOnAccent: { backgroundColor: deepSpace.accent, borderColor: deepSpace.accent },
  modeChipOnSoul: { backgroundColor: deepSpace.soul, borderColor: deepSpace.soul },
  modeChipText: { color: deepSpace.textMid, fontSize: 12, fontFamily: fontFamilies.readable },
  modeChipTextOn: { color: deepSpace.onAccent, fontWeight: "700" },
  modeChipTextOnSoul: { color: deepSpace.bgEdge, fontWeight: "700" },
  modeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: deepSpace.soul },
  // rev2 persona chips: same metrics as modeChip; the accent border/fill comes
  // from m3.persona via rev2PersonaAccent (inline), never a literal here.
  personaChip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.sm,
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
  // 트위비 3-branch chips (P5f): next-step candidates under a Divergent reply.
  branchCol: { gap: 6, marginTop: 6 },
  branchRow: { flexDirection: "row", alignItems: "stretch", gap: 6 },
  branchChip: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    paddingVertical: 8,
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: deepSpace.soulLine,
    backgroundColor: deepSpace.card,
  },
  branchChipText: { color: deepSpace.textHi, fontSize: 12, fontFamily: fontFamilies.readable },
  branchSave: {
    minWidth: 52,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  branchSaveText: { color: deepSpace.mint, fontSize: 12, fontFamily: fontFamilies.readable },

  contextPillWrap: { paddingHorizontal: 18, paddingBottom: deepSpaceSpacing.sm },
  contextPill: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.3),
    backgroundColor: withAlpha(deepSpace.soul, 0.07),
  },
  contextPillText: { color: deepSpace.textHi, fontSize: 11, fontFamily: fontFamilies.readable },

  scroll: { paddingHorizontal: 18, paddingTop: deepSpaceSpacing.sm, gap: 10 },
  empty: { paddingVertical: 56, alignItems: "center", gap: 10 },
  emptyTitle: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.pixelKo },
  emptyBody: {
    color: withAlpha(deepSpace.text, 0.6),
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: fontFamilies.readable,
  },

  bubbleRow: { flexDirection: "row" },
  userRow: { justifyContent: "flex-end" },
  aiRow: { justifyContent: "flex-start" },
  bubbleCol: { maxWidth: "86%", gap: 6, alignItems: "flex-start" },
  // user bubble: M3 primary fill, radius 16/16/4/16 (reference).
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "100%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopLeftRadius: deepSpaceRadii.md,
    borderTopRightRadius: deepSpaceRadii.md,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: deepSpaceRadii.md,
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
    borderTopLeftRadius: 4,
    borderTopRightRadius: deepSpaceRadii.md,
    borderBottomRightRadius: deepSpaceRadii.md,
    borderBottomLeftRadius: deepSpaceRadii.md,
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
    borderRadius: deepSpaceRadii.sm,
  },
  citeChipText: { fontSize: 12, fontWeight: "600", fontFamily: fontFamilies.readable },

  thinking: { paddingVertical: deepSpaceSpacing.md, alignItems: "center" },

  quickRow: { alignItems: "center", gap: deepSpaceSpacing.sm, paddingHorizontal: 18, paddingVertical: deepSpaceSpacing.sm },
  quickChip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  quickChipText: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.readable },

  limitLink: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", paddingHorizontal: 18 },
  limitLinkText: { color: deepSpace.accentSoft, fontSize: 12, fontFamily: fontFamilies.readable },

  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: deepSpaceSpacing.sm,
    paddingHorizontal: 12,
    paddingTop: deepSpaceSpacing.sm,
    paddingBottom: 12,
  },
  // rounded input pill (reference): surface-container-high, mic inline right.
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: deepSpaceSpacing.sm,
    height: 48,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 9999,
    backgroundColor: m3.color.surfaceContainerHigh,
  },
  pillInput: {
    flex: 1,
    minWidth: 0,
    color: m3.color.onSurface,
    fontSize: 15,
    fontFamily: fontFamilies.readable,
    padding: 0,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  // separate 48px round send button (reference): accent fill when canSend.
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(deepSpace.bgEdge, 0.8),
    alignItems: "center",
    justifyContent: "center",
    padding: deepSpaceSpacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    padding: deepSpaceSpacing.lg,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.bg,
  },
  modalEyebrow: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.readable },
  modalBody: { color: deepSpace.textHi, fontSize: 13, lineHeight: 20, marginTop: deepSpaceSpacing.sm, fontFamily: fontFamilies.readable },
  modalActions: { flexDirection: "row", gap: deepSpaceSpacing.sm, marginTop: deepSpaceSpacing.md, justifyContent: "flex-end" },
  modalBtnGhost: { minHeight: 44, justifyContent: "center", paddingHorizontal: deepSpaceSpacing.md, borderRadius: deepSpaceRadii.sm },
  modalBtnGhostText: { color: deepSpace.textMid, fontSize: 13, fontFamily: fontFamilies.readable },
  modalBtnPrimary: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.sm,
    backgroundColor: deepSpace.accent,
  },
  modalBtnPrimaryText: { color: deepSpace.onAccent, fontSize: 13, fontWeight: "700", fontFamily: fontFamilies.readable },

  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "62%",
    padding: deepSpaceSpacing.lg,
    gap: deepSpaceSpacing.sm,
    borderTopLeftRadius: deepSpaceRadii.lg,
    borderTopRightRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.bg,
  },
  drawerHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: deepSpace.cardLine, marginBottom: deepSpaceSpacing.sm },
  drawerTitle: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.pixelKo },
  drawerSubtle: { color: deepSpace.textMid, fontSize: 12, lineHeight: 18, marginTop: 4, fontFamily: fontFamilies.readable },
  drawerList: { marginTop: deepSpaceSpacing.md, gap: deepSpaceSpacing.sm, paddingBottom: deepSpaceSpacing.sm },
  drawerCard: {
    paddingVertical: deepSpaceSpacing.md,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.md,
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
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    marginTop: deepSpaceSpacing.sm,
  },
  drawerCloseText: { color: deepSpace.accentSoft, fontSize: 13, fontFamily: fontFamilies.readable },
});
