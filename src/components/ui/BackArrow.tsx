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

import { isPrimaryTabPath } from "@/lib/nav/tabs";
import { cosmic } from "@/lib/theme/tokens";

// Landing + pre-auth routes that hide the arrow (no "back to graph" there yet).
const PRE_AUTH_PATHS = ["/sign-in", "/sign-up", "/complete-profile"];

// Routes that hide the back arrow entirely: the pre-auth flow plus the graph
// home ("/") itself — "/" IS the back target, so it gets no arrow. Every other
// village screen keeps a top-left back-to-graph arrow, INCLUDING the tab
// destinations (담기/세컨비/공상/나), per the 2026-06-02 directive ("every
// village needs a back button"). On a tab screen the arrow is nudged right of
// the brand chip (see below) so the two don't overlap.
const HIDDEN_PATHS = new Set<string>([...PRE_AUTH_PATHS, "/"]);

/** True when the back arrow is shown on this route (i.e. not the landing /
 *  pre-auth pages). Screens use this to reserve top-left headroom so the
 *  floating arrow never overlaps their first heading/text. */
export function backArrowVisible(pathname: string): boolean {
  return !HIDDEN_PATHS.has(pathname);
}

/** True when the route is a bottom-tab destination (brand chip top-left). */
export function isTabPath(pathname: string): boolean {
  return isPrimaryTabPath(pathname);
}

export function BackArrow() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (HIDDEN_PATHS.has(pathname)) return null;

  // On a tab screen, clear the brand chip by nudging the arrow rightward.
  const leftBase = insets.left + 12;
  const left = isPrimaryTabPath(pathname) ? leftBase + 52 : leftBase;

  return (
    <View style={[styles.wrap, { top: insets.top + 8, left }]} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push("/")}
        hitSlop={16}
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.7 } : null]}
      >
        <View
          style={styles.chevron}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    // Premium glass backing so the arrow never visually merges with text.
    borderRadius: 12,
    backgroundColor: "rgba(167,139,250,0.16)",
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.42)",
    shadowColor: cosmic.signalMint,
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
    backgroundColor: cosmic.signalMint,
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
