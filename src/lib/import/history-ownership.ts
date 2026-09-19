// Which import owns which source row (import-hub 이력/철회).
//
// The import log (history.ts) is shared: /import-hub and /import both render every
// entry and both withdraw any of them, and 철회 deletes the source rows the entry
// points at. So an entry may only point at rows its own import created, and a
// withdrawal may only delete rows that are the withdrawn entry's own.
//
// Both halves broke on one path (vibe r260919 r29 §3-6, 2026-09-20): ratifying the
// same file with the same selection twice in the hub made the second capture an
// exact duplicate, which hands back the FIRST import's row and writes nothing. The
// hub logged that row on the second entry anyway, so withdrawing the second entry
// deleted the first import's row and left the first entry pointing at nothing. The
// file import never logged duplicates (its createdIds), so only the hub wrote such
// entries - but the ones already written can be withdrawn from either screen.
//
// Whose row it is (vibe r260919 LA-1841-1, 2026-09-20). The first fix kept a row while
// any other entry in the log pointed at it, so it read "no other pointer" as "mine".
// The log cannot prove that: it lives on one device and keeps the latest 50 entries.
// An old duplicate entry E2=[R] still deleted R when its first import E1 had been
// pushed out by the cap, lived on another device, or never had an entry at all (a
// /capture clip of the same text). Ownership is now proved instead:
//
//   - `owned` entries (logged from 2026-09-20) list only rows their import created, and
//     so do the file import's entries, which never logged anything else (#898). Their
//     withdrawal deletes every row they list.
//   - An older hub entry asks the server. capture.ts writes an ingest_log row (stage
//     exact_duplicate, survivor_id = the row) before it hands an existing row back,
//     and has since the dedup gate landed (4d5fef8a, 2026-06-16). A row with no such
//     record was never handed back, so the only entry that can list it is the one whose
//     import created it: deleted. A row with records is kept - except that with exactly
//     one record and exactly one other holder in the log, the two holders are its
//     creator and its one duplicate, so once this one is withdrawn the other becomes
//     its owner and deletes it on its own withdrawal.
//
// The judgement is pure; countExactDuplicateHandBacks is its one server read.

import { getSupabaseClient } from "../supabase/client";
import type { CaptureResult } from "../wiki/capture";
import type { ImportHistoryEntry, ImportWithdrawalJudge, ImportWithdrawalPlan } from "./history";

/** The part of a capture's answer the import log cares about. */
export interface CapturedSource {
  source: { id: string };
  deduped: CaptureResult["deduped"];
}

/**
 * The source ids an import may log as its own: the rows its capture created.
 * An exact duplicate hands back a row an earlier capture made and writes nothing
 * (capture.ts), so logging it would give that row to this import's 철회. A near
 * duplicate is a new row (only linked to its survivor via dedup_of), so it counts.
 */
export function createdSourceIds(result: CapturedSource): string[] {
  return result.deduped === "exact_duplicate" ? [] : [result.source.id];
}

/** The file import's sourceKey. Its entries never listed an exact duplicate. */
const FILE_IMPORT_KEY = "file";

/**
 * How long ingest_log can prove an entry's ownership. The drop ledger is kept today,
 * but migration 0056 defines a purge of drop records older than 365 days, and an entry
 * older than that could have lost the very record that marks it a duplicate. 30 days
 * of margin. Measured on one clock: the entry's own atIso against this device's now.
 */
const DROP_LEDGER_TRUST_MS = 335 * 24 * 60 * 60 * 1000;

type Holder = Pick<ImportHistoryEntry, "id" | "sourceKey" | "atIso" | "sourceIds" | "owned">;

function ownsItsRows(entry: Holder): boolean {
  return entry.owned === true || entry.sourceKey === FILE_IMPORT_KEY;
}

function withinDropLedger(entry: Holder, nowMs: number): boolean {
  const at = Date.parse(entry.atIso);
  return Number.isFinite(at) && nowMs - at <= DROP_LEDGER_TRUST_MS;
}

