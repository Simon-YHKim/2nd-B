import { useMemo, useState } from "react";
import { View, StyleSheet, Alert, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { JudgeBadge } from "@/components/auth/JudgeBadge";
import { spacing } from "@/lib/theme/tokens";
import { ageInYears, signUpWithEmail, AgeGateError } from "@/lib/supabase/auth";
import { isJudgeEmail } from "@/lib/judge/domains";

export default function SignUp() {
  const { t, i18n } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const judge = useMemo(() => isJudgeEmail(email), [email]);
  const canSubmit = useMemo(() => {
    return email.includes("@") && password.length >= 8 && ageInYears(birthDate) >= 18 && !submitting;
  }, [email, password, birthDate, submitting]);

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await signUpWithEmail({
        email: email.trim(),
        password,
        birthDate,
        locale,
      });
      if (result.judgeMode) Alert.alert(t("judge.welcome"));
      router.replace("/journal");
    } catch (e) {
      if (e instanceof AgeGateError) Alert.alert(t("errors.ageGate"));
      else {
        const msg = locale === "ko" ? "가입에 실패했어요. 잠시 후 다시 시도해 주세요." : "Sign-up failed. Please try again in a moment.";
        Alert.alert(msg);
        if (typeof console !== "undefined") console.warn("[auth] signUp error", (e as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="caption" color="brand">2nd-Brain</Text>
          <Text variant="heading" style={styles.title}>{t("signUp.title")}</Text>
          <Text variant="body" color="textMuted">{t("signUp.subtitle")}</Text>
          {judge ? <View style={styles.badgeWrap}><JudgeBadge /></View> : null}
        </View>
        <View style={styles.form}>
          <Text variant="caption" color="textMuted">{t("signUp.email")}</Text>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Text variant="caption" color="textMuted">{t("signUp.password")}</Text>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <BirthDateField value={birthDate} onChange={setBirthDate} />
          <Button
            label={t("signUp.submit")}
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onPress={handleSubmit}
          />
        </View>
        <View style={styles.footer}>
          <Text variant="subtle" color="textMuted">
            {t("signUp.alreadyHaveAccount")}{" "}
            <Link href="/sign-in">
              <Text variant="subtle" color="brand" style={styles.link}>
                {t("signUp.signInLink")}
              </Text>
            </Link>
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  header: { gap: spacing.xs, marginBottom: spacing.xl },
  title: { marginTop: spacing.xs },
  badgeWrap: { marginTop: spacing.sm },
  form: { gap: spacing.sm },
  footer: { marginTop: spacing.xl, alignItems: "center" },
  link: { textDecorationLine: "underline" },
});
