// The audit row a proxy writes for one model call (C3), and the chat turn it answers (0255, Z46).
// Deno-free, so it is unit-testable under ts-jest; the four LLM proxies share it so they cannot drift.

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WARN_DETAIL_MAX = 80;
/** The function that binds an answer to a counted turn (0255). Only service_role may call it. */
export const CHAT_TURN_CLAIM_FN = 'claim_chat_turn_for_audit';
/**
 * How long a reply waits for that function, in every outcome. Past it the reply goes out unbound and
 * that turn gets no refund. One value on purpose: a reply must not wait longer on one path than another.
 */
export const CHAT_TURN_CLAIM_TIMEOUT_MS = 1500;

/**
 * The chat turn id an app sent with a chat call, or null. Only the shape is read here. Whether the
 * turn is the caller's, is still unanswered and was counted just now is the database's to say
 * (claim_chat_turn_for_audit reads its own reservation row); the id itself decides nothing.
 */
export function readChatTurnId(purpose: string | null | undefined, raw: unknown): string | null {
  if (purpose !== 'secondb_chat' || typeof raw !== 'string') return null;
  return UUID_SHAPE.test(raw) ? raw.toLowerCase() : null;
}

type DbResult = { data: unknown; error: unknown };
type AuditAdmin = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => { single: () => PromiseLike<DbResult> };
    };
  };
};
type ClaimAdmin = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<DbResult>;
};

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const e = error as { message?: unknown; details?: unknown; code?: unknown };
  return [e.code, e.message, e.details].filter((part) => typeof part === 'string').join(' ');
}

/**
 * Writes the audit row and says whether that very row is there.
 *
 * True only when the insert came back with the row it was given (same id). An insert that reports no
 * error but stores nothing does not count, so a caller never hands out the id of a row that does not
 * exist.
 *
 * Never throws. A failed audit write must not fail the call it describes.
 */
export async function insertLlmAuditRow(
  admin: AuditAdmin,
  row: Record<string, unknown> & { id: string },
  tag: string,
): Promise<boolean> {
  try {
    const { data, error } = await admin.from('ai_audit_log').insert(row).select('id').single();
    const stored = !error && !!data && typeof data === 'object' && (data as { id?: unknown }).id === row.id;
    if (!stored) {
      console.warn(`[${tag}] audit insert failed:`, errorText(error).slice(0, WARN_DETAIL_MAX) || 'no row returned');
    }
    return stored;
  } catch (e) {
    console.warn(`[${tag}] audit insert threw:`, String(e).slice(0, WARN_DETAIL_MAX));
    return false;
  }
}

/**
 * Asks the server to bind the audit row just written to the turn the app named, and says whether it did.
 *
 * The server decides: the reservation must be this user's, not answered yet and made in the last few
 * minutes, and the audit row must be this user's chat row written by a proxy just now. A turn id that
 * is someone else's, already answered, old, or made up binds nothing.
 *
 * Waits at most `timeoutMs`, whatever happens. Past that it answers false and the reply goes out; the
 * call itself is not cancelled, so a reservation may still be bound a moment later, and a refund asked
 * for after that finds it.
 *
 * Never throws. A reply must not fail, or wait without limit, for the bookkeeping of a refund.
 */
export async function claimChatTurn(
  admin: ClaimAdmin,
  ids: { userId: string; auditId: string; turnId: string },
  tag: string,
  timeoutMs: number = CHAT_TURN_CLAIM_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = Promise.resolve(
      admin.rpc(CHAT_TURN_CLAIM_FN, { p_user_id: ids.userId, p_audit_id: ids.auditId, p_turn_id: ids.turnId }),
    ).then(
      ({ data, error }) => {
        if (error) {
          console.warn(`[${tag}] chat turn claim failed:`, errorText(error).slice(0, WARN_DETAIL_MAX));
          return false;
        }
        return data === true;
      },
      (e) => {
        console.warn(`[${tag}] chat turn claim threw:`, String(e).slice(0, WARN_DETAIL_MAX));
        return false;
      },
    );
    const limit = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[${tag}] chat turn claim timed out after ${timeoutMs}ms`);
        resolve(false);
      }, timeoutMs);
    });
    return await Promise.race([call, limit]);
  } catch (e) {
    console.warn(`[${tag}] chat turn claim threw:`, String(e).slice(0, WARN_DETAIL_MAX));
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
