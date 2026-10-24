import { Linking, StyleSheet } from "react-native";
import { PhonePressable, PhoneView } from "@/components/phone/PhoneUIKit";
import { Text } from "@/components/ui/Text";
import { m3TextStyle } from "@/components/m3/typeface";
import type { ProbeGuidanceCopy } from "@/lib/interview/probe-guidance-copy";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";

export interface InterviewGuidanceRowProps {
  copy: Extract<ProbeGuidanceCopy, { kind: "ready" }>;
  onDismiss(): void;
}

/** Dormant fixed-copy row. Its parent owns delivery, layout and reveal lifetime. */
export function InterviewGuidanceRow({ copy, onDismiss }: InterviewGuidanceRowProps) {
  const directory = copy.directory;
  async function openDirectory() {
    if (!directory) return;
    try { await Linking.openURL(directory.href); }
    catch { /* Keep the fixed copy available when the browser cannot open. */ }
  }

  return (
    <PhoneView style={styles.row}>
      <Text variant="caption" accessibilityRole="header" style={m3TextStyle("titleSmall")}>{copy.title}</Text>
      {copy.blocks.map((block) => (
        <Text key={block.id} style={m3TextStyle("bodyLarge")}>{block.body}</Text>
      ))}
      {directory ? (
        <PhonePressable accessibilityRole="link" accessibilityLabel={directory.label}
          accessibilityHint={directory.hint} onPress={openDirectory} style={styles.action}>
          <Text variant="caption" style={[m3TextStyle("labelLarge"), styles.link]}>{directory.label}</Text>
        </PhonePressable>
      ) : null}
      <PhonePressable accessibilityRole="button" accessibilityLabel={copy.dismissLabel}
        onPress={onDismiss} style={styles.action}>
        <Text variant="caption" style={m3TextStyle("labelLarge")}>{copy.dismissLabel}</Text>
      </PhonePressable>
    </PhoneView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: m3.color.outlineVariant },
  action: { minHeight: 44, justifyContent: "center", paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm },
  link: { color: m3.color.primary },
});
