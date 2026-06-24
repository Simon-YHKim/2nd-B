// Global completion toast (Claude Design loading.dc.html, E).
// Mounted once in app/_layout. Appears when a task finishes. It NEVER
// auto-navigates: the user chooses 결과 보기 (push resultHref) or 나중에 (dismiss).
// Restrained moment: a SecondB head in a mint ring + a two-line message; the
// "결과 보기" CTA is mint-filled, "나중에" is an outline. Token-only, no confetti.

import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { dismissTask, useTaskStatus } from "@/lib/tasks/store";
import { reactExpression } from "@/lib/companion/expression";

const HEAD_IMAGE = require("../../../assets/deepspace/secondb-head-front.png");

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
    // A finished task is a happy beat — the persistent SecondB head smiles too.
    reactExpression("positive");
    Animated.timing(drop, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, drop]);

  if (!visible) return null;

  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const C = ko
    ? { done: "분석이 끝났어요", sub: "보러 갈래요?", see: "결과 보기", later: "나중에" }
    : { done: "Analysis is ready", sub: "Take a look?", see: "See result", later: "Later" };
  const sub = task.tip ?? C.sub;

  const href = task.resultHref;
  const openResult = () => {
    dismissTask();
    if (href) router.push(href as Href);
  };

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.safe} edges={["top"]}>
      <Animated.View style={[styles.toast, { opacity: drop, transform: [{ translateY }] }]}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Image source={HEAD_IMAGE} style={styles.head} resizeMode="contain" />
          </View>
          <View style={styles.body}>
            <Text variant="caption" style={styles.title}>{C.done}</Text>
            <Text variant="subtle" style={styles.sub}>{sub}</Text>
          </View>
        </View>
        <View style={styles.btnRow}>
          {href ? (
            <Pressable accessibilityRole="button" onPress={openResult} hitSlop={8} style={styles.seeBtn}>
              <Text variant="caption" style={styles.seeText}>{C.see}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => dismissTask()} hitSlop={8} style={styles.laterBtn}>
            <Text variant="caption" style={styles.laterText}>{C.later}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { position: "absolute", left: 0, right: 0, top: 0 },
  toast: {
    marginHorizontal: deepSpaceSpacing.lg,
    marginTop: deepSpaceSpacing.sm,
    paddingVertical: deepSpaceSpacing.sm,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.bgMid,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.mintBg,
    alignItems: "center",
    justifyContent: "center",
  },
  head: { width: 22, height: 22 },
  body: { flex: 1 },
  title: { fontSize: 13, color: deepSpace.accentBright },
  sub: { fontSize: 11, color: deepSpace.mint, marginTop: 1 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 11 },
  seeBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.sm,
    backgroundColor: deepSpace.mint,
  },
  seeText: { fontSize: 12, fontWeight: "700", color: deepSpace.onMint },
  laterBtn: {
    minHeight: 44,
    paddingHorizontal: deepSpaceSpacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
  },
  laterText: { fontSize: 12, color: deepSpace.accentSoft },
});
