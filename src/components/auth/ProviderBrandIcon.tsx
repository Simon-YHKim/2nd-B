import { StyleSheet, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { PlainText as Text } from "@/components/ui/PlainText";
import type { OAuthProvider } from "@/lib/supabase/auth";
import { m3 } from "@/lib/theme/m3";
import { semantic } from "@/lib/theme/tokens";

type PixelBrandCell = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: string,
];

// PIXEL-CLAY v4 시안의 실제 브랜드 실루엣을 16 x 16 정수 격자로 옮겼다.
// Google의 네 색은 앱 팔레트가 아니라 브랜드 식별에 필요한 고정 색상이다.
const PIXEL_BRAND_CELLS: Partial<Record<OAuthProvider | "naver", readonly PixelBrandCell[]>> = {
  google: [
    [5, 2, 6, 2, semantic.googleBrandRed],
    [3, 4, 2, 1, semantic.googleBrandRed],
    [11, 4, 2, 1, semantic.googleBrandRed],
    [2, 5, 2, 4, semantic.googleBrandYellow],
    [2, 9, 2, 2, semantic.googleBrandGreen],
    [3, 11, 2, 1, semantic.googleBrandGreen],
    [5, 12, 6, 2, semantic.googleBrandGreen],
    [8, 7, 6, 2, semantic.googleBrandBlue],
    [12, 9, 2, 2, semantic.googleBrandBlue],
    [11, 11, 2, 1, semantic.googleBrandBlue],
  ],
  apple: [
    [9, 0, 3, 1],
    [10, 1, 2, 1],
    [8, 2, 1, 1],
    [4, 3, 3, 1],
    [9, 3, 3, 1],
    [3, 4, 9, 1],
    [2, 5, 9, 3],
    [2, 8, 11, 2],
    [3, 10, 10, 2],
    [4, 12, 8, 1],
    [5, 13, 2, 1],
    [9, 13, 2, 1],
  ],
  github: [
    [3, 1, 2, 1],
    [11, 1, 2, 1],
    [3, 2, 3, 1],
    [10, 2, 3, 1],
    [3, 3, 10, 1],
    [2, 4, 12, 1],
    [1, 5, 14, 4],
    [2, 9, 12, 1],
    [3, 10, 10, 1],
    [4, 11, 3, 1],
    [9, 11, 3, 1],
    [0, 10, 2, 1],
    [0, 11, 1, 1],
  ],
};

const PROVIDER_MARK: Partial<Record<OAuthProvider | "naver", string>> = {
  kakao: "K",
  facebook: "f",
  naver: "N",
};

export function ProviderBrandIcon({ provider }: { provider: OAuthProvider | "naver" }) {
  const cells = PIXEL_BRAND_CELLS[provider];
  if (!cells) {
    return (
      <View style={styles.mark} accessible={false}>
        <Text allowFontScaling={false} style={styles.markText}>{PROVIDER_MARK[provider]}</Text>
      </View>
    );
  }
  return (
    <Svg width={32} height={32} viewBox="0 0 16 16">
      {cells.map(([x, y, width, height, fill], index) => (
        <Rect
          // 각 브랜드의 셀 목록은 정적이며 순서도 고정돼 있다.
          key={`${provider}-${index}`}
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill ?? m3.color.onSurface}
        />
      ))}
    </Svg>
  );
}

// D6: this is an icon, with a separate provider label on the button. No inset
// padding or font scaling may consume its fixed 32dp box (20dp line fits inside).
const styles = StyleSheet.create({
  mark: { width: 32, height: 32, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  markText: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: 12,
    lineHeight: 20,
    includeFontPadding: false,
    textAlign: "center",
  },
});
