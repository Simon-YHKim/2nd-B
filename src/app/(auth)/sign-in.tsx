// Sign-in screen — Cosmic Pixel entry gate matching LoadingScreen.
//
// Per docs/DESIGN.md visual continuity: the unauthenticated entry point
// uses the same deep-space, mint, and violet palette as the loader.
// On successful sign-in, the IntroGate in _layout plays the cell-team
// loading sequence as the "we're building your second brain" hand-off.

import { useRef } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { useSignInForm } from "@/lib/auth/useSignInForm";
import { cosmicSky, radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { CosmicBackground, PremiumToast } from "@/components/premium";
import { EyeIcon, EyeOffIcon } from "@/components/ui/EyeIcon";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceSignInDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

// Cosmic entry palette — deep-space bg + mint brand + violet accent, so
// the first (unauthenticated) screen already reads as the Cosmic Pixel
// Graph Village. Same shape as the legacy darkSky it replaced.
const PALETTE = cosmicSky;

function SignInLegacy() {
  const { t, i18n } = useTranslation(["auth", "common"]);
  const {
    userId,
    loading,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    submitting,
    oauthSubmitting,
    canSubmit,
    toast,
    resetHelpVisible,
    resetSubmitting,
    resetEmailSentTo,
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
    handleForgotPassword,
  } = useSignInForm();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();
  const passwordInputRef = useRef<TextInput>(null);

  // Still resolving the session — render the branded checking state instead of
  // flashing the sign-in form to a user who turns out to be signed in (the
  // guest-only guard below reads userId === null during this window).
  if (loading) {
    return <InlineLoader message={t("common.checking")} />;
  }

  // Already signed in (OAuth redirect landed back here, or user hit
  // /sign-in directly while session was still alive). Bounce to root
  // so the IntroGate plays the loader and /index routes the user to
  // the right next step (/complete-profile or graph).
  if (userId) return <Redirect href="/" />;

  return (
    <View style={styles.root}>
      <CosmicBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={[styles.scroll, Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) }]} keyboardShouldPersistTaps="handled">
          {/* Top bar — visible home affordance, brand, locale toggle. */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.push("/")}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={t("common:navGraph.drilldown.back")}
              accessibilityHint={t("common:navGraph.drilldown.backHint")}
              style={styles.authBackButton}
            >
              <View
                style={styles.authBackChevron}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View style={[styles.authBackChevronStroke, styles.authBackChevronTop]} />
                <View style={[styles.authBackChevronStroke, styles.authBackChevronBottom]} />
              </View>
            </Pressable>
            <View style={styles.brandSlot}>
              <Text variant="caption" style={styles.brand} numberOfLines={1}>
                {t("common:app.name")}
              </Text>
            </View>
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
              <Text variant="caption" style={styles.localeToggle}>{locale === "ko" ? "EN" : "한국어"}</Text>
            </Pressable>
          </View>

          {/* Logo + headline — premium SecondB gate hero. */}
          <View style={styles.hero}>
            <Image
              source={authHero}
              style={styles.heroImg}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={t("common.entryArtwork")}
            />
            <Text variant="heading" style={styles.title}>{t("signIn.title")}</Text>
            <Text variant="body" style={styles.subtitle}>{t("signIn.subtitle")}</Text>
          </View>

          {/* Form. */}
          <View style={styles.form}>
            <Text variant="caption" style={styles.label}>{t("signIn.email")}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={PALETTE.textSubtle}
              accessibilityLabel={t("signIn.email")}
              accessibilityHint={t("signIn.emailHint")}
              style={styles.input}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
            />
            <View style={styles.labelRow}>
              <Text variant="caption" style={styles.label}>{t("signIn.password")}</Text>
              <Pressable
                onPress={toggleShowPassword}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? t("signIn.hidePasswordLabel") : t("signIn.showPasswordLabel")
                }
                accessibilityHint={
                  showPassword ? t("signIn.hidePasswordHint") : t("signIn.showPasswordHint")
                }
                accessibilityState={{ selected: showPassword }}
                style={styles.eyeBtn}
              >
                {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
              </Pressable>
            </View>
            <TextInput
              ref={passwordInputRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              textContentType="password"
              placeholderTextColor={PALETTE.textSubtle}
              accessibilityLabel={t("signIn.password")}
              accessibilityHint={t("signIn.passwordHint")}
              style={styles.input}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (canSubmit) void handleSubmit();
              }}
            />

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("signIn.submit")}
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              <Text variant="body" style={styles.primaryBtnText}>
                {submitting ? t("signIn.submitting") : t("signIn.submit")}
              </Text>
            </Pressable>

            {/* E2E-5 (e2e-shots-20260610 05): the sign-up entry point is a new
                user's primary path on the cold-start screen, but it lived in
                the footer below the fold. Keep it ghost-weight (the primary
                action stays Sign in) directly under the CTA, in viewport. */}
            <View style={styles.signUpRow}>
              <Text variant="caption" style={styles.subtleText}>{t("signIn.noAccount")}</Text>
              <Link href="/sign-up" asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t("signIn.signUpLink")}
                  accessibilityHint={t("signIn.signUpHint")}
                  style={styles.footerLinkHit}
                >
                  <Text variant="caption" style={styles.linkText}>{t("signIn.signUpLink")}</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text variant="caption" style={styles.dividerLabel}>{t("signIn.or")}</Text>
              <View style={styles.dividerLine} />
            </View>

            {visibleProviders.includes("google") ? (
              <Pressable
                onPress={() => handleOAuth("google")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithGoogle")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text variant="body" style={styles.secondaryBtnText}>{oauthSubmitting ? "…" : t("signIn.continueWithGoogle")}</Text>
              </Pressable>
            ) : null}

            {visibleProviders.includes("apple") ? (
              <Pressable
                onPress={() => handleOAuth("apple")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithApple")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text variant="body" style={styles.secondaryBtnText}>{oauthSubmitting ? "…" : t("signIn.continueWithApple")}</Text>
              </Pressable>
            ) : null}

            {visibleProviders.includes("kakao") ? (
              <Pressable
                onPress={() => handleOAuth("kakao")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithKakao")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text variant="body" style={styles.secondaryBtnText}>{oauthSubmitting ? "…" : t("signIn.continueWithKakao")}</Text>
              </Pressable>
            ) : null}

            {visibleProviders.includes("facebook") ? (
              <Pressable
                onPress={() => handleOAuth("facebook")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithFacebook")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text variant="body" style={styles.secondaryBtnText}>{oauthSubmitting ? "…" : t("signIn.continueWithFacebook")}</Text>
              </Pressable>
            ) : null}

            {visibleProviders.includes("github") ? (
              <Pressable
                onPress={() => handleOAuth("github")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithGithub")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text variant="body" style={styles.secondaryBtnText}>{oauthSubmitting ? "…" : t("signIn.continueWithGithub")}</Text>
              </Pressable>
            ) : null}

            {naverEnabled ? (
              <Pressable
                onPress={handleNaver}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithNaver")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text variant="body" style={styles.secondaryBtnText}>{t("signIn.continueWithNaver")}</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                void handleForgotPassword();
              }}
              disabled={resetSubmitting}
              hitSlop={14}
              style={[styles.forgotRow, resetSubmitting && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("signIn.resetLabel")}
              accessibilityHint={t("signIn.resetHint")}
              accessibilityState={{ disabled: resetSubmitting, busy: resetSubmitting }}
            >
              <Text variant="caption" style={styles.subtleText}>
                {resetSubmitting ? t("signIn.resetSending") : t("signIn.forgotPassword")}
              </Text>
            </Pressable>

            {resetHelpVisible ? (
              <View style={styles.resetHelpCard} accessibilityRole="alert">
                <Text variant="heading" style={styles.resetHelpTitle}>
                  {resetEmailSentTo ? t("signIn.resetSentTitle") : t("signIn.resetTitle")}
                </Text>
                <Text variant="body" style={styles.resetHelpBody}>
                  {resetEmailSentTo ? t("signIn.resetSentBody", { email: resetEmailSentTo }) : t("signIn.resetBody")}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Footer — manual link. (The sign-up row moved into the form card,
              first viewport — E2E-5.) */}
          <View style={styles.footer}>
            <Link href="/manual" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t("signIn.manualLabel")}
                accessibilityHint={t("signIn.manualHint")}
                style={styles.manualLinkHit}
              >
                <Text variant="caption" style={[styles.subtleText, styles.linkUnderline]}>
                  {t("signIn.manualLink")}
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cosmicSky.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 32,
    // Web only: cap the auth column so desktop viewports don't stretch the
    // inputs and CTA edge-to-edge (cycle-4 live QA). Native screens are
    // narrower than the cap, so this is a no-op there.
    ...(Platform.OS === "web" ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const } : {}),
  },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  authBackButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: semantic.surfaceAlt,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  authBackChevron: {
    width: 14,
    height: 18,
    justifyContent: "center",
  },
  authBackChevronStroke: {
    position: "absolute",
    left: 2,
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: PALETTE.brand,
  },
  authBackChevronTop: {
    transform: [{ rotate: "-42deg" }],
    top: 4,
  },
  authBackChevronBottom: {
    transform: [{ rotate: "42deg" }],
    bottom: 4,
  },
  brandSlot: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: spacing.xs },
  // (R4: the unused `logo` style was removed - the hero renders heroImg.)
  brand: {
    color: PALETTE.brand,
    fontSize: typography.sizes.xs,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center",
  },
  localeToggle: {
    color: PALETTE.accent,
    fontSize: typography.sizes.xs,
    fontWeight: "700",
    letterSpacing: 0,
  },
  localeButton: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  hero: { alignItems: "center", marginTop: 28, marginBottom: 22, gap: 8 },
  // HQ gate hero is ~square (740x746); render it in a square box so it
  // floats on the cosmic background instead of letterboxing into a sliver.
  heroImg: { width: 188, height: 188, marginBottom: 6 },
  title: {
    color: PALETTE.text,
    fontSize: typography.sizes.xl,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center",
  },
  subtitle: {
    color: PALETTE.textMuted,
    fontSize: 14,
    letterSpacing: 0,
    textAlign: "center",
  },
  form: {
    gap: spacing.sm,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    shadowColor: PALETTE.accent,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    ...androidElevationStyle(androidElevation.authForm),
  },
  label: {
    color: PALETTE.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  eyeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    color: PALETTE.text,
    fontSize: typography.sizes.md,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  primaryBtn: {
    backgroundColor: PALETTE.brand,
    borderColor: PALETTE.brand,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: 12,
    shadowColor: PALETTE.brand,
    shadowOpacity: 0.36,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  primaryBtnText: { color: PALETTE.bg, fontSize: typography.sizes.md, fontWeight: "700", letterSpacing: 0 },
  secondaryBtn: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryBtnText: { color: PALETTE.text, fontSize: typography.sizes.md, fontWeight: "600", letterSpacing: 0 },
  btnDisabled: { opacity: 0.4 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: PALETTE.border },
  dividerLabel: {
    color: PALETTE.textSubtle,
    fontSize: typography.sizes.xs,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  forgotRow: {
    minHeight: 44,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  resetHelpCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  resetHelpTitle: { color: PALETTE.text, fontSize: 14, fontWeight: "700", letterSpacing: 0 },
  resetHelpBody: { color: PALETTE.textMuted, fontSize: typography.sizes.sm, letterSpacing: 0 },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "stretch",
  },
  footer: { marginTop: 28, alignItems: "center" },
  signUpRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
  },
  footerLinkHit: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  manualLinkHit: { minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 4 },
  subtleText: { color: PALETTE.textMuted, fontSize: typography.sizes.sm },
  linkText: { color: PALETTE.brand, fontSize: typography.sizes.sm, fontWeight: "600" },
  linkUnderline: { textDecorationLine: "underline" },
});

export default function SignIn() {
  if (isDeepSpaceUI()) return <DeepSpaceSignInDesignScreen />;
  return <SignInLegacy />;
}
