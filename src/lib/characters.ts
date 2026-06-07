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

export const CHARACTERS: Record<CharacterId, CharacterMeta> = {
  secondb: {
    id: "secondb",
    name: { ko: "세컨비", en: "SecondB" },
    role: { ko: "AI 안내자", en: "AI guide" },
    accent: characterColors.secondb,
    routes: ["/secondb", "/"],
    line: {
      ko: "네 기록으로 다시 생각해볼게.",
      en: "I'll think it through with what you've written.",
    },
  },
  momo: {
    id: "momo",
    name: { ko: "모모 반장", en: "Foreman Momo" },
    role: { ko: "기록 크루 반장", en: "Records crew foreman" },
    accent: characterColors.momo,
    routes: ["/journal", "/audit", "/wiki"],
    line: {
      ko: "잘 분류해서 넣어둘게.",
      en: "I'll sort it and keep it safe.",
    },
  },
  lulu: {
    id: "lulu",
    name: { ko: "루멘", en: "Lumen" },
    role: { ko: "지혜의 현자", en: "Sage of wisdom" },
    accent: characterColors.lulu,
    routes: ["/capture"],
    line: {
      ko: "새 조각, 네 삶에 어떻게 엮일까?",
      en: "A fresh piece - where does it fit your life?",
    },
  },
  archi: {
    id: "archi",
    name: { ko: "아콘", en: "Archon" },
    role: { ko: "성장 설계", en: "Growth architect" },
    accent: characterColors.archi,
    routes: ["/persona", "/core-brain", "/trinity", "/insights"],
    line: {
      ko: "이 조각들이 성장으로 이어져.",
      en: "These pieces line up into growth.",
    },
  },
  gadi: {
    id: "gadi",
    name: { ko: "릴리아", en: "Relia" },
    role: { ko: "따뜻한 길잡이", en: "Warm guide" },
    accent: characterColors.gadi,
    // Bond Core guide (worldview v-final). Safety is now system-only (guardRose,
    // no mascot), so Relia owns relationship warmth, not safety events.
    routes: [],
    line: {
      ko: "천천히 같이 들여다보자.",
      en: "Let's look at it together, gently.",
    },
  },
  lumi: {
    id: "lumi",
    name: { ko: "루미나", en: "Lumina" },
    role: { ko: "취향·영감 큐레이터", en: "Taste and inspiration curator" },
    accent: characterColors.lumi,
    // Muse Core: taste + inspiration. No dedicated route screen; surfaces via
    // personas / taste village (see chat/personas.ts, village-ui.ts).
    routes: [],
    line: {
      ko: "요즘 끌리는 걸 더 즐겁게 해볼까?",
      en: "Let's make what you're into more fun.",
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
