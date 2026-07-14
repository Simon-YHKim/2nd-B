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
import { deepSpace, deepSpaceSpacing, deepSpaceRadii } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { InlineLoader } from "@/components/ui/InlineLoader";
import {
  listInferredLinkDetails,
  ratifyLink,
  rejectInferredLink,
  type InferredLinkDetail,
} from "@/lib/wiki/queries";
import { PreferenceToggleRow } from "@/components/ui/PreferenceToggle";
import {
  dailyReviewSupported,
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
      setItems(rows);
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

  useEffect(() => {
    if (!remindersOk) return;
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
          const res = await scheduleDailyReview(9, 0, title, body);
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
  empty: { gap: deepSpaceSpacing.md, alignItems: "center", paddingVertical: deepSpaceSpacing.lg },
  row: {
    backgroundColor: deepSpace.card,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
    padding: deepSpaceSpacing.md,
    gap: 6,
  },
  rowPressed: { opacity: 0.85 },
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
