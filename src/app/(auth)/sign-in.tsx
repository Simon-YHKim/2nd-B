import { useState } from "react";
import { View, StyleSheet, Alert, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { spacing } from "@/lib/theme/tokens";
import { signInWithEmail } from "@/lib/supabase/auth";

export default function SignIn() {
  const { t, i18n } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace("/journal");
    } catch (e) {
      // Map raw Supabase errors to a generic localized message to avoid
      // email enumeration (CSO review finding R3 deferred to Sprint 1).
      const msg = locale === "ko" ? "로그인에 실패했어요. 이메일과 비밀번호를 다시 확인해 주세요." : "Sign-in failed. Please check your email and password.";
      Alert.alert(msg);
      if (typeof console !== "undefined") console.warn("[auth] signIn error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.includes("@") && password.length > 0 && !submitting;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="brand">2nd-Brain</Text>
        <Text variant="heading" style={styles.title}>{t("signIn.title")}</Text>
        <Text variant="body" color="textMuted">{t("signIn.subtitle")}</Text>
      </View>
      <View style={styles.form}>
        <Text variant="caption" color="textMuted">{t("signIn.email")}</Text>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <View style={styles.passwordRow}>
          <Text variant="caption" color="textMuted">{t("signIn.password")}</Text>
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            <Text variant="subtle" color="brand">
              {showPassword
                ? locale === "ko" ? "숨기기" : "Hide"
                : locale === "ko" ? "보기" : "Show"}
            </Text>
          </Pressable>
        </View>
        <Input
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => { if (canSubmit) void handleSubmit(); }}
        />
        <Button
          label={t("signIn.submit")}
          variant="primary"
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={submitting}
        />
      </View>
      <View style={styles.footer}>
        <Text variant="subtle" color="textMuted">
          {t("signIn.noAccount")}{" "}
          <Link href="/sign-up">
            <Text variant="subtle" color="brand" style={styles.link}>
              {t("signIn.signUpLink")}
            </Text>
          </Link>
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.xl },
  title: { marginTop: spacing.xs },
  form: { gap: spacing.sm },
  passwordRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footer: { marginTop: spacing.xl, alignItems: "center" },
  link: { textDecorationLine: "underline" },
});
