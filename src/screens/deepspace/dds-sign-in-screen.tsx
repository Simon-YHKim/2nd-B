import { useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { SecondbHead } from "@/components/deepspace";
import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { type OAuthProvider } from "@/lib/supabase/auth";
import { useSignInForm } from "@/lib/auth/useSignInForm";
import {
  resetPasswordHref,
  runAuthActionOnce,
} from "@/lib/auth/sign-in-screen-contract";
import { m3 } from "@/lib/theme/m3";

const PROVIDER_KEY: Record<OAuthProvider, string> = {
  google: "auth:signIn.continueWithGoogle",
  apple: "auth:signIn.continueWithApple",
  kakao: "auth:signIn.continueWithKakao",
  facebook: "auth:signIn.continueWithFacebook",
  github: "auth:signIn.continueWithGithub",
};

const PROVIDER_MONOGRAM: Record<OAuthProvider | "naver", string> = {
  google: "G",
  apple: "A",
  kakao: "K",
  facebook: "f",
  github: "GH",
  naver: "N",
};

type FocusedField = "email" | "password" | null;

export function DeepSpaceSignInDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common", "settings"]);
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
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
  } = useSignInForm();
  const passwordRef = useRef<TextInput>(null);
  const actionLock = useRef(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);

  if (loading) {
    return (
      <PixelGateShell contentContainerStyle={styles.loadingShell}>
        <View style={styles.loadingHero}>
          <PixelSurface variant="inset" style={styles.headFrame} contentStyle={styles.headContent}>
            <View accessibilityRole="image" accessibilityLabel={t("auth:common.entryArtwork")}>
              <SecondbHead size={72} mood="neutral" />
            </View>
          </PixelSurface>
          <Text style={styles.brand}>{t("deepspace:auth.brandLabel")}</Text>
          <PixelSurface variant="frame" contentStyle={styles.loadingSurface}>
            <Text style={styles.helper}>{t("auth:common.checking")}</Text>
          </PixelSurface>
        </View>
      </PixelGateShell>
    );
  }
  if (userId) return <Redirect href="/" />;

  const authBusy = submitting || oauthSubmitting;
  const submitDisabled = !canSubmit || oauthSubmitting;

  async function submit(): Promise<void> {
    if (submitDisabled) return;
    await runAuthActionOnce(actionLock, handleSubmit);
  }

  async function startProvider(provider: OAuthProvider): Promise<void> {
    if (authBusy) return;
    await runAuthActionOnce(actionLock, () => handleOAuth(provider));
  }

  async function startNaver(): Promise<void> {
    if (authBusy) return;
    await runAuthActionOnce(actionLock, handleNaver);
  }

  return (
    <PixelGateShell contentContainerStyle={styles.shell}>
      <View style={styles.hero}>
        <PixelSurface variant="inset" style={styles.headFrame} contentStyle={styles.headContent}>
          <View accessibilityRole="image" accessibilityLabel={t("auth:common.entryArtwork")}>
            <SecondbHead size={72} mood="neutral" />
          </View>
        </PixelSurface>
        <Text style={styles.brand}>{t("deepspace:auth.brandLabel")}</Text>
        <Text style={styles.title}>{t("deepspace:auth.signInTitle")}</Text>
        <Text style={styles.lead}>{t("deepspace:auth.signInLead")}</Text>
      </View>

      <PixelSurface variant="frame" style={styles.formSurface} contentStyle={styles.form}>
        <Text style={styles.label}>{t("auth:signIn.email")}</Text>
        <PixelSurface
          variant="inset"
          background={
            authBusy
              ? m3.color.surfaceContainerHighest
              : focusedField === "email"
                ? m3.color.primaryContainer
                : m3.color.surfaceVariant
          }
          style={styles.inputSurface}
          contentStyle={styles.inputContent}
        >
          <TextInput
            value={email}
            onChangeText={setEmail}
            editable={!authBusy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="email@example.com"
            placeholderTextColor={m3.color.onSurfaceVariant}
            accessibilityLabel={t("auth:signIn.email")}
            accessibilityHint={t("auth:signIn.emailHint")}
            style={styles.input}
            returnKeyType="next"
            blurOnSubmit={false}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </PixelSurface>

        <View style={styles.passwordLabelRow}>
          <Text style={styles.label}>{t("auth:signIn.password")}</Text>
          <PixelPressable
            variant="frame"
            onPress={toggleShowPassword}
            disabled={authBusy}
            accessibilityLabel={
              showPassword
                ? t("auth:signIn.hidePasswordLabel")
                : t("auth:signIn.showPasswordLabel")
            }
            accessibilityHint={
              showPassword
                ? t("auth:signIn.hidePasswordHint")
                : t("auth:signIn.showPasswordHint")
            }
            accessibilityState={{ selected: showPassword }}
            rootStyle={styles.eyeRoot}
            contentStyle={styles.eyeContent}
          >
            <PixelGlyph
              name={showPassword ? "visibilityOff" : "visibility"}
              color={m3.color.primary}
              size={24}
            />
          </PixelPressable>
        </View>
        <PixelSurface
          variant="inset"
          background={
            authBusy
              ? m3.color.surfaceContainerHighest
              : focusedField === "password"
                ? m3.color.primaryContainer
                : m3.color.surfaceVariant
          }
          style={styles.inputSurface}
          contentStyle={styles.inputContent}
        >
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            editable={!authBusy}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            placeholderTextColor={m3.color.onSurfaceVariant}
            accessibilityLabel={t("auth:signIn.password")}
            accessibilityHint={t("auth:signIn.passwordHint")}
            style={styles.input}
            returnKeyType="go"
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={() => {
              if (!submitDisabled) void submit();
            }}
          />
        </PixelSurface>

        <PixelPressable
          variant={submitDisabled ? "inset" : "bevel"}
          onPress={() => void submit()}
          disabled={submitDisabled}
          accessibilityLabel={t("auth:signIn.submit")}
          accessibilityState={{ busy: submitting }}
          background={submitDisabled ? m3.color.surfaceContainerHighest : m3.color.primary}
          fullWidth
          contentStyle={styles.primaryContent}
        >
          <PixelGlyph
            name="lock"
            color={submitDisabled ? m3.color.onSurfaceVariant : m3.color.onPrimary}
            size={24}
          />
          <Text style={[styles.primaryText, submitDisabled && styles.disabledText]}>
            {submitting ? t("auth:signIn.submitting") : t("auth:signIn.submit")}
          </Text>
        </PixelPressable>

        <PixelPressable
          variant="frame"
          onPress={() => router.push(resetPasswordHref(email))}
          disabled={authBusy}
          accessibilityRole="link"
          accessibilityLabel={t("auth:signIn.resetLabel")}
          accessibilityHint={t("auth:resetPassword.requestSubtitle")}
          fullWidth
          contentStyle={styles.linkContent}
        >
          <Text style={styles.linkText}>{t("deepspace:auth.forgotPassword")}</Text>
          <PixelGlyph name="arrowForward" color={m3.color.primary} size={16} />
        </PixelPressable>

        {visibleProviders.length > 0 || naverEnabled ? (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerCell} />
              <Text style={styles.dividerText}>{t("deepspace:auth.or")}</Text>
              <View style={styles.dividerCell} />
            </View>
            <View style={styles.providers}>
              {visibleProviders.map((provider) => (
                <PixelPressable
                  key={provider}
                  variant="bevel"
                  onPress={() => void startProvider(provider)}
                  disabled={authBusy}
                  accessibilityLabel={t(PROVIDER_KEY[provider])}
                  accessibilityState={{ busy: oauthSubmitting }}
                  rootStyle={styles.providerRoot}
                  contentStyle={styles.providerContent}
                >
                  <Text style={styles.providerMark}>{PROVIDER_MONOGRAM[provider]}</Text>
                  <Text style={styles.providerText}>{t(PROVIDER_KEY[provider])}</Text>
                </PixelPressable>
              ))}
              {naverEnabled ? (
                <PixelPressable
                  variant="bevel"
                  onPress={() => void startNaver()}
                  disabled={authBusy}
                  accessibilityLabel={t("auth:signIn.continueWithNaver")}
                  accessibilityState={{ busy: oauthSubmitting }}
                  rootStyle={styles.providerRoot}
                  contentStyle={styles.providerContent}
                >
                  <Text style={styles.providerMark}>{PROVIDER_MONOGRAM.naver}</Text>
                  <Text style={styles.providerText}>{t("auth:signIn.continueWithNaver")}</Text>
                </PixelPressable>
              ) : null}
            </View>
          </>
        ) : null}
      </PixelSurface>

      <PixelPressable
        variant="bevel"
        onPress={() => router.push("/sign-up")}
        disabled={authBusy}
        accessibilityRole="link"
        accessibilityLabel={t("auth:signIn.signUpLink")}
        accessibilityHint={t("auth:signIn.signUpHint")}
        fullWidth
        contentStyle={styles.signUpContent}
      >
        <View style={styles.signUpCopy}>
          <Text style={styles.helper}>{t("auth:signIn.noAccount")}</Text>
          <Text style={styles.signUpText}>{t("auth:signIn.signUpLink")}</Text>
        </View>
        <PixelGlyph name="arrowForward" color={m3.color.primary} size={24} />
      </PixelPressable>

      <PixelSurface variant="flat" contentStyle={styles.legal}>
        <Text style={styles.legalLead}>{t("deepspace:auth.legalConsent")}</Text>
        <View style={styles.legalLinks}>
          <LegalLink
            label={t("deepspace:ds.plans.legalTerms")}
            onPress={() => router.push("/terms")}
          />
          <LegalLink
            label={t("settings:nav.privacy")}
            onPress={() => router.push("/privacy-policy")}
          />
          <LegalLink
            label={t("deepspace:ds.plans.legalRefund")}
            onPress={() => router.push("/refund")}
          />
        </View>
      </PixelSurface>

      {toast ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion={toast.tone === "danger" ? "assertive" : "polite"}
        >
          <PixelSurface
            variant="frame"
            background={
              toast.tone === "danger"
                ? m3.color.errorContainer
                : toast.tone === "success"
                  ? m3.color.tertiaryContainer
                  : m3.color.primaryContainer
            }
            contentStyle={styles.toast}
          >
            <Text
              style={[
                styles.toastText,
                toast.tone === "danger"
                  ? styles.toastDanger
                  : toast.tone === "success"
                    ? styles.toastSuccess
                    : styles.toastInfo,
              ]}
            >
              {toast.message}
            </Text>
          </PixelSurface>
        </View>
      ) : null}
    </PixelGateShell>
  );
}

function LegalLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PixelPressable
      variant="frame"
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      rootStyle={styles.legalRoot}
      contentStyle={styles.legalLink}
    >
      <PixelGlyph name="article" color={m3.color.onSurfaceVariant} size={16} />
      <Text style={styles.legalText}>{label}</Text>
    </PixelPressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: m3.spacing.s6,
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  loadingShell: {
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  loadingHero: { alignItems: "center", gap: m3.spacing.s4 },
  loadingSurface: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", gap: m3.spacing.s2 },
  headFrame: { width: 96, height: 96 },
  headContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: m3.spacing.s2 },
  brand: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
    textAlign: "center",
  },
  title: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.headlineSmall.size,
    lineHeight: m3.type.headlineSmall.line,
    fontWeight: "700",
    textAlign: "center",
  },
  lead: {
    maxWidth: 360,
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    textAlign: "center",
  },
  formSurface: { alignSelf: "stretch" },
  form: { gap: m3.spacing.s3, padding: m3.spacing.s4 },
  label: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
  },
  inputSurface: { alignSelf: "stretch" },
  inputContent: { minHeight: 48, paddingHorizontal: 0, paddingVertical: 0, justifyContent: "center" },
  input: {
    minHeight: 48,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
  },
  passwordLabelRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
  },
  eyeRoot: { width: m3.minTouch, minHeight: m3.minTouch },
  eyeContent: { minHeight: m3.minTouch, alignItems: "center", padding: m3.spacing.s2 },
  primaryContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s3,
  },
  primaryText: {
    color: m3.color.onPrimary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
  },
  disabledText: { color: m3.color.onSurfaceVariant },
  linkContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
  },
  linkText: {
    flex: 1,
    color: m3.color.primary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  dividerCell: { flex: 1, height: m3.spacing.s1, backgroundColor: m3.color.outlineVariant },
  dividerText: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
  },
  providers: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: m3.spacing.s3 },
  providerRoot: { flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: 112 },
  providerContent: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
  },
  providerMark: {
    minWidth: 24,
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
    textAlign: "center",
  },
  providerText: {
    flex: 1,
    flexShrink: 1,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
  },
  signUpContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
  },
  signUpCopy: { flex: 1, gap: m3.spacing.s1 },
  helper: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
  },
  signUpText: {
    color: m3.color.primary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
  },
  legal: { gap: m3.spacing.s3, paddingHorizontal: 0 },
  legalLead: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    textAlign: "center",
  },
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "stretch",
    gap: m3.spacing.s2,
  },
  legalRoot: { flexGrow: 1, flexShrink: 1, flexBasis: "30%", minWidth: 96 },
  legalLink: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s2,
  },
  legalText: {
    flexShrink: 1,
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
    textAlign: "center",
  },
  toast: { minHeight: m3.minTouch, justifyContent: "center" },
  toastText: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    textAlign: "center",
  },
  toastDanger: { color: m3.color.onErrorContainer },
  toastSuccess: { color: m3.color.onTertiaryContainer },
  toastInfo: { color: m3.color.onPrimaryContainer },
});
