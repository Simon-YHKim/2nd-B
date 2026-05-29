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

import { PixelButton } from "@/components/art/CosmicPixel";

// Routes that hide the back arrow — the landing page itself + the
// pre-auth flow (sign-in / sign-up / complete-profile / auth groups).
const HIDDEN_PATHS = new Set<string>(["/", "/sign-in", "/sign-up", "/complete-profile"]);

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
        {/* v2 back HUD button (self-contained art) */}
        <PixelButton kind="back" size={40} />
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
  },
});
