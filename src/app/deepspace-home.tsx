import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { DeepSpaceHomeScreen } from "@/screens/deepspace/DeepSpaceHomeScreen";

export default function DeepSpaceHomeRoute() {
  return (
    <DevOnlyRoute>
      <DeepSpaceHomeScreen />
    </DevOnlyRoute>
  );
}
