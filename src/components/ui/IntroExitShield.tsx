// 오프닝이 끝난 직후 잠깐 화면 전체의 터치를 받아 두는 투명한 막 (QA 261004 W-05).
// 언제 켜지고 꺼지는지는 src/lib/nav/intro-exit-shield.ts 가 정한다. 이 파일은
// 그리기만 한다. 루트 레이아웃이 IntroGate 다음 형제로 한 번 그린다.
import { useSyncExternalStore, type ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import { isIntroExitShieldActive, subscribeIntroExitShield } from "@/lib/nav/intro-exit-shield";

/** 안드로이드에서 elevation 을 가진 형제(떠 있는 칩 등)보다 위에 오도록.
 *  쌓임 순서로 쓰는 상수 elevation 이다(ANDROID_QA_GUIDELINES 의 shine-through). */
const SHIELD_ELEVATION = 24;

/** 응답자를 가져가기만 하고 아무것도 하지 않는다. */
const claimTouch = (): boolean => true;

/**
 * 막이 없을 때는 아무것도 그리지 않는다.
 *
 * 크기는 absoluteFill 이 아니라 width/height 100% 다. 웹에서 absoluteFill 로 띄운
 * 스크림이 4x4 로 접힌 적이 있다(#1952 의 홈 위 투명 카드).
 */
export function IntroExitShield(): ReactElement | null {
  const shielding = useSyncExternalStore(
    subscribeIntroExitShield,
    isIntroExitShieldActive,
    isIntroExitShieldActive,
  );
  if (!shielding) return null;
  return (
    <View
      testID="intro-exit-shield"
      pointerEvents="auto"
      style={styles.shield}
      onStartShouldSetResponder={claimTouch}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    />
  );
}

const styles = StyleSheet.create({
  shield: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 2000,
    elevation: SHIELD_ELEVATION,
    backgroundColor: "transparent",
  },
});
