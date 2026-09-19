// Which import owns which source row (import-hub 이력/철회).
//
// The import log (history.ts) is shared: /import-hub and /import both render every
// entry and both withdraw any of them, and 철회 deletes the source rows the entry
// points at. So an entry may only point at rows its own import created, and a
// withdrawal may only delete rows no other entry still points at.
//
// Both halves broke on one path (vibe r260919 r29 §3-6, 2026-09-20): ratifying the
// same file with the same selection twice in the hub made the second capture an
// exact duplicate, which hands back the FIRST import's row and writes nothing. The
// hub logged that row on the second entry anyway, so withdrawing the second entry
// deleted the first import's row and left the first entry pointing at nothing. The
// file import never logged duplicates (its createdIds), so only the hub wrote such
// entries - but the ones already written can be withdrawn from either screen.
//
// Pure: no storage, no network. The screens read the log and delete the rows.

import type { CaptureResult } from "../wiki/capture";
import type { ImportHistoryEntry } from "./history";

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

type Pointer = Pick<ImportHistoryEntry, "id" | "sourceIds">;

/**
 * `entry` narrowed to the rows its 철회 may delete: the source ids no OTHER entry in
 * `log` points at. A row another entry still points at stays, and stays revocable
 * from that entry, so no surviving row is ever left without a pointer.
 *
 * `log` must be the log as just read, not a list a screen rendered earlier: an entry
 * already withdrawn elsewhere must not keep a row alive that nothing points at any
 * more. Entries with `entry`'s own id are not "other" - removeImportHistory removes
 * every entry with that id together.
 */
export function withoutSharedSourceIds<T extends Pointer>(entry: T, log: readonly Pointer[]): T {
  const claimed = new Set<string>();
  for (const other of log) {
    if (other.id === entry.id) continue;
    for (const id of other.sourceIds) claimed.add(id);
  }
  return { ...entry, sourceIds: [...new Set(entry.sourceIds)].filter((id) => !claimed.has(id)) };
}
