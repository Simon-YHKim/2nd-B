// GateCover: how a root gate holds the app without unmounting the route tree.
//
// R2A-01 (QA 2026-10-05): after a signed-out user opened an external link to an
// exempt screen (/sign-in, /reset-password, /avatar-studio, ...) and then signed
// in, the app froze on a white screen with "Maximum update depth exceeded".
// AvatarSetupGate held the app by returning a loader INSTEAD of its children, so
// the root Stack unmounted. With no Stack state, expo-router's useSegments() falls
// back to the root slot's params, and those still carry the last deep link even
// after it was consumed. That link named an exempt screen, the gate released, the
// Stack remounted at its initial route ("/"), the gate held again, and the two
// renders alternated until React gave up. IntroGate's profile hold (loader and
// retry) had the same shape.
//
// The fix is structural, not a tweak of the exempt list: a hold never removes the
// route tree. The tree stays mounted under an opaque cover, so the segments keep
// coming from the live navigator and the hold cannot feed back into its own input.
// The scenes underneath are still held one by one (ProfileProbeScope and
// AvatarSetupSceneGuard in app/_layout.tsx), so nothing a held user should not see
// renders or runs effects; the cover is what is shown on top and what takes the
// touches. Hidden from touch and from the screen reader while covered.
//
// Use one GateCover at a stable position for every outcome of a gate, passing
// cover={null} when the gate allows. Swapping between <GateCover> and a bare
// fragment would remount the tree, which is the unmount this exists to avoid.
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export function GateCover({ cover, children }: { cover: ReactNode | null; children: ReactNode }) {
  const covered = cover !== null && cover !== undefined;
  return (
    <View style={styles.fill}>
      <View
        style={styles.fill}
        collapsable={false}
        pointerEvents={covered ? "none" : "auto"}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {covered ? <View style={StyleSheet.absoluteFill}>{cover}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
