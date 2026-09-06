type KeyFetcher<T> = (signal: AbortSignal) => Promise<T[]>;

type VerifierKeyCacheOptions = {
  timeoutMs: number;
  ttlMs: number;
  maxStaleMs: number;
  refreshCooldownMs: number;
  now?: () => number;
};

export async function readBoundedJsonResponse(
  response: Pick<Response, 'headers' | 'body'>,
  maxBytes: number,
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
    await response.body?.cancel().catch(() => undefined);
    throw new Error('invalid verifier-key response');
  }
  if (!response.body) throw new Error('missing verifier-key response');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('verifier-key response too large');
      }
      chunks.push(value.slice());
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export class VerifierKeyCache<T> {
  private cached: { at: number; keys: T[] } | null = null;
  private inFlight: Promise<T[]> | null = null;
  private lastRefreshAttemptAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly fetchKeys: KeyFetcher<T>,
    private readonly options: VerifierKeyCacheOptions,
  ) {
    if (
      options.timeoutMs <= 0 || options.ttlMs <= 0 ||
      options.maxStaleMs < options.ttlMs || options.refreshCooldownMs < 0
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

    if (now - this.lastRefreshAttemptAt < this.options.refreshCooldownMs) {
      // A just-refreshed set can prove that an unknown key really is absent.
      // After a failed refresh, however, stale keys may verify known key IDs
      // but must not turn a rotated-key infrastructure failure into a 403.
      if (
        this.cached &&
        (age < this.options.ttlMs || (staleIfError && age <= this.options.maxStaleMs))
      ) return this.cached.keys;
      throw new Error('verifier-key refresh throttled');
    }

    if (!this.inFlight) {
      this.lastRefreshAttemptAt = now;
      this.inFlight = this.refresh();
    }
    return this.awaitRefresh(this.inFlight, staleIfError);
  }

  private async awaitRefresh(refresh: Promise<T[]>, staleIfError: boolean): Promise<T[]> {
    try {
      const keys = await refresh;
      if (this.inFlight === refresh) this.cached = { at: this.now(), keys };
      return keys;
    } catch (error) {
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
