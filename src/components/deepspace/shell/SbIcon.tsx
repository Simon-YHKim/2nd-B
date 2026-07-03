// SbIcon — 1:1 port of the reference-app Icon (sb-data.jsx §ICON_SVG + Icon()).
//
// The prototype renders each glyph as an inline 24dp SVG: stroke = currentColor
// at 2dp (or 1.4dp when `fill`), fill = currentColor|none, round caps/joins. We
// reproduce that EXACTLY by rebuilding the same <svg> string and handing it to
// react-native-svg's <SvgXml>, whose `color` prop resolves `currentColor`. Only
// the glyphs the deep-space shell + home need are ported here (nav / status /
// bell / back); the full set lives in the reference and can be extended.

import { SvgXml } from "react-native-svg";

// Path fragments copied verbatim from reference-app/sb-data.jsx ICON_SVG.
const ICON_PATHS = {
  star_shine: '<path d="M12 3c.5 3.8 2.7 6 6.5 6.5-3.8.5-6 2.7-6.5 6.5-.5-3.8-2.7-6-6.5-6.5 3.8-.5 6-2.7 6.5-6.5Z"/>',
  add_circle: '<circle cx="12" cy="12" r="8.4"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
  forum: '<path d="M3 5h12v8H7l-4 3.2z"/><path d="M8 13.2V15h9l3 2.4V9.5h-2.5"/>',
  inventory_2: '<path d="M3.5 7.5h17V20h-17z"/><path d="M3.5 7.5 5.5 4h13l2 3.5M12 7.5v4M9.5 11.5h5"/>',
  tune: '<path d="M4 7h9M17.5 7H20M4 17h2.5M11 17h9"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>',
  signal_cellular_alt: '<path d="M6 20v-4.5M12 20v-8.5M18 20V7"/>',
  wifi: '<path d="M4.5 10.5a11 11 0 0 1 15 0M7.8 14a6 6 0 0 1 8.4 0"/><circle cx="12" cy="17.6" r="1.1"/>',
  battery_full: '<rect x="3.5" y="8" width="16" height="9" rx="2.2"/><path d="M21.2 11v3"/>',
  notifications: '<path d="M6 16V10a6 6 0 0 1 12 0v6l2 2.5H4z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  arrow_back: '<path d="M15 5 8 12l7 7M8 12h11"/>',
} as const;

export type SbIconName = keyof typeof ICON_PATHS;

export interface SbIconProps {
  name: SbIconName;
  color: string;
  size?: number;
  /** Filled glyph (currentColor fill, 1.4dp stroke) — matches Icon(fill). */
  fill?: boolean;
}

export function SbIcon({ name, color, size = 24, fill = false }: SbIconProps) {
  const inner = ICON_PATHS[name];
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="${fill ? 1.4 : 2}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}
