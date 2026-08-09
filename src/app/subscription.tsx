// /subscription - [설정 → 구독 관리]. The screen the published refund policy has
// been pointing at since 2026-07-17 (docs/legal/refund-policy.md KO 3항 / EN §3)
// without it existing.
//
// One message per screen: "이 구독은 지금 이런 상태고, 여기서 끝낼 수 있어요."
// Everything else is progressive disclosure - the cancel options and the refund
// consequences appear only after a tap, in a modal, never as a stacked wall.
//
// The refund block is deliberately honest in both directions. The verdict comes
// from refund_eligibility() (0115) and the screen prints ITS numbers: how much of
// the free allowance the payment window covered, how much was actually used, and
// how many days of the window remain. A user who cannot self-refund is shown the
// arithmetic that produced that answer plus the support address, never a bare no.
//
// Two things this screen must never claim:
//   - that a refund has happened (Paddle reviews the adjustment; we submit it)
//   - that a cancel has happened before the server said so (the tier itself is
//     revoked by the paddle-webhook rail, not here)

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { MdButton, MdCard } from "@/components/m3";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PremiumModal } from "@/components/premium";
import { m3 } from "@/lib/theme/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { PUBLIC_TIER_BY_DB } from "@/lib/entitlements/tier-map";
import type { SubscriptionTier } from "@/lib/progression/entitlements";
import {
  cancelSubscription,
  canRequestRefund,
  fetchRefundEligibility,
  fetchSubscriptionOverview,
  formatPaymentMethod,
  refundDaysLeft,
  refundReasonKey,
  REFUND_WINDOW_DAYS,
  renewalState,
  requestRefund,
  revisedPolicyInForce,
  type ManageResult,
  type RefundEligibility,
  type SubscriptionOverview,
} from "@/lib/billing/subscription-manage";

const SUPPORT_EMAIL = "kim0405@hayangzip.com";

type Sheet = "cancel" | "refund" | null;
type Notice = { kind: "ok" | "warn"; key: string } | null;

function formatDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString(locale === "ko" ? "ko-KR" : locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation("settings");
  const { userId, loading: authLoading } = useAuth();
  const { tier, refresh: refreshTier } = useProgression();

  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [eligibility, setEligibility] = useState<RefundEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [immediate, setImmediate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      // Both reads are own-row RPCs; a failure here must not be rendered as
      // "no subscription" (that would read as an entitlement loss).
      const [o, e] = await Promise.all([
        fetchSubscriptionOverview(userId),
        fetchRefundEligibility(userId),
      ]);
      if (!mounted.current) return;
      setOverview(o);
      setEligibility(e);
    } catch (err) {
      if (typeof console !== "undefined") console.warn("[subscription] load failed", (err as Error).message);
      if (mounted.current) setLoadFailed(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyResult = useCallback(
    (result: ManageResult, okKey: string) => {
      // A dry run reached nothing. Saying "submitted" would be the same lie the
      // server no longer tells, so it gets its own operator-facing sentence.
      if (result.outcome === "dry_run") setNotice({ kind: "warn", key: "dryRun" });
      else if (result.outcome === "accepted") setNotice({ kind: "ok", key: okKey });
      else if (result.outcome === "duplicate") setNotice({ kind: "ok", key: "alreadyRequested" });
      // Three refusals, three sentences. Telling someone with nothing to cancel
      // that their refund was declined is a different (and wrong) statement.
      else if (result.outcome === "rejected") {
        const key =
          result.reason === "not_subscribed"
            ? "notSubscribed"
            : result.reason === "policy_not_in_effect"
              ? "policyNotInEffect"
              : "refundRejected";
        setNotice({ kind: "warn", key });
      } else setNotice({ kind: "warn", key: "contactSupport" });
      if (result.eligibility?.status) setEligibility(result.eligibility);
    },
    [],
  );

  const runCancel = useCallback(() => {
    setSheet(null);
    setBusy(true);
    void (async () => {
      try {
        const result = await cancelSubscription(immediate ? "immediately" : "next_billing_period");
        applyResult(result, immediate ? "cancelledNow" : "cancelledAtRenewal");
        // The tier itself is revoked by the webhook rail, so re-read rather than
        // assume: an accepted cancel does not mean the entitlement moved yet.
        void refreshTier();
        await load();
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[subscription] cancel failed", (err as Error).message);
        if (mounted.current) setNotice({ kind: "warn", key: "contactSupport" });
      } finally {
        if (mounted.current) setBusy(false);
      }
    })();
  }, [immediate, applyResult, refreshTier, load]);

  const runRefund = useCallback(() => {
    setSheet(null);
    setBusy(true);
    void (async () => {
      try {
        const result = await requestRefund();
        applyResult(result, "refundRequested");
        await load();
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[subscription] refund failed", (err as Error).message);
        if (mounted.current) setNotice({ kind: "warn", key: "contactSupport" });
      } finally {
        if (mounted.current) setBusy(false);
      }
    })();
  }, [applyResult, load]);

  if (authLoading) {
    return (
      <DeepSpaceScreen active="settings" header="none" variant="windowed" title={t("subscription.title")} onBack={() => router.back()}>
        <View style={s.center}>
          <ActivityIndicator color={m3.color.primary} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const locale = i18n.language === "ko" ? "ko" : "en";
  const publicTier = PUBLIC_TIER_BY_DB[tier as SubscriptionTier] ?? "free";
  const isPaid = publicTier !== "free";
  const renewsAt = formatDate(overview?.renews_at, locale);
  const paidAt = formatDate(overview?.last_paid_at, locale);
  const renewal = overview ? renewalState(overview) : "none";
  // Paddle's own effective_at when it has landed; until then the period we
  // already know the user paid through. Never a guess.
  const cancelAt = formatDate(overview?.cancel_scheduled_at ?? overview?.renews_at, locale);
  const method = overview ? formatPaymentMethod(overview) : null;
  const daysLeft = eligibility ? refundDaysLeft(eligibility) : null;
  const reasonKey = eligibility ? refundReasonKey(eligibility.status) : "unknown";
  // The revised 7-day usage-gated rule only binds from its effective date;
  // before that the screen shows the policy actually in force instead.
  const policyInForce = revisedPolicyInForce();
  const refundOpen = policyInForce && eligibility != null && canRequestRefund(eligibility) && !busy;

  return (
    <DeepSpaceScreen active="settings" header="none" variant="windowed" title={t("subscription.title")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={s.scroll}>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={m3.color.primary} />
          </View>
        ) : null}

        {loadFailed ? (
          <MdCard variant="outlined" style={s.card}>
            <Text style={s.body}>{t("subscription.loadFailed")}</Text>
            <MdButton label={t("subscription.retry")} variant="text" onPress={() => void load()} />
          </MdCard>
        ) : null}

        {!loading && !loadFailed ? (
          <>
            {/* The one message: what this subscription is right now. */}
            <MdCard variant="filled" style={s.card}>
              <Text style={s.eyebrow}>{t("subscription.currentPlan")}</Text>
              <Text style={s.planName}>{t(`subscription.tierName.${publicTier}`)}</Text>
              {overview?.judge_comp ? <Text style={s.dim}>{t("subscription.judgeComp")}</Text> : null}
              {/* The renewal sentence is the one fact a subscriber comes here
                  for. It says "we will charge you again on X" only while that
                  is actually true; once a cancellation is booked it flips to
                  "paid until X, then it stops" and never back on its own. */}
              {renewal === "auto_renew" && renewsAt ? (
                <Text style={s.row}>{t("subscription.autoRenewOn", { date: renewsAt })}</Text>
              ) : null}
              {renewal === "cancel_scheduled" ? (
                <Text style={s.row}>
                  {cancelAt
                    ? t("subscription.cancelScheduledOn", { date: cancelAt })
                    : t("subscription.cancelScheduled")}
                </Text>
              ) : null}
              {paidAt ? <Text style={s.row}>{t("subscription.lastPaidOn", { date: paidAt })}</Text> : null}
              {method ? <Text style={s.row}>{t("subscription.paymentMethod", { method })}</Text> : null}
              {!isPaid ? <Text style={s.dim}>{t("subscription.freeBody")}</Text> : null}
            </MdCard>

            {notice ? (
              <MdCard variant="outlined" style={s.card}>
                <Text style={notice.kind === "ok" ? s.ok : s.warn}>{t(`subscription.notice.${notice.key}`)}</Text>
                {notice.kind === "warn" ? <Text style={s.dim}>{t("subscription.supportLine", { email: SUPPORT_EMAIL })}</Text> : null}
              </MdCard>
            ) : null}

            {/* Cancel. Hidden entirely when there is no Paddle subscription we can
                address: a store purchase is cancelled in the store, and a button
                that cannot work is worse than no button (settings.tsx "no placebo
                controls" rule). */}
            {isPaid && overview?.can_self_cancel && renewal === "auto_renew" ? (
              <MdCard variant="outlined" style={s.card}>
                <Text style={s.sectionTitle}>{t("subscription.cancel.title")}</Text>
                <Text style={s.body}>{t("subscription.cancel.body")}</Text>
                <MdButton
                  label={t("subscription.cancel.cta")}
                  variant="outlined"
                  onPress={() => {
                    setImmediate(false);
                    setSheet("cancel");
                  }}
                  disabled={busy}
                />
              </MdCard>
            ) : null}

            {/* Already cancelled: the button is gone rather than disabled, and
                the card says what happens next instead of offering a no-op. */}
            {isPaid && renewal === "cancel_scheduled" ? (
              <MdCard variant="outlined" style={s.card}>
                <Text style={s.sectionTitle}>{t("subscription.cancel.title")}</Text>
                <Text style={s.body}>{t("subscription.cancel.alreadyScheduled")}</Text>
              </MdCard>
            ) : null}

            {isPaid && !overview?.can_self_cancel && renewal === "auto_renew" ? (
              <MdCard variant="outlined" style={s.card}>
                <Text style={s.sectionTitle}>{t("subscription.cancel.title")}</Text>
                <Text style={s.body}>{t("subscription.cancel.unavailable")}</Text>
                <Text style={s.dim}>{t("subscription.supportLine", { email: SUPPORT_EMAIL })}</Text>
              </MdCard>
            ) : null}

            {/* Refund, BEFORE the revision takes effect. The usage-gated verdict
                is deliberately not shown: until 2026-09-08 the policy that binds
                us is the previous one (30 days, no questions asked, requested by
                email), and displaying a stricter standard than the one in force
                is exactly what the 30-day notice period exists to prevent. */}
            {eligibility && eligibility.status !== "no_payment" && !policyInForce ? (
              <MdCard variant="outlined" style={s.card}>
                <Text style={s.sectionTitle}>{t("subscription.refund.title")}</Text>
                <Text style={s.body}>{t("subscription.refund.beforeEffective")}</Text>
                <Text style={s.dim}>{t("subscription.supportLine", { email: SUPPORT_EMAIL })}</Text>
              </MdCard>
            ) : null}

            {/* Refund. The verdict and the numbers behind it are always shown -
                including when the answer is no. */}
            {eligibility && eligibility.status !== "no_payment" && policyInForce ? (
              <MdCard variant="outlined" style={s.card}>
                <Text style={s.sectionTitle}>{t("subscription.refund.title")}</Text>
                <Text style={s.body}>{t(`subscription.refund.reason.${reasonKey}`)}</Text>

                <View style={s.evidence}>
                  {daysLeft != null ? (
                    <Text style={s.dim}>
                      {t("subscription.refund.window", {
                        days: daysLeft,
                        total: eligibility.refund_window_days ?? REFUND_WINDOW_DAYS,
                      })}
                    </Text>
                  ) : null}
                  {eligibility.free_allowance != null ? (
                    <Text style={s.dim}>
                      {t("subscription.refund.usage", {
                        used: eligibility.counted_usage ?? 0,
                        allowance: eligibility.free_allowance,
                      })}
                    </Text>
                  ) : null}
                  {eligibility.reasoning_calls_logged != null ? (
                    <Text style={s.dim}>
                      {t("subscription.refund.calls", { calls: eligibility.reasoning_calls_logged })}
                    </Text>
                  ) : null}
                </View>

                {refundOpen ? (
                  <MdButton label={t("subscription.refund.cta")} variant="outlined" onPress={() => setSheet("refund")} disabled={busy} />
                ) : (
                  <Text style={s.dim}>{t("subscription.supportLine", { email: SUPPORT_EMAIL })}</Text>
                )}
              </MdCard>
            ) : null}

            <MdButton label={t("subscription.viewPolicy")} variant="text" onPress={() => router.push("/refund")} />
            <MdButton label={t("subscription.viewPlans")} variant="text" onPress={() => router.push("/plans")} />
          </>
        ) : null}
      </ScrollView>

      {/* Cancel confirmation. The timing choice lives HERE, not on the card:
          one tap simplifies the screen instead of stacking another layer on it. */}
      <PremiumModal visible={sheet === "cancel"} onClose={() => setSheet(null)} accessibilityLabel={t("subscription.cancel.confirmTitle")}>
        <Text variant="heading">{t("subscription.cancel.confirmTitle")}</Text>
        <Text style={s.body}>
          {immediate
            ? t("subscription.cancel.confirmImmediate")
            : t("subscription.cancel.confirmAtRenewal", { date: renewsAt ?? t("subscription.cancel.periodEnd") })}
        </Text>
        <MdButton
          label={immediate ? t("subscription.cancel.switchToRenewal") : t("subscription.cancel.switchToImmediate")}
          variant="text"
          onPress={() => setImmediate((v) => !v)}
        />
        <View style={s.modalActions}>
          <MdButton label={t("subscription.keep")} variant="text" onPress={() => setSheet(null)} />
          <MdButton label={t("subscription.cancel.confirmCta")} variant="filled" onPress={runCancel} />
        </View>
      </PremiumModal>

      {/* Refund confirmation. States plainly that this is a REQUEST and that the
          paid access ends, so nobody taps it expecting instant money. */}
      <PremiumModal visible={sheet === "refund"} onClose={() => setSheet(null)} accessibilityLabel={t("subscription.refund.confirmTitle")}>
        <Text variant="heading">{t("subscription.refund.confirmTitle")}</Text>
        <Text style={s.body}>{t("subscription.refund.confirmBody")}</Text>
        <View style={s.modalActions}>
          <MdButton label={t("subscription.keep")} variant="text" onPress={() => setSheet(null)} />
          <MdButton label={t("subscription.refund.confirmCta")} variant="filled" onPress={runRefund} />
        </View>
      </PremiumModal>
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  scroll: { paddingBottom: m3.spacing.s6, gap: m3.spacing.s3 },
  center: { paddingVertical: m3.spacing.s6, alignItems: "center", justifyContent: "center" },
  card: { gap: m3.spacing.s2, padding: m3.spacing.s4 },
  eyebrow: { color: m3.color.onSurfaceVariant, fontSize: 12, letterSpacing: 0.3 },
  planName: { color: m3.color.onSurface, fontSize: 22, lineHeight: 28, fontWeight: "600" },
  sectionTitle: { color: m3.color.onSurface, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  body: { color: m3.color.onSurface, fontSize: 14, lineHeight: 20 },
  row: { color: m3.color.onSurface, fontSize: 14, lineHeight: 20 },
  dim: { color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 18 },
  ok: { color: m3.color.primary, fontSize: 14, lineHeight: 20 },
  warn: { color: m3.color.error, fontSize: 14, lineHeight: 20 },
  evidence: { gap: 2, paddingVertical: m3.spacing.s1 },
  modalActions: { flexDirection: "row", gap: m3.spacing.s2, marginTop: m3.spacing.s2, justifyContent: "flex-end" },
});
