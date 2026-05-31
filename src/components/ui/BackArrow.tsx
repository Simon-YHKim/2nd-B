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

// Routes that hide the back arrow entirely: the landing page, pre-auth flow,
// and primary tab destinations that already have persistent tab navigation.
const HIDDEN_PATHS = new Set<string>([
  "/",
  "/sign-in",
  "/sign-up",
  "/complete-profile",
  "/core-brain",
  "/records",
  "/wiki",
  "/profile",
]);

// Tab destinations render a top-left brand chip (PremiumTopBar) or a heading
// flush-left. On those, the arrow shifts right of the ~44px brand chip so it
// never sits on top of it; other screens get standard headroom (their content
// top-padding was widened to clear the arrow). See PremiumAppShell.
const TAB_PATHS = new Set<string>(["/core-brain", "/records", "/wiki", "/profile"]);

/** True when the back arrow is shown on this route (i.e. not the landing /
 *  pre-auth pages). Screens use this to reserve top-left headroom so the
 *  floating arrow never overlaps their first heading/text. */
export function backArrowVisible(pathname: string): boolean {
  return !HIDDEN_PATHS.has(pathname);
}

/** True when the route is a bottom-tab destination (brand chip top-left). */
export function isTabPath(pathname: string): boolean {
  return TAB_PATHS.has(pathname);
}

export function BackArrow() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (HIDDEN_PATHS.has(pathname)) return null;

  // On a tab screen, clear the brand chip by nudging the arrow rightward.
  const leftBase = insets.left + 12;
  const left = TAB_PATHS.has(pathname) ? leftBase + 52 : leftBase;

  return (
    <View
      style={[styles.wrap, { top: insets.top + 8, left }]}
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
