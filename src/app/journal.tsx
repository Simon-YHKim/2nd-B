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
import {
  createRecord,
  listRecentRecords,
  type RecordedEvidence,
} from "@/lib/records/create";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import type { HotlineId } from "@/lib/safety/lexicon";

type FollowupZone = "green" | "yellow" | "red";

interface StoredFollowup {
  text: string;
  zone: FollowupZone;
  fixedTemplate?: boolean;
  matchedBatches?: string[];
  evidence?: RecordedEvidence[];
}

interface RecordRow {
  id: string;
  kind: "journal" | "note" | "audit_response";
  body: string;
  ai_followup: StoredFollowup | null;
  created_at: string;
}

export default function Journal() {
  const { t, i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastFollowup, setLastFollowup] = useState<StoredFollowup | null>(null);
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
    setLastFollowup(null);
    try {
      const res = await createRecord({
        userId,
        locale,
        kind: "journal",
        body: body.trim(),
      });
      if (res.followup) {
        setLastFollowup(res.followup);
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
            <Button label={locale === "ko" ? "라이프 오딧" : "Life audit"} variant="secondary" />
          </Link>
          <Link href="/persona" asChild>
            <Button label={locale === "ko" ? "페르소나 v1" : "Persona v1"} variant="secondary" />
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
          {lastFollowup ? <FollowupCard followup={lastFollowup} locale={locale} /> : null}
        </View>

        <View style={styles.recentList}>
          <Text variant="caption" color="textMuted">
            {locale === "ko" ? "최근 기록" : "Recent entries"}
          </Text>
          {recent.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text variant="subtle" color="brand" style={{ letterSpacing: 1.2 }}>
                {locale === "ko" ? "여기서 시작" : "START HERE"}
              </Text>
              <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm }}>
                {locale === "ko"
                  ? "한 줄이라도 좋아요. 며칠 쌓이면 패턴이 보이기 시작합니다."
                  : "One sentence is enough. Patterns show up after a few days."}
              </Text>
            </View>
          ) : (
            recent.map((r) => (
              <View key={r.id} style={styles.recordCard}>
                <Text variant="subtle" color="textSubtle">
                  {new Date(r.created_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}
                </Text>
                <Text variant="body" style={{ marginTop: spacing.xs }}>{r.body}</Text>
                {r.ai_followup ? <FollowupCard followup={r.ai_followup} locale={locale} compact /> : null}
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

function FollowupCard({
  followup,
  locale,
  compact,
}: {
  followup: StoredFollowup;
  locale: "en" | "ko";
  compact?: boolean;
}) {
  const zoneColor =
    followup.zone === "red" ? semantic.zoneRed : followup.zone === "yellow" ? semantic.zoneYellow : semantic.brand;
  const label =
    followup.zone === "red"
      ? locale === "ko"
        ? "안전 안내"
        : "Safety notice"
      : followup.zone === "yellow"
        ? locale === "ko"
          ? "AI · 들어주기 모드"
          : "AI · listening mode"
        : locale === "ko"
          ? "AI 어드바이저"
          : "AI Advisor";

  return (
    <View style={[compact ? styles.followupCompact : styles.followupCard, { borderLeftColor: zoneColor }]}>
      <Text variant="subtle" style={{ color: zoneColor, fontWeight: "700" }}>
        {label}
      </Text>
      <Text variant="body" style={{ marginTop: spacing.xs }}>{followup.text}</Text>

      {followup.matchedBatches && followup.matchedBatches.length > 0 ? (
        <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.sm }}>
          {locale === "ko" ? "근거 프레임" : "Frameworks"}: {followup.matchedBatches.join(" · ")}
        </Text>
      ) : null}

      {followup.evidence && followup.evidence.length > 0 ? (
        <View style={styles.evidenceList}>
          <Text variant="subtle" color="textSubtle">
            {locale === "ko" ? "참고 문헌" : "Cited research"}
          </Text>
          {followup.evidence.map((e, i) => (
            <View key={i} style={styles.evidenceRow}>
              <Text variant="subtle" color="textMuted">• {e.title}</Text>
              {e.doi ? (
                <Text variant="subtle" color="textSubtle">DOI {e.doi}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
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
    borderLeftWidth: 3,
    gap: spacing.xs,
  },
  followupCompact: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderColor: semantic.border,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  evidenceList: { marginTop: spacing.sm, gap: spacing.xs },
  evidenceRow: { gap: 2 },
  recentList: { gap: spacing.sm },
  emptyCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
  },
  recordCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
});
