import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

export interface LikertChoice {
  value: number;
  label: string;
}

interface Props {
  choices: LikertChoice[];
  locale: "en" | "ko";
  onSelect: (value: number) => void;
  question: string;
  value?: number;
}

export function LikertChoiceGroup({ choices, locale, onSelect, question, value }: Props) {
  const groupLabel = locale === "ko" ? `${question} 응답 선택` : `${question} answer choices`;

  return (
    <View style={styles.scaleRow} accessibilityRole="radiogroup" accessibilityLabel={groupLabel}>
      {choices.map((choice) => {
        const active = value === choice.value;
        const optionLabel =
          locale === "ko"
            ? `${question}, ${choice.value}점, ${choice.label}`
            : `${question}, ${choice.value}, ${choice.label}`;
        return (
          <Pressable
            key={choice.value}
            onPress={() => onSelect(choice.value)}
            style={[styles.scaleBtn, active && styles.scaleBtnActive]}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={optionLabel}
          >
            <Text variant="caption" color={active ? "background" : "textMuted"}>
              {choice.value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scaleRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  scaleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
    alignItems: "center",
  },
  scaleBtnActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
});
