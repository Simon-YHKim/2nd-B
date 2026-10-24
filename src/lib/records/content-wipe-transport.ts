import { abortError } from "../async/abort";
import { getEnv } from "../env";

/** Private transport input, captured before the ledger's final issue gate. */
export type CapturedContentWipeRequest = Readonly<{
  userId: string;
  accessToken: string;
  signal: AbortSignal;
}>;

const OWNER_COLUMN = {
  wiki_pages: "user_id", sources: "user_id", records: "user_id",
  chat_usage: "user_id", self_contexts: "user_id", clipper_templates: "owner_id",
} as const;
export type ContentWipeTable = keyof typeof OWNER_COLUMN;
export type DeletedRecordRows =
  | Readonly<{ state: "complete"; rows: readonly Readonly<{ structured: unknown }>[] }>
  | Readonly<{ state: "unconfirmed" }>;
export type ContentWipeDeleteResult =
  | Readonly<{ outcome: "committed"; count: number; recordRows?: DeletedRecordRows }>
  | Readonly<{ outcome: "definitely-not-committed" | "unknown"; count: null }>;

const unknownResult = (): ContentWipeDeleteResult => ({ outcome: "unknown", count: null });
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isJson = (response: Response) =>
  response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";

/** No auth lookup or I/O. Shared only by these dormant, single-request transports. */
export function prepareContentWipeRequest(request: CapturedContentWipeRequest) {
  const { userId, accessToken, signal } = request;
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(userId)
    || typeof accessToken !== "string" || !accessToken.trim() || /[\r\n]/.test(accessToken)
    || !signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function") {
    throw new Error("content_wipe_request_invalid");
  }
  if (signal.aborted) throw abortError();
  const env = getEnv();
  return {
    userId, signal, baseUrl: env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, ""),
    headers: { Authorization: `Bearer ${accessToken}`, apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      "content-type": "application/json", Accept: "application/json" },
  };
}

/**
 * Review #2627 r4 -> Q-261018-60 가: a visible Preference-Applied commits only in a known shape. This request sends
 * `count=exact,return=minimal|representation`, so the known shape is exactly one `count=exact` and at most one
 * `return=` of the mode this table asked for (records: representation, every other table: minimal), comma
 * separated with optional spaces or tabs around the commas.
 * No ";" parameters, no other preference, no empty element, no quoting or spacing inside an element. Names and
 * values compare case-insensitively. Anything else - including spellings that merely agree - stays unknown.
 */
function knownAppliedPreferences(header: string, expectedReturn: "minimal" | "representation"): boolean {
  const elements = header.split(",").map(element => element.replace(/^[ \t]+|[ \t]+$/g, "").toLowerCase());
  const counts = elements.filter(element => element === "count=exact").length;
  // Review #2627 r5 (Q-261018-63 가): a visible return must be the mode this table asked for.
  const returns = elements.filter(element => element === `return=${expectedReturn}`).length;
  return counts === 1 && returns <= 1 && counts + returns === elements.length;
}

function exactDeleteCount(response: Response, expectedReturn: "minimal" | "representation"): number | null {
  // Our fixed count=exact DELETE gets the mutation CTE's actual count as */N.
  // PostgREST CORS exposes Content-Range, but not Preference-Applied. When the
  // latter is readable, reject contradictions; its absence is not missing count
  // proof. This requires the normal commit endpoint documented for this adapter.
  const match = /^\*\/(0|[1-9]\d*)$/.exec(response.headers.get("content-range") ?? "");
  if (!match) return null;
  const applied = response.headers.get("preference-applied");
  if (applied !== null) {
    // Visible: only the known shape commits (knownAppliedPreferences); everything else stays unknown.
    if (!knownAppliedPreferences(applied, expectedReturn)) return null;
  }
  const count = Number(match[1]);
  return Number.isSafeInteger(count) ? count : null;
}

function confirmedDatabaseRejection(status: number, value: unknown): boolean {
  // PostgREST errors + transaction docs: these SQL failures roll back the statement.
  // An arbitrary HTTP failure, similar message, or Storage error is not this proof.
  if (!isObject(value) || typeof value.message !== "string" || !value.message
    || !(value.details === null || typeof value.details === "string")
    || !(value.hint === null || typeof value.hint === "string")) return false;
  return (value.code === "42501" && (status === 401 || status === 403))
    || (value.code === "23503" && status === 409)
    || (value.code === "23514" && status === 400)
    || (value.code === "P0001" && status === 400);
}

function recordRows(value: unknown, count: number): DeletedRecordRows {
  if (!Array.isArray(value) || value.length !== count) return { state: "unconfirmed" };
  const rows: { structured: unknown }[] = [];
  for (const row of value) {
    if (!isObject(row) || !Object.prototype.hasOwnProperty.call(row, "structured")) return { state: "unconfirmed" };
    rows.push(Object.freeze({ structured: row.structured }));
  }
  return { state: "complete", rows: Object.freeze(rows) };
}

/**
 * One physical DELETE, for the future content-wipe executor only. The caller must
 * acquire/issue its ledger ticket before entering. This is not deletion authority.
 * Results describe this DB request; a records commit does not confirm its photos.
 */
export async function deleteContentRowsCaptured(
  table: ContentWipeTable, request: CapturedContentWipeRequest,
): Promise<ContentWipeDeleteResult> {
  if (!Object.prototype.hasOwnProperty.call(OWNER_COLUMN, table)) throw new Error("content_wipe_table_invalid");
  const captured = prepareContentWipeRequest(request);
  const query = new URLSearchParams({ [OWNER_COLUMN[table]]: `eq.${captured.userId}` });
  if (table === "records") query.set("select", "structured");
  try {
    // No await/thenable/auth callback before fetch, and no retry or redirect replay.
    const response = await globalThis.fetch(`${captured.baseUrl}/rest/v1/${table}?${query}`, {
      method: "DELETE", headers: { ...captured.headers,
        Prefer: `count=exact,return=${table === "records" ? "representation" : "minimal"}` },
      signal: captured.signal, redirect: "error",
    });
    if (!response.ok) {
      const value: unknown = isJson(response) ? await response.json() : null;
      return confirmedDatabaseRejection(response.status, value)
        ? { outcome: "definitely-not-committed", count: null } : unknownResult();
    }
    if (response.status !== (table === "records" ? 200 : 204)) return unknownResult();
    const count = exactDeleteCount(response, table === "records" ? "representation" : "minimal");
    if (count === null) return unknownResult();
    if (table !== "records") return { outcome: "committed", count };
    if (!isJson(response)) return unknownResult();
    const value: unknown = await response.json();
    // Preserve a confirmed DB count even if the returned row set cannot make a plan.
    return { outcome: "committed", count, recordRows: recordRows(value, count) };
  } catch { return unknownResult(); }
}
