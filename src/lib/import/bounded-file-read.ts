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
  /** Absolute wall-clock deadline shared by a multi-stage extraction. */
  deadlineAtMs?: number;
}

export interface BoundedLocalReadOptions extends BoundedUtf8ReadOptions {
  /** Browser pickers use blob: URLs; callers must opt in explicitly. */
  allowWebBlob?: boolean;
}

interface ChunkReader {
  read(): Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel?(): Promise<unknown> | unknown;
  releaseLock?(): void;
}

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

function timeoutForOptions(options: BoundedUtf8ReadOptions): number {
  const timeoutMs = validatedTimeoutMs(options.timeoutMs);
  if (options.deadlineAtMs == null) return timeoutMs;
  if (!Number.isSafeInteger(options.deadlineAtMs) || options.deadlineAtMs <= 0) throw fail("read_failed");
  const remainingMs = options.deadlineAtMs - Date.now();
  if (remainingMs <= 0) throw fail("timed_out");
  return Math.max(1, Math.min(timeoutMs, remainingMs));
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

function stopQuietly(reader: ChunkReader): void {
  try {
    Promise.resolve(reader.cancel?.()).catch(() => undefined);
  } catch {
    // The safe error returned to the caller must not expose provider details.
  }
}

function runWithDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  onStop?: () => void,
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
        onStop?.();
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

async function decodeReader(
  reader: ChunkReader,
  options: BoundedUtf8ReadOptions,
  maxBytes: number,
  expectedBytes: number | null,
): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let actualBytes = 0;

  const operation = async () => {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      if (!(chunk instanceof Uint8Array)) throw fail("read_failed");
      if (chunk.byteLength > maxBytes - actualBytes) throw fail("too_large");
      actualBytes += chunk.byteLength;
      try {
        parts.push(decoder.decode(chunk, { stream: true }));
      } catch {
        throw fail("invalid_encoding");
      }
    }
    try {
      parts.push(decoder.decode());
    } catch {
      throw fail("invalid_encoding");
    }
    requireMatchingSizes(expectedBytes, actualBytes);
    return parts.join("");
  };

  try {
    return await runWithDeadline(operation, timeoutForOptions(options), options.signal, () =>
      stopQuietly(reader),
    );
  } catch (error) {
    stopQuietly(reader);
    throw sanitized(error);
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // A timed-out provider may still have a pending read; cancellation is enough.
    }
  }
}

