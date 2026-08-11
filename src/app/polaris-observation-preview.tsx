import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { PolarisObservationScene } from "@/components/deep-space/PolarisObservationScene";
import { Stack } from "expo-router";

export default function PolarisObservationPreviewRoute() {
  return (
    <DevOnlyRoute>
      <Stack.Screen options={{ headerShown: false }} />
      <PolarisObservationScene loop />
    </DevOnlyRoute>
  );
}
