// "오늘의 정리" — the pull-style daily review (D-25 Phase 3, morning-brief PULL
// version; the push/scheduler version is deferred per the D-25 debate, so this
// runs ON OPEN only, never on a timer, and never claims a notification it cannot
// send). It surfaces the propose->ratify links the system gathered from your
// records so you confirm what is true. No LLM call here: it only reads the
// already-stored inferred links and writes the user's verdict.

import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { deepSpace, deepSpaceSpacing, deepSpaceRadii } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { InlineLoader } from "@/components/ui/InlineLoader";
import {
  listInferredLinkDetails,
  ratifyLink,
  rejectInferredLink,
  type InferredLinkDetail,
} from "@/lib/wiki/queries";

function bandLabel(confidence: number, ko: boolean): string {
  if (confidence >= 0.6) return ko ? "강한 연결" : "strong link";
  if (confidence >= 0.4) return ko ? "그럴듯한 연결" : "likely link";
  return ko ? "약한 연결" : "weak link";
}

export default function Digest() {
  const { userId, loading } = useAuth();
  const { i18n } = useTranslation();
  const ko = i18n.language === "ko";
  const [items, setItems] = useState<InferredLinkDetail[] | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const rows = await listInferredLinkDetails(userId).catch(() => [] as InferredLinkDetail[]);
    setItems(rows);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = useCallback(
    async (p: InferredLinkDetail, confirm: boolean) => {
      if (!userId) return;
      const key = `${p.from_page}|${p.to_page}`;
      setActingKey(key);
      try {
        if (confirm) await ratifyLink(userId, p.from_page, p.to_page);
        else await rejectInferredLink(userId, p.from_page, p.to_page);
        await refresh();
      } catch {
        // best-effort; the row stays for a retry
      } finally {
        setActingKey(null);
      }
    },
    [userId, refresh],
  );

  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <SecondbHead size={48} mood="positive" />
          <View style={styles.flex}>
            <Text variant="heading">{ko ? "오늘의 정리" : "Today's review"}</Text>
            <Text variant="subtle" color="textMuted" style={styles.intro}>
              {ko
                ? "기록에서 모인 연결 제안이에요. 무엇이 맞는지 당신이 확인하세요."
                : "Connections gathered from your records. You confirm what's true."}
            </Text>
          </View>
        </View>

        {items === null ? (
          <InlineLoader />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body" color="textMuted" style={styles.center}>
              {ko
                ? "지금 검토할 제안이 없어요. 더 담으면 연결이 보이기 시작해요."
                : "Nothing to review yet. Capture more and connections will appear."}
            </Text>
            <Pressable
              onPress={() => router.push("/capture")}
              accessibilityRole="button"
              accessibilityLabel={ko ? "담으러 가기" : "Go capture"}
              style={styles.cta}
            >
              <Text variant="body" style={styles.ctaText}>{ko ? "담으러 가기" : "Go capture"}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text variant="caption" color="textSubtle">
              {ko ? `검토할 제안 ${items.length}개` : `${items.length} to review`}
            </Text>
            {items.map((p) => {
              const key = `${p.from_page}|${p.to_page}`;
              const busy = actingKey === key;
              return (
                <View key={key} style={styles.row}>
                  <Text variant="body" numberOfLines={2}>
                    {p.from_title} <Text variant="body" color="textMuted">↔</Text> {p.to_title}
                  </Text>
                  <Text variant="subtle" color="textMuted" style={styles.band}>
                    {bandLabel(p.confidence, ko)}
                  </Text>
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => void decide(p, false)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={ko ? "보류" : "Dismiss"}
                      style={[styles.btn, styles.btnGhost]}
                    >
                      <Text variant="caption" style={styles.btnGhostText}>{ko ? "보류" : "Dismiss"}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void decide(p, true)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={ko ? "확인" : "Confirm"}
                      style={[styles.btn, styles.btnPrimary]}
                    >
                      <Text variant="caption" style={styles.btnPrimaryText}>{ko ? "확인" : "Confirm"}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: deepSpace.bg },
  flex: { flex: 1 },
  body: { padding: deepSpaceSpacing.lg, gap: deepSpaceSpacing.md },
  header: { flexDirection: "row", gap: deepSpaceSpacing.sm, alignItems: "flex-start" },
  intro: { marginTop: 4 },
  center: { textAlign: "center" },
  empty: { gap: deepSpaceSpacing.md, alignItems: "center", paddingVertical: deepSpaceSpacing.lg },
  row: {
    backgroundColor: deepSpace.card,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
    padding: deepSpaceSpacing.md,
    gap: 6,
  },
  band: {},
  actions: { flexDirection: "row", gap: deepSpaceSpacing.sm, justifyContent: "flex-end", marginTop: 4 },
  btn: { minHeight: 44, paddingHorizontal: deepSpaceSpacing.md, borderRadius: deepSpaceRadii.md, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: deepSpace.cardLine },
  btnGhostText: { color: deepSpace.textMid },
  btnPrimary: { backgroundColor: deepSpace.accent },
  btnPrimaryText: { color: deepSpace.bg },
  cta: { minHeight: 44, paddingHorizontal: deepSpaceSpacing.lg, borderRadius: deepSpaceRadii.md, borderWidth: 1, borderColor: deepSpace.accentSoft, alignItems: "center", justifyContent: "center" },
  ctaText: { color: deepSpace.accentSoft },
});
