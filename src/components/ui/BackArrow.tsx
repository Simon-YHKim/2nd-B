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

// Routes that hide the back arrow:
//  - the landing page + pre-auth flow, and
//  - the primary tab destinations (they're reachable via the bottom tab bar,
//    and the arrow would collide with each screen's PremiumTopBar brand chip
//    in the top-left). (graph-ux-overhaul #7.)
const HIDDEN_PATHS = new Set<string>([
  "/", "/sign-in", "/sign-up", "/complete-profile",
  "/core-brain", "/records", "/wiki", "/profile",
]);

export function BackArrow() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

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
        style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.7 } : null]}
      >
        <View style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.chevronStroke, styles.chevronTop]} />
          <View style={[styles.chevronStroke, styles.chevronBottom]} />
        </View>
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
    alignItems: "center",
    justifyContent: "center",
    // Premium glass backing so the arrow never visually merges with text.
    borderRadius: 12,
    backgroundColor: "rgba(167,139,250,0.16)",
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.42)",
    shadowColor: "#72F2C7",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  chevron: {
    width: 14,
    height: 18,
    justifyContent: "center",
  },
  chevronStroke: {
    position: "absolute",
    left: 2,
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#72F2C7",
  },
  chevronTop: {
    transform: [{ rotate: "-42deg" }],
    top: 4,
  },
  chevronBottom: {
    transform: [{ rotate: "42deg" }],
    bottom: 4,
  },
});
