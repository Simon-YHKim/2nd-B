// SbNavBar — 1:1 port of sb-app.jsx NavBar (5 tabs from window.SB.NAV):
// height 80, 12 top pad, surface-container bg + surface-variant top border; each
// tab is a 64×32 pill (secondary-container when active) with a 24dp icon (FILLED
// on active) and a 12px label (bold on active). Routing is wired here via
// expo-router; the active tab is derived from the current pathname.

import { usePathname, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { m3 } from "@/lib/theme/m3";

import { SbIcon, type SbIconName } from "./SbIcon";

interface NavTab {
  id: string;
  label: string;
  icon: SbIconName;
  route: Href;
}

// window.SB.NAV — 별자리 · 담기 · 세컨비 · 위키 · 설정, wired to the app routes.
const NAV: NavTab[] = [
  { id: "home", label: "별자리", icon: "star_shine", route: "/deepspace-home" },
  { id: "capture", label: "담기", icon: "add_circle", route: "/capture" },
  { id: "chat", label: "세컨비", icon: "forum", route: "/secondb" },
  { id: "records", label: "위키", icon: "inventory_2", route: "/records" },
  { id: "settings", label: "설정", icon: "tune", route: "/settings" },
];

const ROUTE_TO_ID: Record<string, string> = {
  "/deepspace-home": "home",
  "/capture": "capture",
  "/secondb": "chat",
  "/records": "records",
  "/settings": "settings",
};

export function SbNavBar({ active }: { active?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const activeId = active ?? ROUTE_TO_ID[pathname] ?? "home";

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {NAV.map((n) => {
        const on = n.id === activeId;
        const iconColor = on ? m3.color.onSecondaryContainer : m3.color.onSurfaceVariant;
        const labelColor = on ? m3.color.onSurface : m3.color.onSurfaceVariant;
        return (
          <View key={n.id} style={styles.tab}>
            <Pressable
              onPress={() => router.push(n.route)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={n.label}
              android_ripple={{ color: m3.color.secondaryContainer, borderless: true }}
              style={styles.press}
            >
              <View style={[styles.pill, on && { backgroundColor: m3.color.secondaryContainer }]}>
                <SbIcon name={n.icon} size={24} fill={on} color={iconColor} />
              </View>
              <Text style={[styles.label, { color: labelColor, fontWeight: on ? "700" : "500" }]} numberOfLines={1}>
                {n.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: 12,
    backgroundColor: m3.color.surfaceContainer,
    borderTopWidth: 1,
    borderTopColor: m3.color.surfaceVariant,
  },
  tab: { flex: 1, minHeight: 56, justifyContent: "flex-start" },
  press: { alignItems: "center", gap: 4, justifyContent: "center", paddingBottom: 12 },
  pill: {
    width: 64,
    height: 32,
    borderRadius: m3.shape.full,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 12, textAlign: "center", fontFamily: m3.font.plain },
});