const distinct = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * The rows of `entry` only the server can settle: an older entry's rows that no owned
 * entry claims. Empty for an owned entry, and for one too old for the drop ledger.
 */
export function handBackQuestions(entry: Holder, log: readonly Holder[], nowMs: number): string[] {
  if (ownsItsRows(entry) || !withinDropLedger(entry, nowMs)) return [];
  const ownedElsewhere = new Set(
    log.filter((other) => other.id !== entry.id && ownsItsRows(other)).flatMap((other) => other.sourceIds),
  );
  return distinct(entry.sourceIds).filter((id) => !ownedElsewhere.has(id));
}

/**
 * `entry`'s rows split into the ones its withdrawal deletes (its own) and the ones it
 * leaves. `log` is the log as just read - entries with `entry`'s own id are not
 * "other": removeImportHistory removes them together. `handBacks` counts the exact
 * duplicate hand-backs of the rows handBackQuestions asked about; a row it does not
 * answer is kept.
 */
export function planWithdrawal(
  entry: Holder,
  log: readonly Holder[],
  handBacks: ReadonlyMap<string, number>,
  nowMs: number,
): ImportWithdrawalPlan {
  const plan: ImportWithdrawalPlan = { delete: [], keep: [], promote: [] };
  const others = log.filter((other) => other.id !== entry.id);
  const provable = withinDropLedger(entry, nowMs);
  for (const id of distinct(entry.sourceIds)) {
    const holders = others.filter((other) => other.sourceIds.includes(id));
    if (holders.some(ownsItsRows)) {
      // An owned entry's import created it. Two owned claims cannot both be true; the
      // last of them to be withdrawn deletes it.
      plan.keep.push(id);
      continue;
    }
    if (ownsItsRows(entry)) {
      plan.delete.push(id);
      continue;
    }
    const handedBack = provable ? handBacks.get(id) : undefined;
    if (handedBack === 0 && holders.length === 0) {
      plan.delete.push(id);
      continue;
    }
    plan.keep.push(id);
    const [other] = holders;
    if (
      handedBack === 1
      && holders.length === 1
      && distinct(other.sourceIds).length === 1
      && withinDropLedger(other, nowMs)
    ) {
      plan.promote.push({ entryId: other.id, sourceId: id });
    }
  }
  return plan;
}

/**
 * How many times capture handed each row back as an exact duplicate, per ingest_log
 * (0044: owner-only SELECT, survivor_id indexed by 0083). 0, 1, or 2 meaning "more".
 */
export async function countExactDuplicateHandBacks(
  userId: string,
  sourceIds: readonly string[],
): Promise<Map<string, number>> {
  const supabase = getSupabaseClient();
  const counts = await Promise.all(
    distinct(sourceIds).map(async (id): Promise<[string, number]> => {
      // One query per row with a limit of two: enough to tell 0, 1 and more, and a
      // much-duplicated row cannot fill a capped response and hide another row's record.
      const { data, error } = await supabase
        .from("ingest_log")
        .select("id")
        .eq("user_id", userId)
        .eq("stage", "exact_duplicate")
        .eq("survivor_id", id)
        .limit(2);
      if (error) throw error;
      return [id, (data ?? []).length];
    }),
  );
  return new Map(counts);
}

/** The judge the screens hand to withdrawImportHistoryEntry (history.ts). */
export function importWithdrawalJudge(
  userId: string,
  findSurvivingSourceIds: (userId: string, ids: string[]) => Promise<string[]>,
): ImportWithdrawalJudge {
  return {
    plan: async (entry, log) => {
      const nowMs = Date.now();
      const asked = handBackQuestions(entry, log, nowMs);
      const handBacks = asked.length > 0
        ? await countExactDuplicateHandBacks(userId, asked)
        : new Map<string, number>();
      return planWithdrawal(entry, log, handBacks, nowMs);
    },
    surviving: (ids) => findSurvivingSourceIds(userId, ids),
  };
}
