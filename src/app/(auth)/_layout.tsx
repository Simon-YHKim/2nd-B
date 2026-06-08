import { Stack } from "expo-router";

import { pixelStackTransition } from "@/lib/motion/pixel-physical";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, ...pixelStackTransition() }} />;
}
