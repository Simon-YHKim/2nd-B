import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui/Text";
import { m3 } from "@/lib/theme/m3";
import type { ConnectionStatus } from "@/lib/network/connection-monitor";
import { observeConnection } from "@/lib/network/observe-connection";

/** Takes layout space instead of covering the header or intercepting its buttons.
 * Keep the child provider mounted when status changes. Its native frame computes
 * the remaining safe area after the banner moves the route surface down.
 * Global crisis and device-lock dialogs stay outside this frame.
 */
export function OfflineBannerFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation("deepspace");
  const [status, setStatus] = useState<ConnectionStatus>("unknown");
  useEffect(() => observeConnection(setStatus), []);

  return (
    <View style={styles.frame}>
      {status === "disconnected" ? (
        <SafeAreaView edges={["top", "left", "right"]} style={styles.banner}>
          <Text
            variant="caption"
            style={styles.message}
            accessibilityLiveRegion="polite"
          >
            {t("ds.network.offline")}
          </Text>
        </SafeAreaView>
      ) : null}
      <SafeAreaProvider style={styles.content}>
        {children}
      </SafeAreaProvider>
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
