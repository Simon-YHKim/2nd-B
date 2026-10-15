// Ratify seam for finance-csv imports (P1): inserts the CHOSEN ledger
// proposals into ops_ledger via the manual-ledger API (0052,
// src/lib/finance/ledger.ts). Mirrors the #1075 relation-alias law: parsing
// only PROPOSES; nothing persists until the user ratifies, and then exactly
// the rows they kept checked.
//
// Idempotency (0224, 2026-10-07): every imported row carries an import key, so
// ratifying the same statement twice books each row once. The key hashes the
// row's date, kind, amount and label plus its position among identical rows of
// this import: two identical coffees on one day stay two rows, and a second
// import of the same file (or an overlapping statement) finds both keys taken.
// Hand-entered rows carry no key and are unaffected.

import { createImportedLedgerEntry } from "../finance/ledger";
import { contentHash } from "../ingest/dedup";
import type { FinanceTxn } from "./finance-csv";
import type { ImportProposal } from "./proposals";

/** Fixed category so imported rows stay distinguishable from hand-entered ones. */
export const IMPORT_LEDGER_CATEGORY = "명세 가져오기";

export interface LedgerRatifyResult {
  inserted: number;
  /** Rows whose insert failed (RLS/network) — reported, never silently lost. */
  failed: number;
}

/** What ratifyLedgerEntries resolves to: the result plus the rows an earlier import already booked. */
export interface LedgerRatifyOutcome extends LedgerRatifyResult {
  /** Rows already booked by an earlier import of the same statement (0224). Not a failure. */
  skipped: number;
}

/** The import key format 0224 checks: `csv:v1:` + 16 hex characters. */
export const LEDGER_IMPORT_KEY_PREFIX = "csv:v1:";

/** Date, kind, amount and label: what makes two statement rows "the same row". */
function ledgerTuple(txn: FinanceTxn): string {
  return `${txn.occurredOn}|${txn.kind}|${txn.amountKrw}|${txn.label.replace(/\s+/g, " ").trim()}`;
}

/**
 * One key per row, stable across imports. `ordinal` is the row's position (0-based) among the
 * rows of this import that share date, kind, amount and label.
 */
export function ledgerImportKey(txn: FinanceTxn, ordinal: number): string {
  return `${LEDGER_IMPORT_KEY_PREFIX}${contentHash(`${ledgerTuple(txn)}|#${ordinal}`)}`;
}

/**
 * Insert every chosen proposal that carries a ledgerEntry. Sequential inserts
 * (ratified sets are capped at 100 proposals) with per-row fail-soft counting,
 * so one bad row cannot abort the rest of the booking.
 */
export async function ratifyLedgerEntries(
  userId: string,
  chosen: ReadonlyArray<ImportProposal>,
): Promise<LedgerRatifyOutcome> {
  const entries = chosen.flatMap((p) => (p.ledgerEntry ? [p.ledgerEntry] : []));
  const seen = new Map<string, number>();
  let inserted = 0;
  let failed = 0;
  let skipped = 0;
  for (const entry of entries) {
    const tuple = ledgerTuple(entry);
    const ordinal = seen.get(tuple) ?? 0;
    seen.set(tuple, ordinal + 1);
    try {
      const booked = await createImportedLedgerEntry(
        userId,
        {
          occurred_on: entry.occurredOn,
          kind: entry.kind,
          amount_krw: entry.amountKrw,
          category: IMPORT_LEDGER_CATEGORY,
          note: entry.label || null,
        },
        ledgerImportKey(entry, ordinal),
      );
      if (booked) inserted++;
      else skipped++;
    } catch {
      failed++;
    }
  }
  return { inserted, failed, skipped };
}
