/** T39 A1-U: dormant receipt validation; a receipt does not prove model admission. */
export type ChatTurnReservation = Readonly<{ count: number; turnId: string }>;
export type ChatTurnUsage = ChatTurnReservation | Readonly<{ count: number; turnId: null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUsageCount(value: unknown): value is number {
  // Both SQL functions return a PostgreSQL int. The server owns cap + ad bonus.
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function parseChatUsageCount(value: unknown): number {
  if (!isUsageCount(value)) throw new Error("invalid_chat_usage_response");
  return value;
}

export function parseChatTurnReservation(value: unknown): ChatTurnReservation {
  if (!isRecord(value) || !isUsageCount(value.count)
    || typeof value.turnId !== "string" || !UUID.test(value.turnId)) {
    throw new Error("invalid_chat_turn_reservation_response");
  }
  return { count: value.count, turnId: value.turnId };
}

// PostgREST's current and older schema-cache messages identify argument names.
// 0255 takes exactly p_user_id and p_day, without p_cap.
const MISSING_CACHED_FUNCTION = /^Could not find (?:the function public\.bump_chat_usage_for_turn\((?:p_day, p_user_id|p_user_id, p_day)\)|the public\.bump_chat_usage_for_turn\((?:p_day, p_user_id|p_user_id, p_day)\) function) in the schema cache$/;
const MISSING_SQL_FUNCTION = /^function public\.bump_chat_usage_for_turn\((?:uuid, date|p_day => date, p_user_id => uuid|p_user_id => uuid, p_day => date)\) does not exist$/;

/**
 * Require HTTP status, SQL/PostgREST code and the exact message together.
 * A bare 404/42883 or a reference in details/hint can concern an inner function.
 * https://docs.postgrest.org/en/stable/references/errors.html
 * The API does not treat transport exceptions as a confirmed server rejection.
 */
export function classifyChatTurnError(error: unknown, status: number): "missing" | "limit" | "unknown" {
  if (!isRecord(error)) return "unknown";
  if (status === 400 && error.code === "P0001" && error.message === "chat_limit_exceeded") return "limit";
  if (status !== 404 || typeof error.message !== "string") return "unknown";
  if (error.code === "PGRST202" && MISSING_CACHED_FUNCTION.test(error.message)) return "missing";
  if (error.code === "42883" && MISSING_SQL_FUNCTION.test(error.message)) return "missing";
  return "unknown";
}
