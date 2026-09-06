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
// evidence it stays `collecting`. `who` and `fuel` have a real automatic fill
// contract; the other three link to a related place without promising that the
// field will immediately fill. We never invent a value to make the card look
// complete.
//
// Pure + tested so the field/evidence/route mapping is a single source of
// truth; the screen is a thin renderer over `buildSelfPortrait`.

import type { SelfPortraitSignals } from "./build";
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
  /** Localized explanation shown while this field is collecting. */
  hint: string;
  /** Localized screen-reader description of the row's current destination. */
  actionHint: string;
  /** Collecting: honest next step. Filled: records filtered to its evidence. */
  route: string;
}

export interface SelfPortraitInput {
  persona: SelfPortraitSignals | null;
}

const FIELD_ORDER: SelfPortraitFieldId[] = ["who", "forWhom", "goal", "do", "fuel"];

const LABELS: Record<"en" | "ko", Record<SelfPortraitFieldId, string>> = {
  ko: { who: "나는 누구인가", forWhom: "누구를 위해", goal: "나의 목표", do: "무엇을 하는가", fuel: "나의 원동력" },
  en: { who: "Who I am", forWhom: "Who it's for", goal: "What I'm reaching for", do: "What I do", fuel: "What fuels me" },
};

// Collecting nudges. Only who/fuel promise a backing signal; the other three
// say plainly that their automatic portrait summary is not connected yet.
const HINTS: Record<"en" | "ko", Record<SelfPortraitFieldId, string>> = {
  ko: {
    who: "관계 패턴 체크에서 나를 설명하는 단서를 하나 더할 수 있어요.",
    forWhom: "스무고개에 사람 이야기를 남길 수 있어요 · 이 칸의 자동 요약은 준비 중이에요.",
    goal: "세컨비 새 관점 모드에서 다음 한 걸음을 펼칠 수 있어요 · 자동 요약은 준비 중이에요.",
    do: "오늘의 별가루에 실제로 한 일을 남길 수 있어요 · 자동 요약은 준비 중이에요.",
    fuel: "라이프 오딧에서 자주 돌아오는 가치를 살펴볼 수 있어요.",
  },
  en: {
    who: "A relationship-pattern check can add one more clue about you.",
    forWhom: "You can leave a story about someone in an interview · automatic summary for this field is still in progress.",
    goal: "You can unfold a next step in SecondB's new-angle mode · automatic summary is still in progress.",
    do: "You can record what you did in today's piece · automatic summary is still in progress.",
    fuel: "A life audit can surface the values you return to most.",
  },
};

const EVIDENCE_HINT: Record<"en" | "ko", string> = {
  ko: "이 값을 만든 기록을 엽니다.",
  en: "Opens the records behind this value.",
};

// Active collection/related destinations. `/persona` and bare `/audit` are not
// valid here in the default UI: the former redirects back to this same screen,
// while the latter now means Past Me rather than Life Audit.
const COLLECT_ROUTES: Record<SelfPortraitFieldId, string> = {
  who: "/attachment",
  forWhom: "/interview",
  goal: "/secondb?mode=divergent",
  do: "/capture",
  fuel: "/audit?screener=1",
};

/** Filled fields open the concrete records behind the shown value. */
function fieldRoute(
  id: SelfPortraitFieldId,
  persona: SelfPortraitSignals | null,
  value: string | null,
): string {
  if (value && id === "who") {
    return persona?.mbti ? "/records?tags=mbti" : "/records?tags=attachment";
  }
  if (value && id === "fuel") return "/records?tags=life_audit";
  return COLLECT_ROUTES[id];
}

/** The single measured value behind a field, or null when nothing backs it. */
function fieldValue(id: SelfPortraitFieldId, persona: SelfPortraitSignals | null, locale: "en" | "ko"): string | null {
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
      actionHint: value ? EVIDENCE_HINT[locale] : HINTS[locale][id],
      route: fieldRoute(id, persona, value),
    } satisfies SelfPortraitField;
  });
}

/** How many of the five fields currently have a measured value. */
export function filledCount(fields: readonly SelfPortraitField[]): number {
  return fields.filter((f) => f.status === "filled").length;
}
