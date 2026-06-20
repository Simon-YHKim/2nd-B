// Finance IN-bound data source (O-R3 Wave 2): foreign-exchange rates.
// The money_check ops domain uses a deterministic manual ledger (ledger.ts) as
// its core; FX is the optional enrichment that converts a multi-currency entry
// to KRW for the monthly summary.
//
// Source: 한국수출입은행 (Korea Eximbank) OpenAPI — free, but requires a free
// auth key the user registers once (mild Simon-console gate). The client is
// fully implemented and KEY-PARAMETERIZED: with no key it degrades to [] so the
// ledger still works in KRW-only mode. No LLM (no C1/C3/C9), no new dependency.
//
// Activation: set EXPO_PUBLIC_EXIM_FX_KEY (or pass authKey). For production a
// thin edge proxy is preferable so the key isn't bundled, but KRW-only works
// with no key at all.

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
const EXIM_ENDPOINT = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";

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

/**
 * Fetch today's FX table from Eximbank. With no auth key (env unset and none
 * passed) it returns [] — KRW-only mode — instead of throwing, so the ledger is
 * never blocked by the missing free key.
 */
export async function fetchFxRates(
  opts: { authKey?: string; signal?: AbortSignal } = {},
): Promise<FxRate[]> {
  const authKey = opts.authKey ?? process.env.EXPO_PUBLIC_EXIM_FX_KEY ?? "";
  if (!authKey) return [];
  const url = `${EXIM_ENDPOINT}?authkey=${encodeURIComponent(authKey)}&data=AP01`;
  let res: Response;
  try {
    res = await fetch(url, { signal: opts.signal, headers: { Accept: "application/json" } });
  } catch {
    throw "fetch_failed" as FxFetchError;
  }
  if (!res.ok) throw "fetch_failed" as FxFetchError;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw "bad_response" as FxFetchError;
  }
  return parseEximFx(json);
}
