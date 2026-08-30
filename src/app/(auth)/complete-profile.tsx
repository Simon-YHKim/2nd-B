import { SafeAreaView } from "react-native-safe-area-context";
// Post-OAuth profile completion. Users who sign in via Google land here when
// the public.users row doesn't exist yet — we need their date of birth to
// satisfy C10 (age gate) before letting them into the app.

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { GoalField, NameField } from "@/components/auth/ProfileIntakeFields";
import { saveNorthstar } from "@/lib/persona/northstar";
import { deepSpace, deepSpaceSpacing, flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { ageInYears, ensureUserProfile, AgeGateError, EmailInUseError, signOut, MIN_SELF_CONSENT_AGE } from "@/lib/supabase/auth";
import { useAuth } from "@/lib/auth/AuthContext";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { ConsentNotice } from "@/components/consent/ConsentNotice";
import { PixelSurface } from "@/components/pixel";
import {
  emptyConsentSelections,
  allRequiredAcksChecked,
  buildSignUpConsentArgs,
} from "@/lib/auth/consent-selections";
import { submitCompleteProfile, signOutAndSettle } from "@/lib/auth/complete-profile-flow";
import { recordConsentBestEffort } from "@/lib/supabase/consent";
import { useKeyboard } from "@/lib/ui/useKeyboard";

const ADULT_AGE = 18;
type CompleteProfileToast = { message: string; tone: "info" | "success" | "danger" };

export default function CompleteProfile() {
  const { t, i18n } = useTranslation("auth");
  const { userId, hasProfile, loading, refresh, profileProbeFailed } = useAuth();
  const [birthDate, setBirthDate] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Judge accounts (C6) get a 900ms welcome toast before entering. The flow's
  // refresh publishes hasProfile=true, which would make the redirect guard
  // below unmount the toast at zero frames — this flag holds the guard open
  // until the delayed router.replace runs.
  const [judgeWelcome, setJudgeWelcome] = useState(false);
  const [consent, setConsent] = useState(emptyConsentSelections());
  const [toast, setToast] = useState<CompleteProfileToast | null>(null);
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

  const age = ageInYears(birthDate);
  const isMinorAge = age >= MIN_SELF_CONSENT_AGE && age < ADULT_AGE;
  // The reference frame shows a 3/4 mock-profile counter, but the production
  // gate has exactly two required truths: an eligible DOB and every required
  // consent acknowledgement. Optional name/goal fields must never inflate or
  // block this progress indicator.
  const ageReady = age >= MIN_SELF_CONSENT_AGE;
  const consentReady = allRequiredAcksChecked(consent);
  const requiredProgress = Number(ageReady) + Number(consentReady);
  const canSubmit = useMemo(() => {
    return (
      userId !== null &&
      ageReady &&
      consentReady &&
      !submitting
    );
  }, [userId, ageReady, consentReady, submitting]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Still resolving the session/profile — show the branded checking state. The
  // redirects below read userId === null while loading, which would otherwise
  // bounce a freshly-signed-in OAuth user back to /sign-in before auth settles.
  if (loading) {
    return <InlineLoader message={t("common.checking")} />;
  }

  // F4: a TRANSIENT profile-probe failure lands here as hasProfile===false. Hold with
  // the checking state rather than showing the DOB + consent form to a user who may
  // already be fully registered (the probe merely failed). AuthContext re-probes; a
  // genuine no-profile answer (profileProbeFailed===false) falls through to the form.
  if (userId && hasProfile === false && profileProbeFailed) {
    return <InlineLoader message={t("common.checking")} />;
  }

  // Already has a profile — bounce to journal. Possible if the user navigates
  // here manually after completing setup. Held open mid-submit and during the
  // judge welcome: the submit flow refreshes the context (hasProfile flips
  // true) BEFORE the handler navigates, and this guard must not unmount the
  // screen (killing toasts and the handler's own navigation) in that window.
  if (userId && hasProfile && !submitting && !judgeWelcome) {
    return <Redirect href="/" />;
  }

  // Not signed in at all — bounce to sign-in.
  if (userId === null) {
    return <Redirect href="/sign-in" />;
  }

  // E2E-1/E2E-2 (e2e-shots-20260610): both P0s were ordering bugs between this
  // screen's navigation and the AuthContext cache, so the sequencing lives in
  // complete-profile-flow.ts (unit-tested). The flow settles the context
  // (refresh) BEFORE returning; this screen only maps results to UI.
  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await submitCompleteProfile({
        ensureProfile: () => ensureUserProfile({ birthDate, locale, displayName }),
        // Record the consent the user just gave, awaited before navigation so
        // a web router.replace can't cancel the in-flight write (see sign-up).
        // Still best-effort: a failure logs at error level, never blocks entry.
        // The flow calls this only on a fresh profile (created): when the users
        // row already exists, ensureUserProfile returns early WITHOUT
        // persisting this birth_date, so its age_band would be derived from a
        // never-saved DOB — and the original sign-up consent already exists.
        recordConsent: () =>
          userId
            ? recordConsentBestEffort(
                buildSignUpConsentArgs({ userId, isMinor: isMinorAge, locale, selections: consent }),
              )
            : Promise.resolve(),
        refreshAuth: refresh,
        signOutUser: signOut,
        isAgeGateError: (e) => e instanceof AgeGateError,
        isEmailInUseError: (e) => e instanceof EmailInUseError,
      });
      if (result.kind === "entered") {
        // L4: the goal becomes the first 북극성 문장 rather than a users column,
        // so it lands in the same ledger the /northstar screen edits and every
        // later revision stacks on top of it instead of overwriting.
        //
        // Best-effort by design, and the ordering matters: this runs AFTER the
        // profile exists and never gates entry. A failed sentence write must not
        // strand someone outside the app over an optional field they typed once.
        if (goal.trim() && userId) {
          try {
            await saveNorthstar({ userId, locale, sentence: goal, minor: isMinorAge });
          } catch (e) {
            console.error("[complete-profile] northstar seed failed", e);
          }
        }
        // The context already knows hasProfile=true (flow refreshed), so the
        // "/" guard lets the user through instead of bouncing back here — the
        // old silent Continue loop.
        if (result.judgeMode) {
          setJudgeWelcome(true); // hold the redirect guard open for the toast
          setToast({ tone: "success", message: t("judge.welcome") });
          setTimeout(() => router.replace("/"), 900);
          return;
        }
        router.replace("/");
        return;
      }
      if (result.kind === "emailInUse") {
        // Stranded-account exit (U6): this session's email belongs to another
        // sign-in method, so the profile INSERT can never succeed. Toast-first
        // like the age gate (the flow did NOT sign out yet), with a longer
        // beat -- the user must read WHICH way out exists (their original
        // method) before we sign the dead-end session out.
        setToast({ tone: "danger", message: t("errors.emailInUse") });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        const { signedOut } = await signOutAndSettle({ signOutUser: signOut, refreshAuth: refresh });
        if (signedOut) router.replace("/sign-in");
        return;
      }
      if (result.kind === "ageGate") {
        // The flow deliberately did NOT sign out yet: the toast must paint
        // while the screen is still mounted (a refresh would flip userId to
        // null and the guard above would unmount it instantly).
        setToast({ tone: "danger", message: t("errors.ageGate") });
        await new Promise((resolve) => setTimeout(resolve, 900));
        // C10: now sign the under-14 session out and settle the context, then
        // land on /sign-in directly — routing via "/" with a not-yet-settled
        // session is what redirect-warred with IntroGate (E2E-2). If the
        // sign-out failed the session is still live, so stay on the form.
        const { signedOut } = await signOutAndSettle({ signOutUser: signOut, refreshAuth: refresh });
        if (signedOut) router.replace("/sign-in");
        return;
      }
      setToast({ tone: "danger", message: t("errors.completeProfileSaveFailed") });
      if (typeof console !== "undefined") console.warn("[auth] completeProfile error", result.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(): Promise<void> {
    setCancelling(true);
    try {
      const { signedOut } = await signOutAndSettle({ signOutUser: signOut, refreshAuth: refresh });
      if (signedOut) {
        // The flow settled the context (userId is null) before we navigate, and
        // we go straight to /sign-in — not via "/" — so no guard ever sees the
        // contradictory signed-in-without-profile snapshot that crashed with
        // "Maximum update depth exceeded" (E2E-2; settings.tsx documents the
        // same stale-session race on its sign-out button).
        router.replace("/sign-in");
        return;
      }
      setToast({ tone: "danger", message: t("errors.signOutFailed") });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View pointerEvents="none" style={styles.spaceWash}>
        <View style={styles.topGlow} />
        <View style={[styles.star, styles.starA]} />
        <View style={[styles.star, styles.starB]} />
        <View style={[styles.star, styles.starC]} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) }]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <Text variant="heading" style={styles.title}>
            {t("completeProfile.title")}
          </Text>
          <Text variant="body" color="textMuted" style={styles.subtitle}>
            {t("completeProfile.subtitle")}
          </Text>
          <PixelSurface variant="inset" style={styles.portraitFrame} contentStyle={styles.portraitContent}>
            <View accessibilityRole="image" accessibilityLabel={t("common.entryArtwork")}>
              <SecondbHead size={80} mood="neutral" />
            </View>
          </PixelSurface>
        </View>

        <View style={styles.form}>
          {/* 0127 / L4. Optional, and it stays optional: onboarding is where
              people quit, and a required name buys nothing the app cannot do
              without. Both fields feed the profile home star, so filling them
              lights it at L2 immediately -- which is the point of asking here
              rather than burying them in settings. */}
          <PixelSurface variant="frame" style={styles.fieldSurface} contentStyle={styles.fieldSurfaceContent}>
            <NameField value={displayName} onChange={setDisplayName} />
            <GoalField value={goal} onChange={setGoal} />
          </PixelSurface>

          <PixelSurface variant="frame" style={styles.fieldSurface} contentStyle={styles.fieldSurfaceContent}>
            <BirthDateField value={birthDate} onChange={setBirthDate} />

            {birthDate.length > 0 ? (
              <View style={styles.checklist}>
                <ChecklistItem
                  ok={ageReady}
                  label={ageReady ? t("signUp.checkAge") : t("signUp.checkAgeBlocked")}
                />
              </View>
            ) : null}

            <ConsentNotice minor={isMinorAge} value={consent} onChange={setConsent} />
          </PixelSurface>

          <View style={styles.progressRow}>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t("completeProfile.submitHint")}
              accessibilityValue={{ min: 0, max: 2, now: requiredProgress }}
              style={styles.progressTrack}
            >
              <View style={[styles.progressCell, ageReady && styles.progressCellDone]} />
              <View style={[styles.progressCell, consentReady && styles.progressCellDone]} />
            </View>
            <Text variant="subtle" color="textMuted" style={styles.progressCount}>
              {requiredProgress} / 2
            </Text>
          </View>

          <Button
            label={t("completeProfile.submit")}
            variant="primary"
            disabled={!canSubmit || cancelling}
            loading={submitting}
            onPress={handleSubmit}
            accessibilityHint={t("completeProfile.submitHint")}
            full
            style={styles.submitButton}
          />
          <Button
            label={t("completeProfile.cancel")}
            // O-R1 P1: cancel here SIGNS OUT (destructive in effect) yet sat
            // at near-primary weight — demote so the required DOB+consent
            // submit is the only prominent action.
            variant="ghost"
            onPress={handleCancel}
            disabled={submitting || cancelling}
            loading={cancelling}
            accessibilityHint={t("completeProfile.cancelHint")}
            full
            style={styles.submitButton}
          />
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkDot, { backgroundColor: ok ? deepSpace.mint : deepSpace.textLo }]} />
      <Text variant="subtle" color={ok ? "success" : "textMuted"}>
        {label}
      </Text>
    </View>
  );
}

