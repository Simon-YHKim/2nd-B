import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { DeepSpaceHubDockScreen } from "@/screens/deepspace/DeepSpaceHubDockScreen";

export default function DeepSpaceHubRoute() {
  return (
    <DevOnlyRoute>
      <DeepSpaceHubDockScreen />
    </DevOnlyRoute>
  );
}
