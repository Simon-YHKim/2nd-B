// dds-auth-screens: the three deep-space auth screens (sign-in / sign-up /
// reset-password) + their shared shell, toast, and provider maps, moved
// verbatim from DeepSpaceDesignScreens.tsx (P5 megafile split, tranche 1).
// DeepSpaceDesignScreens re-exports them so every route import is unchanged.
/* eslint-disable */
// TODO(split-2): trim the import set + re-enable lint once the move settles.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
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
import { DateField } from "@/components/m3";
import { todayISO } from "@/components/m3/date-picker/calendar-math";

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

// Monochrome brand marks for the icon-only provider circles (flow request #2).
// Single-color per DESIGN.md's palette discipline; every major brand permits a
// one-color mark on dark UI. Facebook has no path here and falls back to its
// letter badge (it ships flag-off by default).
const PROVIDER_MARK_PATH: Partial<Record<OAuthProvider | "naver", string>> = {
  google:
    "M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z",
  kakao:
    "M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66-.15.52-.97 3.36-1 3.58 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.66-2.4 4.24-2.81.57.08 1.16.12 1.77.12 5.52 0 10-3.54 10-7.9S17.52 3 12 3Z",
  github:
    "M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.92-.26 1.9-.38 2.88-.39.98.01 1.96.13 2.88.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.67.8.55C20.22 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z",
  naver: "M16.27 12.85 7.42 0H0v24h7.73V11.15L16.58 24H24V0h-7.73v12.85Z",
};

function ProviderMark({ provider, color }: { provider: OAuthProvider | "naver"; color: string }) {
  if (provider === "apple") return <AppleGlyph color={color} />;
  const d = PROVIDER_MARK_PATH[provider];
  if (d) {
    // Naver's mark is a full-bleed square N; render it smaller so its optical
    // weight matches the padded 24-viewBox marks.
    const size = provider === "naver" ? 14 : 20;
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path fill={color} d={d} />
      </Svg>
    );
  }
  return <RNText style={styles.providerMarkDark}>{PROVIDER_BADGE[provider as OAuthProvider] ?? ""}</RNText>;
}

// Icon-only circular provider row: all social methods in ONE horizontal line
// instead of stacked full-width bars, so the auth screens stay short (flow
// request #2). Icon-only buttons keep the FULL provider label for a11y; Naver
// (custom OAuth, separate handler) joins the same row visually.
function ProviderIconRow({ providers, naverEnabled, disabled, busy, labelKeys, naverLabel, onProvider, onNaver }: {
  providers: readonly OAuthProvider[];
  naverEnabled: boolean;
  disabled: boolean;
  busy: boolean;
  labelKeys: Record<OAuthProvider, string>;
  naverLabel: string;
  onProvider: (provider: OAuthProvider) => void;
  onNaver: () => void;
}) {
  const { t } = useTranslation(["auth"]);
  if (providers.length === 0 && !naverEnabled) return null;
  return (
    <View style={styles.providerCircleRow}>
      {providers.map((provider) => (
        <Pressable
          key={provider}
          onPress={() => onProvider(provider)}
          disabled={disabled}
          style={[styles.providerCircle, disabled && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t(labelKeys[provider])}
          accessibilityState={{ disabled, busy }}
        >
          <ProviderMark provider={provider} color={colors.textTitle} />
        </Pressable>
      ))}
      {naverEnabled ? (
        <Pressable
          onPress={onNaver}
          disabled={disabled}
          style={[styles.providerCircle, disabled && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={naverLabel}
          accessibilityState={{ disabled, busy }}
        >
          <ProviderMark provider="naver" color={colors.textTitle} />
        </Pressable>
      ) : null}
    </View>
  );
}

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (userId) return <Redirect href="/" />;

  const oauthBusy = oauthSubmitting || submitting;

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={72} mood="neutral" />
        <Text variant="caption" pixelEn style={styles.authBrand}>{t("deepspace:auth.brandLabel")}</Text>
        <Text variant="heading" style={styles.authTitle}>{t("deepspace:auth.signInTitle")}</Text>
        <Text variant="body" style={styles.authSub}>{t("deepspace:auth.signInEncrypt")}</Text>
      </View>

      <View style={styles.authMethods}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
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

        {visibleProviders.length > 0 || naverEnabled ? (
          <View style={styles.authDividerRow}>
            <View style={styles.authDividerLine} />
            <Text variant="caption" pixelEn style={styles.authDividerLabel}>{t("deepspace:auth.or")}</Text>
            <View style={styles.authDividerLine} />
          </View>
        ) : null}

        <ProviderIconRow
          providers={visibleProviders}
          naverEnabled={naverEnabled}
          disabled={oauthBusy}
          busy={oauthSubmitting}
          labelKeys={PROVIDER_SIGNIN_KEY}
          naverLabel={t("auth:signIn.continueWithNaver")}
          onProvider={(provider) => void handleOAuth(provider)}
          onNaver={() => void handleNaver()}
        />

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
          returnKeyType="done"
        />
        <Text variant="body" style={styles.authHelper}>{t("auth:signUp.passwordHelper")}</Text>
        <Text variant="caption" pixelEn style={styles.authLabel}>{t("auth:signUp.birthDate")}</Text>
        <DateField
          value={birthDate}
          onChange={setBirthDate}
          minDate="1900-01-01"
          maxDate={todayISO()}
          initialView="year"
          initialCursorDate={`${Number(todayISO().slice(0, 4)) - 20}-01-01`}
          accessibilityLabel={t("auth:signUp.birthDate")}
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
        <ProviderIconRow
          providers={visibleProviders}
          naverEnabled={naverEnabled}
          disabled={oauthSubmitting || submitting}
          busy={oauthSubmitting}
          labelKeys={PROVIDER_SIGNUP_KEY}
          naverLabel={t("auth:signUp.continueWithNaver")}
          onProvider={(provider) => void handleOAuth(provider)}
          onNaver={() => void handleNaver()}
        />
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
  // confirmRef must be created BEFORE the early loading return so the hook order
  // is stable across renders. AuthContext starts loading:true, so a cold start
  // from the reset-password mail link renders the spinner first (fewer hooks)
  // then the form (one more); calling useRef after the return threw "Rendered
  // more hooks than during the previous render" (the file-level eslint-disable
  // is why react-hooks/rules-of-hooks never caught it).
  const confirmRef = useRef<TextInput>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  const helperDanger = helperKey !== "resetPassword.passwordHelper";

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

