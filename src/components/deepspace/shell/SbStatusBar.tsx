// SbStatusBar — 1:1 port of sb-app.jsx StatusBar: LIVE time (HH:MM, never the
// hardcoded 9:41), refreshed each minute, with signal / wifi / battery marks on
// the right. On immersive/museum screens the copy reads deep-space bright cyan
// (#CCFAFF = m3.accent.star); elsewhere it takes on-surface. Reference padding
// is 12/22/6; we add the top safe-area inset so the row clears the device notch.

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { m3 } from "@/lib/theme/m3";

import { SbIcon } from "./SbIcon";

function nowLabel(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function SbStatusBar({ onHome = false }: { onHome?: boolean }) {
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState(() => nowLabel(new Date()));
  useEffect(() => {
    const id = setInterval(() => setLabel(nowLabel(new Date())), 20000);
    return () => clearInterval(id);
  }, []);

  const color = onHome ? m3.accent.star : m3.color.onSurface;
  return (
    <View style={[styles.row, { paddingTop: insets.top + 10 }]}>
      <Text style={[styles.time, { color }]}>{label}</Text>
      <View style={styles.icons}>
        <SbIcon name="signal_cellular_alt" size={17} color={color} />
        <SbIcon name="wifi" size={17} color={color} />
        <SbIcon name="battery_full" size={17} color={color} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingBottom: 6,
  },
  time: { fontSize: 14, fontWeight: "600", fontFamily: m3.font.plain },
  icons: { flexDirection: "row", alignItems: "center", gap: 6 },
});
