export const LLM_PROXY_JSON_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
export const OAUTH_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PEER_RESPONSE_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const RSS_PROXY_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const SUBSCRIPTION_MANAGE_JSON_BODY_LIMIT_BYTES = 4 * 1024;
export const PADDLE_WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

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
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const declaredBytes = Number(declaredLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      await stream.cancel().catch(() => undefined);
      throw bodyTooLarge(maxBytes);
    }
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = stream.getReader();
    let bytesRead = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw bodyTooLarge(maxBytes);
      }
      consumeChunk(value);
    }
    return bytesRead;
  } catch (error) {
    if (error instanceof JsonBodyError) throw error;
    if (reader) await reader.cancel().catch(() => undefined);
    throw invalidJson();
  } finally {
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
