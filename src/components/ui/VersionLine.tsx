import { useState } from "react";
import { type StyleProp, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";

import { PhonePressable as Pressable } from "@/components/phone/PhoneUIKit";
import { Text } from "@/components/ui/Text";
import { appVersion, buildInfoLine } from "@/lib/build-info";
import { spacing } from "@/lib/theme/tokens";

// The app's version as a reader knows it ("Version 0.10.0"). The bundle identity
// (buildInfoLine(): runtime fingerprint, channel, embedded-or-OTA id) is for whoever is
// chasing a build, so it opens on a tap instead of sitting on the screen. On a phone it
// read "v1275e8cd0ca0… · ? · embedded cab1b35f" and a first-time user took the "?" for
// an error (A-Z first-use check, round 7, Z94).
export function VersionLine({ style }: { style?: StyleProp<TextStyle> }) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const version = appVersion();
  // No readable version (expo-constants absent): the bundle identity is all there is.
  if (!version) return <Text variant="caption" color="textMuted" style={style}>{buildInfoLine()}</Text>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={spacing.md} onPress={() => setOpen((was) => !was)}>
      <Text variant="caption" color="textMuted" style={style}>{t("versionLine", { version })}</Text>
      {open ? <Text variant="caption" color="textMuted" style={[style, { marginTop: spacing.xs }]}>{buildInfoLine()}</Text> : null}
    </Pressable>
  );
}
