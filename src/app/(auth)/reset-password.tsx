import { useEffect, useMemo, useRef, useState } from "react";
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
import { Link, router } from "expo-router";
import { useURL } from "expo-linking";

import { CosmicBackground, PremiumToast } from "@/components/premium";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { consumeAuthCallbackUrl, updatePassword } from "@/lib/supabase/auth";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { cosmicSky, radii, semantic, spacing, typography } from "@/lib/theme/tokens";

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

const PALETTE = cosmicSky;
type ResetToast = { message: string; tone: "info" | "success" | "danger" };

export default function ResetPassword() {
  const { t } = useTranslation("auth");
  const { userId, loading } = useAuth();
  const kbHeight = useKeyboard();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [toast, setToast] = useState<ResetToast | null>(null);

  const helperKey = useMemo(() => {
    if (password.length > 0 && password.length < 8) return "resetPassword.passwordTooShort";
    if (confirmPassword.length > 0 && confirmPassword !== password) return "resetPassword.passwordMismatch";
    return "resetPassword.passwordHelper";
  }, [confirmPassword, password]);

  // Native: the recovery email's deep link carries the session tokens, but
  // detectSessionInUrl is web-only — without consuming the URL here the
  // screen always dead-ends at "expired" (audit A-1). useURL covers both the
  // cold-start initial URL and a warm-app link event; AuthContext picks up
  // the resulting session and userId flips the form on.
  const deepLinkUrl = useURL();
  const consumedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web" || !deepLinkUrl || userId) return;
    if (consumedUrlRef.current === deepLinkUrl) return;
    consumedUrlRef.current = deepLinkUrl;
    consumeAuthCallbackUrl(deepLinkUrl).catch((e) => {
      if (typeof console !== "undefined") console.warn("[auth] recovery link consume failed", (e as Error).message);
    });
  }, [deepLinkUrl, userId]);

  if (loading) {
    return <InlineLoader message={t("common.checking")} />;
  }

  async function handleSubmit() {
    if (password.length < 8 || confirmPassword !== password || submitting) return;
    setSubmitting(true);
    try {
      await updatePassword(password);
      setPassword("");
      setConfirmPassword("");
      setComplete(true);
      setToast({ tone: "success", message: t("resetPassword.successToast") });
    } catch (e) {
      setToast({ tone: "danger", message: t("errors.passwordUpdateFailed") });
      if (typeof console !== "undefined") console.warn("[auth] password update error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = userId !== null && password.length >= 8 && confirmPassword === password && !submitting;

  return (
    <View style={styles.root}>
      <CosmicBackground />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Image
              source={authHero}
              style={styles.heroImg}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={t("common.entryArtwork")}
            />
            <Text style={styles.title}>
              {complete ? t("resetPassword.doneTitle") : t("resetPassword.title")}
            </Text>
            <Text style={styles.subtitle}>
              {complete ? t("resetPassword.doneSubtitle") : t("resetPassword.subtitle")}
            </Text>
          </View>

          <View style={styles.form}>
            {!userId ? (
              <>
                <Text style={styles.noticeTitle}>{t("resetPassword.expiredTitle")}</Text>
                <Text style={styles.noticeBody}>{t("resetPassword.expiredBody")}</Text>
                <Link href="/sign-in" asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={t("resetPassword.backToSignIn")}
                    accessibilityHint={t("resetPassword.backToSignInHint")}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>{t("resetPassword.backToSignIn")}</Text>
                  </Pressable>
                </Link>
              </>
            ) : complete ? (
              <Pressable
                onPress={() => router.replace("/")}
                accessibilityRole="button"
                accessibilityLabel={t("resetPassword.continue")}
                accessibilityHint={t("resetPassword.continueHint")}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>{t("resetPassword.continue")}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.label}>{t("resetPassword.newPassword")}</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  accessibilityLabel={t("resetPassword.newPassword")}
                  accessibilityHint={t("resetPassword.newPasswordHint")}
                  style={styles.input}
                />
                <Text style={styles.label}>{t("resetPassword.confirmPassword")}</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  accessibilityLabel={t("resetPassword.confirmPassword")}
                  accessibilityHint={t("resetPassword.confirmPasswordHint")}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (canSubmit) void handleSubmit();
                  }}
                />
                <Text style={[styles.helper, helperKey !== "resetPassword.passwordHelper" && styles.helperDanger]}>
                  {t(helperKey)}
                </Text>
                <Pressable
                  onPress={() => {
                    void handleSubmit();
                  }}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel={t("resetPassword.submit")}
                  accessibilityHint={t("resetPassword.submitHint")}
                  accessibilityState={{ disabled: !canSubmit, busy: submitting }}
                  style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
                >
                  <Text style={styles.primaryBtnText}>
                    {submitting ? t("resetPassword.submitting") : t("resetPassword.submit")}
                  </Text>
                </Pressable>
              </>
            )}
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
    ...(Platform.OS === "web" ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const } : {}),
  },
  hero: { alignItems: "center", marginTop: 28, marginBottom: 22, gap: 8 },
  heroImg: { width: 160, height: 160, marginBottom: 6 },
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
  },
  label: {
    color: PALETTE.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
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
  helper: { color: PALETTE.textMuted, fontSize: typography.sizes.sm, lineHeight: 20 },
  helperDanger: { color: semantic.danger },
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
  noticeTitle: { color: PALETTE.text, fontSize: 14, fontWeight: "700", letterSpacing: 0 },
  noticeBody: { color: PALETTE.textMuted, fontSize: typography.sizes.sm, lineHeight: 20, letterSpacing: 0 },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "stretch",
  },
});
