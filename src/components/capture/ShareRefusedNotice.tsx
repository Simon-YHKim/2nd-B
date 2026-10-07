// Android share -> /capture, signed in only (Simon 2026-10-07, Q-261005-05).
//
// ShareDeliverySync decides each Android share once the account state is known
// (src/lib/capture/share-delivery.ts). It renders nothing and sits in the root
// layout outside IntroGate, so it also runs under the opening, the storage
// recovery gate and every redirect.
//
// ShareRefusedNotice is the one line a refused share leaves: the share was not
// added, sign in and share again. It sits inside IntroGate, next to the other
// global overlays, so it shows on the first screen the person can see after a
// gate (sign-in, profile completion, password reset). It holds no shared text.
// Tap to close; it also closes by itself SHARE_REFUSED_NOTICE_MS after it appears.

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { m3TextStyle } from "@/components/m3";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import { dismissShareRefusedNotice, shareRefusedNoticeVisible } from "@/lib/capture/share-delivery";
import { useShareDeliverySettle, useShareDeliveryState } from "@/lib/capture/use-share-delivery";
import { m3 } from "@/lib/theme/m3";

export const SHARE_REFUSED_NOTICE_MS = 12_000;

export function ShareDeliverySync(): null {
  useShareDeliverySettle();
  return null;
}

export function ShareRefusedNotice() {
  const { t } = useTranslation("capture");
  const snapshot = useShareDeliveryState();
  const visible = shareRefusedNoticeVisible(snapshot);
  const seq = snapshot.refusedNoticeSeq;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => dismissShareRefusedNotice(seq), SHARE_REFUSED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [visible, seq]);

  if (!visible) return null;

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.safe} edges={["top"]}>
      <PixelSurface
        variant="frame"
        background={m3.color.surfaceContainerHighest}
        style={styles.card}
        contentStyle={styles.content}
      >
        <View accessibilityLiveRegion="polite" style={styles.message}>
          <Text style={[m3TextStyle("bodyMedium"), styles.messageText]}>{t("shareRefused.body")}</Text>
        </View>
        <PixelPressable
          onPress={() => dismissShareRefusedNotice(seq)}
          accessibilityLabel={t("shareRefused.dismiss")}
          contentStyle={styles.dismiss}
        >
          <Text style={[m3TextStyle("labelLarge"), styles.dismissText]}>{t("shareRefused.dismiss")}</Text>
        </PixelPressable>
      </PixelSurface>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { position: "absolute", left: 0, right: 0, top: 0 },
  card: { marginHorizontal: m3.spacing.s4, marginTop: m3.spacing.s2 },
  content: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  message: { flex: 1, minWidth: 0 },
  messageText: { color: m3.color.onSurface },
  dismiss: { minHeight: m3.minTouch, justifyContent: "center", paddingHorizontal: m3.spacing.s3 },
  dismissText: { color: m3.color.onSurface },
});
