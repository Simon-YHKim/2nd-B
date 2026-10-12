import { m3 } from "@/lib/theme/m3";
import koHome from "../../../locales/ko/home.json";
import enHome from "../../../locales/en/home.json";
import esHome from "../../../locales/es/home.json";
import ptHome from "../../../locales/pt/home.json";
import idHome from "../../../locales/id/home.json";

// Max advance at 10dp across Galmuri9 and Galmuri11Bold, rounded UP to .001dp.
// nav-label-scaling.test.ts regenerates this table from AVAILABLE_UI_LOCALES
// and the shipped TTFs. A copy/font change must update and revalidate the table.
export const NAV_LABEL_FACES = ["Galmuri9", "Galmuri11Bold"] as const;
const dockKeys = ["home", "capture", "chat", "wiki", "settings"] as const;
const measuredLabels = {
  ko: [koHome.ds.dock, [30, 30, 40, 20, 20]],
  en: [enHome.ds.dock, [29.167, 30.834, 40.834, 22.5, 45]],
  es: [esHome.ds.dock, [29.167, 49.167, 40.834, 22.5, 41.667]],
  pt: [ptHome.ds.dock, [30, 49.167, 40.834, 22.5, 41.667]],
  id: [idHome.ds.dock, [43.334, 19.167, 40.834, 22.5, 61.667]],
} as const;
export const NAV_LABEL_LOCALES = Object.keys(measuredLabels);
export const NAV_LABEL_WIDTHS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.values(measuredLabels).flatMap(([labels, widths]) => dockKeys.map((key, index) => [labels[key], widths[index]])),
);

// Shared with MdNavBar styles; the caller's icon size is source-contract tested.
export const NAV_BAR_GEOMETRY = {
  pressHeight: 52,
  iconSize: 24,
  gap: m3.spacing.s1,
  indicatorHeight: 32,
  paddingHorizontal: m3.spacing.s2,
  buttonGap: m3.spacing.s2,
  buttonBorder: m3.spacing.s1,
} as const;
type NavBarGeometry = { [K in keyof typeof NAV_BAR_GEOMETRY]: number };

// Simon Q-261010-24 (Relay, 2026-10-10 20:15 KST):
// "하단 탭 이름 글자 크기는 화면 폭과 언어에 맞춰서만 키운다. 한국어는 최대 약 1.6배로 한다."
const KOREAN_LABEL_SCALE_CAP = 1.6;

type Label = { key: string; label: string };
export type NavSlotWidths = Readonly<Record<string, number>>;
export type NavSlotMeasurements = Readonly<Record<string, { width: number; windowWidth: number }>>;

export function recordNavSlotWidth(
  measurements: NavSlotMeasurements, key: string, width: number, windowWidth: number,
): NavSlotMeasurements {
  const next = Number.isFinite(width) && width > 0 ? width : 0;
  const previous = measurements[key];
  return previous?.width === next && previous.windowWidth === windowWidth
    ? measurements : { ...measurements, [key]: { width: next, windowWidth } };
}

/** First paint uses the full-width shell; onLayout can only reduce its estimate. */
export function navSlotWidths(
  items: readonly Label[], measurements: NavSlotMeasurements, windowWidth: number, buttonLike: boolean,
): NavSlotWidths {
  const g = NAV_BAR_GEOMETRY;
  const content = windowWidth - 2 * g.paddingHorizontal - (buttonLike ? (items.length - 1) * g.buttonGap : 0);
  const predicted = Math.max(0, content / items.length - (buttonLike ? 2 * g.buttonBorder : 0));
  return Object.fromEntries(items.map(item => {
    const measured = measurements[item.key];
    const current = measured?.windowWidth === windowWidth && measured.width > 0;
    return [item.key, current ? Math.min(predicted, measured.width) : predicted];
  }));
}

/** One scale for every label, independent of selection and mount lifetime. */
export function navLabelLayout(
  items: readonly Label[],
  slotWidths: NavSlotWidths,
  systemFontScale: number,
  pixelRatio: number,
  platform: string,
  locale: string,
  geometry: NavBarGeometry = NAV_BAR_GEOMETRY,
) {
  const density = Number.isFinite(pixelRatio) && pixelRatio >= 1 ? pixelRatio : 1;
  const systemScale = Number.isFinite(systemFontScale) && systemFontScale > 0 ? systemFontScale : 1;
  const base = m3.type.labelMedium;
  // Unknown copy/invalid geometry stays visible at base size. Shipped locale
  // and font coverage is enforced by tests, not hidden by this runtime fallback.
  const measured = items.length > 0 && items.every(item =>
    slotWidths[item.key] > 0 && Number.isFinite(slotWidths[item.key]) &&
    Object.hasOwn(NAV_LABEL_WIDTHS, item.label),
  );
  let cap = 1;
  if (measured) {
    // Two physical pixels cover Yoga slot rounding and native text measurement.
    const horizontalScale = Math.min(...items.map(item =>
      (slotWidths[item.key] - 2 / density) / NAV_LABEL_WIDTHS[item.label],
    ));
    // Round the LINE budget down before sizing it: ceil(lineHeight * density)
    // must still leave room for the icon, style gap and existing 2px clearance.
    const lineBudget = Math.floor((geometry.pressHeight - geometry.iconSize - geometry.gap) * density - 2) / density;
    const verticalScale = lineBudget / base.line;
    const localeCap = locale === "ko" || locale.startsWith("ko-") ? KOREAN_LABEL_SCALE_CAP : Infinity;
    const fittingSize = base.size * Math.min(horizontalScale, verticalScale, localeCap);
    // RN 0.85 Android rounds fontSize UP to a physical pixel. Round the ceiling
    // DOWN first, so the renderer cannot enlarge it beyond the available width.
    const sizeCap = platform === "android" ? Math.floor(fittingSize * density) / density : fittingSize;
    cap = Math.max(1, sizeCap / base.size);
  }
  const scale = platform === "web" ? 1 : Math.min(systemScale, cap);
  const fontSize = base.size * scale;
  const lineHeight = base.line * scale;
  const lineBox = Math.ceil(lineHeight * density) / density;
  // The indicator never crops its icon. The cap above makes its minimum fit
  // inside the unchanged touch surface, even after physical-pixel line rounding.
  const indicatorHeight = platform === "web" ? geometry.indicatorHeight : Math.max(geometry.iconSize,
    Math.min(geometry.indicatorHeight, geometry.pressHeight - geometry.gap - lineBox - 2 / density),
  );
  return { cap, scale, fontSize, lineHeight, indicatorHeight };
}
