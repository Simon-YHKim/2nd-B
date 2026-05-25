import { useMemo, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

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

  const judge = useMemo(() => isJudgeEmail(email), [email]);
  const canSubmit = useMemo(() => {
    return email.includes("@") && password.length >= 8 && ageInYears(birthDate) >= 18 && !submitting;
  }, [email, password, birthDate, submitting]);

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
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
      else Alert.alert("Sign-up failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="heading">{t("signUp.title")}</Text>
        <Text variant="body" color="textMuted">{t("signUp.subtitle")}</Text>
        {judge ? <JudgeBadge /> : null}
      </View>
      <View style={styles.form}>
        <Text variant="caption" color="textMuted">{t("signUp.email")}</Text>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text variant="caption" color="textMuted">{t("signUp.password")}</Text>
        <Input value={password} onChangeText={setPassword} secureTextEntry />
        <BirthDateField value={birthDate} onChange={setBirthDate} />
        <Button
          label={t("signUp.submit")}
          variant="primary"
          disabled={!canSubmit}
          loading={submitting}
          onPress={handleSubmit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.sm },
});
