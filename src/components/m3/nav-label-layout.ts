import { m3 } from "@/lib/theme/m3";
import koHome from "../../../locales/ko/home.json";
import enHome from "../../../locales/en/home.json";
import esHome from "../../../locales/es/home.json";
import ptHome from "../../../locales/pt/home.json";
import idHome from "../../../locales/id/home.json";

// Max advance at 10dp across Galmuri9 and Galmuri11Bold, rounded UP to .001dp.
// nav-label-scaling.test.ts regenerates this table from all five home.json files
// and the shipped TTFs. A copy/font change must update and revalidate the table.
const dockKeys = ["home", "capture", "chat", "wiki", "settings"] as const;
const measuredLabels = [
  [koHome.ds.dock, [30, 30, 40, 20, 20]],
  [enHome.ds.dock, [29.167, 30.834, 40.834, 22.5, 45]],
  [esHome.ds.dock, [29.167, 49.167, 40.834, 22.5, 41.667]],
  [ptHome.ds.dock, [30, 49.167, 40.834, 22.5, 41.667]],
  [idHome.ds.dock, [43.334, 19.167, 40.834, 22.5, 61.667]],
] as const;
export const NAV_LABEL_WIDTHS: Readonly<Record<string, number>> = Object.fromEntries(
  measuredLabels.flatMap(([labels, widths]) => dockKeys.map((key, index) => [labels[key], widths[index]])),
);

type Label = { key: string; label: string };
export type NavSlotWidths = Readonly<Record<string, number>>;

export function recordNavSlotWidth(widths: NavSlotWidths, key: string, width: number): NavSlotWidths {
  const next = Number.isFinite(width) && width > 0 ? width : 0;
  return widths[key] === next ? widths : { ...widths, [key]: next };
}

/** One scale for every label, independent of the selected tab and window width. */
export function navLabelLayout(
  items: readonly Label[],
  slotWidths: NavSlotWidths,
  systemFontScale: number,
  pixelRatio: number,
  platform: string,
) {
  const density = Number.isFinite(pixelRatio) && pixelRatio >= 1 ? pixelRatio : 1;
  const systemScale = Number.isFinite(systemFontScale) && systemFontScale > 0 ? systemFontScale : 1;
  const base = m3.type.labelMedium;
  // No optimistic window-width fallback: until ALL slots have laid out, paint
  // visible labels at the base size, then grow once. Embedded widths work too.
  const measured = items.length > 0 && items.every(item =>
    slotWidths[item.key] > 0 && Number.isFinite(slotWidths[item.key]) &&
    Object.hasOwn(NAV_LABEL_WIDTHS, item.label),
  );
  let cap = 1;
  if (measured) {
    const available = Math.min(...items.map(item => slotWidths[item.key]));
    const widest = Math.max(...items.map(item => NAV_LABEL_WIDTHS[item.label]));
    // Two physical pixels cover Yoga slot rounding and native text measurement.
    const fittingSize = Math.min(base.size * 1.6, (available - 2 / density) / widest * 10);
    // RN 0.85 Android rounds fontSize UP to a physical pixel. Round the ceiling
    // DOWN first, so the renderer cannot enlarge it beyond the available width.
    const sizeCap = platform === "android" ? Math.floor(fittingSize * density) / density : fittingSize;
    cap = Math.max(1, sizeCap / base.size);
  }
  const scale = platform === "web" ? 1 : Math.min(systemScale, cap);
  const fontSize = base.size * scale;
  const lineHeight = base.line * scale;
  const lineBox = Math.ceil(lineHeight * density) / density;
  // Keep the existing 52dp touch surface. Only the empty icon container shrinks;
  // the 24dp icon, 2dp gap, bar padding/borders and safe-area inset do not change.
  const indicatorHeight = platform === "web" ? 32 : Math.min(32, 52 - m3.spacing.s1 - lineBox - 2 / density);
  return { cap, scale, fontSize, lineHeight, indicatorHeight };
}
