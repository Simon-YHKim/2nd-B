import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { DeepSpaceFlowMapScreen } from "@/screens/deepspace/DeepSpaceFlowMapScreen";

export default function DeepSpaceFlowMapRoute() {
  return (
    <DevOnlyRoute>
      <DeepSpaceFlowMapScreen />
    </DevOnlyRoute>
  );
}
