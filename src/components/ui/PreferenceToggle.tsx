import { Pressable, TouchableOpacity, StyleSheet, Switch, View } from "react-native";

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
    // P2-13 (persona sim, low-vision): the only touchable used to be the
    // 51x31 Switch itself — a tiny motor target. The WHOLE row now toggles
    // (in-repo precedent: capture's advisor checkbox row); the Switch stays
    // for the visual state but is hidden from the accessibility tree so the
    // row reads as one switch instead of two nested ones.
    <Pressable
      style={styles.row}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? description}
      accessibilityState={{ checked: value, disabled }}
    >
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
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PreferenceSwitch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          accessibilityLabel={label}
          accessibilityHint={accessibilityHint ?? description}
        />
      </View>
    </Pressable>
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
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={styles.checkRow}
      hitSlop={6}
      activeOpacity={0.7}
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
    </TouchableOpacity>
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
    minHeight: 44,
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
