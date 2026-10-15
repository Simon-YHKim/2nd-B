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
// touches. Hidden from touch, the screen reader and (on web) the keyboard while
// covered.
//
// Web (AUTHBOOT-GATE-01): react-native-web 0.21 drops accessibilityElementsHidden
// and importantForAccessibility, and pointerEvents only becomes a CSS class, so the
// covered tree's Pressables stayed tabIndex 0 tab stops: Tab + Enter could run a
// hidden Retry, Sign-out, BackArrow or CompletionToast. `inert` is what takes the
// tree out of the tab order, keyboard activation and the accessibility tree there;
// RN-web forwards it and React 19 writes it as a boolean attribute. Native keeps
// the three props above unchanged.
//
// `inert` alone leaves one gap: a button that already had focus when the cover went
// up keeps it until the browser's next rendering update, and Enter or Space still
// clicks it (headless Chrome 154, 2026-10-05). So the commit that covers also drops
// a focus left inside the tree (releaseFocusInside); the next Tab lands on the cover.
//
// Use one GateCover at a stable position for every outcome of a gate, passing
// cover={null} when the gate allows. Swapping between <GateCover> and a bare
// fragment would remount the tree, which is the unmount this exists to avoid.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

/**
 * Blur the focused element when it sits inside `tree`. Returns whether it did.
 * Plain duck typing so the rule is testable without a DOM.
 */
export function releaseFocusInside(
  tree: { contains?: (node: unknown) => boolean } | null | undefined,
  doc: { activeElement: unknown } | undefined,
): boolean {
  const active = doc?.activeElement as { blur?: () => void } | null | undefined;
  if (!active || typeof tree?.contains !== "function" || !tree.contains(active)) return false;
  active.blur?.();
  return true;
}

export function GateCover({ cover, children }: { cover: ReactNode | null; children: ReactNode }) {
  const covered = cover !== null && cover !== undefined;
  // Read at render, not at module scope: tests mock react-native without Platform.
  // ViewProps has no `inert` (it is web-only), hence the cast.
  const web = Platform.OS === "web";
  const webInert = (web ? { inert: covered } : {}) as ViewProps;
  const treeRef = useRef<View>(null);
  // Layout effect: runs in the same task as the commit, before any key event.
  useLayoutEffect(() => {
    if (!covered || !web || typeof document === "undefined") return;
    releaseFocusInside(treeRef.current as unknown as { contains?: (node: unknown) => boolean } | null, document);
  }, [covered, web]);
  return (
    <View style={styles.fill}>
      <View
        ref={treeRef}
        style={styles.fill}
        collapsable={false}
        pointerEvents={covered ? "none" : "auto"}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
        {...webInert}
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
