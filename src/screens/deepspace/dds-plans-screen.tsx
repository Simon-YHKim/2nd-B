// Deep-space plans: PIXEL-CLAY renderer over the existing, real billing rails.
// Prices come from the entitlement SoT, the current plan comes only from the
// users row via useProgression, and entitlement changes remain webhook-owned.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Redirect, router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import type { PurchasesPackage } from "react-native-purchases";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { RewardedSheet } from "@/components/deepspace/RewardedSheet";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import { canShowRewardedAds } from "@/lib/ads/policy";
import { canCompleteRewardedWatch } from "@/lib/ads/rewarded";
import {
  openPaddleCheckout,
  paddleCheckoutAvailable,
  type CheckoutCadence,
  type CheckoutTier,
} from "@/lib/billing/paddle-checkout";
import {
  REWARD_MONTHLY_CAP,
  REWARD_PER_WATCH,
  TIER_PRICE_KRW,
  TIER_PRICE_KRW_YEARLY,
} from "@/lib/entitlements/tiers";
import { remainingReasoning } from "@/lib/entitlements/reasoning-cap";
import { addRewardCredits, monthBucket, weekBucket } from "@/lib/entitlements/usage";
import {
  arePurchasesAvailable,
  configurePurchases,
  findMonthlyTierPackage,
  getOfferingsResult,
  purchasePackage,
  restorePurchases,
} from "@/lib/payments/purchases";
import { resolvePrivacyPrefs } from "@/lib/privacy/prefs";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  createOwnerActionGate,
  rewardCapAllowsWatch,
  settleAsyncRead,
  useProgression,
} from "@/lib/progression/useProgression";
import { getSupabaseClient } from "@/lib/supabase/client";
import { m3 } from "@/lib/theme/m3";

const PRO_COMING_SOON = true;
const READ_TIMEOUT_MS = 8_000;
const NOOP = () => {};

type TierKey = "free" | "plus" | "pro";
type ReadStatus = "idle" | "loading" | "ready" | "unavailable" | "error" | "timeout";
type PurchaseState = "idle" | "handed-off" | "purchased" | "cancelled" | "unavailable" | "error";

interface TierCopy {
  key: TierKey;
  name: string;
  sub: string;
  price: string;
  feats: string[];
}

interface StoreRead {
  ownerId: string | null;
  status: ReadStatus;
  packages: PurchasesPackage[];
  nativeAvailable: boolean;
}

interface PrefsRead {
  ownerId: string | null;
  status: ReadStatus;
  adsConsent: boolean | null;
}

interface UsageRead {
  ownerId: string | null;
  status: ReadStatus;
  used: number;
  rewardCredits: number;
  rewardEarned: number;
}

const EMPTY_STORE: StoreRead = {
  ownerId: null,
  status: "idle",
  packages: [],
  nativeAvailable: false,
};
const EMPTY_PREFS: PrefsRead = { ownerId: null, status: "idle", adsConsent: null };
const EMPTY_USAGE: UsageRead = {
  ownerId: null,
  status: "idle",
  used: 0,
  rewardCredits: 0,
  rewardEarned: 0,
};

/** Plans needs the read verdict; the shared settings helper intentionally fails soft. */
async function readPrivacyPrefsStrict(ownerId: string): Promise<PrefsRead> {
  try {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("privacy_prefs")
      .eq("id", ownerId)
      .maybeSingle();
    if (error) return { ownerId, status: "error", adsConsent: null };
    if (!data) return { ownerId, status: "unavailable", adsConsent: null };
    const stored = data.privacy_prefs as Record<string, unknown> | null | undefined;
    return {
      ownerId,
      status: "ready",
      adsConsent: resolvePrivacyPrefs(stored).ads === true,
    };
  } catch {
    return { ownerId, status: "error", adsConsent: null };
  }
}

/** Strict counterpart to getReasoningUsage: no zero-filled success on read failure. */
async function readReasoningUsageStrict(ownerId: string): Promise<UsageRead> {
  const week = weekBucket();
  const month = monthBucket();
  try {
    const client = getSupabaseClient();
    const [counters, summary] = await Promise.all([
      client
        .from("usage_counters")
        .select("month_bucket, reasoning_used, reward_credits")
        .eq("user_id", ownerId)
        .in("month_bucket", [week, month]),
      client.rpc("credit_summary_self"),
    ]);
    if (counters.error || summary.error) {
      return { ownerId, status: "error", used: 0, rewardCredits: 0, rewardEarned: 0 };
    }
    if (summary.data === null || typeof summary.data !== "object" || Array.isArray(summary.data)) {
      return { ownerId, status: "unavailable", used: 0, rewardCredits: 0, rewardEarned: 0 };
    }
    const weekRow = (counters.data ?? []).find((row) => row.month_bucket === week);
    const monthRow = (counters.data ?? []).find((row) => row.month_bucket === month);
    const credit = summary.data as Record<string, unknown>;
    const summaryEarned = Number(credit.ad_earned_this_month);
    const mirrorEarned = Math.max(0, Number(monthRow?.reward_credits) || 0);
    const rewardEarned =
      credit.ad_earned_this_month !== null &&
      credit.ad_earned_this_month !== undefined &&
      Number.isFinite(summaryEarned)
        ? Math.max(0, summaryEarned)
        : mirrorEarned;
    return {
      ownerId,
      status: "ready",
      used: Math.max(0, Number(weekRow?.reasoning_used) || 0),
      rewardCredits: Math.max(0, Number(credit.available) || 0),
      rewardEarned,
    };
  } catch {
    return { ownerId, status: "error", used: 0, rewardCredits: 0, rewardEarned: 0 };
  }
}

