// Dormant T10 surface. Intentionally not mounted by /secondb or /privacy.
// The approved five-line original was not available (Q-71 legal reply is conditional).
// Supply that versioned copy in a later reviewed change; do not invent it here.
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PreferenceCheckRow, PreferenceToggleRow } from "@/components/ui/PreferenceToggle";
import { RECORD_READ_ENABLED } from "@/lib/chat/record-read";
import { spacing } from "@/lib/theme/tokens";

type ConsentLine = Readonly<{ label: string; text: string }>;
export type RecordReadCopy = Readonly<{
  version: string;
  lines: readonly [ConsentLine, ConsentLine, ConsentLine, ConsentLine, ConsentLine];
}>;

export function RecordReadConsentCard({ copy, isMinor }: {
  copy: RecordReadCopy | null; isMinor: boolean | null;
}) {
  const { t } = useTranslation("consent");
  if (!RECORD_READ_ENABLED || isMinor !== false || !copy || copy.lines.length !== 5) return null;
  // No consent submission exists in slice 1. Even changing the visibility flag cannot grant consent.
  return (
    <View style={styles.card}>
      <Text variant="body">{t("recordRead.title")}</Text>
      {copy.lines.map((line, index) => (
        <View key={index} style={styles.line}>
          <Text variant="subtle">{line.label}</Text>
          <Text variant="body">{line.text}</Text>
        </View>
      ))}
      <PreferenceCheckRow checked={false} label={t("recordRead.ack")} onToggle={() => {}} />
      <View style={styles.actions}>
        <Button label={t("recordRead.agree")} disabled style={styles.button} />
        <Button label={t("recordRead.notNow")} disabled variant="secondary" style={styles.button} />
      </View>
    </View>
  );
}

export function RecordReadPrivacyControl() {
  const { t } = useTranslation("consent");
  if (!RECORD_READ_ENABLED) return null;
  return <PreferenceToggleRow label={t("recordRead.setting")} value={false} disabled onValueChange={() => {}} />;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  line: { gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
  button: { flex: 1 },
});
