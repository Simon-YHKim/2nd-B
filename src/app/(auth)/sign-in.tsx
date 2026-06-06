// Sign-in screen — Cosmic Pixel entry gate matching LoadingScreen.
//
// Per docs/DESIGN.md visual continuity: the unauthenticated entry point
// uses the same deep-space, mint, and violet palette as the loader.
// On successful sign-in, the IntroGate in _layout plays the cell-team
// loading sequence as the "we're building your second brain" hand-off.

import { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Link, Redirect, router } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import {
  isNaverEnabled,
  isProviderEnabled,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signInWithKakao,
  signInWithNaver,
} from "@/lib/supabase/auth";
import { cosmicSky, radii, semantic, spacing } from "@/lib/theme/tokens";
import { CosmicBackground, PremiumToast } from "@/components/premium";
import { EyeIcon, EyeOffIcon } from "@/components/ui/EyeIcon";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useKeyboard } from "@/lib/ui/useKeyboard";

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

// Cosmic entry palette — deep-space bg + mint brand + violet accent, so
// the first (unauthenticated) screen already reads as the Cosmic Pixel
// Graph Village. Same shape as the legacy darkSky it replaced.
const PALETTE = cosmicSky;
type SignInToast = { message: string; tone: "info" | "success" | "danger" };