function krw(value: number): string {
  return `₩${value.toLocaleString("ko-KR")}`;
}

function DockShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={title ?? ""}
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function PlanAction({
  label,
  onPress,
  disabled = false,
  glyph,
  selected = false,
  rootStyle,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  glyph?: "bolt" | "check" | "chevron_right" | "refresh";
  selected?: boolean;
  rootStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <PixelPressable
      onPress={onPress ?? NOOP}
      disabled={disabled || onPress === undefined}
      variant={selected ? "inset" : "bevel"}
      background={
        disabled
          ? m3.color.surfaceVariant
          : selected
            ? m3.color.secondaryContainer
            : m3.color.primaryContainer
      }
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      fullWidth
      rootStyle={rootStyle}
      contentStyle={s.actionContent}
    >
      <View style={s.actionRow}>
        {glyph ? (
          <PixelGlyph
            name={glyph}
            size={16}
            color={disabled ? m3.color.onSurfaceVariant : m3.color.onPrimaryContainer}
          />
        ) : null}
        <Text style={[s.actionText, disabled ? s.actionTextDisabled : null]}>{label}</Text>
      </View>
    </PixelPressable>
  );
}

function StatusSurface({
  message,
  error = false,
  loading = false,
  actionLabel,
  onAction,
}: {
  message: string;
  error?: boolean;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <PixelSurface
      variant="inset"
      background={error ? m3.color.errorContainer : m3.color.surfaceContainer}
      contentStyle={s.statusContent}
    >
      <View style={s.statusRow}>
        {loading ? (
          <ActivityIndicator color={m3.color.primary} accessibilityLabel={message} />
        ) : (
          <PixelGlyph
            name={error ? "warning" : "info"}
            size={18}
            color={error ? m3.color.onErrorContainer : m3.color.onSurfaceVariant}
          />
        )}
        <Text style={[s.statusText, error ? s.statusTextError : null]}>{message}</Text>
      </View>
      {actionLabel && onAction ? (
        <PlanAction
          label={actionLabel}
          onPress={onAction}
          glyph="refresh"
          rootStyle={s.statusAction}
        />
      ) : null}
    </PixelSurface>
  );
}

function GateState({
  title,
  message,
  loading = false,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <DockShell title={title}>
      <Text style={s.headline}>{title}</Text>
      <StatusSurface
        message={message}
        error={!loading}
        loading={loading}
        actionLabel={actionLabel}
        onAction={onAction}
      />
    </DockShell>
  );
}

