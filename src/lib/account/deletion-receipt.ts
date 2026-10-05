// The account deletion receipt lives on the server (0217, Simon decision
// Q-261004-42 = A). This module only reads it back by number and builds the
// route that shows it.
//
// Why the app no longer carries the receipt itself: an in-memory notice handed
// from the privacy screen to the sign-in screen needed five review rounds of
// owner/epoch fences and still ended up showing A's receipt on B's sign-in
// screen during an account switch (PR #2054 gates DEL-N1-01, DEL-N2-01). Now
// the server records the receipt in the same transaction that erases the
// profile row, and the app holds nothing but the receipt NUMBER in a route URL.
// A receipt has no account identifier, so the number is all it can be found by.
//
// The lookup goes through the account-deletion-receipt Edge function with the
// publishable key, exactly like peer-respond: the person who just deleted an
// account has no session to send.
import { getEnv } from "../env";

export const RECEIPT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The route that shows one receipt. In the (auth) group: readable signed out. */
export const ACCOUNT_DELETED_ROUTE = "/account-deleted";

/** Per-call bound for one receipt lookup. */
export const ACCOUNT_DELETION_RECEIPT_LOOKUP_MS = 8_000;

export type LocalPurgeOutcome = "complete" | "retry-scheduled" | "unconfirmed";
export type LocalSignOutOutcome = "complete" | "unconfirmed";

/** The six observations the Edge function records (0217 allow-list). */
export type ServerSweepKey =
  | "profile_erased"
  | "deletion_fenced"
  | "raw_clippings_erased"
  | "raw_clippings_empty_at_check"
  | "record_photos_erased"
  | "record_photos_empty_at_check";

const SWEEP_KEYS: readonly ServerSweepKey[] = [
  "profile_erased",
  "deletion_fenced",
  "raw_clippings_erased",
  "raw_clippings_empty_at_check",
  "record_photos_erased",
  "record_photos_empty_at_check",
];

export interface ServerDeletionReceipt {
  id: string;
  erasedAtIso: string;
  expiresAtIso: string;
  /** Three-valued: true confirmed, false reported unfinished, null not reported. */
  sweeps: Readonly<Record<ServerSweepKey, boolean | null>>;
  /** False when the function died after the profile erasure and before it wrote these. */
  sweepsReported: boolean;
}

export type ReceiptLookup =
  | { status: "found"; receipt: ServerDeletionReceipt }
  | { status: "not-found" }
  | { status: "unavailable" };

/** Trim + lowercase a typed or routed number; null unless it is a UUID. */
export function normalizeReceiptId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  return RECEIPT_ID_RE.test(value) ? value : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Strict reader for the Edge response. Anything unexpected is "unavailable", never "found". */
export function parseReceiptLookupBody(body: unknown, requestedId: string): ReceiptLookup {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "unavailable" };
  if (!("receipt" in body)) return { status: "unavailable" };
  const raw = (body as { receipt: unknown }).receipt;
  if (raw === null) return { status: "not-found" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { status: "unavailable" };
  const row = raw as Record<string, unknown>;
  const id = normalizeReceiptId(row.id);
  const erasedAtIso = isoOrNull(row.erased_at);
  const expiresAtIso = isoOrNull(row.expires_at);
  if (id === null || id !== requestedId || erasedAtIso === null || expiresAtIso === null) {
    return { status: "unavailable" };
  }
  const rawSweeps = row.sweeps && typeof row.sweeps === "object" && !Array.isArray(row.sweeps)
    ? row.sweeps as Record<string, unknown>
    : {};
  const sweeps = {} as Record<ServerSweepKey, boolean | null>;
  for (const key of SWEEP_KEYS) {
    const flag = rawSweeps[key];
    sweeps[key] = typeof flag === "boolean" ? flag : null;
  }
  return {
    status: "found",
    receipt: Object.freeze({
      id,
      erasedAtIso,
      expiresAtIso,
      sweeps: Object.freeze(sweeps),
      sweepsReported: row.sweeps_reported === true,
    }),
  };
}

type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Ask the server for one receipt. Never throws: a network failure, timeout,
 * missing function or malformed answer is "unavailable", which callers must
 * keep distinct from "not-found" (a definite answer from a live lookup).
 */
export async function fetchAccountDeletionReceipt(
  receiptId: string,
  options: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<ReceiptLookup> {
  const id = normalizeReceiptId(receiptId);
  if (id === null) return { status: "not-found" };
  const timeoutMs = Math.max(0, options.timeoutMs ?? ACCOUNT_DELETION_RECEIPT_LOOKUP_MS);
  if (timeoutMs === 0) return { status: "unavailable" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const env = getEnv();
    const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
    const response = await fetchImpl(`${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/account-deletion-receipt`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ receipt_id: id }),
      signal: controller.signal,
    });
    if (response.status !== 200 || !response.ok) return { status: "unavailable" };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { status: "unavailable" };
    }
    return parseReceiptLookupBody(body, id);
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The route the deletion flow opens. Only the receipt NUMBER and an opaque
 * one-time token go into the URL - no account id, email, token or receipt body.
 *
 * The token (`op`) is the ONLY thing that ties this route to the deletion this
 * device just finished. The local observations themselves (purge and sign-out
 * results) stay in memory (deletion-local-outcome.ts), bound to that token and
 * to the receipt number. They used to travel as `done`, `local` and `signout`
 * query values, and anyone could open
 * `/account-deleted?done=1&local=complete&signout=complete` and be told that an
 * account deletion was confirmed and this device was cleaned (gates
 * DEL2-R1-05 / D2A-06). A copied, forged or reloaded link now carries no claim:
 * it shows only what the server says for the number, or the lookup form.
 */
export function buildAccountDeletedHref(input: { receiptId: string | null; op: string | null }): string {
  const params = new URLSearchParams();
  const id = normalizeReceiptId(input.receiptId);
  if (id !== null) params.set("receipt", id);
  const op = normalizeReceiptId(input.op);
  if (op !== null) params.set("op", op);
  const query = params.toString();
  return query ? `${ACCOUNT_DELETED_ROUTE}?${query}` : ACCOUNT_DELETED_ROUTE;
}

function firstParam(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

export interface AccountDeletedParams {
  receiptId: string | null;
  /** The one-time token of a deletion finished on this device; proves nothing by itself. */
  op: string | null;
}

/** Route params are untrusted text: unknown values become null, never a claim. */
export function parseAccountDeletedParams(params: Record<string, unknown>): AccountDeletedParams {
  return {
    receiptId: normalizeReceiptId(firstParam(params.receipt)),
    op: normalizeReceiptId(firstParam(params.op)),
  };
}

/**
 * Whether this device is KNOWN to be signed out. `sessionUnavailable` means the
 * session state is UNKNOWN (AuthContext AUTH-01), not "signed out", and a held
 * owner transition means an account is about to be published. Neither may read
 * a receipt or start the pending-deletion sweep (gates DEL2-R1-01 / D2A-05).
 */
export function knownSignedOut(input: {
  loading: boolean;
  userId: string | null;
  sessionUnavailable: boolean;
  transitionPending: boolean;
}): boolean {
  return !input.loading
    && !input.transitionPending
    && !input.sessionUnavailable
    && input.userId === null;
}
