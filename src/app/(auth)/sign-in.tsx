import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { spacing } from "@/lib/theme/tokens";

export default function SignIn() {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
        <Button label={t("signIn.submit")} variant="primary" onPress={() => undefined} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.sm },
});
