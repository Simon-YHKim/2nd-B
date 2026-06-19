import { Redirect } from "expo-router";

import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceDiscoverScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Discover() {
  if (isDeepSpaceUI()) return <DeepSpaceDiscoverScreen />;
  return <Redirect href="/insights" />;
}
