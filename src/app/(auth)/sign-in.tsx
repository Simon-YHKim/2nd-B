import { useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { spacing } from "@/lib/theme/tokens";
import { signInWithEmail } from "@/lib/supabase/auth";

export default function SignIn() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace("/journal");
    } catch (e) {
      Alert.alert("Sign-in failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="heading">{t("signIn.title")}</Text>
        <Text variant="body" color="textMuted">{t("signIn.subtitle")}</Text>
      </View>
      <View style={styles.form}>
        <Text variant="caption" color="textMuted">{t("signIn.email")}</Text>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text variant="caption" color="textMuted">{t("signIn.password")}</Text>
        <Input value={password} onChangeText={setPassword} secureTextEntry />
        <Button
          label={t("signIn.submit")}
          variant="primary"
          onPress={handleSubmit}
          loading={submitting}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.sm },
});
