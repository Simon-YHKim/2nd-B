// Six pixel residents of the Cosmic Pixel Graph Village. The roster +
// role + voice line come from the 2026-05-29 handoff (uploads/.../
// 2ndB_pixel_graph_village_revised_handoff.html §5 "Character System").
//
// Each character is tied to:
//   - an accent color from `cosmic` / `characters` in tokens.ts
//   - a small set of routes where they're allowed to appear
//   - one short line of voice that fits the warm-but-not-childish tone
//
// This module is the source of truth for character → route mapping so
// the graph layer, popovers, and chat avatars all draw from the same
// roster. Adding a new route to a character means editing one line.

import { characters as characterColors } from "./theme/tokens";
import { tLocale } from "@/lib/i18n/text";

export type CharacterId = "secondb" | "momo" | "lulu" | "archi" | "gadi" | "lumi";

export interface CharacterMeta {
  id: CharacterId;
  /** Display name in KO / EN. KO is canonical for the village voice. */
  name: { ko: string; en: string };
  /** Short role description. */
  role: { ko: string; en: string };
  /** Hex accent — mirrors characters.* in tokens. */
  accent: string;
  /** Routes where the character is allowed to surface. Empty array = global. */
  routes: string[];
  /** Short voice line for popovers / introductions. KO canonical. */
  line: { ko: string; en: string };
}

function t(locale: "en" | "ko", key: string): string {
  return tLocale(locale, "secondb", key);
}

export const CHARACTERS: Record<CharacterId, CharacterMeta> = {
  secondb: {
    id: "secondb",
    name: { ko: "세컨비", en: "SecondB" },
    role: { ko: "소울 코어 길잡이", en: "Soul Core navigator" },
    accent: characterColors.secondb,
    routes: ["/secondb", "/"],
    line: {
      ko: t("ko", "characters.secondb.line"),
      en: t("en", "characters.secondb.line"),
    },
  },
  momo: {
    id: "momo",
    name: { ko: "모모 반장", en: "Foreman Momo" },
    role: { ko: "기록 보관소 크루 반장", en: "Narrative Core crew foreman" },
    accent: characterColors.momo,
    routes: ["/journal", "/audit", "/wiki"],
    line: {
      ko: t("ko", "characters.momo.line"),
      en: t("en", "characters.momo.line"),
    },
  },
  lulu: {
    id: "lulu",
    name: { ko: "루멘", en: "Lumen" },
    role: { ko: "삶에 적용하는 지혜 현자", en: "Life-applied wisdom sage" },
    accent: characterColors.lulu,
    routes: ["/capture"],
    line: {
      ko: t("ko", "characters.lulu.line"),
      en: t("en", "characters.lulu.line"),
    },
  },
  archi: {
    id: "archi",
    name: { ko: "아콘", en: "Archon" },
    role: { ko: "커리어 컨설턴트", en: "Career consultant" },
    accent: characterColors.archi,
    routes: ["/persona", "/core-brain", "/trinity", "/insights"],
    line: {
      ko: t("ko", "characters.archi.line"),
      en: t("en", "characters.archi.line"),
    },
  },
  gadi: {
    id: "gadi",
    name: { ko: "릴리아", en: "Relia" },
    role: { ko: "관계의 따뜻한 길잡이", en: "Warm relationship guide" },
    accent: characterColors.gadi,
    // Bond Core guide (worldview v-final). Safety is now system-only (guardRose,
    // no mascot), so Relia owns relationship warmth, not safety events.
    routes: [],
    line: {
      ko: t("ko", "characters.gadi.line"),
      en: t("en", "characters.gadi.line"),
    },
  },
  lumi: {
    id: "lumi",
    name: { ko: "루미나", en: "Lumina" },
    role: { ko: "트레이너 겸 큐레이터", en: "Trainer and curator" },
    accent: characterColors.lumi,
    // Muse Core: taste + inspiration. No dedicated route screen; surfaces via
    // personas / taste village (see chat/personas.ts, village-ui.ts).
    routes: [],
    line: {
      ko: t("ko", "characters.lumi.line"),
      en: t("en", "characters.lumi.line"),
    },
  },
};

/** Lookup the character that owns a given route, or null if none. */
export function characterForRoute(pathname: string): CharacterMeta | null {
  for (const c of Object.values(CHARACTERS)) {
    if (c.routes.includes(pathname)) return c;
  }
  return null;
}

/** All characters in display order — useful for sprite sheets / about pages. */
export const CHARACTER_ORDER: CharacterId[] = ["secondb", "momo", "lulu", "archi", "gadi", "lumi"];
