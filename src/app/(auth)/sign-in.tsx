// Sign-in screen — dark sky-black palette matching LoadingScreen.
//
// Per docs/DESIGN.md visual continuity: the unauthenticated entry point
// uses the same palette as the loader (#02040A bg, electric blue
// #2F97FC accents, soft blue #7FB3F4 secondary, light text #C7D4EA).
// On successful sign-in, the IntroGate in _layout plays the cell-team
// loading sequence as the "we're building your second brain" hand-off.

import { useState } from "react";
import {
  Alert,
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
import { signInWithEmail, signInWithGoogle } from "@/lib/supabase/auth";
import { cosmicSky } from "@/lib/theme/tokens";
import { CosmicBackground } from "@/components/premium";
import { EyeIcon, EyeOffIcon } from "@/components/ui/EyeIcon";

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_clean.png");

// Cosmic entry palette — deep-space bg + mint brand + violet accent, so
// the first (unauthenticated) screen already reads as the Cosmic Pixel
// Graph Village. Same shape as the legacy darkSky it replaced.
const PALETTE = cosmicSky;

export default function SignIn() {
  const { t, i18n } = useTranslation("auth");
  const { userId } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  // Already signed in (OAuth redirect landed back here, or user hit
  // /sign-in directly while session was still alive). Bounce to root
  // so the IntroGate plays the loader and /index routes the user to
  // the right next step (/complete-profile or graph).
  if (userId) return <Redirect href="/" />;

  async function handleGoogle() {
    setOauthSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      Alert.alert(
        locale === "ko"
          ? "Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
          : "Could not start Google sign-in. Please try again in a moment.",
      );
      if (typeof console !== "undefined") console.warn("[auth] google oauth error", (e as Error).message);
    } finally {
      setOauthSubmitting(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      // AuthContext picks up the new session; IntroGate plays the cell
      // LoadingScreen and then mounts the Stack. Route to /index so the
      // post-loading hand-off lands on the graph view (the new main),
      // not /journal. /journal stays reachable via the in-app nav.
      router.replace("/");
    } catch (e) {
      // Generic message to avoid email-enumeration. CSO finding R3.
      Alert.alert(
        locale === "ko"
          ? "로그인에 실패했어요. 이메일과 비밀번호를 다시 확인해 주세요."
          : "Sign-in failed. Please check your email and password.",
      );
      if (typeof console !== "undefined") console.warn("[auth] signIn error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.includes("@") && password.length > 0 && !submitting;

  function handleForgotPassword() {
    Alert.alert(
      locale === "ko" ? "비밀번호 재설정" : "Reset password",
      locale === "ko"
        ? "비밀번호 재설정 기능은 곧 추가됩니다. 그동안은 support@2nd-brain.app으로 연락해 주세요."
        : "Password reset is coming soon. Contact support@2nd-brain.app in the meantime.",
    );
  }

  return (
    <View style={styles.root}>
      <CosmicBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Top bar — brand left, locale toggle right. */}
          <View style={styles.topBar}>
            <Text style={styles.brand}>2ND-BRAIN</Text>
            <Pressable
              onPress={() => {
                void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
              }}
              hitSlop={8}
            >
              <Text style={styles.localeToggle}>{locale === "ko" ? "EN" : "한국어"}</Text>
            </Pressable>
          </View>

          {/* Logo + headline — premium SecondB gate hero. */}
          <View style={styles.hero}>
            <Image source={authHero} style={styles.heroImg} resizeMode="contain" />
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
              placeholder="you@example.com"
              placeholderTextColor={PALETTE.textSubtle}
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
                    ? (locale === "ko" ? "비밀번호 숨기기" : "Hide password")
                    : (locale === "ko" ? "비밀번호 보기" : "Show password")
                }
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
              placeholderTextColor={PALETTE.textSubtle}
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

            <Pressable
              onPress={handleGoogle}
              disabled={oauthSubmitting || submitting}
              style={[styles.secondaryBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            >
              <Text style={styles.secondaryBtnText}>
                {oauthSubmitting ? "…" : t("signIn.continueWithGoogle")}
              </Text>
            </Pressable>

            <Pressable onPress={handleForgotPassword} hitSlop={8} style={styles.forgotRow}>
              <Text style={styles.subtleText}>
                {locale === "ko" ? "비밀번호를 잊으셨나요?" : "Forgot password?"}
              </Text>
            </Pressable>
          </View>

          {/* Footer — sign-up + manual link. */}
          <View style={styles.footer}>
            <Text style={styles.subtleText}>
              {t("signIn.noAccount")}{" "}
              <Link href="/sign-up">
                <Text style={styles.linkText}>{t("signIn.signUpLink")}</Text>
              </Link>
            </Text>
            <Link href="/manual" style={{ marginTop: 8 }}>
              <Text style={[styles.subtleText, styles.linkUnderline]}>
                {locale === "ko" ? "이 앱이 처음이라면 — 안내서 보기" : "New here? Read the 1-min manual"}
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    letterSpacing: 2.5,
  },
  localeToggle: {
    color: PALETTE.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  hero: { alignItems: "center", marginTop: 32, marginBottom: 28, gap: 8 },
  logo: { width: 84, height: 84, marginBottom: 6 },
  heroImg: { width: 260, height: 122, marginBottom: 6 },
  title: {
    color: PALETTE.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    color: PALETTE.textMuted,
    fontSize: 14,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  form: { gap: 10 },
  label: {
    color: PALETTE.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  eyeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  input: {
    backgroundColor: PALETTE.surface,
    borderColor: PALETTE.border,
    borderWidth: 1,
    borderRadius: 8,
    color: PALETTE.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  primaryBtn: {
    backgroundColor: PALETTE.brand,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  primaryBtnText: { color: PALETTE.bg, fontSize: 15, fontWeight: "700", letterSpacing: 0.3 },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderColor: PALETTE.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryBtnText: { color: PALETTE.text, fontSize: 15, fontWeight: "600", letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.4 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 8 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: PALETTE.border },
  dividerLabel: { color: PALETTE.textSubtle, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  forgotRow: { marginTop: 6, alignItems: "center", paddingVertical: 4 },
  footer: { marginTop: 28, alignItems: "center" },
  subtleText: { color: PALETTE.textMuted, fontSize: 13 },
  linkText: { color: PALETTE.brand, fontSize: 13, fontWeight: "600" },
  linkUnderline: { textDecorationLine: "underline" },
});
