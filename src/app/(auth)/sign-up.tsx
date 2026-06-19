import { Image } from "expo-image";
import { View, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router } from "expo-router";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { PremiumAppShell, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { JudgeBadge } from "@/components/auth/JudgeBadge";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { ageInYears, MIN_SELF_CONSENT_AGE } from "@/lib/supabase/auth";
import { ConsentNotice } from "@/components/consent/ConsentNotice";
import { useSignUpForm } from "@/lib/auth/useSignUpForm";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceSignUpDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

const SIGNUP_STICKY_CTA_HEIGHT = 84;
const SIGNUP_SCROLL_BOTTOM_PADDING = spacing.lg;

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

function SignUpLegacy() {
  const { t, i18n } = useTranslation(["auth", "common"]);
  const {
    userId,
    loading,
    submitting,
    judgeWelcome,
    toast,
    email,
    setEmail,
    password,
    setPassword,
    birthDate,
    setBirthDate,
    consent,
    setConsent,
    judge,
    isMinorAge,
    canSubmit,
    oauthSubmitting,
    existingAccountHelp,
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
  } = useSignUpForm();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

  // Guest-only guard, loading-aware. While the session resolves, show the
  // branded checking state rather than flashing the account-creation form; once
  // resolved, a signed-in user is bounced to root (mirrors the sign-in contract).
  // Held open mid-submit, during the judge welcome, and while a toast paints:
  // signUpWithEmail signs in internally, so SIGNED_IN flips userId while the
  // flow is still running — an unconditional redirect here unmounted the form
  // mid-submit, which is how a failed sign-up dropped the user on /sign-in with
  // its toast never painted (E2E-3; IntroGate carries the matching (auth)
  // exemption so a parent swap can't undo this hold).
  if (loading) {
    return <InlineLoader message={t("common.checking")} />;
  }
  if (userId && !submitting && !judgeWelcome && !toast) return <Redirect href="/" />;

  return (
    <PremiumAppShell stars={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scroller}
          contentContainerStyle={[
            styles.scroll,
            Platform.OS === "android" && {
              paddingBottom: Math.max(SIGNUP_SCROLL_BOTTOM_PADDING, kbHeight + spacing.lg),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <View style={styles.brandRow}>
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
              <Text variant="caption" color="brand" numberOfLines={1} style={styles.brandText}>
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
              onChangeText={setEmail}
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

          {visibleProviders.includes("google") ? (
            <Button
              label={t("signUp.continueWithGoogle")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("google")}
            />
          ) : null}
          {visibleProviders.includes("apple") ? (
            <Button
              label={t("signUp.continueWithApple")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("apple")}
            />
          ) : null}
          {visibleProviders.includes("kakao") ? (
            <Button
              label={t("signUp.continueWithKakao")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("kakao")}
            />
          ) : null}
          {visibleProviders.includes("facebook") ? (
            <Button
              label={t("signUp.continueWithFacebook")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("facebook")}
            />
          ) : null}
          {visibleProviders.includes("github") ? (
            <Button
              label={t("signUp.continueWithGithub")}
              variant="secondary"
              disabled={oauthSubmitting || submitting}
              onPress={() => handleOAuth("github")}
            />
          ) : null}
          {naverEnabled ? (
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
        <View style={styles.stickyCta}>
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
  scroller: { flex: 1 },
  scroll: {
    paddingBottom: SIGNUP_SCROLL_BOTTOM_PADDING,
    // Web only: cap the auth column (cycle-4 live QA) — no-op on native.
    ...(Platform.OS === "web" ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const } : {}),
  },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
    backgroundColor: semantic.brand,
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
  brandText: { textAlign: "center" },
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
    minHeight: SIGNUP_STICKY_CTA_HEIGHT,
    justifyContent: "center",
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

export default function SignUp() {
  if (isDeepSpaceUI()) return <DeepSpaceSignUpDesignScreen />;
  return <SignUpLegacy />;
}
