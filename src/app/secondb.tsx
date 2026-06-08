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

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable, Animated, Easing } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, semantic, spacing, withAlpha } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { sendChatMessage } from "@/lib/chat/conversation";
import { getPersona, PERSONAS } from "@/lib/chat/personas";
import { formatSourceCitationLabel, parseSourceCitations } from "@/lib/chat/sources";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { PremiumAppShell, ContextPill, ReferenceShardCard, SceneHero } from "@/components/premium";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { readChatUsage } from "@/lib/chat/usage";
import { CHAT_DAILY_LIMIT } from "@/lib/chat/limits";
import { CORE_VILLAGE_UI, VILLAGE_UI } from "@/lib/village-ui";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Quick-action chips offered under an answer (chat pack §8). Each prefills
// the composer with a short follow-up in the village voice; the user sends.
const QUICK_ACTIONS: { ko: string; en: string; mode?: "divergent"; prompt: { ko: string; en: string } }[] = [
  { ko: "다음 한 걸음", en: "Next step", prompt: { ko: "지금 할 수 있는 다음 한 걸음으로 줄여줘.", en: "Narrow this to one next step I can take today." } },
  { ko: "새 관점으로", en: "New angle", mode: "divergent", prompt: { ko: "이 생각을 전혀 다른 관점에서 펼쳐줘.", en: "Unfold this from a completely different angle." } },
  { ko: "위키에 저장", en: "Save to wiki", prompt: { ko: "이 답을 위키에 저장할 수 있게 한 단락으로 정리해줘.", en: "Sum this up in one paragraph I can save to my wiki." } },
  { ko: "왜 이렇게 봤어?", en: "Why this?", prompt: { ko: "왜 그렇게 봤는지 참고한 조각을 들어 설명해줘.", en: "Explain why you saw it that way, citing the pieces you used." } },
  { ko: "다시 짧게", en: "Shorter", prompt: { ko: "더 짧게 한 문장으로 말해줘.", en: "Say that again, shorter. One sentence." } },
];

