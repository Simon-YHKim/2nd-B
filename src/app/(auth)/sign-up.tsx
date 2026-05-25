import { useMemo, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { JudgeBadge } from "@/components/auth/JudgeBadge";
import { spacing } from "@/lib/theme/tokens";
import { ageInYears } from "@/lib/supabase/auth";
import { isJudgeEmail } from "@/lib/judge/domains";

export default function SignUp() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const judge = useMemo(() => isJudgeEmail(email), [email]);
  const canSubmit = useMemo(() => {
    return email.includes("@") && password.length >= 8 && ageInYears(birthDate) >= 18;
  }, [email, password, birthDate]);

  function handleSubmit(): void {
    if (ageInYears(birthDate) < 18) {
      Alert.alert(t("errors.ageGate"));
      return;
    }
    // Server signUp lives in src/lib/supabase/auth.ts. Wired in Sprint 1.
    Alert.alert("Sprint 1", "Server sign-up wired in Sprint 1.");
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
