// Finance IN-bound data source (O-R3 Wave 2): foreign-exchange rates.
// The money_check ops domain uses a deterministic manual ledger (ledger.ts) as
// its core; FX is the optional enrichment that converts a multi-currency entry
// to KRW for the monthly summary.
//
// Source: 한국수출입은행 (Korea Eximbank) OpenAPI — free, but the auth key is
// issued per account with quota attached, so it is not a client value. It lives
// in the public-data-proxy Edge Function as a Supabase secret; this module sends
// no key and holds none. No LLM (no C1/C3/C9), no new dependency.
//
// With the secret unset server-side (or a signed-out caller) this degrades to []
// so the ledger still works in KRW-only mode, exactly as it did when the free
// key was simply not registered.
//
// 2026-09-08: this module used to read `process.env.EXPO_PUBLIC_EXIM_FX_KEY`.
// The retired variable and its history are in docs/PUBLIC-DATA-KEY-RETIREMENT.md.

import { invokePublicData } from "../public-data/invoke";

export interface FxRate {
  /** ISO-ish currency unit as returned, e.g. "USD", "JPY(100)". */
  currency: string;
  /** Standard rate in KRW per unit (deal_bas_r), parsed from the comma string. */
  rateKrw: number;
  /** Korean name of the currency, when present. */
  name?: string;
}

// oapi.* host: the old www.koreaexim.go.kr OpenAPI domain was retired (Eximbank
// migration, old host discontinued 2026-04-30). Path + params are unchanged.
// Composed server-side now (public-data-proxy/index.ts:upstreamUrlFor); kept here
// as the contract the proxy is string-compared against
// (public-data-proxy-contract.test.ts).
export const EXIM_ENDPOINT = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";

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

export type FxFetchError = "no_key" | "fetch_failed" | "bad_response";

/** Pure: the request body the proxy expects for the daily FX table. */
export function fxRatesBody(): { source: "exim" } {
  return { source: "exim" };
}

/**
 * Fetch today's FX table from Eximbank through the public-data-proxy Edge
 * Function. Returns [] — KRW-only mode — when the proxy has no EXIM secret
 * configured (503) or the caller is signed out (401), so the ledger is never
 * blocked. A real outage throws, as before.
 */
export async function fetchFxRates(
  opts: { signal?: AbortSignal } = {},
): Promise<FxRate[]> {
  const outcome = await invokePublicData(fxRatesBody(), opts.signal);
  if (!outcome.ok) {
    if (outcome.reason === "unconfigured") return [];
    throw outcome.reason as FxFetchError;
  }
  return parseEximFx(outcome.data);
}
