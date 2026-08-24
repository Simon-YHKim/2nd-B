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
import type { TFunction } from "i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { reactExpression } from "@/lib/companion/expression";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { planResurface } from "@/lib/resurface/plan";
import { recordResurfaceDecision, recordResurfaceShown } from "@/lib/resurface/ledger";
import {
  listInferredLinkDetails,
  ratifyLink,
  rejectInferredLink,
  type InferredLinkDetail,
} from "@/lib/wiki/queries";
import { PreferenceToggleRow } from "@/components/ui/PreferenceToggle";
import {
  DAILY_REVIEW_HOURS,
  dailyReviewSupported,
  formatDailyReviewHour,
  loadDailyReviewHour,
  setDailyReviewHourPref,
  loadDailyReviewEnabled,
  scheduleDailyReview,
  cancelDailyReview,
  setDailyReviewEnabledPref,
} from "@/lib/ops/daily-review";

function bandLabel(confidence: number, t: TFunction<"ratifications">): string {
  if (confidence >= 0.6) return t("digest.band.strong");
  if (confidence >= 0.4) return t("digest.band.likely");
  return t("digest.band.weak");
}

export default function Digest() {
  const { userId, loading } = useAuth();
  const { t } = useTranslation("ratifications");
  const [items, setItems] = useState<InferredLinkDetail[] | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setError(false);
    try {
      const rows = await listInferredLinkDetails(userId);
      // 꺼내기 슬롯이 순서를 정한다. 예전에는 신뢰도 순 50개를 그대로 쏟았고,
      // 그러면 높은 신뢰도인데 계속 비준되지 않는 항목이 영원히 맨 위에 남는다 --
      // 매일 같은 것을 보게 된다. 이제 대기 시간으로 감쇠시키고 앞의 몇 개만 띄운다.
      const plan = planResurface(
        rows.map((r) => ({
          key: `${r.from_page}:${r.to_page}`,
          confidence: r.confidence,
          createdAt: r.created_at ?? null,
        })),
      );
      const rank = new Map(plan.resurfaceOrder.map((k, i) => [k, i]));
      const ordered = [...rows]
        .sort((a, b) =>
          (rank.get(`${a.from_page}:${a.to_page}`) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(`${b.from_page}:${b.to_page}`) ?? Number.MAX_SAFE_INTEGER))
        .slice(0, plan.shown);
      setItems(ordered);
      // 채점 원장(0145): 오늘 실제로 뜬 것을 순위와 함께 남긴다. 이게 있어야
      // "무시"(보여줬는데 판정 없음)가 정의되고, 개인화가 지어낸 파라미터가
      // 아니라 데이터에서 나올 수 있다. 실패해도 화면은 그대로(fail-soft).
      void recordResurfaceShown(
        userId,
        ordered.map((r, i) => ({ fromPage: r.from_page, toPage: r.to_page, rank: i })),
      );
    } catch {
      // A load failure is NOT an empty list. Surface a distinct error state
      // with a retry CTA so the user can recover (spec §9).
      setItems(null);
      setError(true);
    }
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
        // 판정이 성공한 뒤에만 원장에 남긴다 -- 실패한 판정을 성공으로 적으면
        // 채점이 거짓이 된다. 거절은 wiki_links 행이 DELETE 되므로 이 원장이
        // 유일한 흔적이다.
        void recordResurfaceDecision(userId, p.from_page, p.to_page, confirm ? "ratified" : "rejected");
        // 승인 = the app-wide ratify wink (rejections stay face-neutral).
        if (confirm) reactExpression("wink");
        await refresh();
      } catch {
        // best-effort; the row stays for a retry
      } finally {
        setActingKey(null);
      }
    },
    [userId, refresh],
  );

  // Opt-in daily-review reminder (native-only). OFF by default; the user turns
  // it on for themselves and the OS permission prompt is the consent. It is a
  // local notification, not an app-initiated re-engagement push.
  const remindersOk = dailyReviewSupported();
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderDenied, setReminderDenied] = useState(false);
  // 알림 시각 (Simon 결정 B3). 지금까지 09:00 하드코딩이었다.
  const [reminderHour, setReminderHour] = useState(9);

  useEffect(() => {
    if (!remindersOk) return;
    void loadDailyReviewHour().then(setReminderHour);
    let cancelled = false;
    void loadDailyReviewEnabled().then((on) => {
      if (!cancelled) setReminderOn(on);
    });
    return () => {
      cancelled = true;
    };
  }, [remindersOk]);

  const toggleReminder = useCallback(
    async (next: boolean) => {
      setReminderBusy(true);
      setReminderDenied(false);
      try {
        if (next) {
          const title = t("digest.title");
          const body = t("digest.reminder.notifBody");
          const res = await scheduleDailyReview(reminderHour, 0, title, body);
          if (res === "scheduled") {
            setReminderOn(true);
            setDailyReviewEnabledPref(true);
          } else if (res === "denied") {
            setReminderDenied(true);
          }
        } else {
          await cancelDailyReview();
          setReminderOn(false);
          setDailyReviewEnabledPref(false);
        }
      } finally {
        setReminderBusy(false);
      }
    },
    [t],
  );

  // 시각을 바꾸면 이미 걸린 알림을 다시 건다. `scheduleDailyReview` 가 같은
  // identifier 로 취소 후 재예약하므로 알림이 쌓이지 않는다.
  const pickReminderHour = useCallback(
    async (hour: number) => {
      if (hour === reminderHour) return;
      setReminderHour(hour);
      setDailyReviewHourPref(hour);
      if (!reminderOn) return;
      setReminderBusy(true);
      try {
        await scheduleDailyReview(hour, 0, t("digest.title"), t("digest.reminder.notifBody"));
      } finally {
        setReminderBusy(false);
      }
    },
    [reminderHour, reminderOn, t],
  );

  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <SecondbHead size={48} mood="neutral" />
          <View style={styles.flex}>
            <Text variant="heading">{t("digest.title")}</Text>
            <Text variant="subtle" color="textMuted" style={styles.intro}>
              {t("digest.intro")}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.empty}>
            <Text variant="body" color="textMuted" style={styles.center}>
              {t("digest.loadError")}
            </Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              accessibilityLabel={t("digest.retry")}
              style={styles.cta}
            >
              <Text variant="body" style={styles.ctaText}>{t("digest.retry")}</Text>
            </Pressable>
          </View>
        ) : items === null ? (
          <InlineLoader />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body" color="textMuted" style={styles.center}>
              {t("digest.empty")}
            </Text>
            <Pressable
              onPress={() => router.push("/capture")}
              accessibilityRole="button"
              accessibilityLabel={t("digest.goCapture")}
              style={styles.cta}
            >
              <Text variant="body" style={styles.ctaText}>{t("digest.goCapture")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text variant="caption" color="textSubtle">
              {t("digest.toReview", { n: items.length })}
            </Text>
            {items.map((p) => {
              const key = `${p.from_page}|${p.to_page}`;
              const busy = actingKey === key;
              return (
                // visuals on the wrapper View — Fabric Android drops
                // function-form Pressable styles (#680).
                <Pressable
                  key={key}
                  onPress={() =>
                    router.push({ pathname: "/wiki", params: { focusPageId: p.from_page } })
                  }
                  // accessible={false}: this row nests confirm/dismiss buttons —
                  // an accessible parent collapses them into one node, leaving the
                  // actions unreachable under VoiceOver. Opening it out lets the
                  // title text and both buttons surface as separate a11y elements.
                  accessible={false}
                  accessibilityLabel={t("digest.a11yOpen", { title: p.from_title })}
                  style={styles.row}
                >
                  <Text variant="body" numberOfLines={2}>
                    {p.from_title} <Text variant="body" color="textMuted">↔</Text> {p.to_title}
                  </Text>
                  <Text variant="subtle" color="textMuted" style={styles.band}>
                    {bandLabel(p.confidence, t)}
                  </Text>
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => void decide(p, false)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={t("digest.dismiss")}
                      style={[styles.btn, styles.btnGhost]}
                    >
                      <Text variant="caption" style={styles.btnGhostText}>{t("digest.dismiss")}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void decide(p, true)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={t("digest.confirm")}
                      style={[styles.btn, styles.btnPrimary]}
                    >
                      <Text variant="caption" style={styles.btnPrimaryText}>{t("digest.confirm")}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        {remindersOk ? (
          <View style={styles.reminder}>
            <PreferenceToggleRow
              label={t("digest.reminder.label")}
              description={t("digest.reminder.desc")}
              value={reminderOn}
              disabled={reminderBusy}
              onValueChange={(v) => {
                void toggleReminder(v);
              }}
            />
            {reminderOn ? (
              <View style={styles.hourBox}>
                <Text variant="caption" color="textMuted">
                  {t("digest.reminder.timeTitle")}
                </Text>
                <View style={styles.hourRow}>
                  {DAILY_REVIEW_HOURS.map((h) => {
                    const on = h === reminderHour;
                    return (
                      <Pressable
                        key={h}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={formatDailyReviewHour(h)}
                        disabled={reminderBusy}
                        onPress={() => {
                          void pickReminderHour(h);
                        }}
                        style={[styles.hourChip, on ? styles.hourChipOn : null]}
                      >
                        <Text variant="caption" color={on ? "brand" : "textMuted"}>
                          {formatDailyReviewHour(h)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text variant="caption" color="textMuted">
                  {t("digest.reminder.timeHint")}
                </Text>
              </View>
            ) : null}
            {reminderDenied ? (
              <Text variant="subtle" color="textMuted" style={styles.center}>
                {t("digest.reminder.denied")}
              </Text>
            ) : null}
          </View>
        ) : null}
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
  reminder: { gap: 6, marginTop: deepSpaceSpacing.md },
  hourBox: { gap: 6, marginTop: deepSpaceSpacing.xs },
  hourRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hourChip: {
    // 44px 터치 타깃 (PRD 불변식). 칩이 작아 오탭이 잦은 자리다.
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.small,
    backgroundColor: deepSpace.card,
  },
  hourChipOn: { borderColor: deepSpace.accent },
  empty: { gap: deepSpaceSpacing.md, alignItems: "center", paddingVertical: deepSpaceSpacing.lg },
  row: {
    backgroundColor: deepSpace.card,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.medium,
    padding: deepSpaceSpacing.md,
    gap: 6,
  },
  rowPressed: { opacity: 0.85 },
  band: {},
  actions: { flexDirection: "row", gap: deepSpaceSpacing.sm, justifyContent: "flex-end", marginTop: 4 },
  btn: { minHeight: 44, paddingHorizontal: deepSpaceSpacing.md, borderRadius: m3.shape.medium, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: deepSpace.cardLine },
  btnGhostText: { color: deepSpace.textMid },
  btnPrimary: { backgroundColor: deepSpace.accent },
  btnPrimaryText: { color: deepSpace.bg },
  cta: { minHeight: 44, paddingHorizontal: deepSpaceSpacing.lg, borderRadius: m3.shape.medium, borderWidth: 1, borderColor: deepSpace.accentSoft, alignItems: "center", justifyContent: "center" },
  ctaText: { color: deepSpace.accentSoft },
});
