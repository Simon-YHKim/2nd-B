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

export type PublicDataRequestBodyErrorCode =
  | "unsupported_media_type"
  | "invalid_content_length"
  | "request_body_too_large"
  | "content_length_mismatch"
  | "invalid_json"
  | "duplicate_json_key"
  | "json_too_deep";

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
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export class PublicDataRequestBodyError extends Error {
  constructor(
    public readonly code: PublicDataRequestBodyErrorCode,
    public readonly status: 400 | 413 | 415,
  ) {
    super(code);
    this.name = "PublicDataRequestBodyError";
  }
}

class StrictJsonScanner {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly maxDepth: number,
  ) {}

  scan(): void {
    this.skipWhitespace();
    this.scanValue(0);
    this.skipWhitespace();
    if (this.index !== this.source.length) this.fail("invalid_json");
  }

  private scanValue(depth: number): void {
    this.skipWhitespace();
    const token = this.source[this.index];
    if (token === "{") {
      this.scanObject(depth + 1);
      return;
    }
    if (token === "[") {
      this.scanArray(depth + 1);
      return;
    }
    if (token === '"') {
      this.scanString();
      return;
    }
    if (token === "t") {
      this.scanLiteral("true");
      return;
    }
    if (token === "f") {
      this.scanLiteral("false");
      return;
    }
    if (token === "n") {
      this.scanLiteral("null");
      return;
    }
    if (token === "-" || (token >= "0" && token <= "9")) {
      this.scanNumber();
      return;
    }
    this.fail("invalid_json");
  }

  private scanObject(depth: number): void {
    this.assertDepth(depth);
    this.index += 1;
    this.skipWhitespace();
    if (this.consume("}")) return;

    const keys = new Set<string>();
    while (true) {
      if (this.source[this.index] !== '"') this.fail("invalid_json");
      const key = this.scanString();
      if (keys.has(key)) this.fail("duplicate_json_key");
      keys.add(key);

      this.skipWhitespace();
      if (!this.consume(":")) this.fail("invalid_json");
      this.scanValue(depth);
      this.skipWhitespace();
      if (this.consume("}")) return;
      if (!this.consume(",")) this.fail("invalid_json");
      this.skipWhitespace();
    }
  }

  private scanArray(depth: number): void {
    this.assertDepth(depth);
    this.index += 1;
    this.skipWhitespace();
    if (this.consume("]")) return;

    while (true) {
      this.scanValue(depth);
      this.skipWhitespace();
      if (this.consume("]")) return;
      if (!this.consume(",")) this.fail("invalid_json");
      this.skipWhitespace();
    }
  }

  private scanString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const token = this.source[this.index];
      if (token === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.source.slice(start, this.index)) as string;
        } catch {
          this.fail("invalid_json");
        }
      }
      if (token === "\\") {
        this.index += 1;
        const escaped = this.source[this.index];
        if (escaped === "u") {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("invalid_json");
          this.index += 5;
          continue;
        }
        if (!escaped || !'"\\/bfnrt'.includes(escaped)) this.fail("invalid_json");
        this.index += 1;
        continue;
      }
      if (token.charCodeAt(0) <= 0x1f) this.fail("invalid_json");
      this.index += 1;
    }
    this.fail("invalid_json");
  }

  private scanNumber(): void {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.source.slice(this.index),
    );
    if (!match) this.fail("invalid_json");
    this.index += match[0].length;
  }

  private scanLiteral(literal: "true" | "false" | "null"): void {
    if (!this.source.startsWith(literal, this.index)) this.fail("invalid_json");
    this.index += literal.length;
  }

  private assertDepth(depth: number): void {
    if (depth > this.maxDepth) this.fail("json_too_deep");
  }

  private skipWhitespace(): void {
    while (
      this.source[this.index] === " " ||
      this.source[this.index] === "\t" ||
      this.source[this.index] === "\n" ||
      this.source[this.index] === "\r"
    ) {
      this.index += 1;
    }
  }

  private consume(token: string): boolean {
    if (this.source[this.index] !== token) return false;
    this.index += 1;
    return true;
  }

  private fail(code: "invalid_json" | "duplicate_json_key" | "json_too_deep"): never {
    throw new PublicDataRequestBodyError(code, 400);
  }
}

function declaredRequestLength(request: Request, maxBytes: number): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) {
    throw new PublicDataRequestBodyError("invalid_content_length", 400);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new PublicDataRequestBodyError("invalid_content_length", 400);
  }
  if (value > maxBytes) {
    throw new PublicDataRequestBodyError("request_body_too_large", 413);
  }
  return value;
}

export async function readJsonRequestBounded(
  request: Request,
  maxBytes: number,
  maxDepth: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)) {
    throw new PublicDataRequestBodyError("unsupported_media_type", 415);
  }

  const declared = declaredRequestLength(request, maxBytes);
  if (!request.body) throw new PublicDataRequestBodyError("invalid_json", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PublicDataRequestBodyError("request_body_too_large", 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PublicDataRequestBodyError) throw error;
    throw new PublicDataRequestBodyError("invalid_json", 400);
  } finally {
    reader.releaseLock();
  }

  if (declared !== null && declared !== total) {
    throw new PublicDataRequestBodyError("content_length_mismatch", 400);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PublicDataRequestBodyError("invalid_json", 400);
  }

  new StrictJsonScanner(text, maxDepth).scan();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PublicDataRequestBodyError("invalid_json", 400);
  }
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
  if (Array.from(query).length > FOOD_QUERY_MAX) {
    return { ok: false, error: "invalid_request" };
  }

  if (
    value.limit !== undefined &&
    (typeof value.limit !== "number" ||
      !Number.isInteger(value.limit) ||
      value.limit < 1 ||
      value.limit > FOOD_RESULT_MAX)
  ) {
    return { ok: false, error: "invalid_request" };
  }
  const limit = value.limit === undefined ? FOOD_RESULT_DEFAULT : value.limit;
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
