// Ratify seam for finance-csv imports (P1): inserts the CHOSEN ledger
// proposals into ops_ledger via the manual-ledger API (0052,
// src/lib/finance/ledger.ts). Mirrors the #1075 relation-alias law: parsing
// only PROPOSES; nothing persists until the user ratifies, and then exactly
// the rows they kept checked.
//
// Idempotency note (documented limitation): ops_ledger has no natural unique
// key, so ratifying the same statement twice books the rows twice. The review
// screen is the dedup authority today; a content-hash guard is a follow-up
// candidate, recorded in the track log.

import { createLedgerEntry } from "../finance/ledger";
import type { ImportProposal } from "./proposals";

/** Fixed category so imported rows stay distinguishable from hand-entered ones. */
export const IMPORT_LEDGER_CATEGORY = "명세 가져오기";

export interface LedgerRatifyResult {
  inserted: number;
  /** Rows whose insert failed (RLS/network) — reported, never silently lost. */
  failed: number;
}

/**
 * Insert every chosen proposal that carries a ledgerEntry. Sequential inserts
 * (ratified sets are capped at 100 proposals) with per-row fail-soft counting,
 * so one bad row cannot abort the rest of the booking.
 */
export async function ratifyLedgerEntries(
  userId: string,
  chosen: ReadonlyArray<ImportProposal>,
): Promise<LedgerRatifyResult> {
  const entries = chosen.flatMap((p) => (p.ledgerEntry ? [p.ledgerEntry] : []));
  let inserted = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      await createLedgerEntry(userId, {
        occurred_on: entry.occurredOn,
        kind: entry.kind,
        amount_krw: entry.amountKrw,
        category: IMPORT_LEDGER_CATEGORY,
        note: entry.label || null,
      });
      inserted++;
    } catch {
      failed++;
    }
  }
  return { inserted, failed };
}
