// KakaoTalk relation signals → relation_people upsert (연동 P0③).
//
// The import hub calls this AFTER the user ratifies a kakao import: each
// pseudonymous signal (subjectKey — never a name, kakao.ts) becomes or updates
// one relation_people row whose display_name is a playful star alias
// ("새벽에 걷는 베텔게우스" — star-alias.ts, Simon 2026-07-18). The user can
// rename, edit, or delete the row like any person they typed in; a re-import
// finds it again by its subject:<key> tag, so the same friend never becomes
// two aliases and a user's manual rename survives (matching is by tag, and
// updates never touch display_name).
//
// PIPA posture: 가명화 + 본인 중심 산출 + 원문 비보존 — this module only ever
// sees {subjectKey, counts, dates}. Volume honesty: 40-person cap upstream,
// and each row is one deliberate ratify act (same "organized by the ratify"
// rationale as the sources fold in load-domain-levels).

import type { KakaoRelationSignal } from "../import/kakao";
import { createPerson, listPeople, updatePerson, type Person } from "./people";
import { starAliasFor } from "./star-alias";

export const KAKAO_IMPORT_TAG = "imported:kakao";
const SUBJECT_TAG_PREFIX = "subject:";
const ALIAS_PROBE_MAX = 6;

function subjectTagOf(person: Person): string | null {
  return person.tags.find((tag) => tag.startsWith(SUBJECT_TAG_PREFIX)) ?? null;
}

/** Pick a star alias not already used by another person (collision probe). */
function freshAlias(subjectKey: string, ko: boolean, taken: ReadonlySet<string>): string {
  for (let variant = 0; variant < ALIAS_PROBE_MAX; variant++) {
    const candidate = starAliasFor(subjectKey, ko, variant);
    if (!taken.has(candidate)) return candidate;
  }
  // 10k+ combinations × 6 probes make this practically unreachable; the key
  // fragment keeps even the pathological case unique AND stable.
  return `${starAliasFor(subjectKey, ko, 0)} ${subjectKey.slice(0, 4)}`;
}

/**
 * Create/update one relation_people row per signal. Returns how many rows were
 * touched. Failures are per-row and non-fatal (a flaky write must not lose the
 * rest of the batch); the caller treats this as best-effort after the import
 * itself has already landed.
 */
export async function upsertKakaoRelationPeople(
  userId: string,
  ko: boolean,
  signals: readonly KakaoRelationSignal[],
): Promise<number> {
  if (signals.length === 0) return 0;
  let existing: Person[];
  try {
    existing = await listPeople(userId);
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[relation-import] listPeople failed; skipping upsert", (e as Error).message);
    }
    return 0;
  }
  const byNormalizedSubject = new Map<string, Person>();
  const takenNames = new Set<string>();
  for (const person of existing) {
    takenNames.add(person.display_name);
    const tag = subjectTagOf(person);
    if (tag) byNormalizedSubject.set(tag.slice(SUBJECT_TAG_PREFIX.length), person);
  }

  let touched = 0;
  for (const signal of signals) {
    try {
      const current = byNormalizedSubject.get(signal.subjectKey);
      const lastOn = signal.lastIso ? signal.lastIso.slice(0, 10) : null;
      if (current) {
        // Never touch display_name (a user rename must survive re-imports);
        // only advance recency/cadence, and only forward in time.
        const newer =
          lastOn !== null &&
          (current.last_interaction_on === null || lastOn > current.last_interaction_on);
        await updatePerson(userId, current.id, {
          contact_cadence: signal.cadence,
          ...(newer ? { last_interaction_on: lastOn } : {}),
        });
      } else {
        const alias = freshAlias(signal.subjectKey, ko, takenNames);
        takenNames.add(alias);
        await createPerson(userId, {
          display_name: alias,
          relation_kind: "other",
          contact_cadence: signal.cadence,
          last_interaction_on: lastOn,
          tags: [KAKAO_IMPORT_TAG, `${SUBJECT_TAG_PREFIX}${signal.subjectKey}`],
          note: ko
            ? "카카오 가져오기에서 만든 별칭이에요. 실제 이름은 저장하지 않았어요."
            : "An alias from a KakaoTalk import. The real name was not stored.",
        });
      }
      touched += 1;
    } catch (e) {
      if (typeof console !== "undefined") {
        console.warn("[relation-import] upsert failed for one signal", (e as Error).message);
      }
    }
  }
  return touched;
}
