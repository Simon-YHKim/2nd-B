// M3 chrome typeface resolver (rev2 migration, P1b).
//
// Roboto is registered at three weights in src/theme/typography.ts (keys
// Roboto / RobotoMedium / RobotoBold). React Native cannot synthesise a crisp
// weight from a single family on Android, so this maps an m3 type-role weight
// to the matching loaded family (no faux-bold). Roboto Mono (numerics) is a
// single 400 weight.
import { m3, type M3TypeRole } from "@/lib/theme/m3";

type M3Weight = "400" | "500" | "700";

const ROBOTO_BY_WEIGHT: Record<M3Weight, string> = {
  "400": "Roboto",
  "500": "RobotoMedium",
  "700": "RobotoBold",
};

/** Loaded Roboto family name for an M3 font weight ("400" | "500" | "700"). */
export function robotoFor(weight: M3Weight): string {
  return ROBOTO_BY_WEIGHT[weight];
}

/**
 * RN Text style for an M3 type role, rendered in Roboto chrome. Spread into a
 * Text style array: `style={[m3TextStyle("labelLarge"), { color }]}`. Color is
 * intentionally left out so the caller supplies a token color.
 */
export function m3TextStyle(role: M3TypeRole) {
  const t = m3.type[role];
  return {
    fontFamily: robotoFor(t.weight),
    fontSize: t.size,
    lineHeight: t.line,
    letterSpacing: t.tracking,
  };
}
