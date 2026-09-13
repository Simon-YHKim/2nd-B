export const LLM_PROXY_JSON_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
export const OAUTH_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PEER_RESPONSE_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const RSS_PROXY_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PUBLIC_DATA_PROXY_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PADDLE_WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

const REQUEST_BODY_TIMEOUT_MS = 15_000;
const REQUEST_BODY_MAX_CHUNKS = 1_024;
const REQUEST_BODY_MAX_NO_PROGRESS_CHUNKS = 8;

export type JsonBodyErrorCode = 'invalid_json' | 'request_body_too_large';

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
