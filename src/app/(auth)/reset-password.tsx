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
import { Link, router } from "expo-router";

import { CosmicBackground, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useResetPasswordForm } from "@/lib/auth/useResetPasswordForm";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { cosmicSky, radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceResetPasswordDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

const PALETTE = cosmicSky;

function ResetPasswordLegacy() {
  const { t } = useTranslation("auth");
  const kbHeight = useKeyboard();
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
    return <InlineLoader message={t("common.checking")} />;
  }

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
            <Text variant="body" style={styles.title}>
              {complete ? t("resetPassword.doneTitle") : t("resetPassword.title")}
            </Text>
            <Text variant="body" style={styles.subtitle}>
              {complete ? t("resetPassword.doneSubtitle") : t("resetPassword.subtitle")}
            </Text>
          </View>

          <View style={styles.form}>
            {!userId ? (
              <>
                <Text variant="body" style={styles.noticeTitle}>{t("resetPassword.expiredTitle")}</Text>
                <Text variant="body" style={styles.noticeBody}>{t("resetPassword.expiredBody")}</Text>
                <Link href="/sign-in" asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={t("resetPassword.backToSignIn")}
                    accessibilityHint={t("resetPassword.backToSignInHint")}
                    style={styles.secondaryBtn}
                  >
                    <Text variant="body" style={styles.secondaryBtnText}>{t("resetPassword.backToSignIn")}</Text>
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
                <Text variant="body" style={styles.primaryBtnText}>{t("resetPassword.continue")}</Text>
              </Pressable>
            ) : (
              <>
                <Text variant="subtle" style={styles.label}>{t("resetPassword.newPassword")}</Text>
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
                <Text variant="subtle" style={styles.label}>{t("resetPassword.confirmPassword")}</Text>
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
                <Text variant="subtle" style={[styles.helper, helperKey !== "resetPassword.passwordHelper" && styles.helperDanger]}>
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
                  <Text variant="body" style={styles.primaryBtnText}>
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
    ...androidElevationStyle(androidElevation.authForm),
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
  helper: { color: PALETTE.textMuted, fontSize: typography.sizes.sm },
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
  noticeBody: { color: PALETTE.textMuted, fontSize: typography.sizes.sm, letterSpacing: 0 },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "stretch",
  },
});

export default function ResetPassword() {
  if (isDeepSpaceUI()) return <DeepSpaceResetPasswordDesignScreen />;
  return <ResetPasswordLegacy />;
}
