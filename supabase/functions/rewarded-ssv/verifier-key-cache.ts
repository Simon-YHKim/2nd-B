type KeyFetcher<T> = (signal: AbortSignal) => Promise<T[]>;

export type BoundedBodyReadOptions = {
  timeoutMs?: number;
  maxChunks?: number;
  maxNoProgressChunks?: number;
  signal?: AbortSignal;
};

type VerifierKeyCacheOptions = {
  timeoutMs: number;
  ttlMs: number;
  maxStaleMs: number;
  refreshCooldownMs: number;
  failureRetryMs?: number;
  now?: () => number;
};

function cancelBestEffort(
  target: { cancel(reason?: unknown): Promise<unknown> } | null | undefined,
  reason: unknown,
): void {
  try {
    void target?.cancel(reason).catch(() => undefined);
  } catch {
    // Cleanup must never replace or delay the bounded operation's result.
  }
}

export async function readBoundedBodyBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  options: BoundedBodyReadOptions = {},
): Promise<Uint8Array> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxChunks = options.maxChunks ?? 1_024;
  const maxNoProgressChunks = options.maxNoProgressChunks ?? 8;
  if (
    !Number.isSafeInteger(maxBytes) || maxBytes < 1 ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
    !Number.isSafeInteger(maxChunks) || maxChunks < 1 ||
    !Number.isSafeInteger(maxNoProgressChunks) || maxNoProgressChunks < 0
  ) throw new Error('invalid body limit');

  const reader = body.getReader();
  const buffer = new Uint8Array(maxBytes);
  let total = 0;
  let chunks = 0;
  let noProgress = 0;
  let terminalError: Error | null = null;
  let rejectDeadline: ((error: Error) => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const failRead = (message: string) => {
    if (terminalError) return;
    terminalError = new Error(message);
    rejectDeadline?.(terminalError);
    cancelBestEffort(reader, message);
  };
  const timer = setTimeout(() => failRead('body read timed out'), timeoutMs);
  const onAbort = () => failRead('body read aborted');
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (options.signal?.aborted) throw new Error('body read aborted');
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (terminalError) throw terminalError;
      if (done) break;
      chunks += 1;
      if (chunks > maxChunks) throw new Error('body stream too fragmented');
      if (!(value instanceof Uint8Array)) throw new Error('invalid body chunk');
      if (value.byteLength === 0) {
        noProgress += 1;
        if (noProgress > maxNoProgressChunks) throw new Error('body stream made no progress');
      } else {
        noProgress = 0;
        if (value.byteLength > maxBytes - total) throw new Error('body response too large');
        buffer.set(value, total);
        total += value.byteLength;
      }

      // A stream that resolves every read as a microtask can starve timers.
      // Yield periodically so the wall-clock deadline and AbortSignal run.
      if (chunks % 64 === 0) {
        await Promise.race([
          new Promise<void>((resolve) => setTimeout(resolve, 0)),
          deadline,
        ]);
      }
    }
    return buffer.slice(0, total);
  } catch (error) {
    cancelBestEffort(reader, error);
    throw terminalError ?? error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      // Cancellation is best-effort. Never replace the bounded read error with
      // a runtime-specific pending-read release failure.
    }
  }
}

export async function readBoundedJsonResponse(
  response: Pick<Response, 'headers' | 'body'>,
  maxBytes: number,
  options: BoundedBodyReadOptions = {},
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('invalid body limit');
  const mediaType = (response.headers.get('content-type') ?? '')
    .split(';', 1)[0].trim().toLowerCase();
  const declared = response.headers.get('content-length')?.trim();
  if (
    mediaType !== 'application/json' ||
    (declared !== undefined && (
      !/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > maxBytes
    ))
  ) {
    cancelBestEffort(response.body, 'invalid verifier-key response');
    throw new Error('invalid verifier-key response');
  }
  if (!response.body) throw new Error('missing verifier-key response');
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBodyBytes(response.body, maxBytes, options);
  } catch (error) {
    if (error instanceof Error && error.message === 'body response too large') {
      throw new Error('verifier-key response too large');
    }
    throw error;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export class VerifierKeyCache<T> {
  private cached: { at: number; keys: T[] } | null = null;
  private inFlight: Promise<T[]> | null = null;
  private lastSuccessfulRefreshAt = Number.NEGATIVE_INFINITY;
  private lastFailedRefreshAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly fetchKeys: KeyFetcher<T>,
    private readonly options: VerifierKeyCacheOptions,
  ) {
    if (
      options.timeoutMs <= 0 || options.ttlMs <= 0 ||
      options.maxStaleMs < options.ttlMs || options.refreshCooldownMs < 0 ||
      (options.failureRetryMs ?? 1_000) < 0
    ) throw new Error('invalid verifier-key cache options');
  }

  async get(force = false, staleIfError = true): Promise<T[]> {
    const now = this.now();
    const age = this.cached ? now - this.cached.at : Number.POSITIVE_INFINITY;
    if (!force && this.cached && age < this.options.ttlMs) return this.cached.keys;

    // Join the active network read before applying the next-attempt cooldown.
    // Otherwise concurrent callbacks after a cold start would be rejected even
    // though one bounded refresh is already in progress.
    if (this.inFlight) return this.awaitRefresh(this.inFlight, staleIfError);

    if (now - this.lastSuccessfulRefreshAt < this.options.refreshCooldownMs) {
      // A just-refreshed set can prove that an unknown key really is absent.
      // After a failed refresh, however, stale keys may verify known key IDs
      // but must not turn a rotated-key infrastructure failure into a 403.
      if (
        this.cached &&
        (age < this.options.ttlMs || (staleIfError && age <= this.options.maxStaleMs))
      ) return this.cached.keys;
      throw new Error('verifier-key refresh throttled');
    }

    // Google retries an unsuccessful callback once per second. Bound repeated
    // outage traffic, but do not let the longer successful-refresh cooldown
    // suppress the provider's entire recovery window.
    if (now - this.lastFailedRefreshAt < (this.options.failureRetryMs ?? 1_000)) {
      if (
        this.cached &&
        (age < this.options.ttlMs || (staleIfError && age <= this.options.maxStaleMs))
      ) return this.cached.keys;
      throw new Error('verifier-key refresh throttled');
    }

    if (!this.inFlight) {
      this.inFlight = this.refresh();
    }
    return this.awaitRefresh(this.inFlight, staleIfError);
  }

  private async awaitRefresh(refresh: Promise<T[]>, staleIfError: boolean): Promise<T[]> {
    try {
      const keys = await refresh;
      if (this.inFlight === refresh) {
        const refreshedAt = this.now();
        this.cached = { at: refreshedAt, keys };
        this.lastSuccessfulRefreshAt = refreshedAt;
        this.lastFailedRefreshAt = Number.NEGATIVE_INFINITY;
      }
      return keys;
    } catch (error) {
      if (this.inFlight === refresh) this.lastFailedRefreshAt = this.now();
      const staleAge = this.cached ? this.now() - this.cached.at : Number.POSITIVE_INFINITY;
      if (staleIfError && this.cached && staleAge <= this.options.maxStaleMs) {
        return this.cached.keys;
      }
      throw error;
    } finally {
      if (this.inFlight === refresh) this.inFlight = null;
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private async refresh(): Promise<T[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await this.fetchKeys(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }
}
