export type PublicDataProvider = "exim_fx" | "mfds_food";

export type PublicDataRequest =
  | { provider: "exim_fx" }
  | { provider: "mfds_food"; query: string; limit: number };

export type PublicDataRequestError = "invalid_request" | "provider_not_allowed" | "query_required";
export type PublicDataUpstreamError =
  | "provider_key_rejected"
  | "provider_quota_exceeded"
  | "provider_rejected"
  | "upstream_bad_payload";

export type ParsedRequest =
  | { ok: true; value: PublicDataRequest }
  | { ok: false; error: PublicDataRequestError };

export type ParsedProviderBody =
  | { ok: true; data: unknown }
  | { ok: false; error: PublicDataUpstreamError; providerCode?: string };

const FOOD_QUERY_MAX = 60;
const FOOD_RESULT_MAX = 10;
const FOOD_RESULT_DEFAULT = 10;

const SECRET_ENV: Record<PublicDataProvider, string> = {
  exim_fx: "EXIM_FX_API_KEY",
  mfds_food: "MFDS_FOOD_API_KEY",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allow = new Set(allowed);
  return Object.keys(value).every((key) => allow.has(key));
}

function normalizeFoodQuery(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(normalized).slice(0, FOOD_QUERY_MAX).join("");
}

export function parsePublicDataRequest(value: unknown): ParsedRequest {
  if (!isRecord(value) || typeof value.provider !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  if (value.provider === "exim_fx") {
    if (!hasOnlyKeys(value, ["provider"])) return { ok: false, error: "invalid_request" };
    return { ok: true, value: { provider: "exim_fx" } };
  }

  if (value.provider !== "mfds_food") return { ok: false, error: "provider_not_allowed" };
  if (!hasOnlyKeys(value, ["provider", "query", "limit"])) {
    return { ok: false, error: "invalid_request" };
  }
  if (typeof value.query !== "string") return { ok: false, error: "invalid_request" };

  const query = normalizeFoodQuery(value.query);
  if (query.length === 0) return { ok: false, error: "query_required" };

  if (
    value.limit !== undefined &&
    (typeof value.limit !== "number" || !Number.isFinite(value.limit))
  ) {
    return { ok: false, error: "invalid_request" };
  }
  const requestedLimit = value.limit === undefined ? FOOD_RESULT_DEFAULT : Math.floor(value.limit);
  const limit = Math.min(FOOD_RESULT_MAX, Math.max(1, requestedLimit));
  return { ok: true, value: { provider: "mfds_food", query, limit } };
}

export function providerSecretEnv(provider: PublicDataProvider): string {
  return SECRET_ENV[provider];
}

export function buildUpstreamUrl(request: PublicDataRequest, serverKey: string): URL {
  if (request.provider === "exim_fx") {
    const url = new URL("https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON");
    url.searchParams.set("authkey", serverKey);
    url.searchParams.set("data", "AP01");
    return url;
  }

  const url = new URL("https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02");
  url.searchParams.set("serviceKey", serverKey);
  url.searchParams.set("FOOD_NM_KR", request.query);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(request.limit));
  url.searchParams.set("type", "json");
  return url;
}

function mfdsEnvelope(data: unknown): { header?: Record<string, unknown>; body?: unknown } | null {
  if (!isRecord(data)) return null;
  const envelope = isRecord(data.response) ? data.response : data;
  return {
    header: isRecord(envelope.header) ? envelope.header : undefined,
    body: envelope.body,
  };
}

function providerFailure(
  error: PublicDataUpstreamError,
  providerCode?: string,
): ParsedProviderBody {
  return providerCode ? { ok: false, error, providerCode } : { ok: false, error };
}

function mfdsFailureFromCode(code: string): ParsedProviderBody | null {
  if (code === "00" || code === "0") return null;
  if (code === "22" || code === "23") {
    return providerFailure("provider_quota_exceeded", code);
  }
  if (["20", "21", "29", "30", "31", "32", "33"].includes(code)) {
    return providerFailure("provider_key_rejected", code);
  }
  return providerFailure("provider_rejected", code);
}

function markerFailure(text: string): ParsedProviderBody | null {
  const upper = text.toUpperCase();
  if (upper.includes("LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR")) {
    return providerFailure("provider_quota_exceeded", "23");
  }
  if (upper.includes("LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR")) {
    return providerFailure("provider_quota_exceeded", "22");
  }
  const keyMarkers: ReadonlyArray<[string, string]> = [
    ["SERVICE_KEY_IS_NOT_REGISTERED_ERROR", "30"],
    ["DEADLINE_HAS_EXPIRED_ERROR", "31"],
    ["UNREGISTERED_IP_ERROR", "32"],
    ["UNSIGNED_CALL_ERROR", "33"],
    ["BLACKLIST_IP_ACCESS_ERROR", "29"],
    ["TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR", "21"],
    ["SERVICE_ACCESS_DENIED_ERROR", "20"],
    ["SERVICE_KEY_IS_NULL", "20"],
    ["PERMISSION_DENIED", "20"],
  ];
  for (const [marker, code] of keyMarkers) {
    if (upper.includes(marker)) return providerFailure("provider_key_rejected", code);
  }
  return null;
}

export function parseProviderBody(provider: PublicDataProvider, text: string): ParsedProviderBody {
  const marker = markerFailure(text);
  if (marker) return marker;

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return providerFailure("upstream_bad_payload");
  }

  if (provider === "exim_fx") {
    if (!Array.isArray(data)) return providerFailure("upstream_bad_payload");
    for (const row of data) {
      if (!isRecord(row)) return providerFailure("upstream_bad_payload");
      const code =
        typeof row.result === "number" || typeof row.result === "string" ? String(row.result) : "";
      if (code === "4") return providerFailure("provider_quota_exceeded", code);
      if (code === "3") return providerFailure("provider_key_rejected", code);
      if (code && code !== "1") return providerFailure("provider_rejected", code);
    }
    return { ok: true, data };
  }

  const envelope = mfdsEnvelope(data);
  if (!envelope) return providerFailure("upstream_bad_payload");
  const code = envelope.header?.resultCode;
  if (typeof code === "string" || typeof code === "number") {
    const failure = mfdsFailureFromCode(String(code));
    if (failure) return failure;
  }
  if (!isRecord(envelope.body)) return providerFailure("upstream_bad_payload");
  return { ok: true, data };
}

export class PublicDataProxyError extends Error {
  constructor(public readonly code: "upstream_response_too_large") {
    super(code);
    this.name = "PublicDataProxyError";
  }
}

export async function readTextBodyBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PublicDataProxyError("upstream_response_too_large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PublicDataProxyError("upstream_response_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
