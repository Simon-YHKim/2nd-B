// The account deletion receipt is the SERVER's record (0217, Simon decision
// Q-261004-42 = A; docs/design/deletion-receipt-server-261006.md 3.4). This
// module only reads it back through the account-deletion-receipt Edge function.
//
// Two questions, both asked with the publishable key (the person who deleted an
// account has no session), exactly like peer-respond:
//   - fetchAccountDeletionReceipt(opId): the receipt for a number. Anyone who
//     holds the number may read it; a receipt holds no account identifier.
//   - fetchAccountDeletionOpStatus({opId, token, owner}): THIS device asking about
//     its own request. The server answers only when the HMAC token binds the op
//     to the owner id the device remembers (I4).
//
// Both are three-way (I5): a definite answer, "the server says there is none",
// and "unknown" (network, timeout, an undeployed function, a malformed body).
// Unknown is never folded into "none".
import { getEnv } from "../env";
import type { LocalPurgeOutcome } from "./deletion-completion";

export const RECEIPT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The route that shows one receipt. In the (auth) group: readable signed out. */
export const ACCOUNT_DELETED_ROUTE = "/account-deleted";

/** Per-call bound for one lookup. */
export const ACCOUNT_DELETION_LOOKUP_MS = 8_000;

export type { LocalPurgeOutcome };
export type LocalSignOutOutcome = "complete" | "unconfirmed";
export type DeletionOpStatus = "accepted" | "executing" | "completed" | "failed" | "abandoned";

/** Three-valued: true confirmed, false reported unfinished, null not reported. */
export interface ReceiptSweeps {
  profileErased: boolean | null;
  deletionFenced: boolean | null;
  rawClippingsErased: boolean | null;
  rawClippingsEmptyAtCheck: boolean | null;
}

export interface ServerDeletionReceipt {
  opId: string;
  erasedAtIso: string;
  expiresAtIso: string;
  sweeps: ReceiptSweeps;
  /** False when the function stopped after the erasure and before it recorded these. */
  sweepsReported: boolean;
  /** The server confirmed the erasure without the trigger's record (0217 settle). */
  unrecorded: boolean;
}

export type ReceiptLookup =
  | { status: "found"; receipt: ServerDeletionReceipt }
  | { status: "not-found" }
  | { status: "rate-limited" }
  | { status: "unavailable" };

export type OpStatusLookup =
  | { status: "known"; op: DeletionOpStatus; receipt: ServerDeletionReceipt | null }
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

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * The same conclusion delete-bulk.ts draws from a live response: raw clippings
 * are "erased" only when all three server observations agree.
 */
export function sweepsFromServer(raw: Record<string, unknown>): ReceiptSweeps {
  const deletionFenced = flag(raw.deletion_fenced);
  const emptyAtCheck = flag(raw.raw_clippings_empty_at_check);
  const reported = flag(raw.raw_clippings_erased);
  return {
    profileErased: flag(raw.profile_erased),
    deletionFenced,
    rawClippingsErased: reported === false
      ? false
      : reported === true && deletionFenced === true && emptyAtCheck === true
        ? true
        : null,
    rawClippingsEmptyAtCheck: emptyAtCheck,
  };
}

/** Strict reader for one receipt object. Anything unexpected is null, never "found". */
export function parseServerReceipt(value: unknown, expectedOpId: string): ServerDeletionReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const opId = normalizeReceiptId(row.op_id);
  const erasedAtIso = isoOrNull(row.erased_at);
  const expiresAtIso = isoOrNull(row.expires_at);
  if (opId === null || opId !== expectedOpId || erasedAtIso === null || expiresAtIso === null) return null;
  const sweeps = row.sweeps && typeof row.sweeps === "object" && !Array.isArray(row.sweeps)
    ? row.sweeps as Record<string, unknown>
    : {};
  return Object.freeze({
    opId,
    erasedAtIso,
    expiresAtIso,
    sweeps: Object.freeze(sweepsFromServer(sweeps)),
    sweepsReported: row.sweeps_reported === true,
    unrecorded: row.unrecorded === true,
  });
}

export function parseReceiptLookupResponse(body: unknown, opId: string): ReceiptLookup {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("receipt" in body)) return { status: "unavailable" };
  const raw = (body as { receipt: unknown }).receipt;
  if (raw === null) return { status: "not-found" };
  const receipt = parseServerReceipt(raw, opId);
  return receipt ? { status: "found", receipt } : { status: "unavailable" };
}

const OP_STATUSES: ReadonlySet<string> = new Set(["accepted", "executing", "completed", "failed", "abandoned"]);

export function parseOpStatusResponse(body: unknown, opId: string): OpStatusLookup {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("op" in body)) return { status: "unavailable" };
  const raw = (body as { op: unknown }).op;
  if (raw === null) return { status: "not-found" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { status: "unavailable" };
  const op = raw as Record<string, unknown>;
  if (typeof op.status !== "string" || !OP_STATUSES.has(op.status)) return { status: "unavailable" };
  const status = op.status as DeletionOpStatus;
  if (status !== "completed") return { status: "known", op: status, receipt: null };
  // A completed op must come with its receipt; one without is not a definite answer.
  const receipt = parseServerReceipt(op.receipt, opId);
  return receipt ? { status: "known", op: status, receipt } : { status: "unavailable" };
}

type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface LookupOptions {
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

async function postLookup(
  body: Record<string, string>,
  options: LookupOptions,
): Promise<{ status: number; body: unknown } | null> {
  const timeoutMs = Math.max(0, options.timeoutMs ?? ACCOUNT_DELETION_LOOKUP_MS);
  if (timeoutMs === 0) return null;
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
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** The receipt for a number. Never throws; unknown is "unavailable", never "not-found". */
export async function fetchAccountDeletionReceipt(opId: string, options: LookupOptions = {}): Promise<ReceiptLookup> {
  const id = normalizeReceiptId(opId);
  if (id === null) return { status: "not-found" };
  const response = await postLookup({ op_id: id }, options);
  if (response === null) return { status: "unavailable" };
  if (response.status === 429) return { status: "rate-limited" };
  if (response.status !== 200) return { status: "unavailable" };
  return parseReceiptLookupResponse(response.body, id);
}

/** This device's own request. Never throws; unknown is "unavailable". */
export async function fetchAccountDeletionOpStatus(
  input: { opId: string; token: string; owner: string },
  options: LookupOptions = {},
): Promise<OpStatusLookup> {
  const opId = normalizeReceiptId(input.opId);
  const owner = normalizeReceiptId(input.owner);
  if (opId === null || owner === null) return { status: "unavailable" };
  const response = await postLookup({ op_id: opId, op_token: input.token, owner_id: owner }, options);
  if (response === null || response.status !== 200) return { status: "unavailable" };
  return parseOpStatusResponse(response.body, opId);
}

/**
 * Whether this device is KNOWN to be signed out. `sessionUnavailable` means the
 * session state is UNKNOWN (AuthContext AUTH-01), not "signed out", and a held
 * owner transition means an account is about to be published. Neither may read
 * a receipt or start the pending-deletion pass (gates DEL2-R1-01 / D2A-05).
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

/**
 * A receipt number typed into a web link as a URL FRAGMENT (`#r=<number>`). A
 * fragment never reaches a server or a hosting log (gate DEL2-R1-06); the screen
 * reads it once and removes it from the address bar.
 */
export function receiptIdFromFragment(hash: string | null | undefined): string | null {
  if (typeof hash !== "string") return null;
  const match = /^#r=([0-9a-fA-F-]{36})$/.exec(hash.trim());
  return match ? normalizeReceiptId(match[1]) : null;
}
