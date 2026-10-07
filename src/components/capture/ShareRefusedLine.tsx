// Android share -> /capture, signed in only (Simon 2026-10-07 12:04).
//
// The one line a turned-away share leaves: it was not added. A gate that sends
// /capture?text=&title=&from=share to another screen (sign-in, profile, reset,
// first avatar) adds SHARE_REFUSED_PARAMS to that screen's route
// (src/lib/capture/share-intent.ts), and the screen draws this line in its own
// message spot, in the flow of the page, not over it (gate SHARE-A1-07). It
// holds no shared text, keeps no state and decides nothing: a forged param
// shows the line and does nothing else.

import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { m3TextStyle } from "@/components/m3";
import { PixelSurface } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import { showsShareRefused } from "@/lib/capture/share-intent";
import { useScreenParams } from "@/lib/nav/phone-embed";
import { m3 } from "@/lib/theme/m3";

export function ShareRefusedLine({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation("capture");
  const params = useScreenParams();
  if (!showsShareRefused(params)) return null;
  return (
    <View accessibilityLiveRegion="polite" style={style}>
      <PixelSurface variant="frame" background={m3.color.primaryContainer} contentStyle={styles.content}>
        <Text style={[m3TextStyle("bodyMedium"), styles.text]}>{t("shareRefused.body")}</Text>
      </PixelSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: m3.spacing.s4, paddingVertical: m3.spacing.s3 },
  text: { color: m3.color.onPrimaryContainer },
});
