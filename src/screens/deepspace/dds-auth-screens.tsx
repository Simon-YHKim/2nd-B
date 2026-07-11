// dds-auth-screens: the three deep-space auth screens (sign-in / sign-up /
// reset-password) + their shared shell, toast, and provider maps, moved
// verbatim from DeepSpaceDesignScreens.tsx (P5 megafile split, tranche 1).
// DeepSpaceDesignScreens re-exports them so every route import is unchanged.
/* eslint-disable */
// TODO(split-2): trim the import set + re-enable lint once the move settles.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View, useWindowDimensions } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/theme/tokens";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { fontFamilies } from "@/theme/typography";
import { Text } from "@/components/ui/Text";
import { ddsStyles as styles } from "./dds-styles";
import { SecondbHead } from "@/components/deepspace";
import { useSignInForm } from "@/lib/auth/useSignInForm";
import { useSignUpForm } from "@/lib/auth/useSignUpForm";
import { useResetPasswordForm } from "@/lib/auth/useResetPasswordForm";
import { ageInYears, MIN_SELF_CONSENT_AGE, type OAuthProvider } from "@/lib/supabase/auth";
import { allRequiredAcksChecked, setAllRequiredAcks, type ConsentSelections } from "@/lib/auth/consent-selections";
import { formatBirthDateInput } from "@/lib/account/dob";

// Keyboard-aware shell for the auth screens (sign-in / sign-up / reset). The
// generic Shell above is for in-app graph screens and has no keyboard handling;
// auth forms need KeyboardAvoidingView + scroll padding (ANDROID_QA_GUIDELINES).
function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }

// Shared starfield, seeded as fractional positions so it scales to any viewport
// (mirrors DeepSpaceBackdrop). Static — no animation lock risk (ANDROID_QA).
const AUTH_STARS = [
  { x: 0.14, y: 0.07, r: 1.4, o: 0.5 },
  { x: 0.82, y: 0.11, r: 1.2, o: 0.42 },
  { x: 0.5, y: 0.2, r: 1.1, o: 0.3 },
  { x: 0.28, y: 0.52, r: 1.1, o: 0.3 },
  { x: 0.74, y: 0.46, r: 1, o: 0.26 },
  { x: 0.16, y: 0.78, r: 1, o: 0.24 },
] as const;

// Deep-space auth backdrop: top-center radial glow over the shared starfield,
// reproducing the canon `radial-gradient(120% 80% at 50% 0%, ...)` (sb-surfaces
// AuthScreen) with tokens only. The buttons float directly on this — no card.
function AuthBackdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="auth-top-glow" cx="50%" cy="0%" rx="120%" ry="78%">
            <Stop offset="0" stopColor={deepSpace.bgMid} stopOpacity="0.9" />
            <Stop offset="0.55" stopColor={deepSpace.bgMid} stopOpacity="0.28" />
            <Stop offset="0.78" stopColor={deepSpace.bgEdge} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={deepSpace.bgEdge} />
        <Rect x="0" y="0" width={width} height={height} fill="url(#auth-top-glow)" />
        {AUTH_STARS.map((s, i) => (
          <Circle key={i} cx={s.x * width} cy={s.y * height} r={s.r} fill={deepSpace.accentSoft} fillOpacity={s.o} />
        ))}
      </Svg>
    </View>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  // Reserve the Android bottom inset: under edge-to-edge (Expo SDK 56 default)
  // the shared scroll's fixed paddingBottom:40 lets the last CTA on a tall
  // sign-up/reset form draw under the 3-button nav bar. insets.bottom clears it.
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <AuthBackdrop />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Provider leading marks. Apple / email get a small token-colored glyph; the
// other providers keep a bold letter badge. No emoji, no pill chips (DESIGN.md).
function AppleGlyph({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M16.36 12.9c.02 2.14 1.87 2.85 1.89 2.86-.02.05-.3 1.02-.98 2.02-.59.87-1.2 1.73-2.16 1.75-.94.02-1.25-.56-2.33-.56-1.08 0-1.42.54-2.31.58-.93.03-1.64-.94-2.23-1.8-1.22-1.77-2.15-5-.9-7.18.62-1.08 1.73-1.77 2.93-1.79.91-.02 1.77.62 2.33.62.55 0 1.6-.76 2.7-.65.46.02 1.75.19 2.58 1.4-.07.04-1.54.9-1.52 2.68zM14.66 6.36c.49-.6.82-1.42.73-2.25-.71.03-1.56.47-2.07 1.07-.45.53-.85 1.37-.74 2.18.79.06 1.59-.4 2.08-1z"
      />
    </Svg>
  );
}

function MailGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
      />
    </Svg>
  );
}

function AuthToast({ message, tone }: { message: string; tone: "info" | "success" | "danger" }) {
  const toneStyle =
    tone === "success" ? styles.authToastSuccess : tone === "danger" ? styles.authToastDanger : styles.authToastInfo;
  return (
    <View style={styles.authToastWrap} pointerEvents="none">
      <View style={[styles.authToast, toneStyle]} accessibilityRole="alert">
        <Text variant="body" style={styles.authToastText}>{message}</Text>
      </View>
    </View>
  );
}

// Per-provider button label keys live in the auth namespace (full C7 parity),
// reused by both the legacy and deep-space presentations.
const PROVIDER_SIGNIN_KEY: Record<OAuthProvider, string> = {
  google: "auth:signIn.continueWithGoogle",
  apple: "auth:signIn.continueWithApple",
  kakao: "auth:signIn.continueWithKakao",
  facebook: "auth:signIn.continueWithFacebook",
  github: "auth:signIn.continueWithGithub",
};
const PROVIDER_SIGNUP_KEY: Record<OAuthProvider, string> = {
  google: "auth:signUp.continueWithGoogle",
  apple: "auth:signUp.continueWithApple",
  kakao: "auth:signUp.continueWithKakao",
  facebook: "auth:signUp.continueWithFacebook",
  github: "auth:signUp.continueWithGithub",
};
// Per-provider mark shown before the label (design: a bold "G" glyph, not an
// emoji or pill chip). Empty string = no badge (e.g. Apple, whose glyph is not
// portable across platforms; it stays label-only).
const PROVIDER_BADGE: Record<OAuthProvider, string> = {
  google: "G",
  apple: "",
  kakao: "K",
  facebook: "f",
  github: "GH",
};

