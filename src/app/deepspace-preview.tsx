import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { DeepSpaceComponentsPreview } from "@/screens/deepspace/DeepSpaceComponentsPreview";

export default function DeepSpacePreviewRoute() {
  return (
    <DevOnlyRoute>
      <DeepSpaceComponentsPreview />
    </DevOnlyRoute>
  );
}
