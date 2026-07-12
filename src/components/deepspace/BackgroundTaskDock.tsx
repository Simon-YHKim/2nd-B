// Global background-task dock (Claude Design loading.dc.html, D).
// Mounted once in app/_layout. Visible only while a task runs in the background,
// so the user keeps using the app uninterrupted: a rotating ring AROUND a small
// breathing SecondB + "{task} · 백그라운드 · 약 Ns". Tap to collapse to just the
// ring (the ▾ affordance is a real toggle, not a dead control). Non-blocking;
// sits above the tab bar. Token-only, copy inline ko/en.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { useTaskStatus } from "@/lib/tasks/store";

export function BackgroundTaskDock() {
  const task = useTaskStatus();
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? true;
  const spin = useRef(new Animated.Value(0)).current;
  const [collapsed, setCollapsed] = useState(false);
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
  const bg = ko ? "백그라운드" : "Background";
  const sub = task.etaSec ? `${bg} · ${ko ? `약 ${task.etaSec}초` : `~${task.etaSec}s`}` : bg;
  const label = ko ? "백그라운드 작업" : "Background task";

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.safe} edges={["bottom"]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: !collapsed }}
        onPress={() => setCollapsed((c) => !c)}
        style={[styles.dock, collapsed ? styles.dockCollapsed : null]}
      >
        <View style={styles.ringWrap}>
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
            <Svg width={30} height={30}>
              <Circle cx={15} cy={15} r={12} fill="none" stroke={deepSpace.cardLine} strokeWidth={2.5} />
              <Circle
                cx={15}
                cy={15}
                r={12}
                fill="none"
                stroke={deepSpace.accent}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray="20 56"
              />
            </Svg>
          </Animated.View>
          <SecondbHead size={18} mood="neutral" />
        </View>
        {!collapsed ? (
          <>
            <View style={styles.body}>
              <Text variant="caption" style={styles.title} numberOfLines={1}>{task.title}</Text>
              <Text variant="subtle" style={styles.meta}>{sub}</Text>
            </View>
            <Text variant="caption" style={styles.chevron}>{"▾"}</Text>
          </>
        ) : null}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { position: "absolute", left: 0, right: 0, bottom: 0 },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginHorizontal: deepSpaceSpacing.lg,
    marginBottom: 78, // clears the bottom tab bar
    paddingVertical: deepSpaceSpacing.sm,
    paddingHorizontal: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    backgroundColor: deepSpace.bgMid,
  },
  dockCollapsed: { alignSelf: "flex-start", paddingHorizontal: deepSpaceSpacing.sm },
  ringWrap: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  title: { fontSize: 12, color: deepSpace.accentBright },
  meta: { fontSize: 10, color: deepSpace.textLo, marginTop: 1 },
  chevron: { fontSize: 12, color: deepSpace.textLo },
});
