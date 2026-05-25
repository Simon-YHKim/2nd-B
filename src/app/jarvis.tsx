// Jarvis chat screen. Per handoff v3 §4.B — preview of how RAG transforms
// the experience. Calls into the single Gemini wrapper (so C1/C3/C9 hold)
// and pulls a compact wiki snapshot as system context.
//
// State lives in component-local memory; no chat-history persistence in v1.
// The chat_usage daily counter (server-side) is the persistent surface.

import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { sendChatMessage } from "@/lib/chat/conversation";
import { readChatUsage } from "@/lib/chat/usage";
import { CHAT_DAILY_LIMIT } from "@/lib/chat/limits";

interface ChatTurn {
  role: "user" | "jarvis";
  text: string;
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
  const scrollRef = useRef<ScrollView>(null);

  const limit = useMemo(() => CHAT_DAILY_LIMIT[progression.tier], [progression.tier]);

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
            <Pressable onPress={() => router.replace("/journal")} hitSlop={6}>
              <Text variant="caption" color="brand">
                ← 2nd-Brain
              </Text>
            </Pressable>
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
              <Text variant="body" color="textMuted">
                {t("empty")}
              </Text>
            </View>
          ) : (
            turns.map((turn, i) => (
              <View
                key={i}
                style={[styles.bubbleRow, turn.role === "user" ? styles.userRow : styles.jarvisRow]}
              >
                <View
                  style={[
                    styles.bubble,
                    turn.role === "user" ? styles.userBubble : styles.jarvisBubble,
                  ]}
                >
                  <Text variant="body" color={turn.role === "user" ? "background" : "text"}>
                    {turn.text}
                  </Text>
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
      </KeyboardAvoidingView>
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
  empty: { paddingVertical: spacing.xl, alignItems: "center" },
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