export default function SignIn() {
  const { t, i18n } = useTranslation("auth");
  const { userId, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [toast, setToast] = useState<SignInToast | null>(null);
  const [resetHelpVisible, setResetHelpVisible] = useState(false);
  // A provider whose OAuth start failed with a "not configured" error is hidden
  // for the rest of the session so the user is not left tapping a dead button.
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set());
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Still resolving the session — render the branded checking state instead of
  // flashing the sign-in form to a user who turns out to be signed in (the
  // guest-only guard below reads userId === null during this window).
  if (loading) {
    return <InlineLoader message={locale === "ko" ? "확인하는 중…" : "Checking…"} />;
  }

  // Already signed in (OAuth redirect landed back here, or user hit
  // /sign-in directly while session was still alive). Bounce to root
  // so the IntroGate plays the loader and /index routes the user to
  // the right next step (/complete-profile or graph).
  if (userId) return <Redirect href="/" />;

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
        message:
          locale === "ko"
            ? `${name} 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.`
            : `Could not start ${name} sign-in. Please try again in a moment.`,
      });
      if (typeof console !== "undefined")
        console.warn(`[auth] ${provider} oauth error`, msg);
    } finally {
      setOauthSubmitting(false);
    }
  }

  // Naver uses a custom redirect (not Supabase-native), so it has its own
  // handler — signInWithNaver() navigates the browser to Naver's authorize page.
  function handleNaver() {
    try {
      signInWithNaver();
    } catch (e) {
      setToast({
        tone: "danger",
        message:
          locale === "ko"
            ? "Naver 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
            : "Could not start Naver sign-in. Please try again in a moment.",
      });
      if (typeof console !== "undefined") console.warn("[auth] naver oauth error", (e as Error).message);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      // AuthContext picks up the new session; IntroGate plays the cell
      // LoadingScreen and then mounts the Stack. Route to /index so the
      // post-loading hand-off lands on the graph view (the new main).
      // (/journal is retired; now a /capture deep-link redirect.)
      router.replace("/");
    } catch (e) {
      // Generic message to avoid email-enumeration. CSO finding R3.
      setToast({
        tone: "danger",
        message:
          locale === "ko"
            ? "로그인에 실패했어요. 이메일과 비밀번호를 다시 확인해 주세요."
            : "Sign-in failed. Please check your email and password.",
      });
      if (typeof console !== "undefined") console.warn("[auth] signIn error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.includes("@") && password.length > 0 && !submitting;

  function handleForgotPassword() {
    setResetHelpVisible(true);
    setToast({
      tone: "info",
      message:
        locale === "ko"
          ? "비밀번호 재설정 안내를 아래에 표시했어요."
          : "Password reset instructions are shown below.",
    });
  }

  return (
    <View style={styles.root}>
      <CosmicBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={[styles.scroll, Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) }]} keyboardShouldPersistTaps="handled">
          {/* Top bar — brand left, locale toggle right. */}
          <View style={styles.topBar}>
            <Text style={styles.brand}>2ND-BRAIN</Text>
            <Pressable
              onPress={() => {
                void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                locale === "ko" ? "로그인 언어를 영어로 변경" : "Switch sign-in language to Korean"
              }
              accessibilityHint={locale === "ko" ? "로그인 화면 문구를 영어로 바꿉니다." : "Changes the sign-in screen copy to Korean."}
              style={styles.localeButton}
            >
              <Text style={styles.localeToggle}>{locale === "ko" ? "EN" : "한국어"}</Text>
            </Pressable>
          </View>

          {/* Logo + headline — premium SecondB gate hero. */}
          <View style={styles.hero}>
            <Image
              source={authHero}
              style={styles.heroImg}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={locale === "ko" ? "SecondB 입장 이미지" : "SecondB entry artwork"}
            />
            <Text style={styles.title}>
              {locale === "ko" ? "밤빛 조각마을에 들어가기" : "Enter the night village"}
            </Text>
            <Text style={styles.subtitle}>
              {locale === "ko"
                ? "내 조각들이 다시 연결될 준비를 하고 있어요."
                : "Your pieces are getting ready to connect again."}
            </Text>
          </View>

          {/* Form. */}
          <View style={styles.form}>
            <Text style={styles.label}>{t("signIn.email")}</Text>
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
              accessibilityHint={
                locale === "ko"
                  ? "로그인할 계정의 이메일 주소를 입력합니다."
                  : "Enter the email address for your account."
              }
              style={styles.input}
            />
            <View style={styles.labelRow}>
              <Text style={styles.label}>{t("signIn.password")}</Text>
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword
                    ? locale === "ko"
                      ? "비밀번호 숨기기"
                      : "Hide password"
                    : locale === "ko"
                      ? "비밀번호 보기"
                      : "Show password"
                }
                accessibilityHint={
                  showPassword
                    ? locale === "ko"
                      ? "비밀번호 입력값을 다시 가립니다."
                      : "Hides the password characters again."
                    : locale === "ko"
                      ? "비밀번호 입력값을 화면에 표시합니다."
                      : "Shows the password characters on screen."
                }
                accessibilityState={{ selected: showPassword }}
                style={styles.eyeBtn}
              >
                {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
              </Pressable>
            </View>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              textContentType="password"
              placeholderTextColor={PALETTE.textSubtle}
              accessibilityLabel={t("signIn.password")}
              accessibilityHint={
                locale === "ko"
                  ? "계정 비밀번호를 입력합니다."
                  : "Enter your account password."
              }
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
              <Text style={styles.primaryBtnText}>
                {submitting ? (locale === "ko" ? "들어가는 중…" : "Entering…") : t("signIn.submit")}
              </Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>{t("signIn.or")}</Text>
              <View style={styles.dividerLine} />
            </View>

            {isProviderEnabled("google") && !hiddenProviders.has("google") ? (
              <Pressable
                onPress={() => handleOAuth("google")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithGoogle")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text style={styles.secondaryBtnText}>
                  {oauthSubmitting ? "…" : t("signIn.continueWithGoogle")}
                </Text>
              </Pressable>
            ) : null}

            {isProviderEnabled("apple") && !hiddenProviders.has("apple") ? (
              <Pressable
                onPress={() => handleOAuth("apple")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithApple")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text style={styles.secondaryBtnText}>
                  {oauthSubmitting ? "…" : t("signIn.continueWithApple")}
                </Text>
              </Pressable>
            ) : null}

            {isProviderEnabled("kakao") && !hiddenProviders.has("kakao") ? (
              <Pressable
                onPress={() => handleOAuth("kakao")}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithKakao")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text style={styles.secondaryBtnText}>
                  {oauthSubmitting ? "…" : t("signIn.continueWithKakao")}
                </Text>
              </Pressable>
            ) : null}

            {isNaverEnabled() ? (
              <Pressable
                onPress={handleNaver}
                disabled={oauthSubmitting || submitting}
                style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("signIn.continueWithNaver")}
                accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
              >
                <Text style={styles.secondaryBtnText}>{t("signIn.continueWithNaver")}</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleForgotPassword}
              hitSlop={8}
              style={styles.forgotRow}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? "비밀번호 재설정" : "Reset password"}
              accessibilityHint={
                locale === "ko"
                  ? "지원팀에 이메일을 보내 재설정을 요청하는 안내를 엽니다."
                  : "Shows instructions for requesting a reset by email."
              }
            >
              <Text style={styles.subtleText}>
                {locale === "ko" ? "비밀번호를 잊으셨나요?" : "Forgot password?"}
              </Text>
            </Pressable>

            {resetHelpVisible ? (
              <View style={styles.resetHelpCard} accessibilityRole="alert">
                <Text style={styles.resetHelpTitle}>
                  {locale === "ko" ? "비밀번호 재설정" : "Reset password"}
                </Text>
                <Text style={styles.resetHelpBody}>
                  {locale === "ko"
                    ? "가입 이메일 주소로 support@2nd-brain.app에 연락해 주세요. 확인 후 재설정을 도와드릴게요."
                    : "Email support@2nd-brain.app from your account address and we will help you reset it."}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Footer — sign-up + manual link. */}
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Text style={styles.subtleText}>{t("signIn.noAccount")}</Text>
              <Link href="/sign-up" asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t("signIn.signUpLink")}
                  accessibilityHint={locale === "ko" ? "회원가입 화면을 엽니다." : "Opens the sign-up screen."}
                  style={styles.footerLinkHit}
                >
                  <Text style={styles.linkText}>{t("signIn.signUpLink")}</Text>
                </Pressable>
              </Link>
            </View>
            <Link href="/manual" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={locale === "ko" ? "앱 안내서 보기" : "Read the one-minute manual"}
                accessibilityHint={locale === "ko" ? "앱 안내서를 엽니다." : "Opens the app manual."}
                style={styles.manualLinkHit}
              >
                <Text style={[styles.subtleText, styles.linkUnderline]}>
                  {locale === "ko"
                    ? "이 앱이 처음이라면 안내서 보기"
                    : "New here? Read the 1-min manual"}
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
  },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: {
    color: PALETTE.brand,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
  },
  localeToggle: {
    color: PALETTE.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
  },
  localeButton: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  hero: { alignItems: "center", marginTop: 28, marginBottom: 22, gap: 8 },
  logo: { width: 84, height: 84, marginBottom: 6 },
  // HQ gate hero is ~square (740x746); render it in a square box so it
  // floats on the cosmic background instead of letterboxing into a sliver.
  heroImg: { width: 188, height: 188, marginBottom: 6 },
  title: {
    color: PALETTE.text,
    fontSize: 22,
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
  },
  label: {
    color: PALETTE.textMuted,
    fontSize: 11,
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
    fontSize: 15,
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
  primaryBtnText: { color: PALETTE.bg, fontSize: 15, fontWeight: "700", letterSpacing: 0 },
  secondaryBtn: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryBtnText: { color: PALETTE.text, fontSize: 15, fontWeight: "600", letterSpacing: 0 },
  btnDisabled: { opacity: 0.4 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: PALETTE.border },
  dividerLabel: {
    color: PALETTE.textSubtle,
    fontSize: 11,
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
  resetHelpBody: { color: PALETTE.textMuted, fontSize: 13, lineHeight: 20, letterSpacing: 0 },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "stretch",
  },
  footer: { marginTop: 28, alignItems: "center" },
  footerRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerLinkHit: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  manualLinkHit: { minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 4 },
  subtleText: { color: PALETTE.textMuted, fontSize: 13 },
  linkText: { color: PALETTE.brand, fontSize: 13, fontWeight: "600" },
  linkUnderline: { textDecorationLine: "underline" },
});
