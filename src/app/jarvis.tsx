// 세컨비 chat screen (formerly "Jarvis"). Per handoff v3 §4.B —
// preview of how RAG transforms the experience. Calls into the single
// Gemini wrapper (so C1/C3/C9 hold) and pulls a compact wiki snapshot
// as system context.
//
// State lives in component-local memory; no chat-history persistence in v1.
// The chat_usage daily counter (server-side) is the persistent surface.
//
// 2026-05-27 (user directive):
//   - Renamed Jarvis → "세컨비" / "2ndB" (locale-routed via jarvis.json).
//   - "What I'm good at" card moved out of the chat panel into a
//     one-time intro modal with [알았어요 / 오늘은 그만 볼래요]
//     buttons. The modal is dismissed via localStorage so it doesn't
//     reappear every session.

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import { SvgXml } from "react-native-svg";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppNav } from "@/components/ui/AppNav";
import { useProgression } from "@/lib/progression/useProgression";
import { sendChatMessage } from "@/lib/chat/conversation";
import { parseSourceCitations } from "@/lib/chat/sources";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { SECONDB_CHAT_XML } from "@/components/art/secondbChatXml";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { readChatUsage } from "@/lib/chat/usage";
import { CHAT_DAILY_LIMIT } from "@/lib/chat/limits";

// Quick-action chips offered under an answer (chat pack §8). Each prefills
// the composer with a short follow-up in the village voice; the user sends.
const QUICK_ACTIONS: { ko: string; en: string; prompt: { ko: string; en: string } }[] = [
  { ko: "다음 한 걸음", en: "Next step", prompt: { ko: "지금 할 수 있는 다음 한 걸음으로 줄여줘.", en: "Narrow this to one next step I can take today." } },
  { ko: "공상으로 펼치기", en: "Open as imagine", prompt: { ko: "이 생각을 장면으로 펼쳐서 보여줘.", en: "Unfold this thought into a few scenes." } },
  { ko: "지식 창고에 저장", en: "Save to wiki", prompt: { ko: "이 답을 지식 창고에 저장할 수 있게 한 단락으로 정리해줘.", en: "Sum this up in one paragraph I can save to my wiki." } },
  { ko: "왜 이렇게 봤어?", en: "Why this?", prompt: { ko: "왜 그렇게 봤는지 참고한 조각을 들어 설명해줘.", en: "Explain why you saw it that way, citing the pieces you used." } },
  { ko: "다시 짧게", en: "Shorter", prompt: { ko: "더 짧게 한 문장으로 말해줘.", en: "Say that again, shorter — one sentence." } },
];

interface ChatTurn {
  role: "user" | "jarvis";
  text: string;
  /** Slugs the reply cited — rendered as small source chips. */
  chips?: string[];
}

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

