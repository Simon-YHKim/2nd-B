// Meals IN-bound data source (O-R3 Wave 2, weekly_meals / simple_meals): the
// 식약처(MFDS) 식품영양성분 DB via data.go.kr. Gives the meal planner real
// nutrition ground-truth so an idea can carry a kcal/macro reference instead of
// a guess.
//
// Harness-first / constraints:
//   - data.go.kr is the $0 Korea-first public-data goldmine. Free, but requires a
//     free service key the user registers once (mild Simon-console gate). The
//     client is fully implemented and KEY-PARAMETERIZED: with no key it returns
//     [] so the planner still works in idea-only mode.
//   - Deterministic source (no LLM → no C1/C3/C9). No new dependency.
//   - NOT medical/diet advice: nutrition numbers are a reference only; surfaces
//     keep the plan/idea framing (vocabulary policy).
//   - Defensive parser tolerates the common data.go.kr response shapes and
//     several field-name spellings; junk is dropped, never trusted.

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
// I2790 = 식품영양성분DB info service (data.go.kr). JSON output.
const MFDS_ENDPOINT = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo01/getFoodNtrCpntDbInq01";

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

/** Pure: build the keyed search URL (JSON output). */
export function buildFoodSearchUrl(query: string, serviceKey: string, max = RESULT_MAX): string {
  const numOfRows = Math.min(Math.max(1, Math.floor(max)), RESULT_MAX);
  const params = new URLSearchParams({
    serviceKey,
    FOOD_NM_KR: query.trim().slice(0, QUERY_MAX),
    pageNo: "1",
    numOfRows: String(numOfRows),
    type: "json",
  });
  return `${MFDS_ENDPOINT}?${params.toString()}`;
}

export type FoodSearchError = "no_key" | "empty_query" | "fetch_failed" | "bad_response";

/**
 * Search the MFDS nutrition DB. With no service key (env unset and none passed)
 * it returns [] — idea-only mode — instead of throwing, so the planner is never
 * blocked by the missing free key. Empty query → [] (no request).
 */
export async function searchFoods(
  query: string,
  opts: { serviceKey?: string; max?: number; signal?: AbortSignal } = {},
): Promise<FoodNutrition[]> {
  if (query.trim().length === 0) return [];
  const serviceKey = opts.serviceKey ?? process.env.EXPO_PUBLIC_MFDS_FOOD_KEY ?? "";
  if (!serviceKey) return [];
  const url = buildFoodSearchUrl(query, serviceKey, opts.max);
  let res: Response;
  try {
    res = await fetch(url, { signal: opts.signal, headers: { Accept: "application/json" } });
  } catch {
    throw "fetch_failed" as FoodSearchError;
  }
  if (!res.ok) throw "fetch_failed" as FoodSearchError;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw "bad_response" as FoodSearchError;
  }
  return parseFoodItems(json, opts.max);
}
