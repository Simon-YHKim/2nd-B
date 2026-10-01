export const LLM_PROXY_JSON_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
export const OAUTH_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PEER_RESPONSE_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const RSS_PROXY_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PUBLIC_DATA_PROXY_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PADDLE_WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

// Container nesting a strict reader accepts; the top-level value is depth 1.
// Paddle's own objects stay far below 32; manage and public-data requests are flat.
export const PADDLE_WEBHOOK_JSON_MAX_DEPTH = 32;
export const SUBSCRIPTION_MANAGE_JSON_MAX_DEPTH = 4;
export const PUBLIC_DATA_PROXY_JSON_MAX_DEPTH = 3;

const REQUEST_BODY_TIMEOUT_MS = 15_000;
const REQUEST_BODY_MAX_CHUNKS = 1_024;
const REQUEST_BODY_MAX_NO_PROGRESS_CHUNKS = 8;

const JSON_CONTENT_TYPE_MAX_LENGTH = 128;
// One JSON media type, optionally declaring UTF-8. A comma never matches: it is
// what the Fetch Headers class leaves behind when the header was sent twice.
const JSON_CONTENT_TYPE_RE =
  /^application\/json[\t ]*(?:;[\t ]*charset=(?:utf-8|"utf-8")[\t ]*)?$/i;

export type JsonBodyErrorCode =
  | 'invalid_json'
  | 'request_body_too_large'
  | 'unsupported_media_type'
  | 'duplicate_json_key'
  | 'json_too_deep';

export class JsonBodyError extends Error {
  constructor(
    readonly code: JsonBodyErrorCode,
    readonly maxBytes?: number,
  ) {
    super(code);
    this.name = 'JsonBodyError';
  }
}

function invalidJson(): JsonBodyError {
  return new JsonBodyError('invalid_json');
}

function bodyTooLarge(maxBytes: number): JsonBodyError {
  return new JsonBodyError('request_body_too_large', maxBytes);
}

async function consumeBoundedStream(
  request: Pick<Request, 'body' | 'headers'>,
  maxBytes: number,
  consumeChunk: (chunk: Uint8Array) => void,
): Promise<number> {
  const stream = request.body;
  if (!stream) throw invalidJson();

  const declaredLength = request.headers.get('content-length')?.trim();
  if (declaredLength) {
    if (!/^(?:0|[1-9]\d*)$/.test(declaredLength)) {
      void stream.cancel().catch(() => undefined);
      throw invalidJson();
    }
    const declaredBytes = Number(declaredLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      void stream.cancel().catch(() => undefined);
      throw bodyTooLarge(maxBytes);
    }
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const signal = (request as { signal?: AbortSignal }).signal;
  let onAbort: (() => void) | undefined;
  let terminalError: JsonBodyError | null = null;
  let rejectDeadline: ((error: JsonBodyError) => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  try {
    reader = stream.getReader();
    const failRead = () => {
      if (terminalError) return;
      terminalError = invalidJson();
      rejectDeadline?.(terminalError);
      void reader?.cancel('request body read stopped').catch(() => undefined);
    };
    onAbort = failRead;
    timeout = setTimeout(failRead, REQUEST_BODY_TIMEOUT_MS);
    signal?.addEventListener('abort', failRead, { once: true });
    if (signal?.aborted) throw invalidJson();

    let bytesRead = 0;
    let chunksRead = 0;
    let noProgressChunks = 0;

    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (terminalError) throw terminalError;
      if (done) break;
      chunksRead += 1;
      if (chunksRead > REQUEST_BODY_MAX_CHUNKS || !(value instanceof Uint8Array)) {
        throw invalidJson();
      }
      if (value.byteLength === 0) {
        noProgressChunks += 1;
        if (noProgressChunks > REQUEST_BODY_MAX_NO_PROGRESS_CHUNKS) throw invalidJson();
      } else {
        noProgressChunks = 0;
      }
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw bodyTooLarge(maxBytes);
      }
      consumeChunk(value);

      // Immediately-resolving reads can monopolize the microtask queue and
      // prevent the timeout/AbortSignal from firing. A bounded periodic yield
      // keeps wall-clock cancellation meaningful even for hostile streams.
      if (chunksRead % 64 === 0) {
        await Promise.race([
          new Promise<void>((resolve) => setTimeout(resolve, 0)),
          deadline,
        ]);
      }
    }
    return bytesRead;
  } catch (error) {
    if (reader) void reader.cancel().catch(() => undefined);
    if (error instanceof JsonBodyError) throw error;
    throw invalidJson();
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    reader?.releaseLock();
  }
}

