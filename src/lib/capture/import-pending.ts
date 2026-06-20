// Post-account import of the device-local pending queue (D-17 / D-25 Phase 2).
//
// After sign-up, each plaintext line captured before the account existed is
// imported as a normal record. This module is PURE orchestration: the record
// creator is injected by the caller (the import sheet passes a closure over
// `createRecord`), so this file never imports the LLM/Supabase graph and stays
// trivially testable. The natural mapping is a `note` record (a captured
// thought, no AI follow-up) — the caller wires:
//
//   importPendingCaptures(ctx, (item, c) => createRecord({
//     userId: c.userId, locale: c.locale, kind: "note",
//     body: item.text, minor: c.minor, withFollowup: false,
//   }))
//
// Failures are retained in the queue so a partial import never loses a capture
// and a retry never duplicates an already-imported one.

import { loadPendingCaptures, replacePendingCaptures, type PendingCapture } from "./preauth-pending";

export interface ImportPendingContext {
  userId: string;
  locale: "en" | "ko";
  /** Forwarded for C10 crisis routing (a minor's red-zone text -> youth hotline). */
  minor?: boolean;
}

export interface ImportPendingSummary {
  total: number;
  imported: number;
  failed: number;
}

/** Creates one record from a pending capture. Injected so tests need no Supabase/LLM. */
export type PendingRecordCreator = (item: PendingCapture, ctx: ImportPendingContext) => Promise<void>;

export async function importPendingCaptures(
  ctx: ImportPendingContext,
  createOne: PendingRecordCreator,
): Promise<ImportPendingSummary> {
  const list = await loadPendingCaptures();
  if (list.length === 0) return { total: 0, imported: 0, failed: 0 };

  const failures: PendingCapture[] = [];
  let imported = 0;
  for (const item of list) {
    try {
      await createOne(item, ctx);
      imported += 1;
    } catch {
      // Keep the failed item; never lose a capture on a transient error.
      failures.push(item);
    }
  }
  // Retain only what failed (clears the queue when everything imported).
  await replacePendingCaptures(failures);
  return { total: list.length, imported, failed: failures.length };
}