// PIXEL-CLAY 규칙 4 — 정적 반투명 금지. 이 화면의 배경 워시는 두 겹이라
// **자리마다 바탕이 다르다**: 글로우는 root(bgEdge) 위, 별 A/B 는 그 글로우 위,
// 별 C 는 다시 root 위다. 그래서 별 색이 두 개다. 하나로 합치면 글로우 위 별이
// 어두워진다 — 그건 면제가 아니라 틀린 색이다.
// ⚠ 알파도 자리마다 다르다 — `star` 기본이 0.7 인데 B·C 가 0.5 로 덮어쓰고 있었다.
//    그래서 색이 두 개가 아니라 **셋**이다.
const GLOW_ON_EDGE = flattenAlpha(deepSpace.bgGlow, 0.85, deepSpace.bgEdge);
const STAR_A = flattenAlpha(deepSpace.accentSoft, 0.7, GLOW_ON_EDGE);
const STAR_B = flattenAlpha(deepSpace.accentSoft, 0.5, GLOW_ON_EDGE);
const STAR_C = flattenAlpha(deepSpace.accentSoft, 0.5, deepSpace.bgEdge);
// 진행 레일은 스크롤 안에서 헤더 아래(y≳250)에 놓여 글로우(위 200px)와
// 겹치지 않는다. 따라서 합성 바탕은 root 다.
const PROGRESS_ON_EDGE = flattenAlpha(deepSpace.bgMid, 0.5, deepSpace.bgEdge);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deepSpace.bgEdge },
  spaceWash: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  topGlow: {
    position: "absolute",
    top: -120,
    left: -80,
    right: -80,
    height: 320,
    borderRadius: m3.shape.none,
    backgroundColor: GLOW_ON_EDGE,
  },
  star: { position: "absolute", width: 3, height: 3, borderRadius: m3.shape.none },
  // A·B 는 글로우 위, C 는 root 위 — 바탕도 알파(0.7/0.5/0.5)도 달라 색이 셋이다.
  starA: { top: 80, left: "20%", backgroundColor: STAR_A },
  starB: { top: 150, right: "24%", backgroundColor: STAR_B },
  starC: { bottom: 120, left: "28%", backgroundColor: STAR_C },
  scroll: {
    padding: deepSpaceSpacing.lg,
    paddingBottom: deepSpaceSpacing.xl,
    gap: deepSpaceSpacing.lg,
    // Web only: cap the auth column (cycle-4 live QA) — no-op on native.
    ...(Platform.OS === "web" ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const } : {}),
  },
  header: { alignItems: "center", gap: deepSpaceSpacing.sm, marginBottom: deepSpaceSpacing.sm },
  title: { color: deepSpace.textHi, textAlign: "center" },
  subtitle: { textAlign: "center", maxWidth: 320 },
  portraitFrame: { width: 104, height: 104, marginTop: deepSpaceSpacing.sm },
  portraitContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: m3.spacing.s2 },
  form: {
    gap: deepSpaceSpacing.md,
  },
  fieldSurface: { alignSelf: "stretch" },
  fieldSurfaceContent: { gap: deepSpaceSpacing.sm, padding: deepSpaceSpacing.md },
  checklist: { gap: deepSpaceSpacing.xs, marginTop: deepSpaceSpacing.xs, marginBottom: deepSpaceSpacing.xs },
  progressRow: { flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm },
  progressTrack: {
    flex: 1,
    height: m3.spacing.s4,
    flexDirection: "row",
    gap: m3.spacing.s1,
    padding: m3.spacing.s1,
    backgroundColor: PROGRESS_ON_EDGE,
  },
  progressCell: { flex: 1, backgroundColor: deepSpace.cardLine },
  progressCellDone: { backgroundColor: m3.color.primary },
  progressCount: { minWidth: 32, textAlign: "right", fontFamily: m3.font.mono },
  submitButton: { alignSelf: "stretch", width: "100%" },
  toastWrap: { position: "absolute", left: deepSpaceSpacing.lg, right: deepSpaceSpacing.lg, bottom: deepSpaceSpacing.xl, alignItems: "stretch" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm },
  checkDot: { width: 8, height: 8, borderRadius: m3.shape.none },
});
