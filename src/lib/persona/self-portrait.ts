// Self-portrait 5-field data contract (queue D). The "자주 보이는 나의 모습"
// section frames the user across five fields that, together, read like a
// one-line personal mission:
//
//   who      나는 누구인가     — measured identity signals (MBTI / attachment)
//   forWhom  누구를 위해       — the people a user keeps returning to
//   goal     나의 목표         — the direction they're reaching for
//   do       무엇을 하는가      — what they actually spend pieces on
//   fuel     나의 원동력        — the values that drive them
//
// DATA CONTRACT (handoff policy #4 — 날조 금지): a field is only `filled`
// when there's a concrete *measured* value behind it. With no backing
// evidence it stays `collecting` and points the user at the one place that
// would fill it. We never invent a value to make the card look complete.
//
// Pure + tested so the field/evidence/route mapping is a single source of
// truth; the screen is a thin renderer over `buildSelfPortrait`.

import type { PersonaCard } from "./build";
import { labelFramework } from "../audit/frameworkLabels";
import { TYPE_NICKNAME } from "./mbti";
import { STYLE_LABEL } from "./attachment";

export type SelfPortraitFieldId = "who" | "forWhom" | "goal" | "do" | "fuel";
export type FieldStatus = "filled" | "collecting";

export interface SelfPortraitField {
  id: SelfPortraitFieldId;
  /** Localized field label. */
  label: string;
  /** Localized value when `filled`; null while `collecting`. */
  value: string | null;
  status: FieldStatus;
  /** Localized nudge — what would fill this field. */
  hint: string;
  /** Where the user goes to add the missing signal. */
  route: string;
}

export interface SelfPortraitInput {
  persona: PersonaCard | null;
}

const FIELD_ORDER: SelfPortraitFieldId[] = ["who", "forWhom", "goal", "do", "fuel"];

const LABELS: Record<"en" | "ko", Record<SelfPortraitFieldId, string>> = {
  ko: { who: "나는 누구인가", forWhom: "누구를 위해", goal: "나의 목표", do: "무엇을 하는가", fuel: "나의 원동력" },
  en: { who: "Who I am", forWhom: "Who it's for", goal: "What I'm reaching for", do: "What I do", fuel: "What fuels me" },
};

// Collecting nudges — phrased in the calm Core Brain plural voice, naming the
// one signal that would move the field to `filled`.
const HINTS: Record<"en" | "ko", Record<SelfPortraitFieldId, string>> = {
  ko: {
    who: "평가를 하나 마치면 또렷해져요.",
    forWhom: "스무고개에서 사람 이야기를 남기면 보이기 시작해요.",
    goal: "세컨비의 새 관점 모드에서 다음 한 걸음을 펼쳐보면 모여요.",
    do: "오늘의 조각을 며칠 남기면 흐름이 보여요.",
    fuel: "라이프 오딧으로 가치를 짚어보면 켜져요.",
  },
  en: {
    who: "Finishing one assessment sharpens this.",
    forWhom: "Talk about the people in your life in an interview and this starts to show.",
    goal: "Unfold a next step in SecondB's new angle mode and this gathers.",
    do: "Leave today's piece for a few days and the pattern shows.",
    fuel: "Name a value in a life audit and this lights up.",
  },
};

// Emit real destinations, not retired redirect routes (goal -> /secondb Divergent
// mode, do -> /capture), so each field opens where its copy promises.
const ROUTES: Record<SelfPortraitFieldId, string> = {
  who: "/persona",
  forWhom: "/interview",
  goal: "/secondb?mode=divergent",
  do: "/capture",
  fuel: "/audit",
};

/** The single measured value behind a field, or null when nothing backs it. */
function fieldValue(id: SelfPortraitFieldId, persona: PersonaCard | null, locale: "en" | "ko"): string | null {
  if (!persona) return null;
  switch (id) {
    case "who": {
      if (persona.mbti) {
        const nickname = TYPE_NICKNAME[locale][persona.mbti.type] ?? "";
        return nickname ? `${persona.mbti.type} · ${nickname}` : persona.mbti.type;
      }
      if (persona.attachment) return STYLE_LABEL[locale][persona.attachment.style];
      return null;
    }
    case "fuel": {
      const top = persona.values[0];
      return top ? labelFramework(top, locale) : null;
    }
    // forWhom / goal / do have no measured data contract yet — always
    // collecting until those signals exist (handoff: "백킹 데이터 없어 보류 중").
    default:
      return null;
  }
}

export function buildSelfPortrait({ persona }: SelfPortraitInput, locale: "en" | "ko"): SelfPortraitField[] {
  return FIELD_ORDER.map((id) => {
    const value = fieldValue(id, persona, locale);
    return {
      id,
      label: LABELS[locale][id],
      value,
      status: value ? "filled" : "collecting",
      hint: HINTS[locale][id],
      route: ROUTES[id],
    } satisfies SelfPortraitField;
  });
}

/** How many of the five fields currently have a measured value. */
export function filledCount(fields: readonly SelfPortraitField[]): number {
  return fields.filter((f) => f.status === "filled").length;
}
