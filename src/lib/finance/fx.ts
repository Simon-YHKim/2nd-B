// Finance IN-bound data source (O-R3 Wave 2): foreign-exchange rates.
// The money_check ops domain uses a deterministic manual ledger (ledger.ts) as
// its core; FX is the optional enrichment that converts a multi-currency entry
// to KRW for the monthly summary.
//
// Source: 한국수출입은행 (Korea Eximbank) OpenAPI. The app calls the authenticated
// public-data-proxy; provider credentials and upstream routing stay server-side.
// No LLM (no C1/C3/C9), no new dependency.

import { getSupabaseClient } from "../supabase/client";

export interface FxRate {
  /** ISO-ish currency unit as returned, e.g. "USD", "JPY(100)". */
  currency: string;
  /** Standard rate in KRW per unit (deal_bas_r), parsed from the comma string. */
  rateKrw: number;
  /** Korean name of the currency, when present. */
  name?: string;
}

/** Parse "1,303.5" / "1,234" style numbers (Eximbank returns comma strings). */
export function parseRateNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/,/g, "").trim();
  if (cleaned.length === 0) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Defensive parse of the Eximbank JSON array → FxRate[]. result===1 rows only. */
export function parseEximFx(json: unknown): FxRate[] {
  if (!Array.isArray(json)) return [];
  const out: FxRate[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    // Eximbank: result===1 means OK; other codes are error rows.
    if (typeof row.result === "number" && row.result !== 1) continue;
    const currency = typeof row.cur_unit === "string" ? row.cur_unit.trim() : "";
    const rateKrw = parseRateNumber(row.deal_bas_r);
    if (!currency || rateKrw === undefined) continue;
    const rate: FxRate = { currency, rateKrw };
    if (typeof row.cur_nm === "string" && row.cur_nm.trim()) rate.name = row.cur_nm.trim();
    out.push(rate);
  }
  return out;
}

/** Find a rate by currency code (matches the leading code, ignoring "(100)"). */
export function fxRateFor(rates: ReadonlyArray<FxRate>, currency: string): FxRate | undefined {
  const want = currency.trim().toUpperCase();
  if (!want) return undefined;
  return rates.find((r) => r.currency.toUpperCase().startsWith(want));
}

/**
 * Convert an amount in `currency` to KRW using the rates. JPY/IDR etc. are quoted
 * per 100 units by Eximbank (cur_unit like "JPY(100)"), so we divide by the unit
 * size encoded in the code. Returns undefined when the currency isn't found.
 */
export function convertToKrw(
  amount: number,
  currency: string,
  rates: ReadonlyArray<FxRate>,
): number | undefined {
  const rate = fxRateFor(rates, currency);
  if (!rate) return undefined;
  const unitMatch = rate.currency.match(/\((\d+)\)/);
  const unit = unitMatch ? Number(unitMatch[1]) : 1;
  const per = unit > 0 ? rate.rateKrw / unit : rate.rateKrw;
  return Math.round(amount * per);
}

export type FxFetchError =
  | "no_key"
  | "fetch_failed"
  | "bad_response"
  | "proxy_unavailable"
  | "proxy_quota_exceeded"
  | "provider_key_rejected"
  | "provider_quota_exceeded"
  | "provider_rejected";

const PASSTHROUGH_PROXY_ERRORS = new Set<FxFetchError>([
  "proxy_quota_exceeded",
  "provider_key_rejected",
  "provider_quota_exceeded",
  "provider_rejected",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function classifyInvokeError(error: unknown): Promise<FxFetchError> {
  const context = isRecord(error) && isRecord(error.context) ? error.context : undefined;
  const status = typeof context?.status === "number" ? context.status : undefined;
  try {
    const readable = typeof context?.clone === "function" ? context.clone() : context;
    const payload =
      readable && typeof readable.json === "function" ? await readable.json() : undefined;
    const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : "";
    if (PASSTHROUGH_PROXY_ERRORS.has(code as FxFetchError)) return code as FxFetchError;
    if (code === "upstream_bad_payload") return "bad_response";
  } catch {
    // Fall back to the HTTP status when the error body is unavailable.
  }
  if (status === 429) return "proxy_quota_exceeded";
  if (status === 502 || status === 504) return "fetch_failed";
  return "proxy_unavailable";
}

/**
 * Fetch today's FX table through the authenticated public-data proxy.
 * `authKey` remains as an ignored compatibility field so older callers compile;
 * credentials are never accepted from the client or forwarded to the proxy.
 */
export async function fetchFxRates(
  opts: { authKey?: string; signal?: AbortSignal } = {},
): Promise<FxRate[]> {
  let result: Awaited<ReturnType<ReturnType<typeof getSupabaseClient>["functions"]["invoke"]>>;
  try {
    result = await getSupabaseClient().functions.invoke("public-data-proxy", {
      body: { provider: "exim_fx" },
      signal: opts.signal,
    });
  } catch {
    throw "proxy_unavailable" as FxFetchError;
  }
  if (result.error) throw await classifyInvokeError(result.error);
  if (
    !isRecord(result.data) ||
    result.data.provider !== "exim_fx" ||
    !Array.isArray(result.data.data)
  ) {
    throw "bad_response" as FxFetchError;
  }
  return parseEximFx(result.data.data);
}
