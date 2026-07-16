import { DeepSpaceGraphDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";
import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";

// Dev-gated (audit pattern B follow-through): the 내 두뇌 지도 body draws its
// center star, cluster stars and background stars at FIXED mock positions —
// only the node/link counts are real — and production nav never linked here
// (the 그래프 tab goes to "/"). Until the layout is driven by real data, this
// stays a dev reference rather than shipping mock-as-real to a deep link.
export default function GraphRoute() {
  return (
    <DevOnlyRoute>
      <DeepSpaceGraphDesignScreen />
    </DevOnlyRoute>
  );
}