export default function Jarvis() {
  const { t, i18n } = useTranslation("jarvis");
  const { userId, loading: authLoading } = useAuth();
  const progression = useProgression();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  // nodeContext entry (chat pack §3/§7): a graph node passed its label.
  const params = useLocalSearchParams<{ fromNode?: string }>();
  const fromNode = typeof params.fromNode === "string" && params.fromNode.length > 0 ? params.fromNode : null;

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [usedToday, setUsedToday] = useState<number | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  // Reference drawer (chat pack §6): the cited pieces of a tapped answer.
  const [refDrawer, setRefDrawer] = useState<string[] | null>(null);
  const companion = useCompanionMoment();
  // Tracks whether the last turn was safety-blocked, so 가디 can give the
  // "clear" beat the first time the conversation flows freely again.
  const wasBlockedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // Seed the composer with the node context once, on a graph-node entry.
  const seededRef = useRef(false);
  useEffect(() => {
    if (fromNode && !seededRef.current) {
      seededRef.current = true;
      setDraft(locale === "ko" ? `'${fromNode}'에 대해 물어볼게요: ` : `About '${fromNode}': `);
    }
  }, [fromNode, locale]);

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
        if (typeof console !== "undefined") console.warn("[jarvis] readChatUsage failed", (e as Error).message);
        setUsedToday(0);
      });
  }, [userId]);

  useEffect(() => {
    // Scroll to bottom after each new turn.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [turns]);

  if (authLoading || progression.loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  async function handleSend(): Promise<void> {
    if (!userId) return;
    const msg = draft.trim();
    if (msg.length === 0) return;
    setSending(true);
    setTurns((prev) => [...prev, { role: "user", text: msg }]);
    setDraft("");
    try {
      const result = await sendChatMessage({ userId, message: msg, locale, tier: progression.tier });
      if (result.status === "blocked") {
        setTurns((prev) => [...prev, { role: "jarvis", text: result.hint }]);
        setUsedToday(result.used);
        // 가디 steps in with a soft stop (companion pack §3 / C9).
        companion.fire("safetySoftStop");
        wasBlockedRef.current = true;
      } else {
        const { display, chips } = parseSourceCitations(result.reply.text);
        setTurns((prev) => [...prev, { role: "jarvis", text: display, chips }]);
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
      setTurns((prev) => [...prev, { role: "jarvis", text: msg }]);
      if (typeof console !== "undefined") console.warn("[jarvis] sendChatMessage error", (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const canSend = draft.trim().length > 0 && !sending;
  const usedDisplay = usedToday === null ? "—" : String(usedToday);

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* 세컨비 — chat presence; thinks while a reply is generating. */}
            <SecondBSprite state={sending ? "thinking" : "chat"} size={44} float />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{t("title")}</Text>
              <Text variant="subtle" color="textMuted">
                {t("subtitle")}
              </Text>
            </View>
          </View>
          <View style={styles.meter}>
            <Text variant="caption" color="textMuted">
              {locale === "ko" ? "오늘" : "Today"}
            </Text>
            <Text
              variant="body"
              color={usedToday !== null && usedToday >= limit ? "danger" : usedToday !== null && limit - usedToday <= 2 ? "warning" : "textMuted"}
            >
              {usedDisplay} / {limit}
            </Text>
            {turns.length > 0 ? (
              <Pressable onPress={() => setTurns([])} hitSlop={4} style={{ marginTop: spacing.xs }}>
                <Text variant="caption" color="brand">
                  {locale === "ko" ? "대화 비우기" : "Clear chat"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* nodeContext pill — entered from a graph node (chat pack §7) */}
        {fromNode ? (
          <View
            style={styles.contextPill}
            accessible
            accessibilityLabel={
              locale === "ko"
                ? `${fromNode}에서 질문. 선택한 노드와 연결된 조각을 먼저 참고해요.`
                : `Asking from ${fromNode}. I'll look at the pieces connected to it first.`
            }
          >
            <Text variant="caption" color="brand" style={{ letterSpacing: 0.5 }}>
              {locale === "ko" ? `${fromNode}에서 질문` : `Asking from ${fromNode}`}
            </Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 2 }}>
              {locale === "ko"
                ? "선택한 노드와 연결된 조각을 먼저 참고해요."
                : "I'll look at the pieces connected to it first."}
            </Text>
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {turns.length === 0 ? (
            <View style={styles.empty}>
              <SvgXml xml={SECONDB_CHAT_XML.empty_state} width={260} height={(260 * 260) / 350} />
              <Text variant="body" color="textMuted" style={{ textAlign: "center", marginTop: spacing.md }}>
                {t("empty")}
              </Text>
            </View>
          ) : (
            turns.map((turn, i) => (
              <View
                key={i}
                style={[styles.bubbleRow, turn.role === "user" ? styles.userRow : styles.jarvisRow]}
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
                      turn.role === "user" ? styles.userBubble : styles.jarvisBubble,
                    ]}
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
                  {turn.role === "jarvis" && turn.chips && turn.chips.length > 0 ? (
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
                          <Text variant="caption" color="brand">{slug}</Text>
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
        {turns.length > 0 && turns[turns.length - 1].role === "jarvis" && !sending ? (
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
                onPress={() => setDraft(locale === "ko" ? qa.prompt.ko : qa.prompt.en)}
                accessibilityRole="button"
                accessibilityLabel={locale === "ko" ? qa.ko : qa.en}
              >
                <Text variant="caption" color="brand">{locale === "ko" ? qa.ko : qa.en}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.composer}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder={t("placeholder")}
            multiline
            style={styles.composerInput}
            accessibilityLabel={locale === "ko" ? "세컨비에게 물어보기" : "Ask SecondB"}
          />
          <Button label={t("send")} variant="primary" onPress={handleSend} disabled={!canSend} loading={sending} />
        </View>
        <AppNav locale={locale} />
      </KeyboardAvoidingView>

      {/* 첫 진입 인사 모달 — 알았어요 / 오늘은 그만 볼래요 */}
      <Modal visible={introOpen} transparent animationType="fade" onRequestClose={() => setIntroOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setIntroOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 1 }}>
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
              >
                <Text variant="body" color="textMuted">{t("intro_mute")}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setIntroOpen(false); }}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                hitSlop={4}
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
        <Pressable style={styles.modalBackdrop} onPress={() => setRefDrawer(null)}>
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
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {(refDrawer ?? []).map((slug) => (
                <View key={slug} style={styles.refRow}>
                  <View style={styles.refDot} />
                  <Text variant="body" style={{ flex: 1 }} selectable>{slug}</Text>
                </View>
              ))}
            </View>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  companionFlash: { position: "absolute", bottom: 90, right: 20 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomColor: semantic.border,
    borderBottomWidth: 1,
  },
  headerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meter: { alignItems: "flex-end", gap: 2 },
  scroll: { paddingVertical: spacing.md, gap: spacing.sm },
  empty: { paddingVertical: spacing.xl, alignItems: "center", gap: spacing.md },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8, 12, 24, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    maxWidth: 420,
    width: "100%",
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  modalBtnPrimary: { backgroundColor: semantic.brand },
  modalBtnSecondary: { backgroundColor: "transparent" },
  bubbleRow: { flexDirection: "row" },
  userRow: { justifyContent: "flex-end" },
  jarvisRow: { justifyContent: "flex-start" },
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
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  contextPill: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
    backgroundColor: semantic.surface,
  },
  quickRow: { gap: spacing.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  quickChip: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  drawer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "62%",
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderColor: semantic.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  drawerHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: semantic.border,
    marginBottom: spacing.sm,
  },
  refRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  refDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
  bubble: {
    maxWidth: "100%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: semantic.brand,
    borderColor: semantic.brand,
  },
  jarvisBubble: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
  },
  thinking: { paddingVertical: spacing.md, alignItems: "center" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
  },
  composerInput: { flex: 1, maxHeight: 120 },
});
