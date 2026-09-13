/** Maximum raw UTF-8 input accepted by local file-import paths. */
export const MAX_BOUNDED_FILE_BYTES = 10 * 1024 * 1024;

/** A deadline prevents a local provider or browser stream from hanging import. */
export const DEFAULT_BOUNDED_FILE_READ_TIMEOUT_MS = 15_000;

export type BoundedFileReadErrorCode =
  | "aborted"
  | "invalid_encoding"
  | "invalid_size"
  | "read_failed"
  | "size_mismatch"
  | "timed_out"
  | "too_large"
  | "unsafe_source"
  | "unverifiable_size";

const ERROR_MESSAGES: Record<BoundedFileReadErrorCode, string> = {
  aborted: "Selected file reading was cancelled.",
  invalid_encoding: "Selected file is not valid UTF-8 text.",
  invalid_size: "Selected file size is invalid.",
  read_failed: "Selected file could not be read safely.",
  size_mismatch: "Selected file size changed while it was being read.",
  timed_out: "Selected file reading timed out.",
  too_large: "Selected file is too large.",
  unsafe_source: "Selected file source is not local.",
  unverifiable_size: "Selected file size could not be verified.",
};

export class BoundedFileReadError extends Error {
  readonly code: BoundedFileReadErrorCode;

  constructor(code: BoundedFileReadErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "BoundedFileReadError";
    this.code = code;
  }
}

export interface BoundedUtf8ReadOptions {
  /** Trusted picker/blob size, when available. */
  declaredBytes?: number | null;
  /** May only tighten the repository-wide 10 MiB ceiling. */
  maxBytes?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ChunkReader {
  read(): Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel?(): Promise<unknown> | unknown;
  releaseLock?(): void;
}

const DECODE_BLOCK_BYTES = 64 * 1024;
const MAX_STREAM_CHUNKS = 65_536;
const MAX_CONSECUTIVE_EMPTY_CHUNKS = 64;
const MACROTASK_YIELD_INTERVAL_CHUNKS = 1_024;
const CANCEL_SETTLE_GRACE_MS = 100;

function fail(code: BoundedFileReadErrorCode): BoundedFileReadError {
  return new BoundedFileReadError(code);
}

function sanitized(error: unknown): BoundedFileReadError {
  return error instanceof BoundedFileReadError ? error : fail("read_failed");
}

function validatedMaxBytes(value: number | undefined): number {
  const maxBytes = value ?? MAX_BOUNDED_FILE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_BOUNDED_FILE_BYTES) {
    throw fail("invalid_size");
  }
  return maxBytes;
}

function validatedTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_BOUNDED_FILE_READ_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw fail("read_failed");
  }
  return timeoutMs;
}

function validatedOptionalSize(value: number | null | undefined, maxBytes: number): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw fail("invalid_size");
  if (value > maxBytes) throw fail("too_large");
  return value;
}

function parsedContentLength(response: Response, maxBytes: number): number | null {
  const raw = response.headers?.get?.("content-length")?.trim();
  if (!raw) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw fail("invalid_size");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw fail("invalid_size");
  if (value > maxBytes) throw fail("too_large");
  return value;
}

function requireMatchingSizes(left: number | null, right: number | null): void {
  if (left != null && right != null && left !== right) throw fail("size_mismatch");
}

function runWithDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  onStop?: (code: "aborted" | "timed_out") => void,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(fail("aborted"));

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (result: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if ("error" in result) reject(sanitized(result.error));
      else resolve(result.value);
    };
    const stop = (code: "aborted" | "timed_out") => {
      if (settled) return;
      try {
        onStop?.(code);
      } catch {
        // Stopping is best-effort; the caller still receives the bounded error.
      }
      finish({ error: fail(code) });
    };
    const onAbort = () => stop("aborted");
    const timer = setTimeout(() => stop("timed_out"), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });

    Promise.resolve()
      .then(operation)
      .then((value) => finish({ value }), (error: unknown) => finish({ error }));
  });
}

function waitForCancellation(promise: Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, CANCEL_SETTLE_GRACE_MS);
    promise.then(finish, finish);
  });
}

