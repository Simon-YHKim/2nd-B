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
  const selectHint = locale === "ko" ? "두 번 탭해 이 답변을 선택합니다." : "Double tap to select this answer.";
  const selectedHint = locale === "ko" ? "선택된 답변입니다." : "Selected answer.";

  return (
    <View style={styles.scaleRow} accessibilityRole="radiogroup" accessibilityLabel={groupLabel}>
      {choices.map((choice) => {
        const active = value === choice.value;
        const optionLabel =
          locale === "ko"
            ? `${question}, ${choice.value}점, ${choice.label}${active ? ", 선택됨" : ""}`
            : `${question}, ${choice.value}, ${choice.label}${active ? ", selected" : ""}`;
        return (
          <Pressable
            key={choice.value}
            onPress={() => onSelect(choice.value)}
            style={[styles.scaleBtn, active && styles.scaleBtnActive]}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={optionLabel}
            accessibilityHint={active ? selectedHint : selectHint}
          >
            <Text variant="body" color={active ? "background" : "textMuted"} style={styles.scaleNumber}>
              {choice.value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scaleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  scaleBtn: {
    flex: 1,
    minWidth: 44,
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  scaleBtnActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  scaleNumber: { fontSize: 16, fontWeight: "700" },
});
