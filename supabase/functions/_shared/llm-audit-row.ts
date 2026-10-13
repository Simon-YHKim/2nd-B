// The audit row a proxy writes for one model call (C3), and the chat turn it answers (0255, Z46).
// Deno-free, so it is unit-testable under ts-jest; the four LLM proxies share it so they cannot drift.

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The unique index that keeps one chat turn on one audit row (0255). */
export const CHAT_TURN_INDEX = 'ai_audit_log_chat_turn_id_key';
const WARN_DETAIL_MAX = 80;

/**
 * The chat turn id an app sent with a chat call, or null. Only the shape is read here. Whether the
 * turn is the caller's, was counted, and is still waiting is the database's to say when a refund is
 * asked for (refund_chat_turn_after_output_swap reads the caller's own chat_usage row).
 */
export function readChatTurnId(purpose: string | null | undefined, raw: unknown): string | null {
  if (purpose !== 'secondb_chat' || typeof raw !== 'string') return null;
  return UUID_SHAPE.test(raw) ? raw.toLowerCase() : null;
}

type InsertResult = { data: unknown; error: unknown };
type AuditAdmin = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => { single: () => PromiseLike<InsertResult> };
    };
  };
};

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const e = error as { message?: unknown; details?: unknown; code?: unknown };
  return [e.code, e.message, e.details].filter((part) => typeof part === 'string').join(' ');
}

function turnAlreadyAnswered(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: unknown }).code === '23505' && errorText(error).includes(CHAT_TURN_INDEX);
}

/**
 * Writes the audit row and says whether that very row is there.
 *
 * True only when the insert came back with the row it was given (same id). An insert that reports no
 * error but stores nothing does not count, so a caller never hands out the id of a row that does not
 * exist.
 *
 * A row that names a chat turn which already has an audit row is refused by the table: one turn, one
 * row. The call is then still audited, without the turn. That row gives nothing back, because the
 * refund asks for a row that carries its turn.
 *
 * Never throws. A failed audit write must not fail the call it describes.
 */
export async function insertLlmAuditRow(
  admin: AuditAdmin,
  row: Record<string, unknown> & { id: string },
  tag: string,
): Promise<boolean> {
  const attempt = async (candidate: Record<string, unknown>): Promise<{ stored: boolean; error: unknown }> => {
    const { data, error } = await admin.from('ai_audit_log').insert(candidate).select('id').single();
    const stored = !error && !!data && typeof data === 'object' && (data as { id?: unknown }).id === row.id;
    return { stored, error };
  };
  try {
    let result = await attempt(row);
    if (!result.stored && row.chat_turn_id != null && turnAlreadyAnswered(result.error)) {
      const { chat_turn_id: _answeredElsewhere, ...withoutTurn } = row;
      result = await attempt(withoutTurn);
    }
    if (!result.stored) {
      console.warn(`[${tag}] audit insert failed:`, errorText(result.error).slice(0, WARN_DETAIL_MAX) || 'no row returned');
    }
    return result.stored;
  } catch (e) {
    console.warn(`[${tag}] audit insert threw:`, String(e).slice(0, WARN_DETAIL_MAX));
    return false;
  }
}
