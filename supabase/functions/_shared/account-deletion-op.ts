// Account deletion op contract shared by delete-account and
// account-deletion-receipt (0217, docs/design/deletion-receipt-server-261006.md 3절).
// Pure: no Deno or network imports, so jest exercises it directly
// (__tests__/account-deletion-op.test.ts).
//
// The op token. The device that asked for a deletion holds
//   v1.<base64url HMAC-SHA256(pepper_v1, "account-deletion-op:v1|<op>|<owner>|<issued ms>")>
// The database stores only sha256(token) and the issue time; the pepper stays in
// the Edge secret ACCOUNT_DELETION_OP_TOKEN_PEPPER_V1. The version prefix names the
// pepper, so a later rotation adds a _V2 secret beside _V1 and old tokens keep
// verifying until their ops expire (설계서 6절 새 위험 1).
//
// Why an HMAC and not just a random token: after the deletion commits, the
// server no longer knows the owner (owner_id is cleared). A device that asks
// "did MY deletion finish?" sends the owner id it remembers, and the server can
// still prove the binding by recomputing the HMAC (설계서 I4, 3.4 ②).

export const OP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const OP_TOKEN_RE = /^v1\.[A-Za-z0-9_-]{43}$/;
export const OP_TOKEN_PEPPER_ENV = 'ACCOUNT_DELETION_OP_TOKEN_PEPPER_V1';
export const LOOKUP_PEPPER_ENV = 'ACCOUNT_DELETION_LOOKUP_PEPPER_V1';
export const MIN_PEPPER_LENGTH = 32;

/** The six observations 0217 lets delete-account record on a completed op. */
export const SWEEP_KEYS = [
  'profile_erased',
  'deletion_fenced',
  'raw_clippings_erased',
  'raw_clippings_empty_at_check',
  'record_photos_erased',
  'record_photos_empty_at_check',
] as const;
export type SweepKey = (typeof SWEEP_KEYS)[number];

export type OpStatus = 'accepted' | 'executing' | 'completed' | 'failed' | 'abandoned';
const OP_STATUSES: ReadonlySet<string> = new Set(['accepted', 'executing', 'completed', 'failed', 'abandoned']);

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export function opTokenMessage(opId: string, ownerId: string, issuedMs: number): string {
  return `account-deletion-op:v1|${opId}|${ownerId}|${issuedMs}`;
}

/** Issue the v1 token for one op. Throws on a short pepper or malformed input. */
export async function issueOpToken(
  pepper: string,
  opId: string,
  ownerId: string,
  issuedMs: number,
): Promise<string> {
  if (pepper.length < MIN_PEPPER_LENGTH) throw new Error('op token pepper is too short');
  if (!OP_ID_RE.test(opId) || !OP_ID_RE.test(ownerId) || !Number.isSafeInteger(issuedMs) || issuedMs <= 0) {
    throw new Error('op token input is invalid');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(opTokenMessage(opId, ownerId, issuedMs)));
  return `v1.${base64Url(new Uint8Array(signature))}`;
}

/** True only when `token` is exactly the v1 token for this op, owner and issue time. */
export async function verifyOpToken(
  pepper: string,
  token: string,
  opId: string,
  ownerId: string,
  issuedMs: number,
): Promise<boolean> {
  if (!OP_TOKEN_RE.test(token)) return false;
  let expected: string;
  try {
    expected = await issueOpToken(pepper, opId, ownerId, issuedMs);
  } catch {
    return false;
  }
  return constantTimeEqual(expected, token);
}

/** sha256 of the token text, lowercase hex. This is what the database stores. */
export async function opTokenHashHex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

export type DeleteAccountRequest =
  | { kind: 'legacy' }
  | { kind: 'begin'; opId: string }
  | { kind: 'execute'; opId: string; opToken: string };

/**
 * The three request bodies delete-account accepts, read from the exact UTF-8
 * text. Anything else is null (400). `{}` is the old app's body and keeps the
 * old flow; begin and execute carry nothing that could pick a target account.
 */
