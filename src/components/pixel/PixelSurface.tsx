// PIXEL-CLAY 표면 프리미티브 (이주 P4, 2026-08-20).
//
// 절대 규칙 6: **4방향 베벨.** 2변 'ㄱ'자 금지.
//
// ## 왜 `borderWidth` 가 아닌가 - 잘린 모서리(cut-corner)
//
// 인수 번들은 테두리를 `border` 로 안 그리고 **4방향 box-shadow** 로 그린다. 그
// 선택이 이 시각 체계의 실루엣을 만든다. `_ds/css/primitives.css` 가 그렇게 적어뒀다:
//
//   "border 대신 4방향 box-shadow -> 모서리가 비면서 잘린 모서리(cut-corner)
//    픽셀 실루엣이 생김"
//
// 왜 비는지: `box-shadow: 0 -u 0 0 c` 는 박스를 위로 u 만큼 민 복사본이라 **가로
// 전체** 폭의 막대가 되고, `-u 0 0 0 c` 는 **세로 전체** 높이의 막대가 된다. 두
// 막대는 각각 자기 축으로만 뻗으므로 (x<0, y<0) 인 모서리 정사각형은 **어느 쪽도
// 안 덮는다.** 그래서 네 귀퉁이가 u x u 만큼 잘려 나간 것처럼 보인다.
//
// RN 의 `borderWidth` 는 모서리를 **채운다**(마이터 조인). 그래서 border 로 옮기면
// 값은 같은데 실루엣이 사라진다 - 이 체계에서 제일 알아보기 쉬운 특징이 조용히
// 없어지는 것이다. 그래서 막대 4개를 직접 놓는다.
//
// ## 왜 바깥이 아니라 안쪽에 놓는가
//
// CSS 의 그림자는 박스 **바깥**에 그려지고 번들도 `margin: var(--u)` 로 자리를
// 비워둔다. RN 에서 음수 offset 으로 바깥에 놓으면 **안드로이드가 부모 경계에서
// 잘라낸다**(`overflow: visible` 이 안드로이드에서 자식에게 안 먹는다 - 이 저장소가
// `ANDROID_QA_GUIDELINES.md` 에서 이미 배운 함정과 같은 종류다). 그래서 래퍼에
// `padding: u` 를 주고 막대를 그 안쪽에 놓는다. 결과 실루엣은 같고 잘림은 없다.
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { m3 } from "@/lib/theme/m3";
import { PhoneForegroundProvider, usePhoneDesign } from "@/lib/theme/phone-design-context";
import { phoneFlatSurface, phoneStyle, phoneSurfaceColor } from "@/lib/theme/phone-design";
import { phoneIos } from "@/lib/theme/phone-ios";
import { PixelRoundRect } from "./PixelRoundRect";

/**
 * - `frame` 테두리만 (px-frame)
 * - `bevel` 테두리 + 안쪽 하이라이트(위/왼쪽) + 그림자(아래/오른쪽) = 솟은 면 (px-bevel)
 * - `inset` 베벨 반전 + 가라앉은 배경 = 눌린 면 (px-inset)
 * - `flat`  배경만, 테두리 없음 (px-flat)
 */
export type PixelSurfaceVariant = "frame" | "bevel" | "inset" | "flat";

export interface PixelSurfaceProps {
  variant?: PixelSurfaceVariant;
  /** 눌린 상태. 베벨을 뒤집는다 (`.px-btn:active` 와 같다). */
  pressed?: boolean;
  /** 면 배경. 기본은 variant 별 토큰. */
  background?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 안쪽 여백. 기본 `--pad-y`/`--pad-x` (s2/s4). */
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * 바깥(`style`)에 건 높이 상한을 면과 안쪽까지 넘긴다. 켜면 둘이 줄어들 수 있어서,
   * 안에 둔 FlatList · ScrollView 가 남은 높이만 차지하고 스크롤된다.
   *
   * 기본은 끔이다(이전 동작 그대로). 면은 바깥과 안쪽 사이의 View 한 층이고, RN-web 의
   * View 기본값이 `flex: 0 0 auto`, Yoga 의 기본 flexShrink 도 0 이라 이 층은 늘 내용
   * 높이로 자란다. 그러면 바깥이 765px 로 묶여도 면은 3273px 로 넘치고, 안쪽의
   * `maxHeight: "100%"` 는 높이가 auto 인 면을 기준으로 풀려 아무것도 막지 못한다.
   * 2026-10-05 웹 거주 국가 시트가 그렇게 스크롤되지 않아 63개국 중 49개국을 고를 수
   * 없었다(R2C-03). 사용처가 많아 기본값을 바꾸지 않고 필요한 시트만 켠다.
   */
  shrink?: boolean;
}

// midnight 시맨틱 (`_ds/tokens/semantic.css` `.theme-dark`). 역할 이름으로 읽는다 -
// hex 리터럴 금지 규칙은 이 파일에도 적용된다.
//   --edge     = c00 -> m3.color.surface
//   --bevel-hi = c03 -> m3.color.surfaceBright
//   --bevel-lo = c00 -> m3.color.surface
//   --sunken   = c00 -> m3.color.surfaceVariant
//   --panel    = c01 -> m3.color.surfaceContainer
const EDGE = m3.color.surface;
const BEVEL_HI = m3.color.surfaceBright;
const BEVEL_LO = m3.color.surface;