async function readByteReader(
  reader: ChunkReader,
  options: BoundedUtf8ReadOptions,
  maxBytes: number,
  expectedBytes: number | null,
): Promise<Uint8Array> {
  const fixed = expectedBytes == null ? null : new Uint8Array(expectedBytes);
  const chunks: Uint8Array[] = [];
  let actualBytes = 0;

  const operation = async () => {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      if (!(chunk instanceof Uint8Array)) throw fail("read_failed");
      if (chunk.byteLength > maxBytes - actualBytes) throw fail("too_large");
      if (fixed && chunk.byteLength > fixed.byteLength - actualBytes) throw fail("size_mismatch");
      if (fixed) fixed.set(chunk, actualBytes);
      else chunks.push(chunk);
      actualBytes += chunk.byteLength;
    }
    requireMatchingSizes(expectedBytes, actualBytes);
    if (fixed) return fixed;

    const bytes = new Uint8Array(actualBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  };

  try {
    return await runWithDeadline(operation, timeoutForOptions(options), options.signal, () =>
      stopQuietly(reader),
    );
  } catch (error) {
    stopQuietly(reader);
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

/** Read a byte stream without accepting or retaining bytes beyond the cap. */
export async function readBoundedByteStream(
  stream: ReadableStream<Uint8Array>,
  options: BoundedUtf8ReadOptions = {},
): Promise<Uint8Array> {
  const maxBytes = validatedMaxBytes(options.maxBytes);
  const declaredBytes = validatedOptionalSize(options.declaredBytes, maxBytes);
  let reader: ChunkReader;
  try {
    reader = stream.getReader();
  } catch (error) {
    throw sanitized(error);
  }
  return readByteReader(reader, options, maxBytes, declaredBytes);
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
      const buffer = await blob.slice(offset, end).arrayBuffer();
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

  // A whole-buffer fallback cannot enforce the cap while bytes arrive. Only a
  // picker-declared local file size may authorize it, and actual bytes are
  // checked immediately after the read.
  if (declaredBytes == null) throw fail("unverifiable_size");
  if (typeof response.arrayBuffer !== "function") throw fail("read_failed");
  let consumed = false;
  const reader: ChunkReader = {
    async read() {
      if (consumed) return { done: true, value: undefined };
      consumed = true;
      const buffer = await response.arrayBuffer();
      return { done: false, value: new Uint8Array(buffer) };
    },
  };
  return decodeReader(reader, options, maxBytes, declaredBytes);
}

/** Read raw response bytes with strict length verification and bounded fallback. */
export async function readBoundedByteResponse(
  response: Response,
  options: BoundedUtf8ReadOptions = {},
): Promise<Uint8Array> {
  const maxBytes = validatedMaxBytes(options.maxBytes);
  const declaredBytes = validatedOptionalSize(options.declaredBytes, maxBytes);
  const contentLength = parsedContentLength(response, maxBytes);
  requireMatchingSizes(declaredBytes, contentLength);
  if (response.ok === false) throw fail("read_failed");
  const expectedBytes = declaredBytes ?? contentLength;

  if (response.body && typeof response.body.getReader === "function") {
    return readBoundedByteStream(response.body, { ...options, declaredBytes: expectedBytes });
  }

  if (declaredBytes == null) throw fail("unverifiable_size");
  if (typeof response.arrayBuffer !== "function") throw fail("read_failed");
  let consumed = false;
  const reader: ChunkReader = {
    async read() {
      if (consumed) return { done: true, value: undefined };
      consumed = true;
      const buffer = await response.arrayBuffer();
      return { done: false, value: new Uint8Array(buffer) };
    },
  };
  return readByteReader(reader, options, maxBytes, declaredBytes);
}

function currentWebOrigin(): string | null {
  const origin = globalThis.location?.origin;
  if (!origin || origin === "null") return null;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

function isLocalFileUri(uri: string, allowWebBlob = false): boolean {
  if (uri.length === 0 || uri.length > 8_192) return false;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "blob:") {
      const origin = currentWebOrigin();
      return allowWebBlob && origin != null && parsed.origin !== "null" && parsed.origin === origin;
    }
    if (parsed.protocol === "content:") return uri.startsWith("content://");
    if (parsed.protocol !== "file:") return false;
    return parsed.hostname === "" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

/** Decode bytes as UTF-8 without replacement characters or provider detail leaks. */
export function decodeBoundedUtf8Bytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw fail("invalid_encoding");
  }
}

/** Fetch only a picker-provided local source and return bounded raw bytes. */
export async function fetchBoundedLocalBytes(
  uri: string,
  options: BoundedLocalReadOptions = {},
): Promise<Uint8Array> {
  const maxBytes = validatedMaxBytes(options.maxBytes);
  const declaredBytes = validatedOptionalSize(options.declaredBytes, maxBytes);
  if (!isLocalFileUri(uri, options.allowWebBlob === true)) throw fail("unsafe_source");
  if (typeof globalThis.fetch !== "function") throw fail("read_failed");

  const timeoutMs = timeoutForOptions(options);
  const controller = new AbortController();
  return runWithDeadline(
    async () => {
      const response = await globalThis.fetch(uri, {
        redirect: "error",
        signal: controller.signal,
      });
      if (
        response.redirected === true ||
        (response.url && !isLocalFileUri(response.url, options.allowWebBlob === true))
      ) {
        throw fail("unsafe_source");
      }
      return readBoundedByteResponse(response, {
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

/** Fetch only a picker-provided local URI and decode it within one deadline. */
export async function fetchBoundedLocalUtf8(
  uri: string,
  options: BoundedLocalReadOptions = {},
): Promise<string> {
  return decodeBoundedUtf8Bytes(await fetchBoundedLocalBytes(uri, options));
}