function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function decodeReader(
  reader: ChunkReader,
  options: BoundedUtf8ReadOptions,
  maxBytes: number,
  expectedBytes: number | null,
): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  const decodeBuffer = new Uint8Array(Math.min(DECODE_BLOCK_BYTES, maxBytes));
  const timeoutMs = validatedTimeoutMs(options.timeoutMs);
  const deadlineAt = Date.now() + timeoutMs;
  let actualBytes = 0;
  let bufferedBytes = 0;
  let chunkCount = 0;
  let consecutiveEmptyChunks = 0;
  let stopCode: "aborted" | "timed_out" | null = null;
  let cancellation: Promise<void> | null = null;

  const cancelOnce = (): Promise<void> => {
    if (cancellation) return cancellation;
    try {
      cancellation = Promise.resolve(reader.cancel?.()).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      cancellation = Promise.resolve();
    }
    return cancellation;
  };

  const markStopped = (code: "aborted" | "timed_out") => {
    stopCode ??= code;
    void cancelOnce();
  };

  const requireActive = () => {
    if (stopCode) throw fail(stopCode);
    if (options.signal?.aborted) {
      markStopped("aborted");
      throw fail("aborted");
    }
    if (Date.now() >= deadlineAt) {
      markStopped("timed_out");
      throw fail("timed_out");
    }
  };

  const decodeBuffered = () => {
    if (bufferedBytes === 0) return;
    try {
      const text = decoder.decode(decodeBuffer.subarray(0, bufferedBytes), { stream: true });
      if (text.length > 0) parts.push(text);
      bufferedBytes = 0;
    } catch {
      throw fail("invalid_encoding");
    }
  };

  const operation = async () => {
    while (true) {
      requireActive();
      const result = await reader.read();
      requireActive();
      if (result.done) break;
      const chunk = result.value;
      if (!(chunk instanceof Uint8Array)) throw fail("read_failed");
      chunkCount += 1;
      if (chunkCount > MAX_STREAM_CHUNKS) throw fail("read_failed");
      if (chunk.byteLength === 0) {
        consecutiveEmptyChunks += 1;
        if (consecutiveEmptyChunks > MAX_CONSECUTIVE_EMPTY_CHUNKS) throw fail("read_failed");
      } else {
        consecutiveEmptyChunks = 0;
      }
      if (expectedBytes != null && chunk.byteLength > expectedBytes - actualBytes) {
        throw fail("size_mismatch");
      }
      if (chunk.byteLength > maxBytes - actualBytes) throw fail("too_large");
      actualBytes += chunk.byteLength;

      let chunkOffset = 0;
      while (chunkOffset < chunk.byteLength) {
        const copyBytes = Math.min(
          decodeBuffer.byteLength - bufferedBytes,
          chunk.byteLength - chunkOffset,
        );
        decodeBuffer.set(chunk.subarray(chunkOffset, chunkOffset + copyBytes), bufferedBytes);
        bufferedBytes += copyBytes;
        chunkOffset += copyBytes;
        if (bufferedBytes === decodeBuffer.byteLength) decodeBuffered();
      }

      if (chunkCount % MACROTASK_YIELD_INTERVAL_CHUNKS === 0) {
        await yieldToMacrotask();
        requireActive();
      }
    }

    decodeBuffered();
    try {
      const text = decoder.decode();
      if (text.length > 0) parts.push(text);
    } catch {
      throw fail("invalid_encoding");
    }
    requireMatchingSizes(expectedBytes, actualBytes);
    return parts.join("");
  };

  try {
    return await runWithDeadline(operation, timeoutMs, options.signal, markStopped);
  } catch (error) {
    await waitForCancellation(cancelOnce());
    throw sanitized(error);
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // A timed-out provider may still have a pending read; cancellation is enough.
    }
  }
}

/** Decode a byte stream without ever accumulating a chunk beyond the cap. */
export async function readBoundedUtf8Stream(
  stream: ReadableStream<Uint8Array>,
  options: BoundedUtf8ReadOptions = {},
): Promise<string> {
  const maxBytes = validatedMaxBytes(options.maxBytes);
  const declaredBytes = validatedOptionalSize(options.declaredBytes, maxBytes);
  let reader: ChunkReader;
  try {
    reader = stream.getReader();
  } catch (error) {
    throw sanitized(error);
  }
  return decodeReader(reader, options, maxBytes, declaredBytes);
}

