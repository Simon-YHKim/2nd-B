export class RequestBoundaryError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'RequestBoundaryError';
  }
}

export interface BoundedBodyOptions {
  maxBytes: number;
  timeoutMs: number;
  allowedContentTypes?: readonly string[];
  requireLengthMatch?: boolean;
}

function contentTypeBase(headers: Headers, allowed: readonly string[]): string {
  const raw = headers.get('content-type') ?? '';
  if (raw.length === 0 || raw.length > 128 || /[,\r\n]/.test(raw)) {
    throw new RequestBoundaryError('unsupported_content_type', 415);
  }
  const match = /^\s*([^;\s]+)\s*(?:;\s*charset\s*=\s*(?:utf-8|"utf-8")\s*)?$/i.exec(raw);
  const base = match?.[1]?.toLowerCase() ?? '';
  if (!allowed.some((value) => value.toLowerCase() === base)) {
    throw new RequestBoundaryError('unsupported_content_type', 415);
  }
  return base;
}

function declaredContentLength(headers: Headers, maxBytes: number): number | null {
  const raw = headers.get('content-length');
  if (raw === null) return null;
  if (raw.length === 0 || raw.length > 16 || !/^\d+$/.test(raw)) {
    throw new RequestBoundaryError('invalid_content_length', 400);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new RequestBoundaryError('invalid_content_length', 400);
  }
  if (value > maxBytes) throw new RequestBoundaryError('body_too_large', 413);
  return value;
}

async function readBeforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new RequestBoundaryError('body_read_timeout', 408);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new RequestBoundaryError('body_read_timeout', 408)),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function readBoundedUtf8Body(
  message: Request | Response,
  options: BoundedBodyOptions,
): Promise<{ bytes: Uint8Array; text: string }> {
  if (
    !Number.isSafeInteger(options.maxBytes)
    || options.maxBytes < 0
    || !Number.isSafeInteger(options.timeoutMs)
    || options.timeoutMs <= 0
  ) throw new Error('invalid_body_boundary_options');

  if (options.allowedContentTypes) {
    contentTypeBase(message.headers, options.allowedContentTypes);
  }
  const declared = declaredContentLength(message.headers, options.maxBytes);
  const reader = message.body?.getReader() ?? null;
  // Allocate the enforced ceiling once. Keeping every transport chunk in an
  // array would let a one-byte-chunk stream amplify metadata far beyond the
  // accepted body size even though its payload bytes remain under the cap.
  const boundedBuffer = new Uint8Array(options.maxBytes);
  let total = 0;
  const deadline = Date.now() + options.timeoutMs;

  try {
    if (reader) {
      while (true) {
        const { done, value } = await readBeforeDeadline(reader.read(), deadline);
        if (done) break;
        if (!(value instanceof Uint8Array)) {
          throw new RequestBoundaryError('invalid_body_stream', 400);
        }
        if (value.byteLength === 0) continue;
        const nextTotal = total + value.byteLength;
        if (nextTotal > options.maxBytes) {
          void reader.cancel().catch(() => undefined);
          throw new RequestBoundaryError('body_too_large', 413);
        }
        boundedBuffer.set(value, total);
        total = nextTotal;
      }
    }
  } catch (error) {
    void reader?.cancel().catch(() => undefined);
    throw error;
  } finally {
    // A timed-out read can still be pending while cancel propagates through an
    // attacker-controlled stream. Never let releaseLock mask the safe timeout.
    try {
      reader?.releaseLock();
    } catch {
      // The abandoned request body is no longer observed by this function.
    }
  }

  if (options.requireLengthMatch && declared !== null && declared !== total) {
    throw new RequestBoundaryError('content_length_mismatch', 400);
  }

  const bytes = boundedBuffer.slice(0, total);

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RequestBoundaryError('invalid_utf8', 400);
  }
  return { bytes, text };
}

function invalidJson(): never {
  throw new Error('invalid_json');
}

/**
 * Validate JSON syntax without materializing attacker-controlled objects first.
 * The scan rejects decoded duplicate object keys and excessive nesting, then the
 * platform parser creates the value only after those ambiguity limits pass.
 */
export function parseJsonWithLimits(text: string, maxDepth: number): unknown {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new Error('invalid_json_depth');
  let at = 0;

  const skipWhitespace = (): void => {
    while (at < text.length && /[\u0020\u0009\u000a\u000d]/.test(text[at])) at += 1;
  };

  const scanString = (): string => {
    if (text[at] !== '"') return invalidJson();
    const start = at;
    at += 1;
    while (at < text.length) {
      const code = text.charCodeAt(at);
      if (code <= 0x1f) return invalidJson();
      if (text[at] === '"') {
        at += 1;
        try {
          return JSON.parse(text.slice(start, at)) as string;
        } catch {
          return invalidJson();
        }
      }
      if (text[at] === '\\') {
        at += 1;
        if (at >= text.length || !/["\\/bfnrtu]/.test(text[at])) return invalidJson();
        if (text[at] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(at + 1, at + 5))) return invalidJson();
          at += 4;
        }
      }
      at += 1;
    }
    return invalidJson();
  };

  const scanValue = (depth: number): void => {
    skipWhitespace();
    const current = text[at];
    if (current === '{') {
      if (depth > maxDepth) throw new Error('json_too_deep');
      at += 1;
      skipWhitespace();
      if (text[at] === '}') {
        at += 1;
        return;
      }
      const keys = new Set<string>();
      while (at < text.length) {
        skipWhitespace();
        const key = scanString();
        if (keys.has(key)) throw new Error('duplicate_json_key');
        keys.add(key);
        skipWhitespace();
        if (text[at] !== ':') return invalidJson();
        at += 1;
        scanValue(depth + 1);
        skipWhitespace();
        if (text[at] === '}') {
          at += 1;
          return;
        }
        if (text[at] !== ',') return invalidJson();
        at += 1;
      }
      return invalidJson();
    }
    if (current === '[') {
      if (depth > maxDepth) throw new Error('json_too_deep');
      at += 1;
      skipWhitespace();
      if (text[at] === ']') {
        at += 1;
        return;
      }
      while (at < text.length) {
        scanValue(depth + 1);
        skipWhitespace();
        if (text[at] === ']') {
          at += 1;
          return;
        }
        if (text[at] !== ',') return invalidJson();
        at += 1;
      }
      return invalidJson();
    }
    if (current === '"') {
      scanString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, at)) {
        at += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (!number) return invalidJson();
    at += number[0].length;
  };

  scanValue(1);
  skipWhitespace();
  if (at !== text.length) return invalidJson();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return invalidJson();
  }
}