export function DeepSpacePlansScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language === "ko";
  const auth = useAuth();
  const progression = useProgression();
  const pathname = usePathname();
  const { userId, hasProfile, isMinor, profileProbeFailed, loading: authLoading } = auth;
  const {
    tier: currentTier,
    loading: tierLoading,
    error: tierError,
    ownerId: tierOwnerId,
    refresh: refreshTier,
  } = progression;

  const dataOwner =
    !authLoading &&
    userId !== null &&
    hasProfile === true &&
    !profileProbeFailed &&
    !tierLoading &&
    tierError !== true &&
    tierOwnerId === userId
      ? userId
      : null;
  const activeOwnerRef = useRef<string | null>(dataOwner);
  activeOwnerRef.current = dataOwner;
  const authOwnerRef = useRef<string | null>(userId);
  authOwnerRef.current = userId;

  const [storeRead, setStoreRead] = useState<StoreRead>(EMPTY_STORE);
  const [prefsRead, setPrefsRead] = useState<PrefsRead>(EMPTY_PREFS);
  const [usageRead, setUsageRead] = useState<UsageRead>(EMPTY_USAGE);
  const [readEpoch, setReadEpoch] = useState(0);
  const storeGeneration = useRef(0);
  const prefsGeneration = useRef(0);
  const usageGeneration = useRef(0);

  const [busyState, setBusyState] = useState<{
    ownerId: string;
    action: "buy" | "restore";
  } | null>(null);
  const actionLockRef = useRef(createOwnerActionGate());
  actionLockRef.current.discardOtherOwner(userId);
  const [, setPurchaseState] = useState<PurchaseState>("idle");
  const [errorState, setError] = useState<string | null>(null);
  const errorOwnerRef = useRef<string | null>(null);
  const [pendingTierState, setPendingTier] = useState<"plus" | "pro" | null>(null);
  const pendingOwnerRef = useRef<string | null>(null);
  const [termsOk, setTermsOk] = useState(false);
  const [cadence, setCadence] = useState<CheckoutCadence>("monthly");
  const [rewardVisibleState, setRewardVisible] = useState(false);
  const rewardOwnerRef = useRef<string | null>(null);
  const interactionBoundaryRef = useRef<string | null>(dataOwner);
  if (interactionBoundaryRef.current !== dataOwner) {
    interactionBoundaryRef.current = dataOwner;
    errorOwnerRef.current = null;
    pendingOwnerRef.current = null;
    rewardOwnerRef.current = null;
  }
  const busyAction = busyState?.ownerId === userId ? busyState.action : null;
  const busy = busyAction !== null || actionLockRef.current.isLocked(userId);
  const error = errorOwnerRef.current === dataOwner ? errorState : null;
  const pendingTier = pendingOwnerRef.current === dataOwner ? pendingTierState : null;
  const rewardVisible = rewardOwnerRef.current === dataOwner && rewardVisibleState;

  useEffect(() => {
    const generation = ++storeGeneration.current;
    if (!dataOwner) {
      setStoreRead(EMPTY_STORE);
      return;
    }
    let alive = true;
    setStoreRead({
      ownerId: dataOwner,
      status: "loading",
      packages: [],
      nativeAvailable: false,
    });
    configurePurchases();
    const nativeAvailable = arePurchasesAvailable();
    void settleAsyncRead(getOfferingsResult(), READ_TIMEOUT_MS).then((settlement) => {
      if (!alive || generation !== storeGeneration.current || activeOwnerRef.current !== dataOwner)
        return;
      if (settlement.status === "timeout") {
        setStoreRead({ ownerId: dataOwner, status: "timeout", packages: [], nativeAvailable });
      } else if (settlement.status === "error") {
        setStoreRead({ ownerId: dataOwner, status: "error", packages: [], nativeAvailable });
      } else if (settlement.value.status === "ready") {
        setStoreRead({
          ownerId: dataOwner,
          status: "ready",
          packages: settlement.value.packages,
          nativeAvailable,
        });
      } else {
        setStoreRead({
          ownerId: dataOwner,
          status: settlement.value.status,
          packages: [],
          nativeAvailable,
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [dataOwner, readEpoch]);

  useEffect(() => {
    const generation = ++prefsGeneration.current;
    if (!dataOwner || currentTier !== "free") {
      setPrefsRead({
        ownerId: dataOwner,
        status: dataOwner ? "unavailable" : "idle",
        adsConsent: null,
      });
      return;
    }
    let alive = true;
    setPrefsRead({ ownerId: dataOwner, status: "loading", adsConsent: null });
    void settleAsyncRead(readPrivacyPrefsStrict(dataOwner), READ_TIMEOUT_MS).then((settlement) => {
      if (!alive || generation !== prefsGeneration.current || activeOwnerRef.current !== dataOwner)
        return;
      if (settlement.status === "ready") setPrefsRead(settlement.value);
      else setPrefsRead({ ownerId: dataOwner, status: settlement.status, adsConsent: null });
    });
    return () => {
      alive = false;
    };
  }, [currentTier, dataOwner, readEpoch]);

  useEffect(() => {
    const generation = ++usageGeneration.current;
    if (!dataOwner || currentTier !== "free") {
      setUsageRead({
        ownerId: dataOwner,
        status: dataOwner ? "unavailable" : "idle",
        used: 0,
        rewardCredits: 0,
        rewardEarned: 0,
      });
      return;
    }
    let alive = true;
    setUsageRead({
      ownerId: dataOwner,
      status: "loading",
      used: 0,
      rewardCredits: 0,
      rewardEarned: 0,
    });
    void settleAsyncRead(readReasoningUsageStrict(dataOwner), READ_TIMEOUT_MS).then(
      (settlement) => {
        if (
          !alive ||
          generation !== usageGeneration.current ||
          activeOwnerRef.current !== dataOwner
        )
          return;
        if (settlement.status === "ready") setUsageRead(settlement.value);
        else
          setUsageRead({
            ownerId: dataOwner,
            status: settlement.status,
            used: 0,
            rewardCredits: 0,
            rewardEarned: 0,
          });
      },
    );
    return () => {
      alive = false;
    };
  }, [currentTier, dataOwner, readEpoch]);

  const ownedStore: StoreRead =
    storeRead.ownerId === dataOwner
      ? storeRead
      : {
          ownerId: dataOwner,
          status: dataOwner ? "loading" : "idle",
          packages: [],
          nativeAvailable: false,
        };
  const ownedPrefs: PrefsRead =
    prefsRead.ownerId === dataOwner
      ? prefsRead
      : { ownerId: dataOwner, status: dataOwner ? "loading" : "idle", adsConsent: null };
  const ownedUsage: UsageRead =
    usageRead.ownerId === dataOwner
      ? usageRead
      : {
          ownerId: dataOwner,
          status: dataOwner ? "loading" : "idle",
          used: 0,
          rewardCredits: 0,
          rewardEarned: 0,
        };

  const packages = ownedStore.packages;
  const plusPkg = useMemo(() => findMonthlyTierPackage(packages, "plus"), [packages]);
  const proPkg = useMemo(() => findMonthlyTierPackage(packages, "pro"), [packages]);

  const yearlyOffered =
    (paddleCheckoutAvailable("cortex", "yearly") && paddleCheckoutAvailable("cortex", "monthly")) ||
    (!PRO_COMING_SOON &&
      paddleCheckoutAvailable("brain", "yearly") &&
      paddleCheckoutAvailable("brain", "monthly"));

  const onNorthStar = currentTier === "brain";
  const onVoyager = !onNorthStar && (currentTier === "cortex" || currentTier === "soma");
  const onStargazer = !onNorthStar && !onVoyager;
  const isCurrent: Record<TierKey, boolean> = {
    free: onStargazer,
    plus: onVoyager,
    pro: onNorthStar,
  };

  function canPurchase(key: TierKey): boolean {
    if (key === "free") return false;
    if (key === "pro" && PRO_COMING_SOON) return false;
    const paddleTier: CheckoutTier = key === "plus" ? "cortex" : "brain";
    if (paddleCheckoutAvailable(paddleTier, cadence)) return true;
    if (cadence !== "monthly") return false;
    return (key === "plus" ? plusPkg : proPkg) != null;
  }

  const loading = ownedStore.status === "loading";
  const offeringHasNoSellablePackage =
    ownedStore.status === "ready" &&
    plusPkg === undefined &&
    (PRO_COMING_SOON || proPkg === undefined);
  const showStoreNotice =
    (ownedStore.status === "unavailable" || offeringHasNoSellablePackage) &&
    !loading &&
    !canPurchase("plus") &&
    !canPurchase("pro");
  const showStoreError =
    (ownedStore.status === "error" || ownedStore.status === "timeout") &&
    !canPurchase("plus") &&
    !canPurchase("pro");

  const per = t("ds.plans.per");
  const perYear = t("ds.plans.perYear");
  const priceFor = (key: "plus" | "pro"): string =>
    cadence === "yearly"
      ? `${krw(TIER_PRICE_KRW_YEARLY[key])}${perYear}`
      : `${krw(TIER_PRICE_KRW[key])}${per}`;
  const tiers: TierCopy[] = [
    {
      key: "free",
      name: t("ds.plans.freeName"),
      sub: t("ds.plans.freeSub"),
      price: t("ds.plans.freePrice"),
      feats: [t("ds.plans.freeFeat1"), t("ds.plans.freeFeat2"), t("ds.plans.freeFeat3")],
    },
    {
      key: "plus",
      name: t("ds.plans.plusName"),
      sub: t("ds.plans.plusSub"),
      price: priceFor("plus"),
      feats: [t("ds.plans.plusFeat1"), t("ds.plans.plusFeat2"), t("ds.plans.plusFeat3")],
    },
    {
      key: "pro",
      name: t("ds.plans.proName"),
      sub: t("ds.plans.proSub"),
      price: priceFor("pro"),
      feats: [t("ds.plans.proFeat1"), t("ds.plans.proFeat2"), t("ds.plans.proFeat3")],
    },
  ];

  async function buy(pkg: PurchasesPackage) {
    const owner = dataOwner;
    if (!owner) return;
    const request = actionLockRef.current.acquire(owner);
    if (!request) return;
    errorOwnerRef.current = owner;
    setBusyState({ ownerId: owner, action: "buy" });
    setError(null);
    try {
      const outcome = await purchasePackage(pkg);
      if (authOwnerRef.current !== owner) return;
      if (outcome.status === "purchased") {
        setPurchaseState("purchased");
        await refreshTier();
      } else if (outcome.status === "cancelled") {
        setPurchaseState("cancelled");
      } else if (outcome.status === "unavailable") {
        setPurchaseState("unavailable");
        setError(t("ds.plans.purchaseError"));
      } else {
        setPurchaseState("error");
        setError(t("ds.plans.purchaseError"));
      }
    } finally {
      const released = actionLockRef.current.release(request);
      if (released && authOwnerRef.current === owner) setBusyState(null);
    }
  }

  async function buyWithPaddle(tier: CheckoutTier) {
    const owner = dataOwner;
    if (!owner) return;
    const request = actionLockRef.current.acquire(owner);
    if (!request) return;
    errorOwnerRef.current = owner;
    setBusyState({ ownerId: owner, action: "buy" });
    setError(null);
    try {
      const outcome = await openPaddleCheckout({ tier, cadence, locale: ko ? "ko" : "en" });
      if (authOwnerRef.current !== owner) return;
      if (outcome.ok) {
        // The overlay was handed off. Only the webhook may grant the tier.
        setPurchaseState("handed-off");
      } else {
        setPurchaseState(outcome.reason === "not_configured" ? "unavailable" : "error");
        setError(t("ds.plans.purchaseError"));
      }
    } finally {
      const released = actionLockRef.current.release(request);
      if (released && authOwnerRef.current === owner) setBusyState(null);
    }
  }

  async function restore() {
    const owner = dataOwner;
    if (!owner) return;
    const request = actionLockRef.current.acquire(owner);
    if (!request) return;
    errorOwnerRef.current = owner;
    setBusyState({ ownerId: owner, action: "restore" });
    setError(null);
    try {
      const outcome = await restorePurchases();
      if (authOwnerRef.current !== owner) return;
      if (outcome.status === "restored") {
        if (outcome.isPro) {
          setPurchaseState("purchased");
          await refreshTier();
        } else {
          setPurchaseState("cancelled");
          setError(t("ds.plans.restoredNone"));
        }
      } else if (outcome.status === "unavailable") {
        setPurchaseState("unavailable");
        setError(t("ds.plans.restoreError"));
      } else {
        setPurchaseState("error");
        setError(t("ds.plans.restoreError"));
      }
    } finally {
      const released = actionLockRef.current.release(request);
      if (released && authOwnerRef.current === owner) setBusyState(null);
    }
  }

  function onStart(key: TierKey) {
    if (busy || actionLockRef.current.isLocked(userId)) return;
    if (key === "free") return;
    if (key === "pro" && PRO_COMING_SOON) return;
    errorOwnerRef.current = dataOwner;
    pendingOwnerRef.current = dataOwner;
    setError(null);
    setTermsOk(false);
    setPendingTier(key);
  }

  function beginPurchase(key: TierKey) {
    if (busy || actionLockRef.current.isLocked(userId)) return;
    if (key === "free") return;
    if (key === "pro" && PRO_COMING_SOON) return;
    const paddleTier: CheckoutTier = key === "plus" ? "cortex" : "brain";
    if (paddleCheckoutAvailable(paddleTier, cadence)) {
      void buyWithPaddle(paddleTier);
      return;
    }
    if (cadence !== "monthly") {
      setError(t("ds.plans.purchaseError"));
      return;
    }
    if (key === "plus" && plusPkg) void buy(plusPkg);
    else if (key === "pro" && proPkg) void buy(proPkg);
    else setError(t("ds.plans.purchaseError"));
  }

  const adsConsent = ownedPrefs.status === "ready" ? ownedPrefs.adsConsent : null;
  const rewardPolicyCandidate =
    canCompleteRewardedWatch() &&
    canShowRewardedAds({
      tier: tierLoading ? null : currentTier,
      isMinor,
      adsConsent: true,
      route: pathname ?? "/",
    });
  const rewardCapOpen =
    ownedUsage.status === "ready" &&
    rewardCapAllowsWatch(ownedUsage.rewardEarned, REWARD_MONTHLY_CAP);
  const rewardCapReached = ownedUsage.status === "ready" && !rewardCapOpen;
  const rewardedAllowed =
    rewardPolicyCandidate && ownedPrefs.status === "ready" && adsConsent === true && rewardCapOpen;
  const freeRemaining =
    ownedUsage.status === "ready"
      ? remainingReasoning("free", ownedUsage.used, ownedUsage.rewardCredits)
      : 0;

  async function onRewardEarned(credits: number) {
    const owner = dataOwner;
    if (!owner || activeOwnerRef.current !== owner || !rewardedAllowed) return;
    await addRewardCredits(owner, credits);
    if (activeOwnerRef.current !== owner) return;
    const generation = ++usageGeneration.current;
    const settlement = await settleAsyncRead(readReasoningUsageStrict(owner), READ_TIMEOUT_MS);
    if (generation !== usageGeneration.current || activeOwnerRef.current !== owner) return;
    if (settlement.status === "ready") setUsageRead(settlement.value);
    else
      setUsageRead({
        ownerId: owner,
        status: settlement.status,
        used: 0,
        rewardCredits: 0,
        rewardEarned: 0,
      });
  }

  if (authLoading) {
    return <GateState title={t("ds.plans.title")} message={t("ds.plans.loading")} loading />;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (profileProbeFailed || hasProfile === null) {
    return (
      <GateState
        title={t("ds.plans.title")}
        message={t("ds.plans.loadError")}
        actionLabel={t("records.retry")}
        onAction={() => void auth.refresh()}
      />
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (tierLoading || tierOwnerId !== userId) {
    return <GateState title={t("ds.plans.title")} message={t("ds.plans.loading")} loading />;
  }
  if (tierError) {
    return (
      <GateState
        title={t("ds.plans.title")}
        message={t("ds.plans.loadError")}
        actionLabel={t("records.retry")}
        onAction={() => void refreshTier()}
      />
    );
  }

  return (
    <DockShell title={t("ds.plans.title")}>
      <Text style={s.headline}>{t("ds.plans.title")}</Text>

      <PixelSurface
        variant="inset"
        background={m3.color.tertiaryContainer}
        contentStyle={s.honestyContent}
      >
        <View style={s.honestyRow}>
          <PixelGlyph name="lock" color={m3.color.onTertiaryContainer} size={20} />
          <Text style={s.honestyText}>
            {t("ds.plans.honestyLead")}
            <Text style={s.honestyStrong}>{t("ds.plans.honestyStrong")}</Text>
            {t("ds.plans.honestyTail")}
          </Text>
        </View>
      </PixelSurface>

      {isMinor === true ? (
        <PixelSurface variant="frame" contentStyle={s.noticeContent}>
          <View style={s.honestyRow}>
            <PixelGlyph name="info" color={m3.color.onSurfaceVariant} size={18} />
            <Text style={s.noticeText}>{t("ds.plans.minorPurchaseNotice")}</Text>
          </View>
        </PixelSurface>
      ) : null}

      {yearlyOffered ? (
        <View style={s.cadence}>
          <View style={s.cadenceRow}>
            <View style={s.cadenceCell}>
              <PixelPressable
                onPress={() => setCadence("monthly")}
                variant={cadence === "monthly" ? "inset" : "bevel"}
                background={
                  cadence === "monthly"
                    ? m3.color.secondaryContainer
                    : m3.color.surfaceContainerHigh
                }
                accessibilityRole="tab"
                accessibilityLabel={t("ds.plans.cadenceMonthly")}
                accessibilityState={{ selected: cadence === "monthly" }}
                fullWidth
                contentStyle={s.cadenceAction}
              >
                <Text style={s.cadenceText}>{t("ds.plans.cadenceMonthly")}</Text>
              </PixelPressable>
            </View>
            <View style={s.cadenceCell}>
              <PixelPressable
                onPress={() => setCadence("yearly")}
                variant={cadence === "yearly" ? "inset" : "bevel"}
                background={
                  cadence === "yearly" ? m3.color.secondaryContainer : m3.color.surfaceContainerHigh
                }
                accessibilityRole="tab"
                accessibilityLabel={t("ds.plans.cadenceYearly")}
                accessibilityState={{ selected: cadence === "yearly" }}
                fullWidth
                contentStyle={s.cadenceAction}
              >
                <Text style={s.cadenceText}>{t("ds.plans.cadenceYearly")}</Text>
              </PixelPressable>
            </View>
          </View>
          <Text style={s.cadenceNote}>{t("ds.plans.cadenceSaving")}</Text>
        </View>
      ) : null}

      {loading ? <StatusSurface message={t("ds.plans.loading")} loading /> : null}

      <View style={s.tierList}>
        {tiers.map((tr) => {
          const cur = isCurrent[tr.key];
          const unavailableLabel =
            ownedStore.status === "loading"
              ? t("ds.plans.loading")
              : ownedStore.status === "error" || ownedStore.status === "timeout"
                ? t("ds.plans.loadError")
                : !canPurchase(tr.key)
                  ? t("ds.plans.comingSoon")
                  : t("ds.plans.startTier", { name: tr.name });
          const actionLabel = cur
            ? t("ds.plans.currentPlan")
            : tr.key === "free"
              ? t("ds.plans.included")
              : tr.key === "pro" && PRO_COMING_SOON
                ? t("ds.plans.comingSoon")
                : !canPurchase(tr.key)
                  ? unavailableLabel
                  : busyAction === "buy"
                    ? t("ds.plans.purchasing")
                    : t("ds.plans.startTier", { name: tr.name });
          return (
            <PixelSurface
              key={tr.key}
              variant={cur ? "inset" : "bevel"}
              background={cur ? m3.color.secondaryContainer : m3.color.surfaceContainerHigh}
              contentStyle={s.tierCard}
            >
              <View style={s.tierTop}>
                <Text style={s.tierName}>{tr.name}</Text>
                <Text style={s.tierSub}>{tr.sub}</Text>
              </View>
              <Text style={s.tierPrice}>{tr.price}</Text>
              {cur || (tr.key === "pro" && PRO_COMING_SOON) ? (
                <View style={s.badgeRow}>
                  {cur ? (
                    <PixelSurface
                      variant="inset"
                      background={m3.color.primary}
                      contentStyle={s.badgeContent}
                    >
                      <Text style={s.badgeTextCurrent}>{t("ds.plans.active")}</Text>
                    </PixelSurface>
                  ) : null}
                  {tr.key === "pro" && PRO_COMING_SOON ? (
                    <PixelSurface
                      variant="inset"
                      background={m3.color.surfaceVariant}
                      contentStyle={s.badgeContent}
                    >
                      <Text style={s.badgeText}>{t("ds.plans.comingSoon")}</Text>
                    </PixelSurface>
                  ) : null}
                </View>
              ) : null}
              <View style={s.featureList}>
                {tr.feats.map((feature) => (
                  <View key={feature} style={s.featureRow}>
                    <PixelGlyph name="check" color={m3.color.primary} size={16} />
                    <Text style={s.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
              <PlanAction
                label={actionLabel}
                glyph={cur ? "check" : "chevron_right"}
                disabled={busy || cur || !canPurchase(tr.key)}
                onPress={cur || !canPurchase(tr.key) ? undefined : () => onStart(tr.key)}
              />
            </PixelSurface>
          );
        })}
      </View>

      {error ? <StatusSurface message={error} error /> : null}

      {rewardPolicyCandidate &&
      ownedPrefs.status === "ready" &&
      ownedPrefs.adsConsent !== true ? null : rewardPolicyCandidate &&
        (ownedPrefs.status === "loading" ||
          (ownedPrefs.status === "ready" && ownedUsage.status === "loading")) ? (
        <StatusSurface message={t("ds.plans.loading")} loading />
      ) : rewardPolicyCandidate &&
        (ownedPrefs.status === "error" ||
          ownedPrefs.status === "timeout" ||
          ownedPrefs.status === "unavailable" ||
          ownedUsage.status === "error" ||
          ownedUsage.status === "timeout" ||
          ownedUsage.status === "unavailable") ? (
        <StatusSurface
          message={t("ds.plans.loadError")}
          error
          actionLabel={t("records.retry")}
          onAction={() => setReadEpoch((value) => value + 1)}
        />
      ) : rewardPolicyCandidate &&
        ownedPrefs.status === "ready" &&
        ownedPrefs.adsConsent === true &&
        rewardCapReached ? (
        <View style={s.rewardSection}>
          <Text style={s.sectionLabel}>{t("ds.plans.growWithoutPaying")}</Text>
          <StatusSurface
            message={t("ds.reasoningLimit.rewardCapReached", { cap: REWARD_MONTHLY_CAP })}
          />
        </View>
      ) : rewardedAllowed ? (
        <View style={s.rewardSection}>
          <Text style={s.sectionLabel}>{t("ds.plans.growWithoutPaying")}</Text>
          <PixelPressable
            onPress={() => {
              rewardOwnerRef.current = dataOwner;
              setRewardVisible(true);
            }}
            variant="bevel"
            background={m3.color.tertiaryContainer}
            accessibilityLabel={`${t("ds.plans.rewardTitle")}. ${t("ds.plans.rewardSub", {
              n: REWARD_PER_WATCH,
              cap: REWARD_MONTHLY_CAP,
            })}`}
            fullWidth
            contentStyle={s.rewardContent}
          >
            <PixelGlyph name="bolt" color={m3.color.onTertiaryContainer} size={22} />
            <View style={s.rewardText}>
              <Text style={s.rewardTitle}>{t("ds.plans.rewardTitle")}</Text>
              <Text style={s.rewardSub}>
                {t("ds.plans.rewardSub", { n: REWARD_PER_WATCH, cap: REWARD_MONTHLY_CAP })}
              </Text>
            </View>
            <PixelGlyph name="chevron_right" color={m3.color.onTertiaryContainer} size={18} />
          </PixelPressable>
        </View>
      ) : null}

      <View style={s.disclosure}>
        <Text style={s.disclosureText}>
          {cadence === "yearly" ? t("ds.plans.disclosureYearly") : t("ds.plans.disclosure")}
        </Text>
        <View style={s.legalLinks}>
          <View style={s.legalCell}>
            <PlanAction label={t("ds.plans.legalTerms")} onPress={() => router.push("/terms")} />
          </View>
          <View style={s.legalCell}>
            <PlanAction label={t("ds.plans.legalRefund")} onPress={() => router.push("/refund")} />
          </View>
        </View>
      </View>

      {showStoreError ? (
        <StatusSurface
          message={t("ds.plans.loadError")}
          error
          actionLabel={t("records.retry")}
          onAction={() => setReadEpoch((value) => value + 1)}
        />
      ) : null}

      {showStoreNotice ? (
        <PixelSurface variant="frame" contentStyle={s.noticeContent}>
          <Text style={s.noticeTitle}>{t("ds.plans.noticeTitle")}</Text>
          <Text style={s.noticeText}>{t("ds.plans.noticeBody")}</Text>
          <PlanAction
            label={t("ds.plans.contactSupport")}
            onPress={() => router.push("/support")}
            glyph="chevron_right"
          />
        </PixelSurface>
      ) : null}

      {ownedStore.nativeAvailable ? (
        <PlanAction
          label={busyAction === "restore" ? t("ds.plans.restoring") : t("ds.plans.restore")}
          onPress={() => void restore()}
          disabled={busy}
          glyph="refresh"
        />
      ) : null}

      <Modal
        visible={pendingTier !== null}
        transparent
        animationType="none"
        onRequestClose={() => setPendingTier(null)}
        statusBarTranslucent
      >
        <View style={s.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPendingTier(null)}
            accessibilityRole="button"
            accessibilityLabel={t("ds.plans.terms.back")}
          >
            <PixelScrim />
          </Pressable>
          <ScrollView
            style={s.modalScroll}
            contentContainerStyle={s.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <PixelSurface
              variant="bevel"
              background={m3.color.surfaceContainerHigh}
              contentStyle={s.termsContent}
            >
              <View accessibilityViewIsModal>
                <Text style={s.termsTitle}>{t("ds.plans.terms.title")}</Text>
                {pendingTier ? (
                  <>
                    <Text style={s.termsPlan}>
                      {t("ds.plans.terms.charge", {
                        plan: tiers.find((item) => item.key === pendingTier)?.name ?? "",
                        price: priceFor(pendingTier),
                      })}
                    </Text>
                    {/* prettier-ignore */}
                    <Text style={s.termsLine}>{cadence === "yearly" ? t("ds.plans.terms.cycleYearly") : t("ds.plans.terms.cycleMonthly")}</Text>
                    <Text style={s.termsLine}>{t("ds.plans.terms.cancelHow")}</Text>
                    <PixelPressable
                      onPress={() => setTermsOk((value) => !value)}
                      variant={termsOk ? "inset" : "frame"}
                      background={termsOk ? m3.color.secondaryContainer : m3.color.surfaceContainer}
                      accessibilityRole="checkbox"
                      accessibilityLabel={t("ds.plans.terms.agree")}
                      accessibilityState={{ checked: termsOk }}
                      fullWidth
                      contentStyle={s.termsCheckContent}
                    >
                      <PixelSurface
                        variant="inset"
                        background={termsOk ? m3.color.primary : m3.color.surfaceVariant}
                        contentStyle={s.checkboxContent}
                      >
                        {termsOk ? (
                          <PixelGlyph name="check" color={m3.color.onPrimary} size={16} />
                        ) : null}
                      </PixelSurface>
                      <Text style={s.termsAgree}>{t("ds.plans.terms.agree")}</Text>
                    </PixelPressable>
                    <View style={s.termsActions}>
                      <PlanAction
                        label={t("ds.plans.terms.back")}
                        onPress={() => setPendingTier(null)}
                      />
                      <PlanAction
                        label={t("ds.plans.terms.cta")}
                        disabled={!termsOk}
                        onPress={
                          termsOk
                            ? () => {
                                const key = pendingTier;
                                setPendingTier(null);
                                if (key) beginPurchase(key);
                              }
                            : undefined
                        }
                        glyph="chevron_right"
                      />
                    </View>
                  </>
                ) : null}
              </View>
            </PixelSurface>
          </ScrollView>
        </View>
      </Modal>

      <RewardedSheet
        visible={rewardVisible && rewardedAllowed}
        onClose={() => {
          if (rewardOwnerRef.current === dataOwner) setRewardVisible(false);
        }}
        remaining={freeRemaining}
        onEarned={onRewardEarned}
        locale={ko ? "ko" : "en"}
      />
    </DockShell>
  );
}

const s = StyleSheet.create({
  scroll: {
    padding: m3.spacing.s4,
    paddingBottom: m3.spacing.s8,
    gap: m3.spacing.s6,
  },
  headline: {
    marginTop: m3.spacing.s2,
    fontFamily: m3.font.brand,
    fontSize: m3.type.headlineSmall.size,
    lineHeight: m3.type.headlineSmall.line,
    fontWeight: m3.type.headlineSmall.weight,
    color: m3.color.onSurface,
  },
  honestyContent: { padding: m3.spacing.s6 },
  honestyRow: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s4 },
  honestyText: {
    flex: 1,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    color: m3.color.onTertiaryContainer,
  },
  honestyStrong: { fontWeight: m3.font.weight.bold, color: m3.color.onTertiaryContainer },
  cadence: { gap: m3.spacing.s3 },
  cadenceRow: { flexDirection: "row", gap: m3.spacing.s4 },
  cadenceCell: { flex: 1, minWidth: 0 },
  cadenceAction: { alignItems: "center" },
  cadenceText: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: m3.type.labelLarge.weight,
    color: m3.color.onSurface,
    textAlign: "center",
  },
  cadenceNote: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
  },
  statusContent: { gap: m3.spacing.s4, padding: m3.spacing.s6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s4 },
  statusText: {
    flex: 1,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    color: m3.color.onSurfaceVariant,
  },
  statusTextError: { color: m3.color.onErrorContainer },
  statusAction: { alignSelf: "stretch" },
  tierList: { gap: m3.spacing.s6 },
  tierCard: { padding: m3.spacing.s6, gap: m3.spacing.s4 },
  tierTop: { gap: m3.spacing.s1 },
  tierName: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.titleLarge.size,
    lineHeight: m3.type.titleLarge.line,
    fontWeight: m3.type.titleLarge.weight,
    color: m3.color.onSurface,
  },
  tierSub: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    color: m3.color.onSurfaceVariant,
  },
  tierPrice: {
    fontFamily: m3.font.mono,
    fontSize: m3.type.headlineSmall.size,
    lineHeight: m3.type.headlineSmall.line,
    fontWeight: m3.type.headlineSmall.weight,
    color: m3.color.primary,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s4 },
  badgeContent: { paddingVertical: m3.spacing.s2, paddingHorizontal: m3.spacing.s4 },
  badgeText: {
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    color: m3.color.onSurfaceVariant,
  },
  badgeTextCurrent: {
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    color: m3.color.onPrimary,
  },
  featureList: { gap: m3.spacing.s3 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s3 },
  featureText: {
    flex: 1,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    color: m3.color.onSurface,
  },
  actionContent: { minHeight: m3.minTouch, alignItems: "center" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s3,
  },
  actionText: {
    flexShrink: 1,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: m3.type.labelLarge.weight,
    color: m3.color.onPrimaryContainer,
    textAlign: "center",
  },
  actionTextDisabled: { color: m3.color.onSurfaceVariant },
  rewardSection: { gap: m3.spacing.s3 },
  sectionLabel: {
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    color: m3.color.onSurfaceVariant,
  },
  rewardContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    padding: m3.spacing.s6,
  },
  rewardText: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  rewardTitle: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.titleSmall.size,
    lineHeight: m3.type.titleSmall.line,
    fontWeight: m3.type.titleSmall.weight,
    color: m3.color.onTertiaryContainer,
  },
  rewardSub: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    color: m3.color.onTertiaryContainer,
  },
  disclosure: { gap: m3.spacing.s4 },
  disclosureText: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    color: m3.color.onSurfaceVariant,
  },
  legalLinks: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s8 },
  legalCell: { flexGrow: 1, minWidth: 132 },
  noticeContent: { gap: m3.spacing.s4, padding: m3.spacing.s6 },
  noticeTitle: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.titleSmall.size,
    lineHeight: m3.type.titleSmall.line,
    fontWeight: m3.type.titleSmall.weight,
    color: m3.color.onSurface,
  },
  noticeText: {
    flex: 1,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    color: m3.color.onSurfaceVariant,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end", padding: m3.spacing.s4 },
  modalScroll: { maxHeight: "90%" },
  modalScrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  termsContent: { padding: m3.spacing.s6 },
  termsTitle: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.titleLarge.size,
    lineHeight: m3.type.titleLarge.line,
    fontWeight: m3.type.titleLarge.weight,
    color: m3.color.onSurface,
  },
  termsPlan: {
    marginTop: m3.spacing.s6,
    fontFamily: m3.font.mono,
    fontSize: m3.type.titleSmall.size,
    lineHeight: m3.type.titleSmall.line,
    fontWeight: m3.type.titleSmall.weight,
    color: m3.color.primary,
  },
  termsLine: {
    marginTop: m3.spacing.s4,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    color: m3.color.onSurfaceVariant,
  },
  termsCheckContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    padding: m3.spacing.s4,
  },
  checkboxContent: {
    width: 20,
    height: 20,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  termsAgree: {
    flex: 1,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    color: m3.color.onSurface,
  },
  termsActions: { marginTop: m3.spacing.s6, gap: m3.spacing.s4 },
});
