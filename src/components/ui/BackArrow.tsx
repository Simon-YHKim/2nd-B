// BackArrow — single fixed-position back affordance.
//
// Per user directive (2026-05-28): the bottom "← 네비게이터로" Button on
// every screen is gone. A small arrow icon in the top-left replaces it,
// no label — the dot constellation is the home, the arrow takes you
// back there. Mounted once at root (`_layout.tsx`) as an overlay, so
// individual screens don't need to remember to render it.

import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { useThemePalette } from "@/lib/theme/ThemeContext";

// Routes that hide the back arrow — the landing page itself + the
// pre-auth flow (sign-in / sign-up / complete-profile / auth groups).
const HIDDEN_PATHS = new Set<string>(["/", "/sign-in", "/sign-up", "/complete-profile"]);

export function BackArrow() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const palette = useThemePalette();

  if (HIDDEN_PATHS.has(pathname)) return null;

  return (
    <View
      style={[styles.wrap, { top: insets.top + 8, left: insets.left + 12 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => router.push("/")}
        hitSlop={16}
        accessibilityLabel="Back"
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: pressed ? palette.surfaceAlt : "transparent",
            borderColor: palette.border,
          },
        ]}
      >
        <Text style={[styles.arrow, { color: palette.text }]}>←</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 100,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: {
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "500",
    marginTop: -2,
  },
});
