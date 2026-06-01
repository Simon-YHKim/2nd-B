// Pure validation + partition helpers for the format-management UI (/formats).
// Kept out of the screen so the rules are unit-tested and reusable.
//
// Why a vocabulary gate here too: a user can edit one of their own clipper
// formats and flip it to community-shared. A shared format is visible to every
// user, so the C-vocabulary rule must apply to MANUAL edits too. Matching runs
// through the canonical, boundary-aware matcher in safety/classifier
// (containsForbiddenLexicon); lexicon.ts mandates that consumers must not
// duplicate it, and the word boundary stops an embedded substring from tripping.

import { containsForbiddenLexicon } from "../safety/classifier";
import type { ClipperAiProperty, TargetCategory } from "./clipper-templates";
import type { SourceKind } from "./types";

/**
 * The editable subset of a format. slug / ownerId / isShared are managed by the
 * caller (slug is the upsert key and must not change on edit; isShared is the
 * list's share toggle), so the editor never owns them.
 */
export interface TemplateDraft {
  baseKind: SourceKind;
  name: { en: string; ko: string };
  what: { en: string; ko: string };
  triggers: string[];
  defaultTags: string[];
  targetCategory: TargetCategory | "";
  wikiTarget: string;
  aiProperties: ClipperAiProperty[];
}

/**
 * Split the accessible formats into the caller's own vs. community-shared
 * (others'). listAccessibleTemplates already returns own-first; this keeps the
 * ownership test in one tested place so the screen stays declarative.
 */
export function partitionTemplates<T extends { ownerId: string }>(
  list: readonly T[],
  userId: string,
): { mine: T[]; community: T[] } {
  const mine: T[] = [];
  const community: T[] = [];
  for (const t of list) {
    if (t.ownerId === userId) mine.push(t);
    else community.push(t);
  }
  return { mine, community };
}

/** Every user-visible string in a draft, joined for a single lexicon scan. */
function surfaceText(draft: TemplateDraft): string {
  return [
    draft.name.en,
    draft.name.ko,
    draft.what.en,
    draft.what.ko,
    draft.wikiTarget,
    ...draft.triggers,
    ...draft.defaultTags,
    ...draft.aiProperties.flatMap((p) => [p.name, p.describe.en, p.describe.ko]),
  ].join(" \n ");
}

/** The forbidden-lexicon gate over a whole draft, via the canonical matcher. */
export function draftHasForbiddenTerm(draft: TemplateDraft): boolean {
  // Surface text mixes EN + KO, so scan both term sets. The canonical matcher
  // applies word boundaries for English (an embedded substring is ignored) and
  // substring matching for Korean.
  const text = surfaceText(draft);
  return containsForbiddenLexicon(text, "en").length > 0 || containsForbiddenLexicon(text, "ko").length > 0;
}

export interface DraftValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate an edited format before save. `locale` selects the message language.
 * Rules: a name in at least one locale, and no clinical/medical vocabulary on
 * any surface (the project vocabulary policy applies to community-visible
 * formats just as it does to AI-proposed ones).
 */
export function validateTemplateDraft(draft: TemplateDraft, locale: "en" | "ko"): DraftValidation {
  const errors: string[] = [];
  if (draft.name.en.trim().length === 0 && draft.name.ko.trim().length === 0) {
    errors.push(
      locale === "ko"
        ? "이름을 한 언어 이상 입력해 주세요."
        : "Give the format a name in at least one language.",
    );
  }
  if (draftHasForbiddenTerm(draft)) {
    errors.push(
      locale === "ko"
        ? "임상·의료 표현은 쓸 수 없어요. 일상적인 표현으로 바꿔 주세요."
        : "Clinical or medical wording isn't allowed here. Use everyday language.",
    );
  }
  return { ok: errors.length === 0, errors };
}
