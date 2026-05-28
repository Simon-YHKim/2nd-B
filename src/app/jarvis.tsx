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
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppNav } from "@/components/ui/AppNav";
import { useProgression } from "@/lib/progression/useProgression";
import { sendChatMessage } from "@/lib/chat/conversation";
import { readChatUsage } from "@/lib/chat/usage";
import { CHAT_DAILY_LIMIT } from "@/lib/chat/limits";

interface ChatTurn {
  role: "user" | "jarvis";
  text: string;
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

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [usedToday, setUsedToday] = useState<number | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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
      } else {
        setTurns((prev) => [...prev, { role: "jarvis", text: result.reply.text }]);
        setUsedToday(result.used);
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
            <Text variant="heading">{t("title")}</Text>
            <Text variant="subtle" color="textMuted">
              {t("subtitle")}
            </Text>
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

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {turns.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
                {t("empty")}
              </Text>
            </View>
          ) : (
            turns.map((turn, i) => (
              <View
                key={i}
                style={[styles.bubbleRow, turn.role === "user" ? styles.userRow : styles.jarvisRow]}
              >
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
              </View>
            ))
          )}
          {sending ? (
            <View style={styles.thinking}>
              <ActivityIndicator color={semantic.brand} />
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder={t("placeholder")}
            multiline
            style={styles.composerInput}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomColor: semantic.border,
    borderBottomWidth: 1,
  },
  headerLeft: { flex: 1 },
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
  bubble: {
    maxWidth: "85%",
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
