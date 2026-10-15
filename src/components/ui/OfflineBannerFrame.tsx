import { useEffect, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
  SafeAreaFrameContext, SafeAreaInsetsContext, SafeAreaProvider, SafeAreaView,
  useSafeAreaFrame, useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/Text";
import { m3 } from "@/lib/theme/m3";
import type { ConnectionStatus } from "@/lib/network/connection-monitor";
import { observeConnection } from "@/lib/network/observe-connection";
import { KeyboardFrameOffsetContext } from "@/lib/ui/keyboard-frame";
import { WindowSafeAreaContext } from "@/lib/ui/window-safe-area";

/** Takes layout space instead of covering the header or intercepting its buttons.
 * Keep the child provider mounted when status changes. Native providers compute
 * remaining insets from their frame; web providers report window insets instead,
 * so the web branch explicitly subtracts the space consumed above the route.
 * Global crisis and device-lock dialogs stay outside this frame.
 */
export function OfflineBannerFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation("deepspace");
  const windowInsets = useSafeAreaInsets();
  const windowFrame = useSafeAreaFrame();
  const [status, setStatus] = useState<ConnectionStatus>("unknown");
  const [bannerHeight, setBannerHeight] = useState(0);
  const offset = status === "disconnected" ? bannerHeight : 0;
  useEffect(() => observeConnection(setStatus), []);

  return (
    <WindowSafeAreaContext.Provider value={{ insets: windowInsets, frame: windowFrame }}>
    <View style={styles.frame}>
      {status === "disconnected" ? (
        <SafeAreaView
          edges={["top", "left", "right"]}
          style={styles.banner}
          onLayout={(event) => setBannerHeight(event.nativeEvent.layout.height)}
        >
          <Text
            variant="caption"
            style={styles.message}
            accessibilityLiveRegion="polite"
          >
            {t("ds.network.offline")}
          </Text>
        </SafeAreaView>
      ) : null}
      <KeyboardFrameOffsetContext.Provider value={offset}>
        <BannerContent offset={offset}>{children}</BannerContent>
      </KeyboardFrameOffsetContext.Provider>
    </View>
    </WindowSafeAreaContext.Provider>
  );
}

function BannerContent({ offset, children }: { offset: number; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  if (Platform.OS !== "web") {
    return <SafeAreaProvider style={styles.content}>{children}</SafeAreaProvider>;
  }
  return (
    <View style={styles.content}>
      <SafeAreaFrameContext.Provider value={{ ...frame, y: frame.y + offset, height: Math.max(0, frame.height - offset) }}>
        <SafeAreaInsetsContext.Provider value={{ ...insets, top: Math.max(0, insets.top - offset) }}>
          {children}
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0, backgroundColor: m3.color.surface },
  content: { flex: 1, minHeight: 0 },
  banner: { backgroundColor: m3.color.surfaceContainerHigh },
  message: {
    color: m3.color.onSurface,
    textAlign: "center",
    paddingHorizontal: m3.spacing.s4,
    paddingTop: m3.spacing.s3,
    paddingBottom: m3.spacing.s4,
    lineHeight: 18,
  },
});
