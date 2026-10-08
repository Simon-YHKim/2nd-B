import type { ReactNode } from "react";
import { useIsFocused } from "expo-router";
import { useNavigationState } from "expo-router/react-navigation";
import { SceneTransition } from "@/components/motion/SceneTransition";
import { worldRouteVisible } from "@/lib/motion/route-visibility";

/** Each navigator still owns one live scene per route. The visible underlay
 * stays settled while a transparent overlay opens and closes above it. */
export function WorldRouteTransition({ children, routeName, routeKey, stack = "world" }: {
  children: ReactNode;
  routeName: string;
  routeKey: string;
  stack?: "world" | "auth";
}) {
  // Expo 56's root-state getter is not subscribed and includes its __root
  // navigator. This selector subscribes to this scene's closest actual Stack.
  const stackVisible = useNavigationState((state) => worldRouteVisible(state, routeKey));
  const focused = useIsFocused();
  // Auth has no transparent scenes. Its focus includes the parent route's
  // focus, so a form beneath an opaque root route cannot remain active.
  // World visibility intentionally comes from only one stack-state snapshot.
  const visible = stack === "auth" ? focused : stackVisible;
  // Auth has its own stack; wrapping both levels would move every form twice.
  if (routeName === "(auth)") return <>{children}</>;
  return (
    <SceneTransition
      transitionKey={routeKey}
      kind={routeName === "dashboard" || routeName === "core-brain" ? "open" : "replace"}
      scope="world"
      active={visible}
      testID="world-scene-transition"
      style={{ flex: 1, minHeight: 0 }}
    >
      {children}
    </SceneTransition>
  );
}
