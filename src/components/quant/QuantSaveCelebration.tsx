import { ScreenModal as Modal } from "@/components/ui/ScreenModal";
import { PhoneView as View } from "@/components/phone/PhoneUIKit";
// Premium save flourish for the quant assessments (MBTI / BFI / ECR-S). On a
// successful save we play a brief saved-cue moment over a dim scrim instead of a
// bare system alert, then hand off to /persona. Rendered in a transparent
// Modal so it reliably covers the screen regardless of the host layout.
// Honours reduced motion (shorter hold) and announces the message to readers.

import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { PixelScrim } from "@/components/pixel/PixelDither";

import { Text } from "@/components/ui/Text";
import { CompanionMoment } from "@/components/art/CompanionSprite";
import { reactExpression } from "@/lib/companion/expression";
import { requestGlobalCue } from "@/lib/audio/global-cues";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { spacing } from "@/lib/theme/tokens";

// The journal-saved cue burst. 그 옆에 서류를 정리하던 옛 캐릭터 '모모' 그림은
// 2026-10-05 에 뺐다(Simon 결정 Q-261004-15 A).
const MOMENT = { cue: "journal_saved" } as const;

export function QuantSaveCelebration({ message, onDone }: { message: string; onDone: () => void }) {
  // Callers pass a fresh inline arrow for onDone each render, so keep the latest
  // in a ref and start the timer once on mount; parent re-renders during the
  // hold must not restart (and thus delay/cancel) the countdown.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // A saved self-report is a happy beat on every mounted head — one line here
    // covers all six quant instruments at once.
    reactExpression("happy");
    // 저장 소리 재사용(Q-261006-10). 이 축하는 저장이 성공했을 때만 뜨고, 모달 위에서 1.6초 뒤
    // 다른 화면으로 넘어가므로 루트의 GlobalCueHost 가 낸다. 여섯 검사가 모두 여기를 지난다.
    requestGlobalCue("quantSaved");
    // CompanionMoment plays for ~1.5s; navigate just after it settles, or after
    // a short beat when motion is reduced (the moment then holds, doesn't fade).
    const t = setTimeout(() => onDoneRef.current(), prefersReducedMotion() ? 900 : 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.scrim} accessibilityRole="alert" accessibilityLabel={message}>
      {/* 모달 스크림은 디더다 — 바탕을 모르는 자리라 평탄화가 아니라 격자로 가린다
          (PIXEL-CLAY 규칙 4). 반투명이 한 픽셀도 없다. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <PixelScrim />
      </View>
        <CompanionMoment moment={MOMENT} />
        <Text variant="body" color="text" style={styles.message}>
          {message}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  message: { textAlign: "center" },
});