export async function readBodyBytes(
  request: Pick<Request, 'body' | 'headers'>,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const byteLength = await consumeBoundedStream(request, maxBytes, (chunk) => {
    chunks.push(chunk.slice());
  });

  if (chunks.length === 1) return chunks[0];
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJsonObject(
  request: Pick<Request, 'body' | 'headers'>,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const decodedChunks: string[] = [];
  await consumeBoundedStream(request, maxBytes, (chunk) => {
    decodedChunks.push(decoder.decode(chunk, { stream: true }));
  });

  try {
    decodedChunks.push(decoder.decode());
    const parsed: unknown = JSON.parse(decodedChunks.join(''));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw invalidJson();
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof JsonBodyError) throw error;
    throw invalidJson();
  }
}

export function hasJsonContentType(headers: Pick<Headers, 'get'>): boolean {
  const value = headers.get('content-type');
  return value !== null
    && value.length <= JSON_CONTENT_TYPE_MAX_LENGTH
    && JSON_CONTENT_TYPE_RE.test(value);
}

/**
 * JSON.parse keeps the LAST value of a repeated key and builds whatever nesting
 * it is given, so one body can mean one thing to a proxy or log reader that
 * takes the first value and another thing here. This scans the syntax first -
 * refusing a repeated key (compared after unescaping, so an escaped spelling
 * of a key collides with its plain spelling) and containers nested past
 * `maxDepth` (the top level is depth 1) - and only then lets the platform
 * parser build the value.
 */
export function parseStrictJson(text: string, maxDepth: number): unknown {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError('maxDepth must be a positive integer');
  }
  const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let at = 0;

  const skipWhitespace = (): void => {
    while (at < text.length) {
      const code = text.charCodeAt(at);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return;
      at += 1;
    }
  };

  const skipString = (): void => {
    at += 1;
    while (at < text.length) {
      const code = text.charCodeAt(at);
      if (code === 0x22) {
        at += 1;
        return;
      }
      if (code < 0x20) throw invalidJson();
      if (code === 0x5c) {
        const escaped = text[at + 1];
        if (escaped === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(at + 2, at + 6))) throw invalidJson();
          at += 6;
          continue;
        }
        if (escaped === undefined || !'"\\/bfnrt'.includes(escaped)) throw invalidJson();
        at += 2;
        continue;
      }
      at += 1;
    }
    throw invalidJson();
  };

  const scanValue = (depth: number): void => {
    skipWhitespace();
    const code = text.charCodeAt(at);
    if (code === 0x7b || code === 0x5b) {
      if (depth > maxDepth) throw new JsonBodyError('json_too_deep');
      const close = code === 0x7b ? 0x7d : 0x5d;
      const keys = code === 0x7b ? new Set<string>() : null;
      at += 1;
      skipWhitespace();
      if (text.charCodeAt(at) === close) {
        at += 1;
        return;
      }
      while (true) {
        if (keys) {
          skipWhitespace();
          if (text.charCodeAt(at) !== 0x22) throw invalidJson();
          const keyStart = at;
          skipString();
          const key = JSON.parse(text.slice(keyStart, at)) as string;
          if (keys.has(key)) throw new JsonBodyError('duplicate_json_key');
          keys.add(key);
          skipWhitespace();
          if (text.charCodeAt(at) !== 0x3a) throw invalidJson();
          at += 1;
        }
        scanValue(depth + 1);
        skipWhitespace();
        const next = text.charCodeAt(at);
        at += 1;
        if (next === close) return;
        if (next !== 0x2c) throw invalidJson();
      }
    }
    if (code === 0x22) {
      skipString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, at)) {
        at += literal.length;
        return;
      }
    }
    numberPattern.lastIndex = at;
    if (!numberPattern.test(text)) throw invalidJson();
    at = numberPattern.lastIndex;
  };

  try {
    scanValue(1);
    skipWhitespace();
    if (at !== text.length) throw invalidJson();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof JsonBodyError) throw error;
    throw invalidJson();
  }
}

/**
 * readJsonObject for callers that also refuse a non-JSON media type, repeated
 * keys, and deep nesting. The media type is judged before any body byte is
 * pulled.
 */
export async function readStrictJsonObject(
  request: Pick<Request, 'body' | 'headers'>,
  maxBytes: number,
  maxDepth: number,
): Promise<Record<string, unknown>> {
  if (!hasJsonContentType(request.headers)) {
    void request.body?.cancel().catch(() => undefined);
    throw new JsonBodyError('unsupported_media_type');
  }
  const body = await readBodyBytes(request, maxBytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw invalidJson();
  }
  const parsed = parseStrictJson(text, maxDepth);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidJson();
  }
  return parsed as Record<string, unknown>;
}
