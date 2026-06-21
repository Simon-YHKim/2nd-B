// Global background-task dock (Claude Design loading.dc.html, D).
// Mounted once in app/_layout. Visible only while a task runs in the background,
// so the user keeps using the app uninterrupted: a spinning ring + breathing
// SecondB + "…살펴보는 중 · 백그라운드 · 약 Ns". Non-blocking; sits above the tab bar.

import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deepspace";
import { useTaskStatus } from "@/lib/tasks/store";

export function BackgroundTaskDock() {
  const task = useTaskStatus();
  const spin = useRef(new Animated.Value(0)).current;
  const visible = task.phase === "running" && task.mode === "background";

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [visible, spin]);

  if (!visible) return null;

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const eta = task.etaSec ? `약 ${task.etaSec}초` : "백그라운드";

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.safe} edges={["bottom"]}>
      <View style={styles.dock}>
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <SecondbHead size={26} mood="neutral" />
        <View style={styles.body}>
          <Text variant="caption" style={styles.title}>{task.title}</Text>
          <Text variant="subtle" style={styles.meta}>{`살펴보는 중 · ${eta}`}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { position: "absolute", left: 0, right: 0, bottom: 0 },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: deepSpaceSpacing.lg,
    marginBottom: 78, // clears the bottom tab bar
    paddingVertical: deepSpaceSpacing.sm,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    backgroundColor: deepSpace.bgMid,
  },
  ring: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: deepSpace.cardLine,
    borderTopColor: deepSpace.accent,
  },
  body: { flex: 1 },
  title: { fontSize: 13, color: deepSpace.accentBright },
  meta: { fontSize: 11, color: deepSpace.textLo, marginTop: 1 },
});
