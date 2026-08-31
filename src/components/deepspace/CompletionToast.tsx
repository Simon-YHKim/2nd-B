// Global completion toast (Claude Design loading.dc.html, E).
// Mounted once in app/_layout. Appears when a task finishes. It NEVER
// auto-navigates: the user chooses 결과 보기 (push resultHref) or 나중에 (dismiss).
// Restrained moment: a SecondB head in a mint ring + a two-line message; the
// "결과 보기" CTA is mint-filled, "나중에" is an outline. Token-only, no confetti.

import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router, type Href, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { Text } from "@/components/ui/Text";
import { dismissTask, useTaskStatus } from "@/lib/tasks/store";
import { reactExpression } from "@/lib/companion/expression";

const HEAD_IMAGE = require("../../../assets/deepspace/secondb-head-front.png");

const COMPLETION_COPY = {
  en: { done: "Analysis is ready", sub: "Take a look?", see: "See result", later: "Later" },
  ko: { done: "분석이 끝났어요", sub: "보러 갈래요?", see: "결과 보기", later: "나중에" },
  es: { done: "El analisis esta listo", sub: "Quieres verlo?", see: "Ver resultado", later: "Mas tarde" },
  pt: { done: "A analise esta pronta", sub: "Quer ver?", see: "Ver resultado", later: "Mais tarde" },
  id: { done: "Analisis sudah siap", sub: "Mau lihat?", see: "Lihat hasil", later: "Nanti" },
} as const;

type CompletionCopyLocale = keyof typeof COMPLETION_COPY;

function completionCopyLocale(language: string | undefined): CompletionCopyLocale {
  const normalized = language?.toLowerCase() ?? "en";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("pt")) return "pt";
  if (normalized.startsWith("id")) return "id";
  return "en";
}

export function CompletionToast() {
  const task = useTaskStatus();
  const { i18n } = useTranslation();
  const pathname = usePathname();
  const drop = useRef(new Animated.Value(0)).current;
  // Keep the task queued but expose no global navigation CTA while the reset
  // route owns a pending/active recovery session. router.push(resultHref) does
  // not remove the current route, so usePreventRemove cannot intercept it.
  const visible = task.phase === "done" && pathname !== "/reset-password";

  useEffect(() => {
    if (!visible) {
      drop.setValue(0);
      return;
    }
    // A finished task is a happy beat — the persistent SecondB head beams too.
    reactExpression("happy");
    Animated.timing(drop, { toValue: 1, duration: 320, easing: pixelStepsFor(320), useNativeDriver: true }).start();
  }, [visible, drop]);

  if (!visible) return null;

  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const C = COMPLETION_COPY[completionCopyLocale(i18n.language)];
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
            <Image source={HEAD_IMAGE} style={styles.head} contentFit="contain" />
          </View>
          <View style={styles.body}>
            <Text variant="caption" style={styles.title}>{C.done}</Text>
            <Text variant="subtle" style={styles.sub}>{sub}</Text>
          </View>
        </View>
        <View style={styles.btnRow}>
          {href ? (
            <Pressable accessibilityRole="button" accessibilityLabel={C.see} onPress={openResult} hitSlop={8} style={styles.seeBtn}>
              <Text variant="caption" style={styles.seeText}>{C.see}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={C.later} onPress={() => dismissTask()} hitSlop={8} style={styles.laterBtn}>
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
    borderRadius: m3.shape.large,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.bgMid,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: m3.shape.none,
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
    borderRadius: m3.shape.small,
    backgroundColor: deepSpace.mint,
  },
  seeText: { fontSize: 12, fontWeight: "700", color: deepSpace.onMint },
  laterBtn: {
    minHeight: 44,
    paddingHorizontal: deepSpaceSpacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.small,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
  },
  laterText: { fontSize: 12, color: deepSpace.accentSoft },
});
