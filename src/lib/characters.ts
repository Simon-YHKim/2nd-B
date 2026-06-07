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
    role: { ko: "소울 코어 길잡이", en: "Soul Core navigator" },
    accent: characterColors.secondb,
    routes: ["/secondb", "/"],
    line: {
      ko: "패턴을 보고, 다른 길도 열어볼게.",
      en: "I'll read the pattern and open another angle.",
    },
  },
  momo: {
    id: "momo",
    name: { ko: "모모 반장", en: "Foreman Momo" },
    role: { ko: "기록 보관소 크루 반장", en: "Narrative Core crew foreman" },
    accent: characterColors.momo,
    routes: ["/journal", "/audit", "/wiki"],
    line: {
      ko: "무슨 일이 있었는지 찾기 쉽게 정리할게.",
      en: "I'll file it so we can find what happened.",
    },
  },
  lulu: {
    id: "lulu",
    name: { ko: "루멘", en: "Lumen" },
    role: { ko: "삶에 적용하는 지혜 현자", en: "Life-applied wisdom sage" },
    accent: characterColors.lulu,
    routes: ["/capture"],
    line: {
      ko: "이 지식이 삶에서 어디로 이어질까?",
      en: "Where does this knowledge connect to life?",
    },
  },
  archi: {
    id: "archi",
    name: { ko: "아콘", en: "Archon" },
    role: { ko: "커리어 컨설턴트", en: "Career consultant" },
    accent: characterColors.archi,
    routes: ["/persona", "/core-brain", "/trinity", "/insights"],
    line: {
      ko: "지금 상황에 맞는 성장 방향을 잡아볼게.",
      en: "I'll map a growth direction for this situation.",
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
      ko: "사람과 마음의 결을 천천히 볼게.",
      en: "I'll look gently at the people and feelings around this.",
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
      ko: "끌리는 걸 더 즐겁고 건강하게 이어볼게.",
      en: "Let's keep what you're drawn to fun and balanced.",
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
