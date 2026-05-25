import { useTranslation } from "react-i18next";
import { View, StyleSheet } from "react-native";
import { Link } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { spacing } from "@/lib/theme/tokens";

export default function Landing() {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="caption" color="brand">2nd-Brain</Text>
        <Text variant="display">{t("app.name")}</Text>
        <Text variant="body" color="textMuted">{t("app.tagline")}</Text>
      </View>
      <View style={styles.actions}>
        <Link href="/sign-in" asChild>
          <Button label="Sign in" variant="primary" />
        </Link>
        <Link href="/sign-up" asChild>
          <Button label="Create account" variant="secondary" />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: "center", gap: spacing.sm },
  actions: { gap: spacing.md, paddingBottom: spacing.xl },
});