const BACKGROUND: Record<PixelSurfaceVariant, string> = {
  frame: m3.color.surfaceContainer,
  bevel: m3.color.surfaceContainerHigh,
  inset: m3.color.surfaceVariant,
  flat: m3.color.surfaceContainer,
};

/** 이 variant 가 안쪽 베벨을 그리는가, 그리고 하이라이트가 위/왼쪽인가. */
function bevelOf(variant: PixelSurfaceVariant, pressed: boolean): { hi: string; lo: string } | null {
  if (variant === "frame" || variant === "flat") return null;
  // inset 은 bevel 의 반전이고, pressed 도 반전이다. 둘 다면 다시 뒤집혀 제자리다.
  const sunken = (variant === "inset") !== pressed;
  return sunken ? { hi: BEVEL_LO, lo: BEVEL_HI } : { hi: BEVEL_HI, lo: BEVEL_LO };
}

export function PixelSurface({
  variant = "bevel",
  pressed = false,
  background,
  children,
  style,
  contentStyle,
  shrink = false,
}: PixelSurfaceProps) {
  const phone = usePhoneDesign();
  if (phone) {
    const base = background ? phoneSurfaceColor(background) : phoneIos.cell;
    const fill = pressed ? base === phoneIos.blue ? phoneIos.bluePressed : phoneIos.fill : base;
    return <PixelRoundRect fill={fill} style={[phoneStyle(StyleSheet.flatten(style) ?? {}), phoneFlatSurface, shrink && styles.shrink]}>
      <PhoneForegroundProvider color={base === phoneIos.blue ? phoneIos.onBlue : phoneIos.label}>
        <View style={[styles.content, shrink && styles.shrink, phoneStyle(StyleSheet.flatten(contentStyle) ?? {})]}>{children}</View>
      </PhoneForegroundProvider>
    </PixelRoundRect>;
  }
  const bevel = bevelOf(variant, pressed);
  const edged = variant !== "flat";
  return (
    <View style={[edged && styles.wrap, style]}>
      {edged ? (
        // 테두리 막대 4개. 각 막대는 양 끝에서 u 만큼 물러나 있어 네 모서리가 빈다.
        <>
          <View pointerEvents="none" style={styles.edgeTop} />
          <View pointerEvents="none" style={styles.edgeBottom} />
          <View pointerEvents="none" style={styles.edgeLeft} />
          <View pointerEvents="none" style={styles.edgeRight} />
        </>
      ) : null}
      <View style={[styles.face, shrink && styles.shrink, { backgroundColor: background ?? BACKGROUND[variant] }]}>
        {bevel ? (
          // lo 를 먼저, hi 를 나중에 - CSS 는 앞선 그림자가 위에 그려지고 번들은
          // hi 를 먼저 선언하므로, 겹치는 모서리에서 hi 가 이긴다.
          <>
            <View pointerEvents="none" style={[styles.innerBottom, { backgroundColor: bevel.lo }]} />
            <View pointerEvents="none" style={[styles.innerRight, { backgroundColor: bevel.lo }]} />
            <View pointerEvents="none" style={[styles.innerTop, { backgroundColor: bevel.hi }]} />
            <View pointerEvents="none" style={[styles.innerLeft, { backgroundColor: bevel.hi }]} />
          </>
        ) : null}
        <View style={[styles.content, shrink && styles.shrink, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

const U = m3.spacing.s1;

const styles = StyleSheet.create({
  // 바깥 테두리가 들어갈 자리. 번들의 `margin: var(--u)` 에 대응한다.
  wrap: { padding: U },
  edgeTop: { position: "absolute", left: U, right: U, top: 0, height: U, backgroundColor: EDGE },
  edgeBottom: { position: "absolute", left: U, right: U, bottom: 0, height: U, backgroundColor: EDGE },
  edgeLeft: { position: "absolute", top: U, bottom: U, left: 0, width: U, backgroundColor: EDGE },
  edgeRight: { position: "absolute", top: U, bottom: U, right: 0, width: U, backgroundColor: EDGE },

  face: { borderRadius: m3.shape.none },
  innerTop: { position: "absolute", left: 0, right: 0, top: 0, height: U },
  innerLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: U },
  innerBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: U },
  innerRight: { position: "absolute", top: 0, bottom: 0, right: 0, width: U },

  // `--pad-y: var(--s2)` / `--pad-x: var(--s4)` (tokens/space.css).
  content: { paddingVertical: m3.spacing.s2, paddingHorizontal: m3.spacing.s4 },
  // `shrink` 를 켰을 때만 면과 안쪽에 붙는다. minHeight 0 은 내용 높이 아래로 줄어들 수
  // 있다는 것을 엔진 기본값에 기대지 않고 적어 둔 것이다.
  shrink: { flexShrink: 1, minHeight: 0 },
});
