export type PublicDataSource = "exim" | "mfds";
export type PublicDataQuotaProvider = "exim_fx" | "mfds_food";

export type PublicDataRequest = { source: "exim" } | { source: "mfds"; query: string; max: number };

export type ParsedPublicDataRequest =
  | { ok: true; value: PublicDataRequest }
  | { ok: false; error: "invalid_request" | "source_not_allowed" | "query_required" };

export type PublicDataUpstreamError =
  | "provider_key_rejected"
  | "provider_quota_exceeded"
  | "provider_rejected"
  | "upstream_bad_payload";

export type ParsedPublicDataUpstream =
  | { ok: true; data: unknown }
  | { ok: false; error: PublicDataUpstreamError; providerCode?: string };

export type PublicDataBodyReadOptions = {
  timeoutMs?: number;
  maxChunks?: number;
  maxNoProgressChunks?: number;
  signal?: AbortSignal;
};

const QUERY_MAX = 60;
const RESULT_MAX = 10;
const PROVIDER_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

const QUOTA_PROVIDER: Record<PublicDataSource, PublicDataQuotaProvider> = {
  exim: "exim_fx",
  mfds: "mfds_food",
};

const SECRET_ENV: Record<PublicDataSource, string> = {
  exim: "EXIM_FX_KEY",
  mfds: "MFDS_FOOD_KEY",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function normalizeFoodQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function publicDataProviderFor(source: PublicDataSource): PublicDataQuotaProvider {
  return QUOTA_PROVIDER[source];
}

export function publicDataSecretFor(source: PublicDataSource): string {
  return SECRET_ENV[source];
}

export function parsePublicDataRequest(value: unknown): ParsedPublicDataRequest {
  if (!isRecord(value) || typeof value.source !== "string") {
    return { ok: false, error: "invalid_request" };
  }
  if (value.source === "exim") {
    return hasOnlyKeys(value, ["source"])
      ? { ok: true, value: { source: "exim" } }
      : { ok: false, error: "invalid_request" };
  }
  if (value.source !== "mfds") return { ok: false, error: "source_not_allowed" };
  if (!hasOnlyKeys(value, ["source", "query", "max"]) || typeof value.query !== "string") {
    return { ok: false, error: "invalid_request" };
  }

  const query = normalizeFoodQuery(value.query);
  if (!query) return { ok: false, error: "query_required" };
  if (Array.from(query).length > QUERY_MAX) return { ok: false, error: "invalid_request" };
  const max = value.max === undefined ? RESULT_MAX : value.max;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > RESULT_MAX) {
    return { ok: false, error: "invalid_request" };
  }
  return { ok: true, value: { source: "mfds", query, max } };
}

export function buildPublicDataUpstreamUrl(request: PublicDataRequest, serverKey: string): URL {
  if (request.source === "exim") {
    const url = new URL("https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON");
    url.searchParams.set("authkey", serverKey);
    url.searchParams.set("data", "AP01");
    return url;
  }

  const url = new URL("https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo01/getFoodNtrCpntDbInq01");
  url.searchParams.set("serviceKey", serverKey);
  url.searchParams.set("FOOD_NM_KR", request.query);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(request.max));
  url.searchParams.set("type", "json");
  return url;
}

function providerFailure(
  error: PublicDataUpstreamError,
  providerCode?: string,
): ParsedPublicDataUpstream {
  return providerCode && PROVIDER_CODE_PATTERN.test(providerCode)
    ? { ok: false, error, providerCode }
    : { ok: false, error };
}

