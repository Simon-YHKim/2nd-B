// Character personas (2026-05-31 user directive): tapping a companion on the
// main graph opens a chat with THAT character, each with its own name, role,
// greeting, and voice — not the single generic SecondB.
//
// The five Pattern Core mascots map to the five cores; SecondB is the central
// Soul Core navigator (worldview v-final). Voice/role text is woven into the
// chat system prompt so replies stay in character while grounding on the user's
// wiki. Internal ids (archi/gadi/lulu/momo/lumi) are unchanged — only the
// display names + concepts move (Archon/Relia/Lumen/Foreman Momo/Lumina). The
// `vela` entry is dormant (공상 → SecondB Divergent mode); it is not surfaced.
//
// Pure data + tested. Vocabulary stays within the project's self-understanding
// /growth/reflection register (see src/lib/safety/lexicon.ts) and exposes no
// internal technical terms.

import type { WorkerId } from "@/components/art/WorkerSprite";
import { tLocale } from "@/lib/i18n/text";

export interface Persona {
  /** Worker sprite id — also the avatar shown in the chat header. */
  id: WorkerId;
  name: { en: string; ko: string };
  /** One-line role, shown under the name. */
  role: { en: string; ko: string };
  /** First message the character opens the conversation with. */
  greeting: { en: string; ko: string };
  /** A short voice/persona instruction appended to the chat system prompt. */
  systemHint: { en: string; ko: string };
}

function t(locale: "en" | "ko", key: string): string {
  return tLocale(locale, "secondb", key);
}

export const PERSONAS: Record<WorkerId, Persona> = {
  secondb: {
    id: "secondb",
    name: { en: "SecondB", ko: "세컨비" },
    role: { en: "Soul Core navigator", ko: "소울 코어 길잡이" },
    greeting: {
      en: t("en", "personas.secondb.greeting"),
      ko: t("ko", "personas.secondb.greeting"),
    },
    systemHint: {
      en: t("en", "personas.secondb.systemHint"),
      ko: t("ko", "personas.secondb.systemHint"),
    },
  },
  archi: {
    id: "archi",
    name: { en: "Archon", ko: "아콘" },
    role: { en: "Career consultant", ko: "커리어 컨설턴트" },
    greeting: {
      en: t("en", "personas.archi.greeting"),
      ko: t("ko", "personas.archi.greeting"),
    },
    systemHint: {
      en: t("en", "personas.archi.systemHint"),
      ko: t("ko", "personas.archi.systemHint"),
    },
  },
  gadi: {
    id: "gadi",
    name: { en: "Relia", ko: "릴리아" },
    role: { en: "Warm relationship guide", ko: "관계의 따뜻한 길잡이" },
    greeting: {
      en: t("en", "personas.gadi.greeting"),
      ko: t("ko", "personas.gadi.greeting"),
    },
    systemHint: {
      en: t("en", "personas.gadi.systemHint"),
      ko: t("ko", "personas.gadi.systemHint"),
    },
  },
  lulu: {
    id: "lulu",
    name: { en: "Lumen", ko: "루멘" },
    role: { en: "Life-applied wisdom sage", ko: "삶에 적용하는 지혜 현자" },
    greeting: {
      en: t("en", "personas.lulu.greeting"),
      ko: t("ko", "personas.lulu.greeting"),
    },
    systemHint: {
      en: t("en", "personas.lulu.systemHint"),
      ko: t("ko", "personas.lulu.systemHint"),
    },
  },
  momo: {
    id: "momo",
    name: { en: "Foreman Momo", ko: "모모 반장" },
    role: { en: "Narrative Core crew foreman", ko: "기록 보관소 크루 반장" },
    greeting: {
      en: t("en", "personas.momo.greeting"),
      ko: t("ko", "personas.momo.greeting"),
    },
    systemHint: {
      en: t("en", "personas.momo.systemHint"),
      ko: t("ko", "personas.momo.systemHint"),
    },
  },
  lumi: {
    id: "lumi",
    name: { en: "Lumina", ko: "루미나" },
    role: { en: "Trainer & curator", ko: "트레이너 겸 큐레이터" },
    greeting: {
      en: t("en", "personas.lumi.greeting"),
      ko: t("ko", "personas.lumi.greeting"),
    },
    systemHint: {
      en: t("en", "personas.lumi.systemHint"),
      ko: t("ko", "personas.lumi.systemHint"),
    },
  },
};

/** Resolve a persona by worker id, falling back to SecondB for unknown ids. */
export function getPersona(id: string | null | undefined): Persona {
  if (id && id in PERSONAS) return PERSONAS[id as WorkerId];
  return PERSONAS.secondb;
}

/** All worker ids that have a persona. */
export function personaIds(): WorkerId[] {
  return Object.keys(PERSONAS) as WorkerId[];
}
