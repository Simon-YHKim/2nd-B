// PIXEL-CLAY 누름 (이주 P4, 2026-08-20).
//
// 번들의 `.px-btn:active` 는 두 가지를 동시에 한다:
//   1. `transform: translateY(var(--u))`  - 한 유닛 가라앉는다
//   2. 베벨 반전                          - 하이라이트가 위/왼쪽에서 아래/오른쪽으로
//
// 둘이 같이 있어야 "눌렸다" 로 읽힌다. 하나만 하면 흔들리거나(1만) 납작해진다(2만).
//
// ## 왜 `pressed` 를 직접 들고 있는가 - #680
//
// 처음에 이 파일을 함수형 style prop 과 함수형 children 으로 썼다가
// (둘 다 `pressed` 를 콜백 인자로 받는 그 형태다)
// `no-function-form-pressable-style` 가드에 걸렸다. **가드가 맞다.** 안드로이드
// Fabric 은 함수형 Pressable prop 을 런타임에 버려서, 소스는 멀쩡한데 실기기에서만
// 레이아웃·테두리·터치 영역이 사라진다. 이 저장소가 그걸 세 번 겪었다(#885 기록 카드,
// #912 주간성장 칩, 온보딩 CTA).
//
// 그래서 안전한 형태를 쓴다: **정적 style + 로컬 onPressIn/onPressOut 상태.**
// 여기서는 그 상태가 어차피 필요하다 - 베벨 반전이 같은 값을 읽어야 하기 때문이다.
//
// hover 상태층은 **가져오지 않는다.** 터치에 대응물이 없다
// (`design/pixel_clay_v4/REPO-NOTES.md` 함정 5).
import { useCallback, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";

import { m3 } from "@/lib/theme/m3";

import { PixelSurface, type PixelSurfaceVariant } from "./PixelSurface";

export interface PixelPressableProps {
  onPress: () => void;
  variant?: PixelSurfaceVariant;
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** 기본은 button. 링크처럼 다른 네이티브 역할이 필요한 공용 CTA 에서만 바꾼다. */
  accessibilityRole?: AccessibilityRole;
  /** busy/selected/expanded 등 호출부가 소유한 상태. disabled 는 `disabled` prop 이 정본이다. */
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  /** PixelSurface 면 배경. PIXEL-CLAY 토큰 색만 전달한다. */
  background?: string;
  /** Pressable 바깥 루트 스타일. 기존 `style` 은 계속 눌림 래퍼에 적용된다. */
  rootStyle?: StyleProp<ViewStyle>;
  /** 게이트 CTA 처럼 부모 가로폭을 채우는 경우의 명시적 편의 prop. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function PixelPressable({
  onPress,
  variant = "bevel",
  children,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  accessibilityState,
  disabled = false,
  background,
  rootStyle,
  fullWidth = false,
  style,
  contentStyle,
}: PixelPressableProps) {
  const [held, setHeld] = useState(false);
  const press = useCallback(() => setHeld(true), []);
  const release = useCallback(() => setHeld(false), []);
  const sunken = held && !disabled;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press}
      onPressOut={release}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      style={[styles.root, fullWidth && styles.fullWidth, rootStyle]}
    >
      <View style={[sunken ? styles.sunk : styles.rest, fullWidth && styles.fullWidth, style]}>
        <PixelSurface
          variant={variant}
          pressed={sunken}
          background={background}
          style={styles.surface}
          contentStyle={[styles.content, contentStyle]}
        >
          {children}
        </PixelSurface>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "flex-start" },
  fullWidth: { alignSelf: "stretch", width: "100%" },
  rest: {},
  // 절대 규칙 5: 계단 모션. 이 변환은 상태 전환이라 애니메이션이 없다 - 한 프레임에
  // 붙는다. 그게 곧 steps(1) 이다.
  sunk: { transform: [{ translateY: m3.spacing.s1 }] },
  // 최소 터치 규격. m3 프리미티브와 같은 바닥을 쓴다.
  surface: { minHeight: m3.minTouch, justifyContent: "center" },
  content: { justifyContent: "center" },
});
