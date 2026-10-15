import { StyleSheet, View } from "react-native";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { phoneIos } from "@/lib/theme/phone-ios";
import type { PhoneAppId } from "./phone-app-assets";

export const PHONE_ICON_STYLE: Record<PhoneAppId, { fill: string; ink: string; glyph: AnyGlyphName }> = {
  notifications: { fill: phoneIos.red, ink: phoneIos.onBlue, glyph: "notifications" },
  assistant: { fill: phoneIos.blue, ink: phoneIos.onBlue, glyph: "sparkle" },
  focus: { fill: phoneIos.iconDark, ink: phoneIos.onBlue, glyph: "schedule" },
  reminders: { fill: phoneIos.cell, ink: phoneIos.blue, glyph: "task" },
  money: { fill: phoneIos.green, ink: phoneIos.onBlue, glyph: "credit_card" },
  growth: { fill: phoneIos.iconIndigo, ink: phoneIos.onBlue, glyph: "trending_up" },
  meals: { fill: phoneIos.orange, ink: phoneIos.onBlue, glyph: "utensils" },
  museum: { fill: phoneIos.teal, ink: phoneIos.onBlue, glyph: "account_balance" },
  community: { fill: phoneIos.green, ink: phoneIos.onBlue, glyph: "forum" },
  relationships: { fill: phoneIos.iconPink, ink: phoneIos.onBlue, glyph: "group" },
  settings: { fill: phoneIos.gray3, ink: phoneIos.iconDark, glyph: "settings" },
  avatarPalette: { fill: phoneIos.yellow, ink: phoneIos.iconPink, glyph: "palette" },
  more: { fill: phoneIos.gray3, ink: phoneIos.iconDark, glyph: "grid" },
};

export function PhoneAppIcon({ id, size, disabled }: { id: PhoneAppId; size: number; disabled: boolean }) {
  const spec = PHONE_ICON_STYLE[id];
  const edge = Math.floor(size / 2) * 2;
  return <PixelRoundRect testID={`phone-icon-${id}`} corner="icon" pointerEvents="none" fill={disabled ? phoneIos.fill : spec.fill}
    style={[styles.icon, { width: edge, height: edge }]}>
    {id === "reminders" ? <View style={styles.checklist}>{[phoneIos.orange, phoneIos.blue, phoneIos.red].map(color =>
      <View key={color} style={styles.line}><View style={[styles.mark, { backgroundColor: color }]} /><View style={styles.rule} /></View>)}</View>
      : <PixelGlyph name={spec.glyph} size={edge >= 64 ? 48 : 24} color={disabled ? phoneIos.label2 : spec.ink} />}
  </PixelRoundRect>;
}

const styles = StyleSheet.create({
  icon: { alignSelf: "center", alignItems: "center", justifyContent: "center" },
  checklist: { gap: 6 }, line: { flexDirection: "row", gap: 6, alignItems: "center" },
  mark: { width: 6, height: 6 }, rule: { width: 24, height: 2, backgroundColor: phoneIos.separator },
});
