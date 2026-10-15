import { usePhoneDesign } from "@/lib/theme/phone-design-context";
import { PhoneView as View } from "@/components/phone/PhoneUIKit";
// Branded inline loader for in-screen / inter-route loading (graph-ux #3).
// Renders the shared filling/twinkling North Star on the canon deep-space backdrop, so
// route transitions and per-screen auth/data waits read as *our* loading screen
// — not a bare system spinner, and not the legacy violet orb. Self-contained:
// the loader only needs the global i18n instance (initialised at module load),
// so it is safe to render before app context is ready. Before the pixel font is
// registered, render it `bare` (no caption): see DeepSpaceLoader's `bare` (R2A-04).

import { StyleSheet } from "react-native";
import i18next from "i18next";

import { deepSpace } from "@/lib/theme/tokens";
import { DeepSpaceBackdrop } from "@/components/deepspace/DeepSpaceBackdrop";
import { DeepSpaceLoader } from "@/components/deepspace/DeepSpaceLoader";

export function InlineLoader({ message, bare = false }: { message?: string; bare?: boolean } = {}) {
  const phone = usePhoneDesign();
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={message ?? i18next.t("states.loading", { ns: "common", defaultValue: "Loading" })}>
      {!phone ? <DeepSpaceBackdrop /> : null}
      <DeepSpaceLoader variant="dots" caption={message} bare={bare} />
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
