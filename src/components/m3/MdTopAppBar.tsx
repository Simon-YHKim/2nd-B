// MdTopAppBar - M3 small top app bar for windowed sub-screens (rev2 sb-app
// TopAppBar 1:1): 56dp row, back icon button, title-large, optional trailing
// action slot. Presentational; the caller owns navigation (onBack).
//
// LAYOUT NOTE (PR 680): Fabric Android drops function-form Pressable styles,
// so the 40dp chip layout lives on a View and the Pressable inside is a bare
// touch surface with an android_ripple state layer.
import { useCallback, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet } from "react-native";
import { PhonePressable as Pressable, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { usePhoneDesign } from "@/lib/theme/phone-design-context";
import { phoneIos } from "@/lib/theme/phone-ios";
import { PlainText as Text } from "@/components/ui/PlainText";

import { m3 } from "@/lib/theme/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { registerOwnBack } from "@/lib/nav/own-back";

import { m3TextStyle } from "./typeface";

export function MdTopAppBar({
  title,
  onBack,
  action,
  backAccessibilityLabel,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
  backAccessibilityLabel?: string;
}) {
  const phone = usePhoneDesign();
  // Native stacks retain buried screens. Register only while this screen is
  // focused, otherwise a hidden app bar keeps the root BackArrow suppressed on
  // every screen pushed above it.
  useFocusEffect(useCallback(() => registerOwnBack(), []));
  return (
    <View style={styles.bar}>
      <View style={styles.backChip}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel ?? title}
          android_ripple={{ color: m3.color.secondaryContainer, borderless: true }}
          hitSlop={8}
          style={styles.backPress}
        >
          <PixelGlyph name={phone ? "chevron_left" : "arrow_back"} color={phone ? phoneIos.blue : m3.color.onSurface} size={24} />
        </Pressable>
      </View>
      <Text style={[m3TextStyle("titleLarge"), styles.title]} numberOfLines={1}>
        {title}
      </Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 4,
    paddingRight: 8,
  },
  backChip: {
    width: 40,
    height: 40,
    borderRadius: m3.shape.none,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  backPress: { alignItems: "center", justifyContent: "center", width: 40, height: 40 },
  title: { flexShrink: 1, color: m3.color.onSurface },
  action: { marginLeft: "auto", flexDirection: "row", alignItems: "center", paddingRight: 4 },
});
