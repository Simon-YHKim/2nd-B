// PIXEL-CLAY 디더 (이주 P4, 2026-08-20).
//
// 절대 규칙 3: 블러 금지. 절대 규칙 4: 정적 opacity 금지 -> **색 밴딩 또는 50% 디더.**
//
// 반투명하게 보여야 하는 자리(모달 뒤 스크림, 눌림 상태층)를 알파 없이 만든다.
// 하드에지 체커보드는 멀리서 보면 반투명으로 읽히고 가까이서 보면 안티에일리어싱이
// 한 픽셀도 없다 - 그게 이 규칙이 지키려는 것이다.
//
// 웹 번들은 `repeating-conic-gradient` / 겹친 45deg `linear-gradient` 로 그린다
// (`_ds/css/primitives.css` `.px-scrim`). RN 에는 둘 다 없어서 Simon 결정 D4 가
// **작은 타일 이미지 반복**을 골랐다.
//
// ## 왜 @2x/@3x 가 필요한가
//
// `resizeMode="repeat"` 은 이미지를 **dp 기준 원본 크기**로 깐다. 그래서 3배 기기에서
// 1x 에셋을 쓰면 RN 이 3배로 늘리는데, 그 확대는 **바이리니어**라 체커의 모든 경계에
// 회색 그라데이션이 생긴다. 규칙 3이 금지한 바로 그 흐림이고, 코드 리뷰에서는 안 보이고
// 실기기에서만 보인다. 밀도별 에셋을 실으면 매핑이 1:1 이라 경계가 딱 떨어진다.
//
// 타일은 `scripts/build-dither-tiles.py` 가 만든다 (개당 80바이트 안팎).
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import { type DitherDensity } from "./press";

// require 는 정적이어야 Metro 가 번들에 넣는다 - 경로를 만들어 쓰면 안 된다.
// (`@2x`/`@3x` 는 파일명 규약이라 여기 안 적는다. RN 이 알아서 고른다.)
const TILE = {
  25: require("../../../assets/dither/dither-25.png"),
  50: require("../../../assets/dither/dither-50.png"),
  75: require("../../../assets/dither/dither-75.png"),
} as const;

export interface PixelDitherProps {
  density?: DitherDensity;
  style?: StyleProp<ImageStyle>;
}

/**
 * 부모를 채우는 디더 층. 부모에 `position: relative` 가 필요 없다 - 기본이
 * `StyleSheet.absoluteFill` 이다. 터치를 막지 않는다.
 */
export function PixelDither({ density = 50, style }: PixelDitherProps) {
  return (
    // View 로 감싸는 이유: `pointerEvents` 는 Image 의 prop 이 아니고, 스타일로도
    // `ImageStyle` 에는 없다(ViewStyle 전용). 전면을 덮는 층이라 이게 없으면 아래쪽
    // 버튼이 안 눌린다 - 노드 하나 값어치는 충분히 한다.
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={TILE[density]}
        resizeMode="repeat"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, style]}
      />
    </View>
  );
}

/**
 * 모달 뒤 스크림. 번들의 `.px-scrim` 자리다.
 *
 * 번들은 `color-mix(scrim 55%, transparent)` 바탕 위에 50% 체커를 얹는데, 그
 * **바탕이 정적 알파**라 규칙 4를 스스로 어긴다. 여기서는 알파 없이 75% 디더 하나로
 * 비슷한 어둡기를 낸다 - 규칙을 지키는 쪽으로 옮긴 의도된 차이다.
 */
export function PixelScrim({ style }: { style?: StyleProp<ImageStyle> }) {
  return <PixelDither density={75} style={[styles.scrim, style]} />;
}

const styles = StyleSheet.create({
  // `--z-overlay: 300`. RN 은 형제 안에서만 의미가 있지만, 스크림이 시트보다
  // 아래에 있어야 한다는 계약을 코드에 남긴다.
  scrim: { zIndex: 300 },
});