/** Read a browser File/Blob via its stream, or bounded slices on older browsers. */
export async function readBoundedUtf8Blob(
  blob: Blob,
  options: Omit<BoundedUtf8ReadOptions, "declaredBytes"> = {},
): Promise<string> {
  const maxBytes = validatedMaxBytes(options.maxBytes);
  const size = validatedOptionalSize(blob.size, maxBytes);
  if (size == null) throw fail("unverifiable_size");

  if (typeof blob.stream === "function") {
    return readBoundedUtf8Stream(blob.stream(), { ...options, declaredBytes: size });
  }

  const chunkBytes = 64 * 1024;
  let offset = 0;
  const reader: ChunkReader = {
    async read() {
      if (offset >= size) return { done: true, value: undefined };
      const end = Math.min(size, offset + chunkBytes);
      const slice = blob.slice(offset, end);
      if (typeof slice.arrayBuffer !== "function") throw fail("read_failed");
      const buffer = await slice.arrayBuffer();
      if (buffer.byteLength !== end - offset) throw fail("size_mismatch");
      offset = end;
      return { done: false, value: new Uint8Array(buffer) };
    },
  };
  return decodeReader(reader, options, maxBytes, size);
}

/** Decode a local fetch response, including strict Content-Length verification. */
export async function readBoundedUtf8Response(
  response: Response,
  options: BoundedUtf8ReadOptions = {},
): Promise<string> {
  const maxBytes = validatedMaxBytes(options.maxBytes);
  const declaredBytes = validatedOptionalSize(options.declaredBytes, maxBytes);
  const contentLength = parsedContentLength(response, maxBytes);
  requireMatchingSizes(declaredBytes, contentLength);
  if (response.ok === false) throw fail("read_failed");
  const expectedBytes = declaredBytes ?? contentLength;

  if (response.body && typeof response.body.getReader === "function") {
    return readBoundedUtf8Stream(response.body, { ...options, declaredBytes: expectedBytes });
  }

  // Response.arrayBuffer() cannot enforce a byte ceiling or cooperative abort
  // while bytes arrive. A declared picker size is metadata, not authorization
  // to allocate the provider's entire response, so fail closed without a stream.
  throw fail("unverifiable_size");
}

function isLocalFileUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "content:") return uri.startsWith("content://");
    if (parsed.protocol !== "file:") return false;
    return parsed.hostname === "" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function isMatchingLocalResponseUri(requestUri: string, responseUri: string): boolean {
  if (!responseUri) return false;
  try {
    const request = new URL(requestUri);
    const response = new URL(responseUri);
    if (request.protocol === response.protocol) {
      return (
        request.username === response.username &&
        request.password === response.password &&
        request.hostname === response.hostname &&
        request.port === response.port &&
        request.pathname === response.pathname &&
        request.search === response.search &&
        request.hash === response.hash
      );
    }

    // Expo SDK 56 maps file:///path to this private OkHttp sentinel on Android.
    // Accept only the exact original path; a different host, port or path fails.
    return (
      request.protocol === "file:" &&
      response.protocol === "http:" &&
      response.username === "" &&
      response.password === "" &&
      response.hostname === "filesystem.local" &&
      response.port === "" &&
      request.pathname === response.pathname &&
      request.search === response.search &&
      request.hash === response.hash
    );
  } catch {
    return false;
  }
}

/** Fetch only a picker-provided local URI and decode it within one deadline. */
export async function fetchBoundedLocalUtf8(
  uri: string,
  options: BoundedUtf8ReadOptions = {},
): Promise<string> {
  const maxBytes = validatedMaxBytes(options.maxBytes);
  const declaredBytes = validatedOptionalSize(options.declaredBytes, maxBytes);
  if (!isLocalFileUri(uri)) throw fail("unsafe_source");
  if (typeof globalThis.fetch !== "function") throw fail("read_failed");

  const timeoutMs = validatedTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  return runWithDeadline(
    async () => {
      const response = await globalThis.fetch(uri, {
        redirect: "error",
        signal: controller.signal,
      });
      if (response.redirected === true || !isMatchingLocalResponseUri(uri, response.url)) {
        throw fail("unsafe_source");
      }
      return readBoundedUtf8Response(response, {
        ...options,
        declaredBytes,
        signal: controller.signal,
        timeoutMs,
      });
    },
    timeoutMs,
    options.signal,
    () => controller.abort(),
  );
}
