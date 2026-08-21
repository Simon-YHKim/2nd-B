// MdCard - Material 3 card surface (rev2 migration, P1b). filled / outlined /
// elevated. Non-interactive by default; pass `onPress` to make it a button.
// Consumes m3.* tokens only.
//
// Pressable layout note (#680): Fabric Android drops function-form Pressable
// styles, so the card visuals live on a wrapper View and the inner Pressable
// carries only a STATIC padding style (with android_ripple for touch feedback)
// - the same proven pattern as SbNavBar and ConstellationHome.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from "react-native";

import { m3 } from "@/lib/theme/m3";

export type MdCardVariant = "filled" | "outlined" | "elevated";

export interface MdCardProps {
  variant?: MdCardVariant;
  children?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const CARD: Record<MdCardVariant, ViewStyle> = {
  filled: { backgroundColor: m3.color.surfaceContainerHighest },
  outlined: { backgroundColor: m3.color.surface, borderWidth: 1, borderColor: m3.color.outlineVariant },
  elevated: { backgroundColor: m3.color.surfaceContainerLow, ...m3.elevation.level1 },
};

export function MdCard({ variant = "filled", children, onPress, accessibilityLabel, style }: MdCardProps) {
  if (onPress) {
    return (
      <View style={[styles.shell, CARD[variant], style]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          android_ripple={{ color: m3.color.surfaceVariant }}
          style={styles.press}
        >
          {children}
        </Pressable>
      </View>
    );
  }
  return <View style={[styles.card, CARD[variant], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: m3.shape.medium, padding: m3.spacing.s4 },
  // interactive split: radius / bg / border on the shell, padding on the bare
  // touch surface so taps cover the whole card face.
  shell: { borderRadius: m3.shape.medium, overflow: "hidden" },
  //
  // ⚠ **높이 바닥이 여기 있어야 하는 이유** (PIXEL-CLAY 2단계, 2026-08-20).
  //
  // 다른 m3 프리미티브는 자기 높이를 리터럴로 깔아둔다(MdButton 48 · MdChip 44 ·
  // SegBtn 48 · MdNavBar 52 · Field 56). MdCard 만 높이가 **패딩에서만** 나왔다.
  // 그래서 `--u` 가 4px -> 2px 로 가면서 `s4` 가 16 -> 8 이 되자, 자식이 한 줄인
  // 카드가 통째로 44 아래로 내려갔다. 실측:
  //
  //   /ops '오늘의 추천'  (DeepSpaceDesignScreens.tsx:2629)  52 -> 36
  //   /ops '다음 추천'    (DeepSpaceDesignScreens.tsx:2639)  48 -> 32
  //   DatePicker 연도 칸  (date-picker/DatePicker.tsx:772)   48 -> 36
  //
  // 이 셋은 화면 코드가 아니라 **여기**가 원인이다 - 호출부가 `style` 을 주면
  // 그건 `shell` 에 붙지 `press` 에 안 붙는다(위 렌더 참조). 그래서 바닥도 여기
  // 깐다. 화면마다 minHeight 를 흩뿌리면 다음 토큰 변경 때 또 샌다.
  //
  // `justifyContent: "center"` 가 같이 있어야 한다 - 바닥만 깔면 내용이 위로
  // 붙어서 카드가 비어 보인다.
  press: { padding: m3.spacing.s4, minHeight: m3.minTouch, justifyContent: "center" },
});
