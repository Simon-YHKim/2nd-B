// First-ON explainer for automatic reasoning (spec docs/reasoning-ux-spec_260718.html
// 화면 A 인터랙션: "처음 ON: 소비 규칙을 설명하는 bottom sheet 확인 후 활성화").
// The switch must NOT flip on the first tap — the consumption rules (automatic
// runs spend the weekly base, one manual run always reserved) get confirmed
// here first, then the caller enables the pref. Declining leaves it OFF.
//
// Same overlay discipline as ReasoningLimitSheet (O-7): a bottom sheet, never
// a modal over content; the caller's screen state stays mounted behind it.

import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text as RNText, View, useWindowDimensions } from "react-native";

import { MdButton } from "@/components/m3";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export interface AutoReasoningIntroSheetProps {
  visible: boolean;
  ko: boolean;
  /** User confirmed the rules — the caller flips the pref ON and marks seen. */
  onConfirm: () => void;
  /** Dismissed without enabling (veil tap or "not now"). */
  onClose: () => void;
}

export function AutoReasoningIntroSheet({ visible, ko, onConfirm, onClose }: AutoReasoningIntroSheetProps) {
  const { height } = useWindowDimensions();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, rise]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.veil}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={ko ? "닫기" : "Close"}
        />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          <RNText style={styles.title}>{ko ? "자동 리즈닝을 켜요" : "Turn on automatic reasoning"}</RNText>
          <RNText style={styles.line}>
            {ko
              ? "새 자료를 모아 세컨비가 연결을 제안해요."
              : "SecondB groups new items and proposes connections."}
          </RNText>
          <RNText style={styles.line}>
            {ko
              ? "자동 실행도 주간 한도를 1회씩 사용해요. 직접 실행할 1회는 항상 남겨 둬요."
              : "Automatic runs use one weekly run and always reserve one for manual use."}
          </RNText>
          <View style={styles.actions}>
            <MdButton
              label={ko ? "켜기" : "Turn on"}
              variant="filled"
              onPress={onConfirm}
              style={styles.actionButton}
            />
            <MdButton
              label={ko ? "나중에" : "Not now"}
              variant="text"
              onPress={onClose}
              style={styles.actionButton}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  veil: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(m3.color.scrim, 0.6) },
  sheet: {
    borderTopLeftRadius: m3.shape.extraLarge,
    borderTopRightRadius: m3.shape.extraLarge,
    borderTopWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: m3.color.surfaceContainerHigh,
    paddingTop: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s5,
    paddingBottom: m3.spacing.s6,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(m3.color.onSurfaceVariant, 0.4),
    alignSelf: "center",
    marginBottom: m3.spacing.s4,
  },
  title: {
    color: m3.color.onSurface,
    fontFamily: fontFamilies.readable,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  line: {
    color: m3.color.onSurfaceVariant,
    fontFamily: fontFamilies.readable,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: m3.spacing.s3,
  },
  actions: { gap: m3.spacing.s2, marginTop: m3.spacing.s5 },
  actionButton: { width: "100%" },
});
