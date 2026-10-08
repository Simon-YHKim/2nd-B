import type { TextStyle, ViewStyle } from "react-native";

import { m3 } from "./m3";
import { phoneIos } from "./phone-ios";
import { cosmic, deepSpace, semantic } from "./tokens";

// Pure, local conversions. Never mutate m3/tokens or a caller's StyleSheet:
// standalone and hosted instances of the same screen can be mounted together.
const phoneColors = new Set<string>(Object.values(phoneIos).flat().map(value => value.toLowerCase()));
const textColors = new Map<string, string>();
function textTone(to: string, ...from: string[]) {
  for (const value of from) textColors.set(value.toLowerCase(), to);
}
textTone(phoneIos.label, m3.color.onSurface, m3.color.onSecondaryContainer,
  cosmic.moonWhite, cosmic.softWhite, deepSpace.text, deepSpace.accentBright, semantic.text,
  deepSpace.accentSoft, m3.color.onPrimary, m3.color.onTertiaryContainer);
textTone(phoneIos.label2, m3.color.onSurfaceVariant, cosmic.mistGray, cosmic.quietGray,
  deepSpace.textMuted, semantic.textMuted, semantic.textSubtle, deepSpace.accentDim);
textTone(phoneIos.blue, m3.color.primary, m3.color.primaryContainer, cosmic.signalBlue,
  cosmic.signalMint, deepSpace.accent, semantic.brand);
textTone(phoneIos.red, m3.color.error, cosmic.guardRose, semantic.zoneRed);
textTone(phoneIos.orange, cosmic.pixelLamp, semantic.zoneYellow);
textTone(phoneIos.green, semantic.zoneGreen);
textTone(phoneIos.aiText, cosmic.soulViolet, cosmic.soulViolet2);
textTone(phoneIos.label2, ...Object.values(m3.disabled));

export function phoneTextColor(color: string): string {
  const key = color.toLowerCase();
  if (phoneColors.has(key) || key === "transparent") return color;
  return textColors.get(key) ?? color;
}

const groupColors = new Set([m3.color.surface, m3.color.surfaceContainer, deepSpace.bgEdge,
  deepSpace.bgMid, cosmic.space950, cosmic.space900].map(value => value.toLowerCase()));
const cellColors = new Set([m3.color.surfaceContainerHigh, m3.color.surfaceContainerHighest,
  m3.color.surfaceContainerLow, m3.color.surfaceVariant, cosmic.panelBg, cosmic.space800,
  cosmic.space700].map(value => value.toLowerCase()));

export function phoneSurfaceColor(color: string): string {
  const key = color.toLowerCase();
  if (phoneColors.has(key) || key === "transparent") return color;
  if (groupColors.has(key)) return phoneIos.grouped;
  if (cellColors.has(key)) return phoneIos.cell;
  const accent = textColors.get(key);
  if (accent === phoneIos.blue) return phoneIos.blue;
  if (accent === phoneIos.aiText) return phoneIos.aiFill;
  if (accent === phoneIos.red || accent === phoneIos.orange || accent === phoneIos.green) return accent;
  // Legacy surfaces also use colors pre-composited over the dark stage.
  // Those are quiet panels, even when their tint came from an accent.
  if (/^#[0-9a-f]{6}$/.test(key)) {
    const channels = [1, 3, 5].map(start => parseInt(key.slice(start, start + 2), 16));
    if (Math.max(...channels) < 150) return phoneIos.cell;
  }
  return phoneIos.cell;
}

export function phoneButtonColors({ primary = false, destructive = false, disabled = false, pressed = false }: {
  primary?: boolean; destructive?: boolean; disabled?: boolean; pressed?: boolean;
} = {}): { background: string; foreground: string } {
  if (disabled) return { background: phoneIos.fill, foreground: phoneIos.label2 };
  if (primary) return { background: pressed ? phoneIos.bluePressed : phoneIos.blue, foreground: phoneIos.onBlue };
  return { background: pressed ? phoneIos.fill : phoneIos.cell, foreground: destructive ? phoneIos.red : phoneIos.blue };
}

export const phoneFlatSurface: ViewStyle = {
  backgroundColor: "transparent", borderWidth: 0, borderRadius: 0,
  borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderStartWidth: 0, borderEndWidth: 0,
  shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0,
};
export const phoneInputStyle: TextStyle = {
  color: phoneIos.label, fontFamily: "Galmuri14", fontSize: 15, lineHeight: 22,
  backgroundColor: phoneIos.cell, borderColor: phoneIos.separator, borderRadius: 0,
  minHeight: 44, paddingBottom: 10,
};

/** Convert visual colors only; retain geometry and readable-font preferences. */
export function phoneStyle<T extends object>(style: T): T {
  const converted: Record<string, unknown> = { ...style } as Record<string, unknown>;
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === "string") {
      if (key === "color" || key === "textDecorationColor") converted[key] = phoneTextColor(value);
      else if (key === "backgroundColor") converted[key] = phoneSurfaceColor(value);
      else if (/^border.*Color$/.test(key)) {
        const tone = textColors.get(value.toLowerCase());
        converted[key] = value === "transparent" || phoneColors.has(value.toLowerCase()) ? value
          : tone === phoneIos.blue || tone === phoneIos.red || tone === phoneIos.green || tone === phoneIos.orange ? tone : phoneIos.separator;
      }
    }
    if (/^border.*Radius$/.test(key) || key === "elevation" || key === "shadowOpacity" || key === "shadowRadius") converted[key] = 0;
  }
  return converted as T;
}

export function phoneStyleSheet<T extends Record<string, object>>(styles: T): T {
  return Object.fromEntries(Object.entries(styles).map(([key, style]) => [key, phoneStyle(style)])) as T;
}
