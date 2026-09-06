// Meals IN-bound data source (O-R3 Wave 2, weekly_meals / simple_meals): the
// 식약처(MFDS) 식품영양성분 DB via data.go.kr. Gives the meal planner real
// nutrition ground-truth so an idea can carry a kcal/macro reference instead of
// a guess.
//
// Harness-first / constraints:
//   - The authenticated public-data-proxy owns provider credentials, quotas,
//     and upstream routing. The app sends only a fixed operation and search input.
//   - Deterministic source (no LLM → no C1/C3/C9). No new dependency.
//   - NOT medical/diet advice: nutrition numbers are a reference only; surfaces
//     keep the plan/idea framing (vocabulary policy).
//   - Defensive parser tolerates the common data.go.kr response shapes and
//     several field-name spellings; junk is dropped, never trusted.

import { getSupabaseClient } from "../supabase/client";

export interface FoodNutrition {
  name: string;
  /** kcal per the serving the API reports; undefined when absent. */
  kcal?: number;
  carbsG?: number;
  proteinG?: number;
  fatG?: number;
}

const QUERY_MAX = 60;
const RESULT_MAX = 10;
const NAME_MAX = 120;

function num(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/,/g, "").trim();
  if (cleaned.length === 0) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function pickName(row: Record<string, unknown>): string | null {
  for (const k of ["FOOD_NM_KR", "DESC_KOR", "foodNmKr", "name"]) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, NAME_MAX);
  }
  return null;
}

function pickNum(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = num(row[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Find the items array under the shapes data.go.kr commonly returns. */
function extractItems(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  // newer flat shape: { body: { items: [...] } } or { items: [...] }
  const body = obj.body && typeof obj.body === "object" ? (obj.body as Record<string, unknown>) : undefined;
  const directItems = obj.items ?? body?.items;
  if (Array.isArray(directItems)) return directItems;
  // legacy nested shape: { response: { body: { items: { item: [...] } } } }
  const response = obj.response && typeof obj.response === "object" ? (obj.response as Record<string, unknown>) : undefined;
  const rBody = response?.body && typeof response.body === "object" ? (response.body as Record<string, unknown>) : undefined;
  const rItems = rBody?.items;
  if (Array.isArray(rItems)) return rItems;
  if (rItems && typeof rItems === "object") {
    const inner = (rItems as Record<string, unknown>).item;
    if (Array.isArray(inner)) return inner;
    if (inner && typeof inner === "object") return [inner];
  }
  return [];
}

/** Defensive parse → FoodNutrition[]. The network proposes; this clamps. */
export function parseFoodItems(json: unknown, max = RESULT_MAX): FoodNutrition[] {
  const items = extractItems(json);
  const out: FoodNutrition[] = [];
  for (const item of items) {
    if (out.length >= max) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = pickName(row);
    if (!name) continue;
    const food: FoodNutrition = { name };
    const kcal = pickNum(row, ["AMT_NUM1", "NUTR_CONT1", "enerc", "kcal"]);
    if (kcal !== undefined) food.kcal = kcal;
    const carbs = pickNum(row, ["AMT_NUM6", "NUTR_CONT2", "chocdf", "carbs"]);
    if (carbs !== undefined) food.carbsG = carbs;
    const protein = pickNum(row, ["AMT_NUM3", "NUTR_CONT3", "prot", "protein"]);
    if (protein !== undefined) food.proteinG = protein;
    const fat = pickNum(row, ["AMT_NUM4", "NUTR_CONT4", "fatce", "fat"]);
    if (fat !== undefined) food.fatG = fat;
    out.push(food);
  }
  return out;
}

/** @deprecated Direct provider URLs are disabled; use `searchFoods`. */
export function buildFoodSearchUrl(
  _query: string,
  _serviceKey: string,
  _max = RESULT_MAX,
): string {
  throw new Error("direct_provider_url_disabled");
}

function normalizeQuery(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(normalized).slice(0, QUERY_MAX).join("");
}

export type FoodSearchError =
  | "no_key"
  | "empty_query"
  | "fetch_failed"
  | "bad_response"
  | "proxy_unavailable"
  | "proxy_quota_exceeded"
  | "provider_key_rejected"
  | "provider_quota_exceeded"
  | "provider_rejected";

const PASSTHROUGH_PROXY_ERRORS = new Set<FoodSearchError>([
  "proxy_quota_exceeded",
  "provider_key_rejected",
  "provider_quota_exceeded",
  "provider_rejected",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function classifyInvokeError(error: unknown): Promise<FoodSearchError> {
  const context = isRecord(error) && isRecord(error.context) ? error.context : undefined;
  const status = typeof context?.status === "number" ? context.status : undefined;
  try {
    const readable = typeof context?.clone === "function" ? context.clone() : context;
    const payload =
      readable && typeof readable.json === "function" ? await readable.json() : undefined;
    const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : "";
    if (PASSTHROUGH_PROXY_ERRORS.has(code as FoodSearchError)) return code as FoodSearchError;
    if (code === "upstream_bad_payload") return "bad_response";
  } catch {
    // Fall back to the HTTP status when the error body is unavailable.
  }
  if (status === 429) return "proxy_quota_exceeded";
  if (status === 502 || status === 504) return "fetch_failed";
  return "proxy_unavailable";
}

/**
 * Search the MFDS nutrition DB through the authenticated public-data proxy.
 * `serviceKey` remains as an ignored compatibility field so older callers
 * compile; credentials are never accepted from or forwarded by the client.
 * Empty query → [] (no request).
 */
export async function searchFoods(
  query: string,
  opts: { serviceKey?: string; max?: number; signal?: AbortSignal } = {},
): Promise<FoodNutrition[]> {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length === 0) return [];
  const limit = Math.min(Math.max(1, Math.floor(opts.max ?? RESULT_MAX)), RESULT_MAX);
  let result: Awaited<ReturnType<ReturnType<typeof getSupabaseClient>["functions"]["invoke"]>>;
  try {
    result = await getSupabaseClient().functions.invoke("public-data-proxy", {
      body: { provider: "mfds_food", query: normalizedQuery, limit },
      signal: opts.signal,
    });
  } catch {
    throw "proxy_unavailable" as FoodSearchError;
  }
  if (result.error) throw await classifyInvokeError(result.error);
  if (
    !isRecord(result.data) ||
    result.data.provider !== "mfds_food" ||
    !isRecord(result.data.data)
  ) {
    throw "bad_response" as FoodSearchError;
  }
  return parseFoodItems(result.data.data, limit);
}
