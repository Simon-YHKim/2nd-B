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
 * Review #2627 r2: read Preference-Applied as RFC 7240 preferences - token [BWS "=" BWS (token /
 * quoted-string)] followed by ";" parameters, comma-separated with optional whitespace and empty
 * elements. Names and values compare case-insensitively; parameters are ignored. Anything that does
 * not parse returns null so the caller treats the response as unconfirmed.
 */
function parsePreferenceApplied(header: string): readonly Readonly<{ name: string; value: string | null }>[] | null {
  const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+/;
  const preferences: { name: string; value: string | null }[] = [];
  let at = 0;
  const skipSpace = () => { while (header[at] === " " || header[at] === "\t") at++; };
  const token = (): string | null => {
    const match = TOKEN.exec(header.slice(at));
    if (!match) return null;
    at += match[0].length;
    return match[0];
  };
  const word = (): string | null => {
    if (header[at] !== "\"") return token();
    at++;
    let value = "";
    while (at < header.length) {
      const char = header[at];
      if (char === "\"") { at++; return value; }
      if (char === "\\") {
        if (at + 1 >= header.length) return null;
        value += header[at + 1];
        at += 2;
        continue;
      }
      if (char === "\r" || char === "\n") return null;
      value += char;
      at++;
    }
    return null;
  };
  const nameAndValue = (): { name: string; value: string | null } | null => {
    const name = token();
    if (name === null) return null;
    skipSpace();
    if (header[at] !== "=") return { name: name.toLowerCase(), value: null };
    at++;
    skipSpace();
    const value = word();
    return value === null ? null : { name: name.toLowerCase(), value: value.toLowerCase() };
  };
  for (;;) {
    skipSpace();
    if (at >= header.length) return preferences;
    if (header[at] === ",") { at++; continue; }
    const preference = nameAndValue();
    if (preference === null) return null;
    skipSpace();
    while (header[at] === ";") {
      at++;
      skipSpace();
      if (at < header.length && header[at] !== ";" && header[at] !== ",") {
        if (nameAndValue() === null) return null;
        skipSpace();
      }
    }
    if (at < header.length && header[at] !== ",") return null;
    preferences.push(preference);
  }
}

function exactDeleteCount(response: Response): number | null {
  // Our fixed count=exact DELETE gets the mutation CTE's actual count as */N.
  // PostgREST CORS exposes Content-Range, but not Preference-Applied. When the
  // latter is readable, reject contradictions; its absence is not missing count
  // proof. This requires the normal commit endpoint documented for this adapter.
  const match = /^\*\/(0|[1-9]\d*)$/.exec(response.headers.get("content-range") ?? "");
  if (!match) return null;
  const applied = response.headers.get("preference-applied");
  if (applied !== null) {
    // Visible: every count must be exact (and at least one present), every tx must be commit.
    const preferences = parsePreferenceApplied(applied);
    if (preferences === null) return null;
    const counts = preferences.filter(preference => preference.name === "count");
    if (counts.length === 0 || counts.some(preference => preference.value !== "exact")
      || preferences.some(preference => preference.name === "tx" && preference.value !== "commit")) return null;
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
    const count = exactDeleteCount(response);
    if (count === null) return unknownResult();
    if (table !== "records") return { outcome: "committed", count };
    if (!isJson(response)) return unknownResult();
    const value: unknown = await response.json();
    // Preserve a confirmed DB count even if the returned row set cannot make a plan.
    return { outcome: "committed", count, recordRows: recordRows(value, count) };
  } catch { return unknownResult(); }
}