export function DeepSpaceSignInDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
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
  const passwordRef = useRef<TextInput>(null);
  // Progressive disclosure: the first paint is social-first (provider pills +
  // an "이메일로 계속하기" entry), matching the 01-auth canon. Tapping the entry
  // reveals the email/password fields (Simon O-7 one-touch-simplifies rule).
  const [emailOpen, setEmailOpen] = useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (userId) return <Redirect href="/" />;

  const oauthBusy = oauthSubmitting || submitting;
  const renderProvider = (provider: OAuthProvider) => {
    const light = provider === "apple";
    const label = t(`deepspace:auth.continueShort.${provider}`);
    return (
      <Pressable
        key={provider}
        onPress={() => void handleOAuth(provider)}
        disabled={oauthBusy}
        style={[styles.providerPill, light ? styles.providerPillLight : styles.providerPillDark, oauthBusy && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: oauthBusy, busy: oauthSubmitting }}
      >
        <View style={styles.providerPillRow}>
          {provider === "apple" ? (
            <AppleGlyph color={deepSpace.providerLightFg} />
          ) : PROVIDER_BADGE[provider] ? (
            <RNText style={styles.providerMarkDark}>{PROVIDER_BADGE[provider]}</RNText>
          ) : null}
          <Text variant="body" style={light ? styles.providerPillTextLight : styles.providerPillTextDark}>
            {oauthSubmitting ? "…" : label}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={72} mood="neutral" />
        <Text variant="caption" pixelEn style={styles.authBrand}>{t("deepspace:auth.brandLabel")}</Text>
        <Text variant="heading" style={styles.authTitle}>{t("deepspace:auth.signInTitle")}</Text>
        <Text variant="body" style={styles.authSub}>{t("deepspace:auth.signInEncrypt")}</Text>
      </View>

      <View style={styles.authMethods}>
        {!emailOpen ? (
          <>
            {visibleProviders.map(renderProvider)}
            {naverEnabled ? (
              <Pressable
                onPress={handleNaver}
                disabled={oauthBusy}
                style={[styles.providerPill, styles.providerPillDark, oauthBusy && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("auth:signIn.continueWithNaver")}
              >
                <View style={styles.providerPillRow}>
                  <RNText style={styles.providerMarkDark}>N</RNText>
                  <Text variant="body" style={styles.providerPillTextDark}>{t("auth:signIn.continueWithNaver")}</Text>
                </View>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => setEmailOpen(true)}
              style={styles.emailEntry}
              accessibilityRole="button"
              accessibilityLabel={t("deepspace:auth.emailContinue")}
            >
              <View style={styles.emailEntryLeft}>
                <MailGlyph color={colors.cyanSoft} />
                <Text variant="body" style={styles.emailEntryLabel}>{t("deepspace:auth.emailContinue")}</Text>
              </View>
              <RNText style={styles.emailEntryArrow}>{"→"}</RNText>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoFocus
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="email@example.com"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:signIn.email")}
              style={styles.input}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <View style={styles.authLabelRow}>
              <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signIn.password")}</Text>
              <Pressable
                onPress={toggleShowPassword}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t("auth:signIn.hidePasswordLabel") : t("auth:signIn.showPasswordLabel")}
                accessibilityState={{ selected: showPassword }}
                style={styles.eyeBtn}
              >
                <Text variant="body" style={styles.eyeText}>{showPassword ? t("auth:signIn.hidePasswordLabel") : t("auth:signIn.showPasswordLabel")}</Text>
              </Pressable>
            </View>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:signIn.password")}
              style={styles.input}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (canSubmit) void handleSubmit();
              }}
            />
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              style={[styles.providerPill, styles.authPrimary, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("auth:signIn.submit")}
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              <Text variant="body" style={styles.authPrimaryText}>{submitting ? t("auth:signIn.submitting") : t("auth:signIn.submit")}</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleForgotPassword()}
              disabled={resetSubmitting}
              hitSlop={14}
              style={[styles.authForgotRow, resetSubmitting && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("auth:signIn.resetLabel")}
              accessibilityState={{ disabled: resetSubmitting, busy: resetSubmitting }}
            >
              <Text variant="body" style={styles.authHelper}>{resetSubmitting ? t("auth:signIn.resetSending") : t("deepspace:auth.forgotPassword")}</Text>
            </Pressable>

            {resetHelpVisible ? (
              <View style={styles.authHelpCard} accessibilityRole="alert">
                <Text variant="heading" style={styles.authHelpTitle}>{resetEmailSentTo ? t("auth:signIn.resetSentTitle") : t("auth:signIn.resetTitle")}</Text>
                <Text variant="body" style={styles.authHelpBody}>
                  {resetEmailSentTo ? t("auth:signIn.resetSentBody", { email: resetEmailSentTo }) : t("auth:signIn.resetBody")}
                </Text>
              </View>
            ) : null}
          </>
        )}

        <Pressable onPress={() => router.push("/sign-up")} style={styles.authSignUpRow} accessibilityRole="link" accessibilityLabel={`${t("deepspace:auth.signUpPrompt")} ${t("deepspace:auth.signUp")}`}>
          <Text variant="body" style={styles.authSignUpPrompt}>{t("deepspace:auth.signUpPrompt")}</Text>
          <Text variant="body" style={styles.authSignUpCta}>{t("deepspace:auth.signUp")}</Text>
        </Pressable>
      </View>

      <Text variant="caption" style={styles.authLegal}>{t("deepspace:auth.legalConsent")}</Text>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

// Deep-space consent block: drives the SAME ConsentSelections state + helpers the
// legacy ConsentNotice uses, so the C10 ledger (buildSignUpConsentArgs in the
// hook) is byte-for-byte equivalent. Copy comes from the reviewed `consent`
// namespace (notice.*). Styling is deep-space tokens only.
function ConsentCheckRow({ checked, label, emphasize, onToggle }: { checked: boolean; label: string; emphasize?: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={styles.consentRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[styles.consentCheckbox, checked && styles.consentCheckboxOn]}>
        {checked ? <RNText style={styles.consentCheckmark}>✓</RNText> : null}
      </View>
      <Text variant="body" style={[styles.consentLabel, emphasize && { color: colors.textTitle }]}>{label}</Text>
    </Pressable>
  );
}

function DeepSpaceConsentBlock({ minor, value, onChange }: { minor: boolean; value: ConsentSelections; onChange: (next: ConsentSelections) => void }) {
  const { t } = useTranslation("consent");
  const allChecked = allRequiredAcksChecked(value);
  const toggle = (key: keyof ConsentSelections) => onChange({ ...value, [key]: !value[key] });
  return (
    <Card>
      <Text variant="heading" style={styles.section}>{t("notice.title")}</Text>
      <Text variant="body" style={styles.consentIntro}>{t("notice.intro")}</Text>
      {minor ? (
        <View style={styles.minorBanner}>
          <Text variant="body" style={styles.minorBannerText}>{t("notice.minorBanner")}</Text>
        </View>
      ) : null}
      <Text variant="caption" pixelEn style={styles.consentGroupLabel}>{t("notice.requiredLabel")}</Text>
      <ConsentCheckRow checked={allChecked} label={t("notice.agreeAll")} emphasize onToggle={() => onChange(setAllRequiredAcks(value, !allChecked))} />
      <View style={styles.consentDivider} />
      <ConsentCheckRow checked={value.service} label={t("notice.ackService")} onToggle={() => toggle("service")} />
      <ConsentCheckRow checked={value.llmProcessing} label={t("notice.ackLlm")} onToggle={() => toggle("llmProcessing")} />
      <ConsentCheckRow checked={value.overseasTransfer} label={t("notice.ackOverseas")} onToggle={() => toggle("overseasTransfer")} />
      <ConsentCheckRow checked={value.sensitiveData} label={t("notice.ackSensitive")} onToggle={() => toggle("sensitiveData")} />
      <Text variant="caption" pixelEn style={styles.consentGroupLabel}>{t("notice.optionalLabel")}</Text>
      <ConsentCheckRow checked={value.marketing} label={t("notice.optMarketing")} onToggle={() => toggle("marketing")} />
    </Card>
  );
}

export function DeepSpaceSignUpDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
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
  const passwordRef = useRef<TextInput>(null);
  const birthDateRef = useRef<TextInput>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (userId && !submitting && !judgeWelcome && !toast) return <Redirect href="/" />;

  const birthOk = ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE;
  const showChecklist = email.length > 0 || password.length > 0 || birthDate.length > 0;

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={120} mood="neutral" />
        <Text variant="heading" style={styles.big}>{t("deepspace:auth.signUpTitle")}</Text>
        <Text variant="body" style={styles.lead}>{t("deepspace:auth.signUpLead")}</Text>
        <Text variant="body" style={styles.authHelper}>{t("deepspace:auth.ageNotice")}</Text>
      </View>
      <Card>
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signUp.email")}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="email@example.com"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.email")}
          style={styles.input}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signUp.password")}</Text>
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="••••••••"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.password")}
          style={styles.input}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => birthDateRef.current?.focus()}
        />
        <Text variant="body" style={styles.authHelper}>{t("auth:signUp.passwordHelper")}</Text>
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signUp.birthDate")}</Text>
        <TextInput
          ref={birthDateRef}
          value={birthDate}
          onChangeText={(next) => setBirthDate(formatBirthDateInput(next))}
          autoCapitalize="none"
          keyboardType="number-pad"
          maxLength={10}
          placeholder="2010-03-15"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.birthDate")}
          accessibilityHint={t("auth:signUp.birthDateHelper")}
          style={styles.input}
          returnKeyType="done"
        />
        <Text variant="body" style={styles.authHelper}>{t("auth:signUp.birthDateHelper")}</Text>

        {showChecklist ? (
          <View style={{ gap: 6 }}>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: email.includes("@") ? colors.mint : colors.textLo }]} />
              <Text variant="body" style={[styles.checklistText, { color: email.includes("@") ? colors.mint : colors.textMid }]}>
                {email.includes("@") ? t("auth:signUp.checkEmail") : t("auth:signUp.checkEmailMissing")}
              </Text>
            </View>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: password.length >= 8 ? colors.mint : colors.textLo }]} />
              <Text variant="body" style={[styles.checklistText, { color: password.length >= 8 ? colors.mint : colors.textMid }]}>
                {password.length >= 8 ? t("auth:signUp.checkPassword") : t("auth:signUp.checkPasswordShort")}
              </Text>
            </View>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: birthOk ? colors.mint : colors.textLo }]} />
              <Text variant="body" style={[styles.checklistText, { color: birthOk ? colors.mint : colors.textMid }]}>
                {birthOk ? t("auth:signUp.checkAge") : t("auth:signUp.checkAgeBlocked")}
              </Text>
            </View>
          </View>
        ) : null}
      </Card>

      <DeepSpaceConsentBlock minor={isMinorAge} value={consent} onChange={setConsent} />

      {existingAccountHelp ? (
        <View style={styles.authHelpCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text variant="heading" style={styles.authHelpTitle}>{t("auth:signUp.existingAccountTitle")}</Text>
          <Text variant="body" style={styles.authHelpBody}>{t("auth:signUp.existingAccountBody")}</Text>
          <Pressable style={styles.providerBtn} onPress={() => router.push("/sign-in")} accessibilityRole="button" accessibilityLabel={t("auth:signUp.existingAccountSignIn")}>
            <Text variant="caption" style={styles.providerBtnText}>{t("auth:signUp.existingAccountSignIn")}</Text>
          </Pressable>
        </View>
      ) : null}

      <Card>
        {visibleProviders.length > 0 || naverEnabled ? (
          <View style={styles.authDividerRow}>
            <View style={styles.authDividerLine} />
            <Text variant="caption" pixelEn style={styles.authDividerLabel}>{t("deepspace:auth.or")}</Text>
            <View style={styles.authDividerLine} />
          </View>
        ) : null}
        {visibleProviders.map((provider) => (
          <Pressable
            key={provider}
            onPress={() => void handleOAuth(provider)}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t(PROVIDER_SIGNUP_KEY[provider])}
            accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
          >
            <View style={styles.providerRow}>
              {PROVIDER_BADGE[provider] ? <Text style={styles.providerBadge}>{PROVIDER_BADGE[provider]}</Text> : null}
              <Text variant="caption" style={styles.providerBtnText}>{t(PROVIDER_SIGNUP_KEY[provider])}</Text>
            </View>
          </Pressable>
        ))}
        {naverEnabled ? (
          <Pressable
            onPress={handleNaver}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("auth:signUp.continueWithNaver")}
          >
            <Text variant="caption" style={styles.providerBtnText}>{t("auth:signUp.continueWithNaver")}</Text>
          </Pressable>
        ) : null}
      </Card>

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={!canSubmit}
        style={[styles.primary, !canSubmit && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t("auth:signUp.submit")}
        accessibilityState={{ disabled: !canSubmit, busy: submitting }}
      >
        <Text variant="caption" style={styles.primaryText}>{t("auth:signUp.submit")}</Text>
      </Pressable>

      <Pressable onPress={() => router.push("/sign-in")} style={styles.authLinkRow} accessibilityRole="link" accessibilityLabel={t("auth:signUp.signInLink")}>
        <Text variant="body" style={styles.link}>{t("deepspace:auth.haveAccount")}</Text>
      </Pressable>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

export function DeepSpaceResetPasswordDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
  const {
    userId,
    loading,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    submitting,
    complete,
    toast,
    helperKey,
    canSubmit,
    handleSubmit,
  } = useResetPasswordForm();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  const helperDanger = helperKey !== "resetPassword.passwordHelper";
  const confirmRef = useRef<TextInput>(null);

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={120} mood={complete ? "positive" : "neutral"} />
        <Text variant="heading" style={styles.big}>{complete ? t("auth:resetPassword.doneTitle") : t("auth:resetPassword.title")}</Text>
        <Text variant="body" style={styles.lead}>{complete ? t("auth:resetPassword.doneSubtitle") : t("auth:resetPassword.subtitle")}</Text>
      </View>
      <Card>
        {!userId ? (
          <>
            <Text variant="heading" style={styles.authHelpTitle}>{t("auth:resetPassword.expiredTitle")}</Text>
            <Text variant="body" style={styles.authHelpBody}>{t("auth:resetPassword.expiredBody")}</Text>
            <Pressable style={styles.providerBtn} onPress={() => router.replace("/sign-in")} accessibilityRole="link" accessibilityLabel={t("auth:resetPassword.backToSignIn")}>
              <Text variant="caption" style={styles.providerBtnText}>{t("auth:resetPassword.backToSignIn")}</Text>
            </Pressable>
          </>
        ) : complete ? (
          <Pressable style={styles.primary} onPress={() => router.replace("/")} accessibilityRole="button" accessibilityLabel={t("auth:resetPassword.continue")}>
            <Text variant="caption" style={styles.primaryText}>{t("auth:resetPassword.continue")}</Text>
          </Pressable>
        ) : (
          <>
            <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:resetPassword.newPassword")}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:resetPassword.newPassword")}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmRef.current?.focus()}
              style={styles.input}
            />
            <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:resetPassword.confirmPassword")}</Text>
            <TextInput
              ref={confirmRef}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:resetPassword.confirmPassword")}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSubmit) void handleSubmit();
              }}
            />
            <Text variant="body" style={[styles.authHelper, helperDanger && styles.authDanger]}>{t(`auth:${helperKey}`)}</Text>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              style={[styles.primary, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("auth:resetPassword.submit")}
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              <Text variant="caption" style={styles.primaryText}>{submitting ? t("auth:resetPassword.submitting") : t("auth:resetPassword.submit")}</Text>
            </Pressable>
          </>
        )}
      </Card>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

