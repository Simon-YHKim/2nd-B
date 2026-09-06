import { useRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader } from "@/components/deepspace";
import { m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { useAuth } from "@/lib/auth/AuthContext";
import { useChangePasswordForm } from "@/lib/auth/useChangePasswordForm";
import { useFontStyle } from "@/lib/settings/readable-font";
import { m3 } from "@/lib/theme/m3";
import { useKeyboard } from "@/lib/ui/useKeyboard";

function PasswordField({
  label,
  helper,
  danger = false,
  children,
}: {
  label: string;
  helper?: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <RNText style={[m3TextStyle("labelMedium"), styles.fieldLabel]}>{label}</RNText>
      <PixelSurface
        variant="inset"
        background={m3.color.surfaceContainerHigh}
        contentStyle={styles.fieldSurface}
      >
        {children}
      </PixelSurface>
      {helper ? (
        <RNText
          accessibilityLiveRegion="polite"
          style={[m3TextStyle("bodySmall"), styles.helper, danger && styles.helperDanger]}
        >
          {helper}
        </RNText>
      ) : null}
    </View>
  );
}

export function DeepSpaceChangePasswordScreen() {
  const { t } = useTranslation(["auth", "common"]);
  const { userId, loading } = useAuth();
  const form = useChangePasswordForm();
  const keyboardHeight = useKeyboard();
  useFontStyle();

  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const scrollBottomPadding =
    Platform.OS === "android"
      ? Math.max(m3.spacing.s8 * 2, keyboardHeight + m3.spacing.s6 * 2)
      : m3.spacing.s8 * 2;

  if (loading) {
    return (
      <DeepSpaceScreen active="settings" header="none">
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const helperDanger = form.helperKey !== "resetPassword.passwordHelper";
  const submitDisabled = !form.canSubmit;
  const submitBackground = submitDisabled ? m3.color.surfaceVariant : m3.color.primary;
  const submitForeground = submitDisabled ? m3.disabled.onSurface : m3.color.onPrimary;

  return (
    <DeepSpaceScreen active="settings" header="none">
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <PixelPressable
            onPress={() => router.back()}
            accessibilityLabel={t("common:actions.back")}
            contentStyle={styles.backContent}
          >
            <PixelGlyph name="arrowBack" color={m3.color.onSurface} size={24} />
          </PixelPressable>
          <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.headerTitle]}>
            {t("auth:account.navPassword")}
          </RNText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <PixelSurface
              variant="frame"
              background={m3.color.primaryContainer}
              style={styles.heroGlyph}
              contentStyle={styles.heroGlyphContent}
            >
              <PixelGlyph name="lock" color={m3.color.onPrimaryContainer} size={24} />
            </PixelSurface>
            <RNText style={[m3TextStyle("bodyLarge"), styles.intro]}>
              {t("auth:changePassword.intro")}
            </RNText>
          </View>

          <View style={styles.form}>
            <PasswordField
              label={t("auth:changePassword.currentLabel")}
              helper={t("auth:changePassword.currentHelper")}
            >
              <TextInput
                value={form.currentPassword}
                onChangeText={form.setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                editable={!form.submitting}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => newPasswordRef.current?.focus()}
                accessibilityLabel={t("auth:changePassword.currentLabel")}
                accessibilityHint={t("auth:changePassword.currentHelper")}
                style={[styles.input, m3TextStyle("bodyLarge")]}
              />
            </PasswordField>

            <PasswordField label={t("auth:resetPassword.newPassword")}>
              <TextInput
                ref={newPasswordRef}
                value={form.password}
                onChangeText={form.setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!form.submitting}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                accessibilityLabel={t("auth:resetPassword.newPassword")}
                accessibilityHint={t("auth:resetPassword.newPasswordHint")}
                style={[styles.input, m3TextStyle("bodyLarge")]}
              />
            </PasswordField>

            <PasswordField
              label={t("auth:resetPassword.confirmPassword")}
              helper={t(form.helperKey)}
              danger={helperDanger}
            >
              <TextInput
                ref={confirmPasswordRef}
                value={form.confirmPassword}
                onChangeText={form.setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!form.submitting}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (form.canSubmit) void form.handleSubmit();
                }}
                accessibilityLabel={t("auth:resetPassword.confirmPassword")}
                accessibilityHint={t("auth:resetPassword.confirmPasswordHint")}
                style={[styles.input, m3TextStyle("bodyLarge")]}
              />
            </PasswordField>

            <PixelPressable
              onPress={() => void form.handleSubmit()}
              disabled={!form.canSubmit}
              accessibilityLabel={
                form.submitting
                  ? t("auth:resetPassword.submitting")
                  : t("auth:resetPassword.submit")
              }
              accessibilityHint={t("auth:resetPassword.submitHint")}
              accessibilityState={{ busy: form.submitting }}
              fullWidth
              variant={submitDisabled ? "inset" : "bevel"}
              background={submitBackground}
              contentStyle={styles.actionContent}
            >
              <RNText style={[m3TextStyle("labelLarge"), { color: submitForeground }]}>
                {form.submitting
                  ? t("auth:resetPassword.submitting")
                  : t("auth:resetPassword.submit")}
              </RNText>
            </PixelPressable>

            {form.needsReauth ? (
              <PixelPressable
                onPress={() => router.push("/sign-in")}
                accessibilityRole="link"
                accessibilityLabel={t("auth:changePassword.reauthCta")}
                accessibilityHint={t("auth:changePassword.reauthCta")}
                fullWidth
                variant="bevel"
                background={m3.color.surfaceContainerHigh}
                contentStyle={styles.actionContent}
              >
                <RNText style={[m3TextStyle("labelLarge"), styles.secondaryLabel]}>
                  {t("auth:changePassword.reauthCta")}
                </RNText>
              </PixelPressable>
            ) : null}
          </View>

          {form.toast ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
              <PixelSurface
                variant="frame"
                background={
                  form.toast.tone === "danger"
                    ? m3.color.errorContainer
                    : m3.color.surfaceContainerHigh
                }
                contentStyle={styles.toastContent}
              >
                <RNText
                  style={[
                    m3TextStyle("bodyMedium"),
                    form.toast.tone === "danger" ? styles.toastDanger : styles.toastSuccess,
                  ]}
                >
                  {form.toast.message}
                </RNText>
              </PixelSurface>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollView: { flex: 1 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s2,
  },
  backContent: { minWidth: m3.minTouch, alignItems: "center", paddingHorizontal: m3.spacing.s2 },
  headerTitle: {
    flex: 1,
    color: m3.color.onSurface,
    paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0,
  },
  scroll: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: m3.spacing.s8,
    paddingTop: m3.spacing.s6,
    gap: m3.spacing.s8,
  },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s6 },
  heroGlyph: { width: m3.minTouch, height: m3.minTouch },
  heroGlyphContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  intro: {
    flex: 1,
    color: m3.color.onSurfaceVariant,
    paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0,
  },
  form: { gap: m3.spacing.s6 },
  fieldGroup: { gap: m3.spacing.s2 },
  fieldLabel: {
    color: m3.color.onSurfaceVariant,
    paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0,
  },
  fieldSurface: {
    minHeight: m3.minTouch,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
  },
  input: {
    minHeight: m3.minTouch,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s4,
    color: m3.color.onSurface,
    borderRadius: m3.shape.none,
  },
  helper: {
    color: m3.color.onSurfaceVariant,
    paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0,
  },
  helperDanger: { color: m3.color.error },
  actionContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s6,
  },
  secondaryLabel: { color: m3.color.onSurface },
  toastContent: { paddingHorizontal: m3.spacing.s6, paddingVertical: m3.spacing.s4 },
  toastDanger: { color: m3.color.onErrorContainer },
  toastSuccess: { color: m3.accent.moodPositive },
});
