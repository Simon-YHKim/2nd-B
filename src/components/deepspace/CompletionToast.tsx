// Global completion toast (Claude Design loading.dc.html, E).
// Mounted once in app/_layout. Appears when a task finishes. It NEVER
// auto-navigates: the user chooses 결과 보기 (push resultHref) or 나중에 (dismiss).
// Restrained celebratory moment (mint tick), no confetti.

import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { dismissTask, useTaskStatus } from "@/lib/tasks/store";

export function CompletionToast() {
  const task = useTaskStatus();
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const drop = useRef(new Animated.Value(0)).current;
  const visible = task.phase === "done";

  useEffect(() => {
    if (!visible) {
      drop.setValue(0);
      return;
    }
    Animated.timing(drop, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, drop]);

  if (!visible) return null;

  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const C = ko
    ? { done: "분석이 끝났어요", see: "결과 보기", later: "나중에" }
    : { done: "Analysis is ready", see: "See result", later: "Later" };

  const openResult = () => {
    const href = task.resultHref;
    dismissTask();
    if (href) router.push(href as never);
  };

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.safe} edges={["top"]}>
      <Animated.View style={[styles.toast, { opacity: drop, transform: [{ translateY }] }]}>
        <View style={styles.tick}><View style={styles.tickDot} /></View>
        <Text variant="caption" style={styles.label}>{task.title || C.done}</Text>
        <Pressable accessibilityRole="button" onPress={openResult} hitSlop={8} style={styles.seeBtn}>
          <Text variant="caption" style={styles.seeText}>{C.see}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => dismissTask()} hitSlop={8} style={styles.laterBtn}>
          <Text variant="caption" style={styles.laterText}>{C.later}</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { position: "absolute", left: 0, right: 0, top: 0 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: deepSpaceSpacing.lg,
    marginTop: deepSpaceSpacing.sm,
    paddingVertical: deepSpaceSpacing.sm,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.bgMid,
  },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.mintBg,
    alignItems: "center",
    justifyContent: "center",
  },
  tickDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: deepSpace.mint },
  label: { flex: 1, fontSize: 13, color: deepSpace.textHi },
  seeBtn: {
    minHeight: 36,
    paddingHorizontal: deepSpaceSpacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.sm,
    backgroundColor: deepSpace.mint,
  },
  seeText: { fontSize: 12, color: deepSpace.onMint },
  laterBtn: { minHeight: 36, paddingHorizontal: deepSpaceSpacing.sm, alignItems: "center", justifyContent: "center" },
  laterText: { fontSize: 12, color: deepSpace.textLo },
});
