import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { View, StyleSheet, Alert, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { JudgeBadge } from "@/components/auth/JudgeBadge";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
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
  MIN_SELF_CONSENT_AGE,
} from "@/lib/supabase/auth";
import { isJudgeEmail } from "@/lib/judge/domains";
import { ConsentNotice } from "@/components/consent/ConsentNotice";
import {
  emptyConsentSelections,
  allRequiredAcksChecked,
  buildSignUpConsentArgs,
} from "@/lib/auth/consent-selections";
import { recordConsentBestEffort } from "@/lib/supabase/consent";
import { useKeyboard } from "@/lib/ui/useKeyboard";

const ADULT_AGE = 18;

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

export default function SignUp() {
  const { t, i18n } = useTranslation("auth");
  const { userId, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  // A provider whose OAuth start failed with a "not configured" error is hidden
  // for the rest of the session so the user is not left tapping a dead button.
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(emptyConsentSelections());
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

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
      !submitting
    );
  }, [email, password, birthDate, consent, submitting]);

  // Guest-only guard, loading-aware. While the session resolves, show the
  // branded checking state rather than flashing the account-creation form; once
  // resolved, a signed-in user is bounced to root (mirrors the sign-in contract).
  if (loading) {
    return <InlineLoader message={locale === "ko" ? "확인하는 중…" : "Checking…"} />;
  }
  if (userId) return <Redirect href="/" />;

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await signUpWithEmail({
        email: email.trim(),
        password,
        birthDate,
        locale,
      });
      // Record the consent the user just gave. Await it BEFORE navigating: on
      // web a router.replace tears down the page and cancels an in-flight
      // fire-and-forget request, which could silently drop the PIPA consent
      // row. Still best-effort -- a write failure logs at error level and must
      // not undo a created account; pre-migration it no-ops.
      await recordConsentBestEffort(
        buildSignUpConsentArgs({
          userId: result.userId,
          isMinor: isMinorAge,
          locale,
          selections: consent,
        }),
      );
      if (result.judgeMode) Alert.alert(t("judge.welcome"));
      // Post-signup hand-off → graph view (main). (/journal retired → /capture redirect.)
      router.replace("/");
    } catch (e) {
      if (e instanceof AgeGateError) Alert.alert(t("errors.ageGate"));
      else if (e instanceof BreachedPasswordError) Alert.alert(t("errors.breachedPassword"));
      else {
        const msg =
          locale === "ko"
            ? "가입에 실패했어요. 잠시 후 다시 시도해 주세요."
            : "Sign-up failed. Please try again in a moment.";
        Alert.alert(msg);
        if (typeof console !== "undefined")
          console.warn("[auth] signUp error", (e as Error).message);
      }
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
      Alert.alert(
        locale === "ko"
          ? `${name} 가입을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.`
          : `Could not start ${name} sign-up. Please try again in a moment.`,
      );
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
      Alert.alert(
        locale === "ko"
          ? "Naver 가입을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
          : "Could not start Naver sign-up. Please try again in a moment.",
      );
      if (typeof console !== "undefined") console.warn("[auth] naver oauth error", (e as Error).message);
    }
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) }]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text variant="caption" color="brand">
              2nd-Brain
            </Text>
            <Pressable
              onPress={() => {
                void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                locale === "ko" ? "Switch sign-up language to English" : "회원가입 언어를 한국어로 변경"
              }
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
            <Image source={authHero} style={styles.heroImg} resizeMode="contain" />
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
              accessibilityHint={
                locale === "ko"
                  ? "가입할 계정의 이메일 주소를 입력합니다."
                  : "Enter the email address for the account you want to create."
              }
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
              accessibilityHint={
                locale === "ko"
                  ? "새 계정에 사용할 비밀번호를 입력합니다."
                  : "Enter the password for your new account."
              }
            />
            <Text variant="subtle" color="textSubtle" style={styles.helper}>
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
          <Button
            label={t("signUp.submit")}
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onPress={handleSubmit}
            full
            style={styles.submitButton}
          />

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
                accessibilityHint={locale === "ko" ? "로그인 화면을 엽니다" : "Opens the sign-in screen"}
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
              accessibilityLabel={
                locale === "ko" ? "1분 안내서 보기" : "Read the one-minute manual"
              }
              accessibilityHint={locale === "ko" ? "앱 안내서를 엽니다" : "Opens the app manual"}
              style={styles.manualLinkHit}
            >
              <Text variant="subtle" color="textSubtle" style={styles.link}>
                {locale === "ko"
                  ? "이 앱이 처음이라면 안내서 보기"
                  : "New here? Read the 1-min manual"}
              </Text>
            </Pressable>
          </Link>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: { paddingBottom: spacing.xl },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  localeButton: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroCopy: { flex: 1, gap: spacing.xs },
  heroImg: { width: 112, height: 112 },
  title: { marginTop: 0 },
  ageNotice: { marginTop: spacing.xs },
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
  submitButton: { alignSelf: "stretch", width: "100%" },
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
});
