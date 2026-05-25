import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, Link } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import { createRecord, listRecentRecords } from "@/lib/records/create";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import type { HotlineId } from "@/lib/safety/lexicon";

interface RecordRow {
  id: string;
  kind: "journal" | "note" | "audit_response";
  body: string;
  ai_followup: { text: string; zone: "green" | "yellow" | "red" } | null;
  created_at: string;
}

export default function Journal() {
  const { t, i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [followup, setFollowup] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecordRow[]>([]);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  useEffect(() => {
    if (!userId) return;
    void refresh(userId);
  }, [userId]);

  async function refresh(uid: string): Promise<void> {
    try {
      const rows = await listRecentRecords(uid);
      setRecent(rows as RecordRow[]);
    } catch (e) {
      console.warn("Failed to load records", e);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!userId || !body.trim()) return;
    setSubmitting(true);
    setFollowup(null);
    try {
      const res = await createRecord({
        userId,
        locale,
        kind: "journal",
        body: body.trim(),
      });
      if (res.followup) {
        setFollowup(res.followup.text);
        if (res.followup.zone === "red") {
          setCrisis({ visible: true, hotline: locale === "ko" ? "KR_1393" : "GLOBAL_988" });
        }
      }
      setBody("");
      await refresh(userId);
    } catch (e) {
      Alert.alert("Save failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
      router.replace("/");
    } catch (e) {
      Alert.alert("Sign-out failed", (e as Error).message);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </Screen>
    );
  }

  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View>
            <Text variant="caption" color="brand">2nd-Brain</Text>
            <Text variant="heading">{t("app.name")}</Text>
          </View>
          <Button label="Sign out" variant="secondary" onPress={handleSignOut} />
        </View>

        <View style={styles.navRow}>
          <Link href="/audit" asChild>
            <Button
              label={locale === "ko" ? "라이프 오딧" : "Life audit"}
              variant="secondary"
            />
          </Link>
          <Link href="/persona" asChild>
            <Button
              label={locale === "ko" ? "페르소나 v1" : "Persona v1"}
              variant="secondary"
            />
          </Link>
        </View>

        <View style={styles.composer}>
          <Text variant="caption" color="textMuted">
            {locale === "ko" ? "오늘의 기록" : "Today's entry"}
          </Text>
          <Input
            value={body}
            onChangeText={setBody}
            placeholder={
              locale === "ko"
                ? "오늘 떠오른 생각이나 느낌을 적어주세요."
                : "What's on your mind today?"
            }
            multiline
            numberOfLines={6}
            style={styles.textarea}
          />
          <Button
            label={locale === "ko" ? "기록하기" : "Save"}
            variant="primary"
            onPress={handleSubmit}
            disabled={!body.trim() || submitting}
            loading={submitting}
          />
          {followup ? (
            <View style={styles.followupCard}>
              <Text variant="subtle" color="brand">
                {locale === "ko" ? "AI 후속 질문" : "AI follow-up"}
              </Text>
              <Text variant="body">{followup}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.recentList}>
          <Text variant="caption" color="textMuted">
            {locale === "ko" ? "최근 기록" : "Recent entries"}
          </Text>
          {recent.length === 0 ? (
            <Text variant="subtle" color="textSubtle">
              {locale === "ko" ? "아직 기록이 없어요." : "No entries yet."}
            </Text>
          ) : (
            recent.map((r) => (
              <View key={r.id} style={styles.recordCard}>
                <Text variant="subtle" color="textSubtle">
                  {new Date(r.created_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}
                </Text>
                <Text variant="body" style={{ marginTop: spacing.xs }}>{r.body}</Text>
                {r.ai_followup ? (
                  <Text variant="subtle" color="brand" style={{ marginTop: spacing.xs }}>
                    → {r.ai_followup.text}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <CrisisRouter
        visible={crisis.visible}
        hotline={crisis.hotline}
        onClose={() => setCrisis({ ...crisis, visible: false })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navRow: { flexDirection: "row", gap: spacing.sm },
  composer: { gap: spacing.sm },
  textarea: { minHeight: 120, textAlignVertical: "top", paddingTop: spacing.md },
  followupCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    borderColor: semantic.border,
    borderWidth: 1,
    gap: spacing.xs,
  },
  recentList: { gap: spacing.sm },
  recordCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
});
