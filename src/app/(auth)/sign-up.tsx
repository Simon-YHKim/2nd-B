import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { PremiumAppShell, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { JudgeBadge } from "@/components/auth/JudgeBadge";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import {
  ageInYears,
  signUpWithEmail,
  isNaverEnabled,
  isProviderEnabled,
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
  signInWithNaver,
  AgeGateError,
  BreachedPasswordError,
  ExistingAccountLikelyError,
  MIN_SELF_CONSENT_AGE,
} from "@/lib/supabase/auth";
import { isJudgeEmail } from "@/lib/judge/domains";
import { ConsentNotice } from "@/components/consent/ConsentNotice";
import {
  emptyConsentSelections,
  allRequiredAcksChecked,
  buildSignUpConsentArgs,
} from "@/lib/auth/consent-selections";
import { submitSignUp } from "@/lib/auth/sign-up-flow";
import { recordConsentBestEffort } from "@/lib/supabase/consent";
import { useKeyboard } from "@/lib/ui/useKeyboard";

const ADULT_AGE = 18;
const SIGNUP_STICKY_CTA_HEIGHT = 84;
const SIGNUP_SCROLL_BOTTOM_PADDING = SIGNUP_STICKY_CTA_HEIGHT + spacing.xl;
type SignUpToast = { message: string; tone: "info" | "success" | "danger" };

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

export default function SignUp() {
  const { t, i18n } = useTranslation(["auth", "common"]);
  const { userId, loading, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  // Judge accounts (C6) get a 900ms welcome toast before entering; this flag
  // holds the guest guard below open until the delayed router.replace runs
  // (mirrors complete-profile.tsx).
  const [judgeWelcome, setJudgeWelcome] = useState(false);
  const [toast, setToast] = useState<SignUpToast | null>(null);
  // J3: persistent recovery card for the likely-already-registered shape — a
  // toast alone vanishes in 2.8s, which left the user looping on a generic
  // failure with no way out. Conditionally worded (enumeration-safe).
  const [existingAccountHelp, setExistingAccountHelp] = useState(false);
  // A provider whose OAuth start failed with a "not configured" error is hidden
  // for the rest of the session so the user is not left tapping a dead button.
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(emptyConsentSelections());
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  const judge = useMemo(() => isJudgeEmail(email), [email]);
  // A valid DOB in the 14-17 band drives the high-privacy notice variant and
  // the minor_self consent band.
  const age = ageInYears(birthDate);
  const isMinorAge = age >= MIN_SELF_CONSENT_AGE && age < ADULT_AGE;
  const canSubmit = useMemo(() => {
    return (
      email.includes("@") &&
      password.length >= 8 &&
      ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE &&
      allRequiredAcksChecked(consent) &&
      !submitting &&
      // R3: the OAuth buttons cross-disable against `submitting`, but the
      // email submit stayed tappable while an OAuth browser was opening -
      // two concurrent auth flows racing the same guard.
      !oauthSubmitting
    );
  }, [email, password, birthDate, consent, submitting, oauthSubmitting]);

  // Guest-only guard, loading-aware. While the session resolves, show the
  // branded checking state rather than flashing the account-creation form; once
  // resolved, a signed-in user is bounced to root (mirrors the sign-in contract).
  // Held open mid-submit, during the judge welcome, and while a toast paints:
  // signUpWithEmail signs in internally, so SIGNED_IN flips userId while the
  // flow is still running — an unconditional redirect here unmounted the form
  // mid-submit, which is how a failed sign-up dropped the user on /sign-in with
  // its toast never painted (E2E-3; IntroGate carries the matching (auth)
  // exemption so a parent swap can't undo this hold). The !toast hold covers
  // the rare failure where the rollback sign-out ALSO failed (session live,
  // profile-less): the error stays readable for its full duration, then the
  // redirect routes the live session to /complete-profile recovery. OAuth
  // sign-ups don't set `submitting`, so their redirect-driven hand-off
  // (→ /complete-profile) is unchanged.
  if (loading) {
    return <InlineLoader message={t("common.checking")} />;
  }
  if (userId && !submitting && !judgeWelcome && !toast) return <Redirect href="/" />;

  // E2E-3/E2E-4 (e2e-shots-20260610): the submit sequencing lives in
  // sign-up-flow.ts (unit-tested). The flow settles the context (refresh)
  // BEFORE returning; this screen only maps results to UI.
  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setExistingAccountHelp(false);
    try {
      const result = await submitSignUp({
        signUp: () => signUpWithEmail({ email: email.trim(), password, birthDate, locale }),
        // Record the consent the user just gave. Awaited BEFORE navigating: on
        // web a router.replace tears down the page and cancels an in-flight
        // fire-and-forget request, which could silently drop the PIPA consent
        // row. Still best-effort -- a write failure logs at error level and
        // must not undo a created account; pre-migration it no-ops.
        recordConsent: (newUserId) =>
          recordConsentBestEffort(
            buildSignUpConsentArgs({ userId: newUserId, isMinor: isMinorAge, locale, selections: consent }),
          ),
        refreshAuth: refresh,
        isAgeGateError: (e) => e instanceof AgeGateError,
        isBreachedPasswordError: (e) => e instanceof BreachedPasswordError,
        isExistingAccountLikelyError: (e) => e instanceof ExistingAccountLikelyError,
      });
      if (result.kind === "entered") {
        // The context already knows hasProfile=true (flow refreshed), so the
        // "/" guard lets the brand-new user through instead of bouncing them
        // to /complete-profile to re-type DOB + consent (E2E-4).
        if (result.judgeMode) {
          setJudgeWelcome(true); // hold the guest guard open for the toast
          setToast({ tone: "success", message: t("judge.welcome") });
          setTimeout(() => router.replace("/"), 900);
          return;
        }
        // Post-signup hand-off → graph view (main). (/journal retired → /capture redirect.)
        router.replace("/");
        return;
      }
      if (result.kind === "ageGate") {
        setToast({ tone: "danger", message: t("errors.ageGate") });
        return;
      }
      if (result.kind === "breachedPassword") {
        setToast({ tone: "danger", message: t("errors.breachedPassword") });
        return;
      }
      if (result.kind === "maybeExistingAccount") {
        // J3: persistent card (not a toast) with the recovery path. The copy is
        // conditional — we never confirm the email exists (CSO R3).
        setExistingAccountHelp(true);
        return;
      }
      // The form is still mounted (guard held open here, parent swap blocked
      // by IntroGate's (auth) exemption), so this toast is visible and the
      // user's values are intact for a retry — never the old silent drop to
      // /sign-in (E2E-3).
      setToast({ tone: "danger", message: t("errors.signUpFailed") });
      if (typeof console !== "undefined") console.warn("[auth] signUp error", result.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Social sign-up: the OAuth flow creates the auth user, then /complete-profile
  // collects date of birth (C10) and records consent — so the age gate + consent
  // ledger still apply to provider sign-ups, just at the post-redirect step.
  async function handleOAuth(provider: "google" | "apple" | "kakao") {
    setOauthSubmitting(true);
    try {
      if (provider === "apple") await signInWithApple();
      else if (provider === "kakao") await signInWithKakao();
      else await signInWithGoogle();
    } catch (e) {
      const name = provider === "apple" ? "Apple" : provider === "kakao" ? "Kakao" : "Google";
      const msg = (e as Error).message ?? "";
      // A provider that is not configured in Supabase fails to even start with a
      // "provider is not enabled" error. Hide its button for the session so the
      // user is not left tapping a dead control; email/password and any working
      // provider remain.
      if (/not enabled|unsupported provider|validation_failed/i.test(msg)) {
        setHiddenProviders((prev) => new Set(prev).add(provider));
      }
      setToast({
        tone: "danger",
        message: t("errors.oauthSignUpStartFailed", { provider: name }),
      });
      if (typeof console !== "undefined") console.warn(`[auth] ${provider} oauth error`, msg);
    } finally {
      setOauthSubmitting(false);
    }
  }

  // Naver: custom redirect flow (not Supabase-native). Navigates to Naver.
  function handleNaver() {
    try {
      signInWithNaver();
    } catch (e) {
      setToast({
        tone: "danger",
        message: t("errors.oauthSignUpStartFailed", { provider: "Naver" }),
      });
      if (typeof console !== "undefined") console.warn("[auth] naver oauth error", (e as Error).message);
    }
  }

  return (
    <PremiumAppShell stars={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            Platform.OS === "android" && {
              paddingBottom: Math.max(SIGNUP_SCROLL_BOTTOM_PADDING, kbHeight + SIGNUP_STICKY_CTA_HEIGHT + spacing.lg),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text variant="caption" color="brand">
              {t("common:app.name")}
            </Text>
            <Pressable
              onPress={() => {
                void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
              }}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={
                locale === "ko" ? t("language.switchToEnglishLabel") : t("language.switchToKoreanLabel")
              }
              accessibilityHint={locale === "ko" ? t("language.switchToEnglishHint") : t("language.switchToKoreanHint")}
              style={styles.localeButton}
            >
              <Text variant="caption" color="brand">
                {locale === "ko" ? "EN" : "한국어"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.heroRow}>
            <View style={styles.heroCopy}>
              <Text variant="heading" style={styles.title}>
                {t("signUp.title")}
              </Text>
              <Text variant="body" color="textMuted">
                {t("signUp.subtitle")}
              </Text>
              <Text variant="subtle" color="textMuted" style={styles.ageNotice}>
                {t("signUp.ageNotice")}
              </Text>
            </View>
            <Image
              source={authHero}
              style={styles.heroImg}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={t("common.entryArtwork")}
            />
          </View>
          {judge ? (
            <View style={styles.badgeWrap}>
              <JudgeBadge />
            </View>
          ) : null}
        </View>
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text variant="caption" color="textMuted">
              {t("signUp.email")}
            </Text>
            <Input
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                // The recovery card is keyed to the email that failed; editing
                // the address makes it stale, so retire it immediately.
                if (existingAccountHelp) setExistingAccountHelp(false);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
              accessibilityLabel={t("signUp.email")}
              accessibilityHint={t("signUp.emailHint")}
            />
            <Text variant="caption" color="textMuted" style={styles.fieldLabelSpaced}>
              {t("signUp.password")}
            </Text>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              accessibilityLabel={t("signUp.password")}
              accessibilityHint={t("signUp.passwordHint")}
            />
            {/* O-R1.4 (persona sim, low-vision): this line GATES submission
                (8+ chars feeds canSubmit), so it cannot be the smallest,
                most muted text on the form — a user who can't read it never
                learns why the button stays disabled. */}
            <Text variant="body" color="textMuted" style={styles.helper}>
              {t("signUp.passwordHelper")}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldGroup}>
            <BirthDateField value={birthDate} onChange={setBirthDate} />
          </View>
          {email.length > 0 || password.length > 0 || birthDate.length > 0 ? (
            <View style={styles.checklist}>
              <ChecklistItem
                ok={email.includes("@")}
                label={email.includes("@") ? t("signUp.checkEmail") : t("signUp.checkEmailMissing")}
              />
              <ChecklistItem
                ok={password.length >= 8}
                label={
                  password.length >= 8 ? t("signUp.checkPassword") : t("signUp.checkPasswordShort")
                }
              />
              <ChecklistItem
                ok={ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE}
                label={
                  ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE
                    ? t("signUp.checkAge")
                    : t("signUp.checkAgeBlocked")
                }
              />
            </View>
          ) : null}
          <ConsentNotice minor={isMinorAge} value={consent} onChange={setConsent} />

          {existingAccountHelp ? (
            // accessibilityLiveRegion: role="alert" alone announces only on
            // web; Android needs the live region (settings.tsx precedent), and
            // this result kind deliberately has no toast to announce instead.
            <View style={styles.existingHelpCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text variant="body" style={styles.existingHelpTitle}>
                {t("signUp.existingAccountTitle")}
              </Text>
              <Text variant="subtle" color="textMuted">
                {t("signUp.existingAccountBody")}
              </Text>
              <Button
                label={t("signUp.existingAccountSignIn")}
                variant="secondary"
                onPress={() => router.push("/sign-in")}
                accessibilityHint={t("signUp.signInHint")}
                full
              />
            </View>
          ) : null}

          <View style={styles.providerDivider}>
            <View style={styles.providerDividerLine} />
            <Text variant="subtle" color="textSubtle" style={styles.providerOr}>
              {t("signUp.or")}
            </Text>
            <View style={styles.providerDividerLine} />
          </View>

          {isProviderEnabled("google") && !hiddenProviders.has("google") ? (
            <Button
              label={t("signUp.continueWithGoogle")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("google")}
            />
          ) : null}
          {isProviderEnabled("apple") && !hiddenProviders.has("apple") ? (
            <Button
              label={t("signUp.continueWithApple")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("apple")}
            />
          ) : null}
          {isProviderEnabled("kakao") && !hiddenProviders.has("kakao") ? (
            <Button
              label={t("signUp.continueWithKakao")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("kakao")}
            />
          ) : null}
          {isNaverEnabled() ? (
            <Button
              label={t("signUp.continueWithNaver")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={handleNaver}
            />
          ) : null}
        </View>
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text variant="subtle" color="textMuted">
              {t("signUp.alreadyHaveAccount")}
            </Text>
            <Link href="/sign-in" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t("signUp.signInLink")}
                accessibilityHint={t("signUp.signInHint")}
                style={styles.footerLinkHit}
              >
                <Text variant="subtle" color="brand" style={styles.link}>
                  {t("signUp.signInLink")}
                </Text>
              </Pressable>
            </Link>
          </View>
          <Link href="/manual" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("signUp.manualLabel")}
              accessibilityHint={t("signUp.manualHint")}
              style={styles.browseLinkHit}
            >
              <Text variant="subtle" color="textSubtle" style={styles.link}>
                {t("signUp.manualLink")}
              </Text>
            </Pressable>
          </Link>
        </View>
        </ScrollView>
        <View
          style={[
            styles.stickyCta,
            Platform.OS === "android" && kbHeight > 0 ? { bottom: kbHeight } : null,
          ]}
        >
          <View style={styles.stickyCtaInner}>
            <Button
              label={t("signUp.submit")}
              variant="primary"
              disabled={!canSubmit}
              loading={submitting}
              onPress={handleSubmit}
              full
              style={styles.stickySubmitButton}
              accessibilityLabel={t("signUp.submit")}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </PremiumAppShell>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.checkRow}>
      <View
        style={[styles.checkDot, { backgroundColor: ok ? semantic.success : semantic.textSubtle }]}
      />
      <Text variant="subtle" color={ok ? "success" : "textMuted"}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: SIGNUP_SCROLL_BOTTOM_PADDING,
    // Web only: cap the auth column (cycle-4 live QA) — no-op on native.
    ...(Platform.OS === "web" ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const } : {}),
  },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  localeButton: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroCopy: { flex: 1, gap: spacing.xs },
  heroImg: { width: 80, height: 80 },
  title: { marginTop: 0 },
  ageNotice: { marginTop: spacing.xs },
  browseLinkHit: {
    minHeight: 44,
    alignSelf: "center",
    justifyContent: "center",
  },
  badgeWrap: { marginTop: spacing.sm },
  form: {
    gap: spacing.sm,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    ...androidElevationStyle(androidElevation.authForm),
  },
  fieldGroup: { gap: spacing.sm },
  fieldLabelSpaced: { marginTop: spacing.sm },
  divider: {
    height: 1,
    backgroundColor: semantic.border,
    opacity: 0.5,
    marginVertical: spacing.md,
  },
  helper: { marginTop: -spacing.xs },
  checklist: { gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.xs },
  stickyCta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: cosmic.panelBg,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
  },
  stickyCtaInner: {
    width: "100%",
    ...(Platform.OS === "web" ? { maxWidth: 520, alignSelf: "center" as const } : {}),
  },
  stickySubmitButton: { alignSelf: "stretch", width: "100%" },
  existingHelpCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  existingHelpTitle: { fontWeight: "600" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
  footer: { marginTop: spacing.xl, alignItems: "center" },
  footerRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  footerLinkHit: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  manualLinkHit: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  link: { textDecorationLine: "underline" },
  providerDivider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  providerDividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: semantic.border },
  providerOr: { textTransform: "uppercase" },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "stretch",
  },
});
