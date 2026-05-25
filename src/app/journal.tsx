import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, Link } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import { XpBar } from "@/components/progression/XpBar";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import {
  createRecord,
  listRecentRecords,
  countRecordsByKind,
  type RecordedEvidence,
} from "@/lib/records/create";
import { useProgression } from "@/lib/progression/useProgression";
import { checkGate } from "@/lib/progression/gates";
import { checkUsage } from "@/lib/progression/entitlements";
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
  const progression = useProgression();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastFollowup, setLastFollowup] = useState<StoredFollowup | null>(null);
  const [recent, setRecent] = useState<RecordRow[]>([]);
  const [journalCount, setJournalCount] = useState(0);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  // Progression gates: journal unlocks at Lv3, then free tier allows 2 entries.
  const gate = checkGate("journal", progression.totalXp);
  const usage = checkUsage("journal", progression.tier, journalCount);

  useEffect(() => {
    if (!userId) return;
    void refresh(userId);
  }, [userId]);

  async function refresh(uid: string): Promise<void> {
    try {
      const [rows, jc] = await Promise.all([
        listRecentRecords(uid),
        countRecordsByKind(uid, "journal"),
      ]);
      setRecent(rows as RecordRow[]);
      setJournalCount(jc);
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
      // Capture earned XP — refresh the level bar.
      void progression.refresh();
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
          <Button label={t("actions.signOut")} variant="secondary" onPress={handleSignOut} />
        </View>

        {/* Quest progression — level + XP toward the next unlock. */}
        {progression.loading ? null : <XpBar progress={progression.progress} locale={locale} />}

        <View style={styles.navRow}>
          <Link href="/capture" asChild>
            <Button label={locale === "ko" ? "캡처" : "Capture"} variant="secondary" />
          </Link>
          <Link href="/inbox" asChild>
            <Button label={locale === "ko" ? "받은편지함" : "Inbox"} variant="secondary" />
          </Link>
          <Link href="/jarvis" asChild>
            <Button label={locale === "ko" ? "자비스" : "Jarvis"} variant="secondary" />
          </Link>
          <Link href="/audit" asChild>
            <Button label={locale === "ko" ? "라이프 오딧" : "Life audit"} variant="secondary" />
          </Link>
          <Link href="/persona" asChild>
            <Button label={locale === "ko" ? "페르소나 v1" : "Persona v1"} variant="secondary" />
          </Link>
        </View>

        {/* Composer — gated by level (Lv3) then by the free-tier 2-use limit. */}
        {progression.loading ? (
          <View style={styles.gateCard}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : !gate.unlocked ? (
          <View style={styles.gateCard}>
            <Text variant="subtle" color="brand" style={styles.gateEyebrow}>
              {locale === "ko" ? "일기 잠김" : "Journal locked"}
            </Text>
            <Text variant="body" style={{ marginTop: spacing.xs }}>
              {locale === "ko"
                ? `입문 퀘스트(라이프 오딧)를 완료하면 Lv${gate.requiredLevel}에 도달하고 일기가 열려요.`
                : `Finish the onboarding quest (life audit) to reach Lv${gate.requiredLevel} and unlock the journal.`}
            </Text>
            <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
              {locale === "ko"
                ? `현재 Lv${gate.currentLevel} → Lv${gate.requiredLevel} 필요`
                : `Currently Lv${gate.currentLevel} → Lv${gate.requiredLevel} required`}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Link href="/audit" asChild>
                <Button
                  label={locale === "ko" ? "라이프 오딧 시작하기" : "Start the life audit"}
                  variant="primary"
                />
              </Link>
            </View>
          </View>
        ) : !usage.allowed ? (
          <View style={styles.limitCard}>
            <Text variant="subtle" color="warning" style={styles.gateEyebrow}>
              {locale === "ko" ? "무료 한도 도달" : "Free limit reached"}
            </Text>
            <Text variant="body" style={{ marginTop: spacing.xs }}>
              {locale === "ko"
                ? `무료 일기 ${usage.limit}회를 모두 사용했어요. Soma 구독부터 일기를 무제한으로 쓸 수 있어요.`
                : `You have used all ${usage.limit} free journal entries. The Soma plan and up unlock unlimited journaling.`}
            </Text>
            <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
              {locale === "ko" ? "구독 화면은 곧 추가됩니다." : "The subscription screen is coming soon."}
            </Text>
          </View>
        ) : (
          <View style={styles.composer}>
            <View style={styles.composerHeadRow}>
              <Text variant="caption" color="textMuted">
                {locale === "ko" ? "오늘의 기록" : "Today's entry"}
              </Text>
              {!usage.unlimited && usage.remaining !== null ? (
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko"
                    ? `무료 ${usage.remaining}회 남음`
                    : `${usage.remaining} free left`}
                </Text>
              ) : null}
            </View>
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
            <Text variant="subtle" color="textSubtle" style={styles.privacyFootnote}>
              {t("journal.privacyFootnote")}
            </Text>
            {lastFollowup ? <FollowupCard followup={lastFollowup} locale={locale} /> : null}
          </View>
        )}

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
            recent.map((r) => <RecentEntry key={r.id} record={r} locale={locale} t={t} />)
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

// Recent entry: collapses long bodies behind a tap to keep the scan fast.
// Threshold (240 chars) ≈ a half-screen on most phones in body type size.
const PREVIEW_CHARS = 240;
function RecentEntry({
  record,
  locale,
  t,
}: {
  record: RecordRow;
  locale: "en" | "ko";
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = record.body.length > PREVIEW_CHARS;
  const body = expanded || !isLong ? record.body : record.body.slice(0, PREVIEW_CHARS).trimEnd() + "…";
  const toggleLabel = expanded
    ? locale === "ko" ? "접기" : "Show less"
    : locale === "ko" ? "더 보기" : "Show more";
  return (
    <View style={styles.recordCard}>
      <Text variant="subtle" color="textSubtle">
        {formatRelative(record.created_at, locale, t)}
      </Text>
      <Text variant="body" style={{ marginTop: spacing.xs }}>{body}</Text>
      {isLong ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8} style={styles.showMoreBtn}>
          <Text variant="subtle" color="brand">{toggleLabel}</Text>
        </Pressable>
      ) : null}
      {record.ai_followup ? <FollowupCard followup={record.ai_followup} locale={locale} compact /> : null}
    </View>
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
      <View style={styles.zoneLabelRow}>
        <View style={[styles.zoneDot, { backgroundColor: zoneColor }]} />
        <Text variant="subtle" style={{ color: zoneColor, fontWeight: "700", letterSpacing: 0.4 }}>
          {label}
        </Text>
      </View>
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

// Format an ISO timestamp as a short, locale-aware relative string. Falls
// through to the full date once the entry is more than ~24h old, so older
// records stay scannable without scrolling.
function formatRelative(iso: string, locale: "en" | "ko", t: (k: string, opts?: Record<string, unknown>) => string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return t("journal.relativeJustNow");
  if (diffSec < 3600) return t("journal.relativeMinutes", { n: Math.floor(diffSec / 60) });
  if (diffSec < 86400) return t("journal.relativeHours", { n: Math.floor(diffSec / 3600) });
  if (diffSec < 172800) return t("journal.relativeYesterday");
  return new Date(iso).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  privacyFootnote: { marginTop: spacing.xs, fontStyle: "italic" },
  zoneLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  showMoreBtn: { marginTop: spacing.xs, alignSelf: "flex-start", paddingVertical: 2 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navRow: { flexDirection: "row", gap: spacing.sm },
  composer: { gap: spacing.sm },
  composerHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  textarea: { minHeight: 120, textAlignVertical: "top", paddingTop: spacing.md },
  gateEyebrow: { fontWeight: "700", letterSpacing: 1 },
  gateCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  limitCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.warning,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: semantic.warning,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
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