function markerFailure(text: string): ParsedPublicDataUpstream | null {
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

function mfdsResultCode(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const envelope = isRecord(value.response) ? value.response : value;
  if (!isRecord(envelope.header)) return null;
  const code = envelope.header.resultCode;
  return typeof code === "string" || typeof code === "number" ? String(code) : null;
}

export function parsePublicDataUpstream(
  source: PublicDataSource,
  text: string,
): ParsedPublicDataUpstream {
  const marker = markerFailure(text);
  if (marker) return marker;

  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return providerFailure("upstream_bad_payload");
  }

  if (source === "exim") {
    if (!Array.isArray(data)) return providerFailure("upstream_bad_payload");
    for (const row of data) {
      if (!isRecord(row)) return providerFailure("upstream_bad_payload");
      const result = row.result;
      const code = typeof result === "number" || typeof result === "string" ? String(result) : "";
      if (code === "4") return providerFailure("provider_quota_exceeded", code);
      if (code === "3") return providerFailure("provider_key_rejected", code);
      if (code && code !== "1") return providerFailure("provider_rejected", code);
    }
    return { ok: true, data };
  }

  if (!isRecord(data)) return providerFailure("upstream_bad_payload");
  const code = mfdsResultCode(data);
  if (code && code !== "00" && code !== "0") {
    if (code === "22" || code === "23") {
      return providerFailure("provider_quota_exceeded", code);
    }
    if (["20", "21", "29", "30", "31", "32", "33"].includes(code)) {
      return providerFailure("provider_key_rejected", code);
    }
    return providerFailure("provider_rejected", code);
  }
  return { ok: true, data };
}

export class PublicDataProxyError extends Error {
  constructor(
    public readonly code:
      | "upstream_response_too_large"
      | "upstream_body_timed_out"
      | "upstream_body_too_fragmented"
      | "upstream_body_no_progress"
      | "upstream_body_invalid",
    message: string,
  ) {
    super(message);
    this.name = "PublicDataProxyError";
  }
}

export async function readPublicDataBodyBounded(
  response: Pick<Response, "headers" | "body">,
  maxBytes: number,
  options: PublicDataBodyReadOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 7_000;
  const maxChunks = options.maxChunks ?? 1_024;
  const maxNoProgressChunks = options.maxNoProgressChunks ?? 8;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxChunks) ||
    maxChunks < 1 ||
    !Number.isSafeInteger(maxNoProgressChunks) ||
    maxNoProgressChunks < 0
  )
    throw new Error("invalid public-data body limit");

  const declared = response.headers.get("content-length")?.trim();
  if (declared !== undefined) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > maxBytes) {
      void response.body?.cancel().catch(() => undefined);
      throw new PublicDataProxyError("upstream_response_too_large", "upstream response too large");
    }
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const bytes = new Uint8Array(maxBytes);
  let total = 0;
  let chunks = 0;
  let noProgress = 0;
  let terminalError: PublicDataProxyError | null = null;
  let rejectDeadline: ((error: PublicDataProxyError) => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const failRead = (error: PublicDataProxyError) => {
    if (terminalError) return;
    terminalError = error;
    rejectDeadline?.(terminalError);
    void reader.cancel(error.code).catch(() => undefined);
  };
  const timer = setTimeout(
    () =>
      failRead(new PublicDataProxyError("upstream_body_timed_out", "upstream body read timed out")),
    timeoutMs,
  );
  const onAbort = () =>
    failRead(new PublicDataProxyError("upstream_body_timed_out", "upstream body read timed out"));
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (options.signal?.aborted)
      throw new PublicDataProxyError("upstream_body_timed_out", "upstream body read timed out");
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (terminalError) throw terminalError;
      if (done) break;
      chunks += 1;
      if (chunks > maxChunks)
        throw new PublicDataProxyError(
          "upstream_body_too_fragmented",
          "upstream body too fragmented",
        );
      if (!(value instanceof Uint8Array))
        throw new PublicDataProxyError("upstream_body_invalid", "invalid upstream body chunk");
      if (value.byteLength === 0) {
        noProgress += 1;
        if (noProgress > maxNoProgressChunks)
          throw new PublicDataProxyError(
            "upstream_body_no_progress",
            "upstream body made no progress",
          );
      } else {
        noProgress = 0;
        if (value.byteLength > maxBytes - total)
          throw new PublicDataProxyError(
            "upstream_response_too_large",
            "upstream response too large",
          );
        bytes.set(value, total);
        total += value.byteLength;
      }
      if (chunks % 64 === 0) {
        await Promise.race([new Promise<void>((resolve) => setTimeout(resolve, 0)), deadline]);
      }
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total));
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof PublicDataProxyError) throw error;
    throw new PublicDataProxyError("upstream_body_invalid", "invalid upstream body");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
