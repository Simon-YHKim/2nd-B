// PIXEL-CLAY v4 gate 셸.
//
// signed-out, recovery, not-found 화면은 인증된 앱의 DeepSpaceScreen dock 을
// 보여주면 안 된다. 그렇다고 각 화면이 SafeAreaView, 별 하늘, 키보드/스크롤
// 처리를 복제해서도 안 된다(DESIGN.md 공용 셸 계약). 이 primitive 가 그 경계를
// 한 곳에 고정한다.
import type { ReactNode, Ref } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SbStarfield } from "@/components/deep-space/SbStarfield";
import { m3 } from "@/lib/theme/m3";
import { useKeyboard } from "@/lib/ui/useKeyboard";

import { pixelGateBottomPadding } from "./pixel-gate";

export interface PixelGateShellProps {
  children: ReactNode;
  /** 긴 가입/복구 흐름이 다음 입력으로 스크롤할 때 사용한다. */
  scrollRef?: Ref<ScrollView>;
  /** 화면별 정렬만 추가한다. safe-area/IME 여백은 셸이 계속 소유한다. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** 네이티브 헤더가 있는 iOS 호스트에서만 필요하다. */
  keyboardVerticalOffset?: number;
}

export function PixelGateShell({
  children,
  scrollRef,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
}: PixelGateShellProps) {
  const keyboardHeight = useKeyboard();
  const paddingBottom = pixelGateBottomPadding(Platform.OS, keyboardHeight);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
      <SbStarfield cosmic />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.keyboard}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          // Screen alignment may extend the content style, but the shell owns
          // safe-area/IME clearance and therefore applies it last.
          contentContainerStyle={[styles.content, contentContainerStyle, { paddingBottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m3.accent.cosmicBase },
  keyboard: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingTop: m3.spacing.s8,
    paddingHorizontal: m3.spacing.s8,
  },
});
