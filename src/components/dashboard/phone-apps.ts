import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";

interface PhoneApp {
  id: string;
  glyph: AnyGlyphName;
  route: string;
  adultOnly?: boolean;
}

const PHONE_APPS: readonly PhoneApp[] = [
  { id: "assistant", glyph: "bubble", route: "/ops" },
  { id: "focus", glyph: "timer", route: "/focus" },
  { id: "reminders", glyph: "notifications", route: "/reminders" },
  { id: "money", glyph: "credit_card", route: "/ledger" },
  { id: "growth", glyph: "target", route: "/milestones" },
  { id: "meals", glyph: "fire", route: "/meals" },
  { id: "community", glyph: "group", route: "/community", adultOnly: true },
  { id: "avatarPalette", glyph: "grid", route: "/avatar-palette" },
  { id: "relationships", glyph: "person", route: "/star/relation" },
];

/** Community remains adult-only; the local drawing palette is available to all profiles. */
export function phoneAppsFor(isMinor: boolean | null): readonly PhoneApp[] {
  return PHONE_APPS.filter((app) => !app.adultOnly || isMinor === false);
}
