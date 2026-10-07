// Android share -> /capture, signed in only (Simon 2026-10-07, Q-261005-05).
//
// ShareDeliverySync decides each Android share once the account state is known
// (src/lib/capture/share-delivery.ts). It renders nothing and sits in the root
// layout outside IntroGate, so it also runs under the opening, the storage
// recovery gate and every redirect.
//
// ShareRefusedNotice is the one line a refused share leaves: the share was not
// added, sign in and share again. It holds no shared text. The root layout
// draws it once, as a sibling after IntroGate (and its exit shield), so it
// shows over every branch IntroGate can render once the opening has ended:
// the routes, the storage recovery gate, the profile retry and loader covers,
// and the screen a redirect lands on (gate SHARE-A1-04). Inside IntroGate it
// was replaced by the recovery gate and hidden under the covers. It stays off
// while the opening plays, and its timer starts only when it shows.
// Tap to close; it also closes by itself SHARE_REFUSED_NOTICE_MS after it appears.

import { useEffect, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { m3TextStyle } from "@/components/m3";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import { dismissShareRefusedNotice, shareRefusedNoticeVisible } from "@/lib/capture/share-delivery";
import { useShareDeliverySettle, useShareDeliveryState } from "@/lib/capture/use-share-delivery";
import { hasIntroEnded, subscribeIntroExitShield } from "@/lib/nav/intro-exit-shield";
import { m3 } from "@/lib/theme/m3";

export const SHARE_REFUSED_NOTICE_MS = 12_000;

export function ShareDeliverySync(): null {
  useShareDeliverySettle();
  return null;
}

export function ShareRefusedNotice() {
  const { t } = useTranslation("capture");
  const snapshot = useShareDeliveryState();
  const introEnded = useSyncExternalStore(subscribeIntroExitShield, hasIntroEnded, hasIntroEnded);
  const visible = introEnded && shareRefusedNoticeVisible(snapshot);
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
