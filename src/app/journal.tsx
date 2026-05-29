import { useEffect, useMemo, useState } from "react";
import { Animated, View, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable } from "react-native";
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
import { dailyPrompt } from "@/lib/journal/daily-prompts";
import { computeStreak } from "@/lib/journal/streak";
import { notify } from "@/lib/notifications/web";
import {
  createRecord,
  deleteRecord,
  listRecentRecords,
  countRecordsByKind,
  type RecordedEvidence,
} from "@/lib/records/create";
import { useProgression } from "@/lib/progression/useProgression";
import { useSavePop } from "@/components/motion/useSignatureMotion";
import { CharacterFlash } from "@/components/art/CosmicPixel";
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
  topic: string | null;
  summary: string | null;
  conclusion: string | null;
  tags: string[];
  created_at: string;
}

export default function Journal() {
  const { t, i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const progression = useProgression();
  // 저장 / Save — "루루 뽁" signature pop on a successful entry.
  const { scale: saveScale, pop: savePop } = useSavePop();
  // Bumped on save to flash 루루 (collection drone) briefly.
  const [saveFlash, setSaveFlash] = useState(0);
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [askAdvisor, setAskAdvisor] = useState(false);
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

  const streak = useMemo(() => computeStreak(recent.map((r) => r.created_at)), [recent]);

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
      const tags = tagsInput
        .split(/[,#]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const res = await createRecord({
        userId,
        locale,
        kind: "journal",
        body: body.trim(),
        topic: topic.trim().length > 0 ? topic.trim() : undefined,
        tags: tags.length > 0 ? tags : undefined,
        conclusion: conclusion.trim().length > 0 ? conclusion.trim() : undefined,
        // Advisor is OPT-IN per user directive: '아무것한테나 어드바이저 하지말고'.
        // Default behavior is record-without-AI; only fire callAdvisor
        // when the user explicitly toggles "Ask Advisor" on this entry.
        withFollowup: askAdvisor,
      });
      if (res.followup) {
        setLastFollowup(res.followup);
        if (res.followup.zone === "red") {
          setCrisis({ visible: true, hotline: locale === "ko" ? "KR_1393" : "GLOBAL_988" });
        }
      }
      setBody("");
      setTopic("");
      setTagsInput("");
      setConclusion("");
      setShowExtras(false);
      setAskAdvisor(false);
      await refresh(userId);
      // 루루 뽁 — signature save pop (+ synth pop on web) + brief 루루 flash.
      savePop();
      setSaveFlash((n) => n + 1);
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

        {streak.current > 0 ? (
          <View style={styles.streakRow}>
            <Text variant="caption" color="brand">
              {streak.capturedToday ? "🔥" : "·"}
            </Text>
            <Text variant="subtle" color="textMuted">
              {locale === "ko"
                ? `${streak.current}일 연속 기록${streak.capturedToday ? "" : " (오늘은 아직)"}`
                : `${streak.current}-day streak${streak.capturedToday ? "" : " (no entry today yet)"}`}
            </Text>
          </View>
        ) : null}

        <View style={styles.navRow}>
          <Link href="/capture" asChild>
            <Button label={locale === "ko" ? "캡처" : "Capture"} variant="secondary" />
          </Link>
          <Link href="/inbox" asChild>
            <Button label={locale === "ko" ? "받은편지함" : "Inbox"} variant="secondary" />
          </Link>
          <Link href="/wiki" asChild>
            <Button label={locale === "ko" ? "위키" : "Wiki"} variant="secondary" />
          </Link>
          <Link href="/insights" asChild>
            <Button label={locale === "ko" ? "인사이트" : "Insights"} variant="secondary" />
          </Link>
          <Link href="/jarvis" asChild>
            <Button label={locale === "ko" ? "세컨비" : "SecondB"} variant="secondary" />
          </Link>
          <Link href="/manual" asChild>
            <Button label={locale === "ko" ? "안내" : "Manual"} variant="secondary" />
          </Link>
          <Link href="/audit" asChild>
            <Button label={locale === "ko" ? "과거의 나" : "Past me"} variant="secondary" />
          </Link>
          <Link href="/interview" asChild>
            <Button label={locale === "ko" ? "스무고개" : "Interview"} variant="secondary" />
          </Link>
          <Link href="/persona" asChild>
            <Button label={locale === "ko" ? "페르소나" : "Persona"} variant="secondary" />
          </Link>
          <Link href="/trinity" asChild>
            <Button label={locale === "ko" ? "Trinity" : "Trinity"} variant="secondary" />
          </Link>
          <Link href="/settings" asChild>
            <Button label={locale === "ko" ? "설정" : "Settings"} variant="secondary" />
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
                ? `입문 퀘스트(과거의 나)를 완료하면 Lv${gate.requiredLevel}에 도달하고 일기가 열려요.`
                : `Finish the onboarding quest (past me) to reach Lv${gate.requiredLevel} and unlock the journal.`}
            </Text>
            <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
              {locale === "ko"
                ? `현재 Lv${gate.currentLevel} → Lv${gate.requiredLevel} 필요`
                : `Currently Lv${gate.currentLevel} → Lv${gate.requiredLevel} required`}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Link href="/audit" asChild>
                <Button
                  label={locale === "ko" ? "과거의 나 시작하기" : "Start the past me"}
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
            <View style={styles.dailyPromptCard}>
              <View style={styles.dailyPromptHead}>
                <Text variant="caption" color="brand" style={{ letterSpacing: 1.2 }}>
                  {locale === "ko" ? "오늘의 성찰 질문" : "Today's reflection prompt"}
                </Text>
                <Pressable
                  onPress={async () => {
                    const r = await notify(
                      locale === "ko" ? "두번째 뇌 — 오늘의 성찰" : "2nd-Brain — today's reflection",
                      dailyPrompt(locale),
                    );
                    if (r.status === "not_supported") {
                      Alert.alert(locale === "ko" ? "이 환경에선 알림이 지원되지 않아요" : "Notifications not supported here");
                    } else if (r.status === "denied") {
                      Alert.alert(locale === "ko" ? "알림 권한이 차단돼 있어요" : "Notification permission blocked");
                    }
                  }}
                  hitSlop={6}
                >
                  <Text variant="caption" color="brand">
                    {locale === "ko" ? "🔔 알림으로" : "🔔 Notify"}
                  </Text>
                </Pressable>
              </View>
              <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs, lineHeight: 22 }} selectable>
                {dailyPrompt(locale)}
              </Text>
              {topic.length === 0 ? (
                <Pressable
                  onPress={() => setTopic(dailyPrompt(locale))}
                  hitSlop={4}
                  style={{ marginTop: spacing.xs }}
                >
                  <Text variant="caption" color="brand">
                    {locale === "ko" ? "→ 이 질문을 주제로" : "→ Use this as topic"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Input
              value={topic}
              onChangeText={setTopic}
              placeholder={locale === "ko" ? "주제 (선택) — 한 줄로" : "Topic (optional) — one line"}
              autoCapitalize="sentences"
            />
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
            {body.length > 0 ? (
              <View style={styles.charCountRow}>
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko"
                    ? body.trim().length < 40
                      ? "조금만 더 길게 적어볼까요"
                      : "충분해요"
                    : body.trim().length < 40
                      ? "A few more words help"
                      : "Looks good"}
                </Text>
                <Text variant="subtle" color="textSubtle">{body.length}</Text>
              </View>
            ) : null}
            <Input
              value={tagsInput}
              onChangeText={setTagsInput}
              placeholder={locale === "ko" ? "태그 (선택, 쉼표/# 구분) — #일기 #감정" : "Tags (optional, comma/# separated) — #journal #emotion"}
              autoCapitalize="none"
            />
            {tagsInput.trim().length > 0 ? (
              <Text variant="subtle" color="textSubtle">
                {(() => {
                  const parsed = tagsInput.split(/[,#]+/).map((t) => t.trim()).filter((t) => t.length > 0);
                  return parsed.length === 0
                    ? (locale === "ko" ? "태그가 비어 있어요" : "No tags parsed")
                    : "→ " + parsed.map((t) => `#${t}`).join(" ");
                })()}
              </Text>
            ) : null}
            <Pressable onPress={() => setShowExtras((v) => !v)} hitSlop={4}>
              <Text variant="caption" color="brand">
                {showExtras
                  ? locale === "ko" ? "▾ 결론 칸 닫기" : "▾ Hide conclusion field"
                  : locale === "ko" ? "▸ 결론 한 줄로 (선택)" : "▸ Add a one-line conclusion (optional)"}
              </Text>
            </Pressable>
            {showExtras ? (
              <Input
                value={conclusion}
                onChangeText={setConclusion}
                placeholder={locale === "ko" ? "결론 — 오늘의 한 줄 깨달음" : "Conclusion — today's one-line takeaway"}
                multiline
                numberOfLines={2}
              />
            ) : null}
            <Pressable onPress={() => setAskAdvisor((v) => !v)} hitSlop={4} style={styles.advisorRow}>
              <View style={[styles.advisorCheck, askAdvisor && styles.advisorCheckOn]}>
                {askAdvisor ? <Text variant="caption" color="background">✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="subtle" color={askAdvisor ? "brand" : "textMuted"}>
                  {locale === "ko" ? "이 기록에 AI 조언 받기" : "Ask Advisor on this entry"}
                </Text>
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko"
                    ? "기본은 꺼짐. 고민이나 되묻고 싶을 때만 켜세요."
                    : "Off by default. Turn on only for entries where you want a reflection back."}
                </Text>
              </View>
            </Pressable>
            <Animated.View style={{ transform: [{ scale: saveScale }] }}>
              <Button
                label={locale === "ko" ? "기록하기" : "Save"}
                variant="primary"
                onPress={handleSubmit}
                disabled={!body.trim() || submitting}
                loading={submitting}
              />
            </Animated.View>
            <Text variant="subtle" color="textSubtle" style={styles.privacyFootnote}>
              {t("journal.privacyFootnote")}
            </Text>
            {lastFollowup ? <FollowupCard followup={lastFollowup} locale={locale} /> : null}
          </View>
        )}

        {recent.length === 0 ? (
          <View style={styles.coachmarkCard}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 1.2 }}>
              {locale === "ko" ? "처음이신가요?" : "First time?"}
            </Text>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs, lineHeight: 22 }}>
              {locale === "ko"
                ? "두번째 뇌는 8가지 핵심 동작이 있어요. 캡처 → 인박스 → 위키 → 세컨비로 흐름이 이어집니다. 1분 안내서를 먼저 보시면 길을 잃지 않아요."
                : "2nd-Brain has 8 core moves. Capture → Inbox → Wiki → SecondB. A 1-minute manual saves you from getting lost."}
            </Text>
            <Link href="/manual" asChild>
              <Button label={locale === "ko" ? "안내서 열기" : "Open the manual"} variant="primary" />
            </Link>
          </View>
        ) : null}

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
              <RecentEntry
                key={r.id}
                record={r}
                locale={locale}
                t={t}
                onDelete={async () => {
                  if (!userId) return;
                  try {
                    await deleteRecord(userId, r.id);
                    await refresh(userId);
                  } catch (e) {
                    Alert.alert(
                      locale === "ko" ? "삭제 실패" : "Delete failed",
                      (e as Error).message,
                    );
                  }
                }}
              />
            ))
          )}
        </View>
      </ScrollView>
      {/* 루루 — collection drone flashes briefly when an entry is saved (§9) */}
      <CharacterFlash id="lulu" trigger={saveFlash} size={52} style={styles.saveFlash} />
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
  onDelete,
}: {
  record: RecordRow;
  locale: "en" | "ko";
  t: (k: string, opts?: Record<string, unknown>) => string;
  onDelete: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = record.body.length > PREVIEW_CHARS;
  const body = expanded || !isLong ? record.body : record.body.slice(0, PREVIEW_CHARS).trimEnd() + "…";
  const toggleLabel = expanded
    ? locale === "ko" ? "접기" : "Show less"
    : locale === "ko" ? "더 보기" : "Show more";
  return (
    <View style={styles.recordCard}>
      <View style={styles.recordTopRow}>
        <Text variant="subtle" color="textSubtle">
          {formatRelative(record.created_at, locale, t)}
        </Text>
        {record.topic ? (
          <Text variant="subtle" color="brand" numberOfLines={1} style={{ flex: 1, textAlign: "right" }}>
            {record.topic}
          </Text>
        ) : null}
      </View>
      <Text variant="body" style={{ marginTop: spacing.xs }} selectable>{body}</Text>
      {isLong ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8} style={styles.showMoreBtn}>
          <Text variant="subtle" color="brand">{toggleLabel}</Text>
        </Pressable>
      ) : null}
      {record.conclusion ? (
        <View style={styles.conclusionBlock}>
          <Text variant="caption" color="textSubtle">
            {locale === "ko" ? "결론" : "Conclusion"}
          </Text>
          <Text variant="subtle" color="textMuted" selectable>{record.conclusion}</Text>
        </View>
      ) : null}
      {record.tags && record.tags.length > 0 ? (
        <Text variant="subtle" color="textSubtle" numberOfLines={1} style={{ marginTop: spacing.xs }}>
          #{record.tags.join(" #")}
        </Text>
      ) : null}
      {record.ai_followup ? <FollowupCard followup={record.ai_followup} locale={locale} compact /> : null}
      <Pressable
        onPress={() => {
          Alert.alert(
            locale === "ko" ? "이 기록을 삭제하시겠어요?" : "Delete this entry?",
            locale === "ko" ? "되돌릴 수 없어요." : "This cannot be undone.",
            [
              { text: locale === "ko" ? "취소" : "Cancel", style: "cancel" },
              {
                text: locale === "ko" ? "삭제" : "Delete",
                style: "destructive",
                onPress: () => {
                  void onDelete();
                },
              },
            ],
          );
        }}
        hitSlop={6}
        style={{ marginTop: spacing.sm, alignSelf: "flex-end" }}
      >
        <Text variant="caption" color="textSubtle">
          {locale === "ko" ? "삭제" : "Delete"}
        </Text>
      </Pressable>
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
  saveFlash: { position: "absolute", bottom: 90, right: 20 },
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
  charCountRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  advisorRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingVertical: spacing.xs },
  advisorCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  advisorCheckOn: { backgroundColor: semantic.brand, borderColor: semantic.brand },
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
  coachmarkCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
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
  recordTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  streakRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dailyPromptHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dailyPromptCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
    padding: spacing.sm,
  },
  conclusionBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
    gap: 2,
  },
});
