// 비밀번호 변경 (Settings -> 계정). The screen the app was missing: until now the
// only path that changed a password was the recovery form, so a signed-in user
// had no way to rotate theirs. Supabase Auth's "Require current password when
// updating" (Email provider, 2026-08-10) makes the current-password field
// mandatory here, and the intro says so up front rather than letting the server
// refuse after the fact.

import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View } from "react-native";

import { PremiumAppShell, PremiumToast } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { useChangePasswordForm } from "@/lib/auth/useChangePasswordForm";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceChangePasswordScreen } from "@/screens/deepspace/dds-change-password-screen";

function ChangePasswordLegacy() {
  const { t } = useTranslation("auth");
  const { userId, loading } = useAuth();
  const form = useChangePasswordForm();

  if (!loading && userId === null) return <Redirect href="/sign-in" />;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="heading" style={styles.title}>
          {t("account.navPassword")}
        </Text>

        <View style={styles.intro}>
          <Text variant="body" style={styles.introText}>
            {t("changePassword.intro")}
          </Text>
        </View>

        <Text variant="body" style={styles.label}>
          {t("changePassword.currentLabel")}
        </Text>
        <Input
          value={form.currentPassword}
          onChangeText={form.setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t("changePassword.currentLabel")}
          accessibilityHint={t("changePassword.currentHelper")}
        />
        <Text variant="caption" style={styles.helper}>
          {t("changePassword.currentHelper")}
        </Text>

        <Text variant="body" style={styles.label}>
          {t("resetPassword.newPassword")}
        </Text>
        <Input
          value={form.password}
          onChangeText={form.setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t("resetPassword.newPassword")}
          accessibilityHint={t("resetPassword.newPasswordHint")}
        />

        <Text variant="body" style={styles.label}>
          {t("resetPassword.confirmPassword")}
        </Text>
        <Input
          value={form.confirmPassword}
          onChangeText={form.setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t("resetPassword.confirmPassword")}
          accessibilityHint={t("resetPassword.confirmPasswordHint")}
        />
        <Text variant="caption" style={styles.helper}>
          {t(form.helperKey)}
        </Text>

        <Button
          label={form.submitting ? t("resetPassword.submitting") : t("resetPassword.submit")}
          onPress={form.handleSubmit}
          disabled={!form.canSubmit}
          accessibilityHint={t("resetPassword.submitHint")}
        />

        {/* Secure password change: the session is older than 24h, so the only way
            forward is a fresh sign-in. Shown only after the server says so. */}
        {form.needsReauth ? (
          <Button
            label={t("changePassword.reauthCta")}
            onPress={() => router.push("/sign-in")}
            accessibilityHint={t("changePassword.reauthCta")}
          />
        ) : null}
      </ScrollView>

      {form.toast ? <PremiumToast tone={form.toast.tone} message={form.toast.message} /> : null}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { marginBottom: spacing.sm },
  intro: {
    backgroundColor: semantic.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  introText: {},
  label: { marginTop: spacing.sm },
  helper: {},
});

export default function ChangePassword() {
  if (isDeepSpaceUI()) return <DeepSpaceChangePasswordScreen />;
  return <ChangePasswordLegacy />;
}
