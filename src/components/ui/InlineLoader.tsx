// Branded inline loader for in-screen / inter-route loading (graph-ux #3).
// Renders the deep-space canon loader (breathing SecondB head + cyan dots,
// Claude Design loading.dc.html "A/dots") on the canon deep-space backdrop, so
// route transitions and per-screen auth/data waits read as *our* loading screen
// — not a bare system spinner, and not the legacy violet orb. Self-contained:
// the dots loader only needs the global i18n instance (initialised at module
// load) and the head asset, so it is safe to render before app context is ready.

import { StyleSheet, View } from "react-native";

import { deepSpace } from "@/lib/theme/tokens";
import { DeepSpaceBackdrop } from "@/components/deepspace/DeepSpaceBackdrop";
import { DeepSpaceLoader } from "@/components/deepspace/DeepSpaceLoader";

export function InlineLoader({ message }: { message?: string } = {}) {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={message ?? "불러오는 중"}>
      <DeepSpaceBackdrop />
      <DeepSpaceLoader variant="dots" caption={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: deepSpace.bgEdge,
  },
});
