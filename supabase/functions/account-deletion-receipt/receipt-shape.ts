// Pure request/response shaping for account-deletion-receipt. No Deno or
// network imports, so jest exercises it directly (__tests__/receipt-shape.test.ts).

export const RECEIPT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The six observations 0217 allows delete-account to record. */
export const SWEEP_KEYS: ReadonlySet<string> = new Set([
  'profile_erased',
  'deletion_fenced',
  'raw_clippings_erased',
  'raw_clippings_empty_at_check',
  'record_photos_erased',
  'record_photos_empty_at_check',
]);

/** The receipt number from a strictly parsed body, or null when the body is not exactly `{ receipt_id }`. */
export function receiptIdFromBody(body: Record<string, unknown>): string | null {
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'receipt_id') return null;
  const value = body.receipt_id;
  return typeof value === 'string' && RECEIPT_ID_RE.test(value) ? value : null;
}

/** Copy only the known receipt fields; anything else the row might grow stays server-side. */
export function publicReceipt(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !RECEIPT_ID_RE.test(row.id)) return null;
  if (typeof row.erased_at !== 'string' || typeof row.expires_at !== 'string') return null;
  const sweeps: Record<string, boolean | null> = {};
  if (row.sweeps && typeof row.sweeps === 'object' && !Array.isArray(row.sweeps)) {
    for (const [key, flag] of Object.entries(row.sweeps as Record<string, unknown>)) {
      if (SWEEP_KEYS.has(key) && (typeof flag === 'boolean' || flag === null)) sweeps[key] = flag;
    }
  }
  return {
    id: row.id,
    erased_at: row.erased_at,
    expires_at: row.expires_at,
    sweeps,
    sweeps_reported: row.sweeps_reported === true,
  };
}
