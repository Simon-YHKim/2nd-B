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

/**
 * Resolves a core-brain key in the language on screen. i18next's `t` from
 * useTranslation("core-brain") satisfies it.
 *
 * The field labels and hints live in locales/<lng>/core-brain.json under
 * `portrait.*` (Q-261005-01 = A, R2B-03). Until 2026-10-06 they were an en/ko
 * table in this file, so es/pt/id painted English here. The collecting hints
 * keep their contract: only who/fuel promise a backing signal; the other three
 * say plainly that their automatic portrait summary is not connected yet.
 */
export type PortraitTranslate = (key: string) => string;

export const SELF_PORTRAIT_KEYS = {
  label: (id: SelfPortraitFieldId) => `portrait.label.${id}`,
  hint: (id: SelfPortraitFieldId) => `portrait.hint.${id}`,
  evidenceHint: "portrait.evidenceHint",
} as const;

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

/**
 * `locale` picks the measured values (MBTI nickname, attachment style, value
 * framework), which those modules still carry as en/ko only. `t` paints the
 * field copy in whatever language is on screen.
 */
export function buildSelfPortrait(
  { persona }: SelfPortraitInput,
  locale: "en" | "ko",
  t: PortraitTranslate,
): SelfPortraitField[] {
  return FIELD_ORDER.map((id) => {
    const value = fieldValue(id, persona, locale);
    const hint = t(SELF_PORTRAIT_KEYS.hint(id));
    return {
      id,
      label: t(SELF_PORTRAIT_KEYS.label(id)),
      value,
      status: value ? "filled" : "collecting",
      hint,
      actionHint: value ? t(SELF_PORTRAIT_KEYS.evidenceHint) : hint,
      route: fieldRoute(id, persona, value),
    } satisfies SelfPortraitField;
  });
}

/** How many of the five fields currently have a measured value. */
export function filledCount(fields: readonly SelfPortraitField[]): number {
  return fields.filter((f) => f.status === "filled").length;
}
