import { Pressable, StyleSheet, Switch, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

export function PreferenceSwitch({
  value,
  disabled,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
}: {
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ false: semantic.border, true: semantic.brand }}
      thumbColor={semantic.text}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
    />
  );
}

export function PreferenceToggleRow({
  label,
  description,
  value,
  disabled,
  muted,
  lockedLabel,
  accessibilityHint,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  muted?: boolean;
  lockedLabel?: string;
  accessibilityHint?: string;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <View style={styles.labelRow}>
          <Text variant="body" color={muted ? "textMuted" : "text"}>
            {label}
          </Text>
          {lockedLabel ? (
            <Text variant="subtle" color="textSubtle" style={styles.lockedTag}>
              {lockedLabel}
            </Text>
          ) : null}
        </View>
        {description ? (
          <Text variant="subtle" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      <PreferenceSwitch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint ?? description}
      />
    </View>
  );
}

export function PreferenceCheckRow({
  checked,
  label,
  onToggle,
  emphasize,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  emphasize?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={styles.checkRow}
      hitSlop={6}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <View style={styles.boxInner} /> : null}
      </View>
      <Text
        variant={emphasize ? "caption" : "subtle"}
        color={checked ? "text" : "textMuted"}
        style={styles.checkLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  copy: { flex: 1, gap: 2 },
  labelRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  lockedTag: {
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: 32,
    paddingVertical: spacing.xs,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxChecked: { borderColor: semantic.brand },
  boxInner: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: semantic.brand,
  },
  checkLabel: { flex: 1, lineHeight: 18 },
});
