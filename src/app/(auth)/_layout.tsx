import { Stack } from "expo-router";

import { WorldRouteTransition } from "@/components/motion/WorldRouteTransition";

export default function AuthLayout() {
  return (
    <Stack
      screenLayout={({ children, route }) => (
        <WorldRouteTransition routeName={route.name} routeKey={route.key} stack="auth">
          {children}
        </WorldRouteTransition>
      )}
      screenOptions={{ headerShown: false, animation: "none", animationDuration: 0 }}
    />
  );
}