interface ChatTurn {
  role: "user" | "secondb";
  text: string;
  /** Slugs the reply cited — rendered as small source chips. */
  chips?: string[];
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
      const today = new Date().toISOString().slice(0, 10);
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
    const v = kind === "permanent" ? "permanent" : `today:${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(INTRO_DISMISS_KEY, v);
  } catch {
    // ignore — private mode, native
  }
}

export default function SecondBChat() {
  const { t, i18n } = useTranslation("secondb");
  const { userId, loading: authLoading, isMinor, hasProfile } = useAuth();
  const progression = useProgression();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const insets = useSafeAreaInsets();
  const keyboardBehavior = Platform.OS === "ios" ? "padding" : "height";
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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [usedToday, setUsedToday] = useState<number | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  // SecondB conversation mode (worldview v-final). Analytic = data-grounded
  // analysis; Divergent = data-grounded but explores radically different angles.
  // Seeded from ?mode=divergent (e.g. a graph node's "새 관점으로 펼치기").
  const [chatMode, setChatMode] = useState<ChatMode>(
    params.mode === "divergent" ? "divergent" : "analytic",
  );
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
  const scrollRef = useRef<ScrollView>(null);

  // Seed once on entry: a character chat opens with that companion's greeting
  // as the first turn; a node entry pre-fills the composer with the context.
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (isCharacterChat) {
      setTurns([{ role: "secondb", text: persona.greeting[locale] }]);
    }
    if (fromNode) {
      setDraft(locale === "ko" ? `'${fromNode}'에 대해 물어볼게요: ` : `About '${fromNode}': `);
    }
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

  if (authLoading || progression.loading) return <InlineLoader />;
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }
  // OAuth mints a session before the profile/DOB + PIPA consent exist. A
  // no-profile session must not reach an LLM/crisis surface: route it to
  // /complete-profile (C10 age gate + consent; also fixes minor crisis-routing,
  // which keys off isMinor that is null until the birth date is on file).
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  async function handleSend(): Promise<void> {
    if (!userId) return;
    const msg = draft.trim();
    if (msg.length === 0) return;
    setSending(true);
    setTurns((prev) => [...prev, { role: "user", text: msg }]);
    setDraft("");
    try {
      const result = await sendChatMessage({
        userId,
        message: msg,
        locale,
        tier: progression.tier,
        personaHint: isCharacterChat ? persona.systemHint[locale] : null,
        mode: chatMode,
        minor: isMinor === true,
      });
      if (result.status === "blocked") {
        setTurns((prev) => [...prev, { role: "secondb", text: result.hint }]);
        setUsedToday(result.used);
        // 가디 steps in with a soft stop (companion pack §3 / C9).
        companion.fire("safetySoftStop");
        wasBlockedRef.current = true;
      } else {
        const { display, chips } = parseSourceCitations(result.reply.text);
        setTurns((prev) => [...prev, { role: "secondb", text: display, chips }]);
        setUsedToday(result.used);
        // 가디 gives the all-clear the first time we flow freely after a stop.
        if (wasBlockedRef.current) {
          companion.fire("safetyClear");
          wasBlockedRef.current = false;
        }
      }
    } catch (e) {
      const msg =
        locale === "ko"
          ? "응답에 실패했어요. 잠시 후 다시 시도해 주세요."
          : "Could not get a reply. Please try again in a moment.";
      setTurns((prev) => [...prev, { role: "secondb", text: msg }]);
      if (typeof console !== "undefined") console.warn("[secondb] sendChatMessage error", (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  // Disable send once the daily AI limit is reached (the server also rejects via
  // ChatLimitExceededError, but the UI should not look actionable). usedToday===null
  // means the count is still loading, so allow until we know.
  const canSend = draft.trim().length > 0 && !sending && (usedToday === null || usedToday < limit);
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
  const usageColor: keyof typeof semantic =
    usedToday !== null && usedToday >= limit
      ? "danger"
      : usedToday !== null && limit - usedToday <= 2
        ? "warning"
        : "textMuted";
  const compactModeLabel = chatMode === "divergent" ? "New angle" : "Analysis";

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
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear chat"
              accessibilityHint="Clears the current conversation"
            >
              <Text variant="caption" color="brand">
                Clear
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.composerPrimary}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder={t("placeholder")}
            multiline
            style={styles.composerInput}
            accessibilityLabel="Ask SecondB"
          />
          <Button label={t("send")} variant="primary" onPress={handleSend} disabled={!canSend} loading={sending} />
        </View>

        {usedToday !== null && usedToday >= limit ? (
          <Pressable
            onPress={() => router.push("/plans")}
            hitSlop={8}
            style={styles.limitLink}
            accessibilityRole="button"
            accessibilityLabel="View plans"
            accessibilityHint="Opens the plans screen"
          >
            <Text variant="caption" color="brand">
              View plans
            </Text>
          </Pressable>
        ) : null}

        {!hasTurns ? (
        <SceneHero
          eyebrow={locale === "ko" ? "06. 세컨비 대화" : "06. SecondB chat"}
          title={isCharacterChat ? persona.name[locale] : t("title")}
          subtitle={isCharacterChat ? persona.role[locale] : t("subtitle")}
          island={chatUi.island}
          worker={chatUi.worker}
          accent={chatUi.accent}
          speech={
            sending
              ? locale === "ko"
                ? "참고한 조각들을 읽어오는 중이에요."
                : "I'm reading the pieces that matter."
              : chatMode === "divergent"
                ? locale === "ko"
                  ? "새 관점으로 낯선 가정을 짚어볼게요."
                  : "A new angle is checking a different assumption."
              : locale === "ko"
                ? "오늘의 기록을 읽어봤어요. 작은 한 걸음으로 시작해볼까요?"
                : "I've read today's pieces. Shall we start with one small step?"
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
            accessibilityLabel={locale === "ko" ? "분석 모드" : "Analysis mode"}
          >
            <Text variant="caption" color={chatMode === "analytic" ? "background" : "textMuted"}>
              {locale === "ko" ? "분석" : "Analysis"}
            </Text>
          </Pressable>
            <Pressable
              onPress={() => setChatMode("divergent")}
              style={[styles.modeChip, chatMode === "divergent" ? styles.modeChipDivergent : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: chatMode === "divergent" }}
            accessibilityLabel={locale === "ko" ? "새 관점 모드" : "New angle mode"}
          >
            <Text variant="caption" color={chatMode === "divergent" ? "text" : "textMuted"}>
              {locale === "ko" ? "새 관점" : "New angle"}
            </Text>
          </Pressable>
          {chatMode === "divergent" ? (
            <>
              <Animated.View style={[styles.divergentPulseDot, { opacity: divergentPulse as never }]} />
              <Text variant="caption" color="textSubtle" style={styles.modeHint} numberOfLines={1}>
                {locale === "ko" ? "새로운 관점·가정으로" : "New perspectives & what-ifs"}
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
                  label={locale === "ko" ? "대화할 준비가 된 세컨비" : "SecondB ready to chat"}
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
                        ? locale === "ko"
                          ? "내 메시지"
                          : "Your message"
                        : locale === "ko"
                          ? "세컨비 답변"
                          : "SecondB answer"
                    }
                    accessibilityHint={
                      locale === "ko" ? "길게 눌러 메시지를 복사합니다" : "Long press to copy this message"
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
                  {/* Grounding strip — "이 답변은 참고한 조각 N개를 봤어요"; tap to
                      open the reference drawer (chat pack §5/§6). */}
                  {turn.role === "secondb" && turn.chips && turn.chips.length > 0 ? (
                    <Pressable
                      style={styles.chipRow}
                      onPress={() => setRefDrawer(turn.chips ?? [])}
                      accessibilityRole="button"
                      accessibilityLabel={
                        locale === "ko"
                          ? `이 답변은 참고한 조각 ${turn.chips.length}개를 봤어요. 눌러서 자세히 보기.`
                          : `This answer drew on ${turn.chips.length} of your pieces. Tap for detail.`
                      }
                    >
                      <Text variant="caption" color="textSubtle">
                        {locale === "ko" ? `참고한 조각 ${turn.chips.length}` : `${turn.chips.length} pieces`}
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
                  setDraft(locale === "ko" ? qa.prompt.ko : qa.prompt.en);
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
          accessibilityLabel={locale === "ko" ? "인사 모달 닫기" : "Close intro"}
          accessibilityHint={locale === "ko" ? "세컨비 인사 모달을 닫습니다" : "Dismisses the intro modal"}
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
            <Text variant="body" color="text" style={{ marginTop: spacing.sm, lineHeight: 20 }}>
              {t("intro_body")}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => { writeIntroDismissed("today"); setIntroOpen(false); }}
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={t("intro_mute")}
              >
                <Text variant="body" color="textMuted">{t("intro_mute")}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setIntroOpen(false); }}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                hitSlop={4}
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
          accessibilityLabel={locale === "ko" ? "참고 조각 닫기" : "Close referenced pieces"}
          accessibilityHint={locale === "ko" ? "참고 조각 서랍을 닫습니다" : "Dismisses the referenced pieces drawer"}
        >
          <Pressable
            style={styles.drawer}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
            accessibilityLabel={locale === "ko" ? "참고한 조각들" : "Pieces referenced"}
          >
            <View style={styles.drawerHandle} />
            <Text variant="heading">{locale === "ko" ? "참고한 조각들" : "Pieces referenced"}</Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 4 }}>
              {locale === "ko"
                ? "답변에 영향을 준 조각들이에요. 필요하면 하나씩 열어볼 수 있어요."
                : "The pieces that shaped this answer. Open any one if you like."}
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
                <ReferenceShardCard key={slug} title={formatSourceCitationLabel(slug)} meta={t("reference_piece_meta")} />
              ))}
            </ScrollView>
            <Button
              label={locale === "ko" ? "닫기" : "Close"}
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
  modeHint: { flex: 1, minWidth: 0, marginLeft: spacing.xs },
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