export function parseDeleteAccountBody(rawBody: string): DeleteAccountRequest | null {
  if (rawBody === '{}') return { kind: 'legacy' };
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort().join(',');
  if (keys === 'op,op_id' && body.op === 'begin' && typeof body.op_id === 'string' && OP_ID_RE.test(body.op_id)) {
    return { kind: 'begin', opId: body.op_id };
  }
  if (
    keys === 'op,op_id,op_token'
    && body.op === 'execute'
    && typeof body.op_id === 'string'
    && OP_ID_RE.test(body.op_id)
    && typeof body.op_token === 'string'
    && OP_TOKEN_RE.test(body.op_token)
  ) {
    return { kind: 'execute', opId: body.op_id, opToken: body.op_token };
  }
  return null;
}

export type ReceiptLookupRequest =
  | { kind: 'receipt'; opId: string }
  | { kind: 'recover'; opId: string; opToken: string; ownerId: string };

/**
 * account-deletion-receipt bodies: `{op_id}` reads a completed receipt (anyone
 * holding the number); `{op_id, op_token, owner_id}` is this device asking about
 * its own request, answered only when the HMAC binds all three.
 */
export function parseReceiptLookupBody(body: Record<string, unknown>): ReceiptLookupRequest | null {
  const keys = Object.keys(body).sort().join(',');
  if (keys === 'op_id') {
    return typeof body.op_id === 'string' && OP_ID_RE.test(body.op_id) ? { kind: 'receipt', opId: body.op_id } : null;
  }
  if (
    keys === 'op_id,op_token,owner_id'
    && typeof body.op_id === 'string'
    && OP_ID_RE.test(body.op_id)
    && typeof body.op_token === 'string'
    && OP_TOKEN_RE.test(body.op_token)
    && typeof body.owner_id === 'string'
    && OP_ID_RE.test(body.owner_id)
  ) {
    return { kind: 'recover', opId: body.op_id, opToken: body.op_token, ownerId: body.owner_id };
  }
  return null;
}

export interface PublicReceipt {
  op_id: string;
  erased_at: string;
  expires_at: string;
  sweeps: Partial<Record<SweepKey, boolean | null>>;
  sweeps_reported: boolean;
  /** True when the server confirmed the erasure without the trigger's record. */
  unrecorded: boolean;
}

function isoText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Copy only the known receipt fields of a completed op row; anything else stays server-side. */
export function publicReceipt(value: unknown, expectedOpId: string): PublicReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.op_id !== expectedOpId || row.status !== 'completed') return null;
  const erasedAt = isoText(row.finished_at);
  const expiresAt = isoText(row.receipt_expires_at);
  if (erasedAt === null || expiresAt === null) return null;
  const sweeps: Partial<Record<SweepKey, boolean | null>> = {};
  let unrecorded = false;
  if (row.sweeps && typeof row.sweeps === 'object' && !Array.isArray(row.sweeps)) {
    const raw = row.sweeps as Record<string, unknown>;
    for (const key of SWEEP_KEYS) {
      const flag = raw[key];
      if (typeof flag === 'boolean' || flag === null) sweeps[key] = flag;
    }
    unrecorded = raw.unrecorded === true;
  }
  return {
    op_id: expectedOpId,
    erased_at: erasedAt,
    expires_at: expiresAt,
    sweeps,
    sweeps_reported: row.sweeps_reported === true,
    unrecorded,
  };
}

/** The status and issue time from a device-recovery read (get_account_deletion_op with a token hash). */
export function recoveryRow(value: unknown, expectedOpId: string): { status: OpStatus; issuedMs: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.op_id !== expectedOpId || typeof row.status !== 'string' || !OP_STATUSES.has(row.status)) return null;
  const issuedMs = row.token_issued_ms;
  if (typeof issuedMs !== 'number' || !Number.isSafeInteger(issuedMs) || issuedMs <= 0) return null;
  return { status: row.status as OpStatus, issuedMs };
}

/** The sweep observations delete-account records after Auth deletion, allow-listed. */
export function sweepsForRecord(flags: Partial<Record<SweepKey, boolean | null>>): Record<string, boolean | null> {
  const out: Record<string, boolean | null> = {};
  for (const key of SWEEP_KEYS) {
    const flag = flags[key];
    if (typeof flag === 'boolean' || flag === null) out[key] = flag;
  }
  return out;
}
