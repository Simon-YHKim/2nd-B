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

export type CharacterId = "secondb" | "momo" | "lulu" | "archi" | "vela" | "gadi";

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

export const CHARACTERS: Record<CharacterId, CharacterMeta> = {
  secondb: {
    id: "secondb",
    name: { ko: "세컨비", en: "SecondB" },
    role: { ko: "AI 안내자", en: "AI guide" },
    accent: characterColors.secondb,
    routes: ["/jarvis", "/", "/imagine"],
    line: {
      ko: "네 기록으로 다시 생각해볼게.",
      en: "I'll think it through with what you've written.",
    },
  },
  momo: {
    id: "momo",
    name: { ko: "Foreman Momo", en: "Foreman Momo" },
    role: { ko: "Narrative Core 반장", en: "Narrative Core foreman" },
    accent: characterColors.momo,
    routes: ["/journal", "/audit", "/wiki"],
    line: {
      ko: "잘 넣어둘게.",
      en: "I'll keep it safe.",
    },
  },
  lulu: {
    id: "lulu",
    name: { ko: "Lumen", en: "Lumen" },
    role: { ko: "Wisdom Core 현자", en: "Wisdom Core sage" },
    accent: characterColors.lulu,
    routes: ["/capture"],
    line: {
      ko: "새 조각 주워왔어.",
      en: "Brought back a fresh piece.",
    },
  },
  archi: {
    id: "archi",
    name: { ko: "Archon", en: "Archon" },
    role: { ko: "Growth Core 설계", en: "Growth Core architect" },
    accent: characterColors.archi,
    routes: ["/persona", "/core-brain", "/trinity", "/insights"],
    line: {
      ko: "이 조각들이 이어져 있어.",
      en: "These pieces line up — see?",
    },
  },
  vela: {
    id: "vela",
    name: { ko: "SecondB Divergent", en: "SecondB Divergent" },
    role: { ko: "Divergent mode", en: "Divergent mode" },
    accent: characterColors.vela,
    routes: [],
    line: {
      ko: "그 생각을 비스듬히 돌려볼까?",
      en: "Want to turn that thought sideways?",
    },
  },
  gadi: {
    id: "gadi",
    name: { ko: "Relia", en: "Relia" },
    role: { ko: "Bond Core 길잡이", en: "Bond Core guide" },
    accent: characterColors.gadi,
    // Gadi doesn't own a screen — surfaces on top of any safety event.
    routes: [],
    line: {
      ko: "이 길은 천천히 비춰보자.",
      en: "Let's take this path gently.",
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
export const CHARACTER_ORDER: CharacterId[] = ["secondb", "momo", "lulu", "archi", "vela", "gadi"];
