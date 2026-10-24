// Dormant T10 surface. Intentionally not mounted by /secondb or /privacy.
// Q-71/Q-72 copy was approved on 10-13 20:43 and legally rechecked at 17:09.
// The document tuple awaits the privacy-policy revision; no version is invented.
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PreferenceCheckRow, PreferenceToggleRow } from "@/components/ui/PreferenceToggle";
import { RECORD_READ_ENABLED } from "@/lib/chat/record-read";
import type { RecordReadCopy } from "@/lib/chat/record-read-copy";
import { spacing } from "@/lib/theme/tokens";
export type { RecordReadCopy } from "@/lib/chat/record-read-copy";

export function RecordReadConsentCard({ copy, isMinor, onOpenPolicyClause, outcome = null }: {
  copy: RecordReadCopy | null; isMinor: boolean | null;
  onOpenPolicyClause: (section: "5") => void;
  outcome?: "agreed" | "declined" | null;
}) {
  if (!RECORD_READ_ENABLED || isMinor !== false || !copy?.version || copy.lines.length !== 5) return null;
  if (outcome) return <Text variant="body" accessibilityLiveRegion="polite">{copy.afterPress[outcome]}</Text>;
  // No consent submission exists in slice 1. Even changing the visibility flag cannot grant consent.
  return (
    <View style={styles.card}>
      <Text variant="body">{copy.title}</Text>
      {copy.lines.map((line, index) => (
        <View key={index} style={styles.line}>
          <Text variant="subtle">{line.label}</Text>
          {"link" in line ? (
            <Text variant="body">
              {line.text.split(line.link.label)[0]}
              <Text variant="body" accessibilityRole="link" onPress={() => onOpenPolicyClause(line.link.section)}>{line.link.label}</Text>
              {line.text.split(line.link.label)[1]}
            </Text>
          ) : <Text variant="body">{line.text}</Text>}
        </View>
      ))}
      <Text variant="subtle">{copy.smallPrint}</Text>
      <PreferenceCheckRow checked={false} label={copy.ack} onToggle={() => {}} />
      <View style={styles.actions}>
        <Button label={copy.notNow} disabled variant="secondary" style={styles.button} />
        <Button label={copy.agree} disabled style={styles.button} />
      </View>
    </View>
  );
}

export function RecordReadPrivacyControl({ copy, isMinor, state = "off" }: {
  copy: RecordReadCopy | null; isMinor: boolean | null;
  state?: "off" | "on" | "justDisabled";
}) {
  if (!RECORD_READ_ENABLED) return null;
  if (!copy?.version) return null;
  return (
    <View style={styles.card}>
      <PreferenceToggleRow label={copy.settings.name} value={state === "on" && isMinor === false} disabled onValueChange={() => {}} />
      <Text variant="body">{isMinor === false ? copy.settings[state] : copy.settings.minor}</Text>
      {isMinor === false && <Button label={state === "on" ? copy.settings.disable : copy.settings.enable} disabled />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  line: { gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
  button: { flex: 1 },
});
