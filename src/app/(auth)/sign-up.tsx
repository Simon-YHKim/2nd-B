import { useMemo, useState } from "react";
import { Image, View, StyleSheet, Alert, Pressable, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

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
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
  signInWithNaver,
  AgeGateError,
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

const ADULT_AGE = 18;

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

export default function SignUp() {
  const { t, i18n } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [consent, setConsent] = useState(emptyConsentSelections());
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

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

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await signUpWithEmail({
        email: email.trim(),
        password,
        birthDate,
        locale,
      });
      // Record the consent the user just gave (best-effort: a ledger write
      // failure must not undo a created account; pre-migration it no-ops).
      void recordConsentBestEffort(
        buildSignUpConsentArgs({
          userId: result.userId,
          isMinor: isMinorAge,
          locale,
          selections: consent,
        }),
      );
      if (result.judgeMode) Alert.alert(t("judge.welcome"));
      // Post-signup hand-off → graph view (main). /journal reachable via nav.
      router.replace("/");
    } catch (e) {
      if (e instanceof AgeGateError) Alert.alert(t("errors.ageGate"));
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
      Alert.alert(
        locale === "ko"
          ? `${name} 가입을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.`
          : `Could not start ${name} sign-up. Please try again in a moment.`,
      );
      if (typeof console !== "undefined") console.warn(`[auth] ${provider} oauth error`, (e as Error).message);
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
      <ScrollView contentContainerStyle={styles.scroll}>
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
              placeholder="you@example.com"
            />
            <Text variant="caption" color="textMuted" style={styles.fieldLabelSpaced}>
              {t("signUp.password")}
            </Text>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
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
          />

          <View style={styles.providerDivider}>
            <View style={styles.providerDividerLine} />
            <Text variant="subtle" color="textSubtle" style={styles.providerOr}>
              {t("signUp.or")}
            </Text>
            <View style={styles.providerDividerLine} />
          </View>

          <Button
            label={t("signUp.continueWithGoogle")}
            variant="secondary"
            disabled={oauthSubmitting || submitting}
            onPress={() => handleOAuth("google")}
          />
          <Button
            label={t("signUp.continueWithApple")}
            variant="secondary"
            disabled={oauthSubmitting || submitting}
            onPress={() => handleOAuth("apple")}
          />
          <Button
            label={t("signUp.continueWithKakao")}
            variant="secondary"
            disabled={oauthSubmitting || submitting}
            onPress={() => handleOAuth("kakao")}
          />
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
              <Pressable accessibilityRole="link" style={styles.footerLinkHit}>
                <Text variant="subtle" color="brand" style={styles.link}>
                  {t("signUp.signInLink")}
                </Text>
              </Pressable>
            </Link>
          </View>
          <Link href="/manual" asChild>
            <Pressable accessibilityRole="link" style={styles.manualLinkHit}>
              <Text variant="subtle" color="textSubtle" style={styles.link}>
                {locale === "ko"
                  ? "이 앱이 처음이라면 안내서 보기"
                  : "New here? Read the 1-min manual"}
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
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
