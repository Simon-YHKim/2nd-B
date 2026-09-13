import {
  BoundedFileReadError,
  MAX_BOUNDED_FILE_BYTES,
  fetchBoundedLocalBytes,
  fetchBoundedLocalUtf8,
  readBoundedByteResponse,
  readBoundedByteStream,
  readBoundedUtf8Blob,
  readBoundedUtf8Response,
  readBoundedUtf8Stream,
} from "../bounded-file-read";

function streamFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return {
    getReader: () => ({
      read: jest.fn(() =>
        Promise.resolve(
          index < chunks.length
            ? { done: false, value: chunks[index++] }
            : { done: true, value: undefined },
        ),
      ),
      cancel: jest.fn(() => Promise.resolve()),
      releaseLock: jest.fn(),
    }),
  } as unknown as ReadableStream<Uint8Array>;
}

function responseWith(
  body: ReadableStream<Uint8Array> | null,
  contentLength: string | null = null,
  arrayBuffer?: () => Promise<ArrayBuffer>,
): Response {
  return {
    ok: true,
    body,
    headers: { get: jest.fn(() => contentLength) },
    arrayBuffer,
  } as unknown as Response;
}

function installLocationOrigin(origin: string): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin } });
  return () => {
    if (original) Object.defineProperty(globalThis, "location", original);
    else Reflect.deleteProperty(globalThis, "location");
  };
}

describe("bounded UTF-8 file reads", () => {
  test("uses the existing 10 MiB extraction boundary", () => {
    expect(MAX_BOUNDED_FILE_BYTES).toBe(10 * 1024 * 1024);
  });

  test("rejects oversized declared input before opening a stream", async () => {
    const getReader = jest.fn();
    const stream = { getReader } as unknown as ReadableStream<Uint8Array>;

    await expect(
      readBoundedUtf8Stream(stream, {
        declaredBytes: MAX_BOUNDED_FILE_BYTES + 1,
      }),
    ).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "too_large" });
    expect(getReader).not.toHaveBeenCalled();
  });

  test("checks streamed bytes before accumulating an over-limit chunk", async () => {
    const stream = streamFrom([new Uint8Array([97, 98, 99]), new Uint8Array([100, 101])]);

    await expect(readBoundedUtf8Stream(stream, { maxBytes: 4 })).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({ code: "too_large" });
  });

  test("fatally rejects malformed UTF-8", async () => {
    const malformed = streamFrom([new Uint8Array([0xc3, 0x28])]);

    await expect(readBoundedUtf8Stream(malformed)).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({
      code: "invalid_encoding",
    });
  });

  test("decodes a multibyte character split across stream chunks", async () => {
    const split = streamFrom([
      new Uint8Array([0xed, 0x95]),
      new Uint8Array([0x9c, 0xea, 0xb8, 0x80]),
    ]);

    await expect(readBoundedUtf8Stream(split, { declaredBytes: 6 })).resolves.toBe("한글");
  });

  test("times out a stalled stream without leaking source details", async () => {
    const stalled = {
      getReader: () => ({
        read: () => new Promise<never>(() => undefined),
        cancel: jest.fn(() => Promise.resolve()),
        releaseLock: jest.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;

    const read = readBoundedUtf8Stream(stalled, { timeoutMs: 5 });

    await expect(read).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "timed_out" });
    await expect(read).rejects.not.toThrow("file://");
  });

  test("honors an external AbortSignal and cancels the active reader", async () => {
    const cancel = jest.fn(() => Promise.resolve());
    const stalled = {
      getReader: () => ({
        read: () => new Promise<never>(() => undefined),
        cancel,
        releaseLock: jest.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;
    const controller = new AbortController();

    const read = readBoundedUtf8Stream(stalled, { signal: controller.signal });
    controller.abort();

    await expect(read).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "aborted" });
    expect(cancel).toHaveBeenCalled();
  });

  test("bounds an immediately-resolving zero-byte stream without starving the deadline", async () => {
    let reads = 0;
    const stream = {
      getReader: () => ({
        read: () => {
          reads += 1;
          return Promise.resolve(
            reads <= 250_000
              ? { done: false, value: new Uint8Array(0) }
              : { done: true, value: undefined },
          );
        },
        cancel: jest.fn(() => Promise.resolve()),
        releaseLock: jest.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;

    await expect(
      readBoundedUtf8Stream(stream, { maxBytes: 1, timeoutMs: 1 }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/^(read_failed|timed_out)$/),
    });
    expect(reads).toBeLessThan(250_000);
  });

  test("caps total chunk fragmentation independently of the byte ceiling", async () => {
    let reads = 0;
    const stream = {
      getReader: () => ({
        read: () => {
          reads += 1;
          return Promise.resolve(
            reads <= 250_000
              ? { done: false, value: new Uint8Array([97]) }
              : { done: true, value: undefined },
          );
        },
        cancel: jest.fn(() => Promise.resolve()),
        releaseLock: jest.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;

    await expect(readBoundedUtf8Stream(stream, { timeoutMs: 60_000 })).rejects.toMatchObject({
      code: "read_failed",
    });
    expect(reads).toBeLessThan(250_000);
  });

  test("coalesces acceptable one-byte fragments before invoking the decoder", async () => {
    const bytes = 4_096;
    let reads = 0;
    const decode = jest.spyOn(TextDecoder.prototype, "decode");
    const stream = {
      getReader: () => ({
        read: () => {
          reads += 1;
          return Promise.resolve(
            reads <= bytes
              ? { done: false, value: new Uint8Array([97]) }
              : { done: true, value: undefined },
          );
        },
        cancel: jest.fn(() => Promise.resolve()),
        releaseLock: jest.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;

    try {
      await expect(
        readBoundedUtf8Stream(stream, { declaredBytes: bytes, timeoutMs: 60_000 }),
      ).resolves.toHaveLength(bytes);
      expect(decode).toHaveBeenCalledTimes(2);
    } finally {
      decode.mockRestore();
    }
  });

  test("yields to an external abort during immediately-resolving fragmented reads", async () => {
    let reads = 0;
    const stream = {
      getReader: () => ({
        read: () => {
          reads += 1;
          return Promise.resolve(
            reads <= 250_000
              ? { done: false, value: new Uint8Array([97]) }
              : { done: true, value: undefined },
          );
        },
        cancel: jest.fn(() => Promise.resolve()),
        releaseLock: jest.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);

    await expect(
      readBoundedUtf8Stream(stream, { signal: controller.signal, timeoutMs: 60_000 }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(reads).toBeLessThan(250_000);
  });

  test("waits for one reader cancellation before releasing its lock", async () => {
    const order: string[] = [];
    const cancel = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("cancelled");
            resolve();
          }, 5);
        }),
    );
    const stream = {
      getReader: () => ({
        read: () => new Promise<never>(() => undefined),
        cancel,
        releaseLock: () => order.push("released"),
      }),
    } as unknown as ReadableStream<Uint8Array>;
    const controller = new AbortController();

    const read = readBoundedUtf8Stream(stream, { signal: controller.signal });
    controller.abort();

    await expect(read).rejects.toMatchObject({ code: "aborted" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["cancelled", "released"]);
  });

  test("rejects content-length mismatches after a streamed read", async () => {
    const response = responseWith(streamFrom([new Uint8Array([111, 107])]), "3");

    await expect(readBoundedUtf8Response(response)).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({
      code: "size_mismatch",
    });
  });

  test("never consumes an unbounded whole-buffer response fallback", async () => {
    const arrayBuffer = jest.fn(() => Promise.resolve(new Uint8Array([97, 98, 99]).buffer));
    const response = responseWith(null, "3", arrayBuffer);

    await expect(readBoundedUtf8Response(response)).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({
      code: "unverifiable_size",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();

    await expect(readBoundedUtf8Response(response, { declaredBytes: 3 })).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({ code: "unverifiable_size" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  test("stops on a stale declared size before consuming the remainder", async () => {
    let reads = 0;
    const reader = {
      read: jest.fn(() => {
        reads += 1;
        return Promise.resolve(
          reads <= 4
            ? { done: false, value: new Uint8Array([97]) }
            : { done: true, value: undefined },
        );
      }),
      cancel: jest.fn(() => Promise.resolve()),
      releaseLock: jest.fn(),
    };
    const stream = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;

    await expect(readBoundedUtf8Stream(stream, { declaredBytes: 1 })).rejects.toMatchObject({
      code: "size_mismatch",
    });
    expect(reads).toBe(2);
  });

  test("reads a Blob in bounded chunks and verifies its actual size", async () => {
    const blob = new Blob([new Uint8Array([0x73, 0x61, 0x66, 0x65])]);

    await expect(readBoundedUtf8Blob(blob)).resolves.toBe("safe");
  });

  test("uses bounded Blob slices when stream() is unavailable", async () => {
    const bytes = new TextEncoder().encode("slice-safe");
    const blob = {
      size: bytes.byteLength,
      slice: (start: number, end: number) => ({
        arrayBuffer: () => Promise.resolve(bytes.slice(start, end).buffer),
      }),
    } as unknown as Blob;

    await expect(readBoundedUtf8Blob(blob)).resolves.toBe("slice-safe");
  });

  test("fails closed when neither Blob streams nor bounded slice reads exist", async () => {
    const blob = {
      size: 4,
      slice: () => ({}),
    } as unknown as Blob;

    await expect(readBoundedUtf8Blob(blob)).rejects.toMatchObject({ code: "read_failed" });
  });
});

describe("bounded raw byte reads", () => {
  test("does not preallocate an untrusted declared size before bytes arrive", async () => {
    const OriginalUint8Array = globalThis.Uint8Array;
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Uint8Array");
    const allocations: number[] = [];
    const TrackingUint8Array = new Proxy(OriginalUint8Array, {
      construct(target, args) {
        if (typeof args[0] === "number") allocations.push(args[0]);
        return Reflect.construct(target, args, target);
      },
    });
    const stream = streamFrom([]);

    Object.defineProperty(globalThis, "Uint8Array", {
      configurable: true,
      writable: true,
      value: TrackingUint8Array,
    });
    try {
      await expect(
        readBoundedByteStream(stream, { declaredBytes: MAX_BOUNDED_FILE_BYTES }),
      ).rejects.toMatchObject({ code: "size_mismatch" });
      expect(Math.max(0, ...allocations)).toBeLessThanOrEqual(64 * 1024);
    } finally {
      if (originalDescriptor) Object.defineProperty(globalThis, "Uint8Array", originalDescriptor);
      else Object.defineProperty(globalThis, "Uint8Array", { value: OriginalUint8Array });
    }
  });

  test("grows only to the declared boundary and returns an exact-sized buffer", async () => {
    const first = new Uint8Array(60_000).fill(1);
    const second = new Uint8Array(40_000).fill(2);

    const bytes = await readBoundedByteStream(streamFrom([first, second]), {
      declaredBytes: 100_000,
    });

    expect(bytes).toHaveLength(100_000);
    expect(bytes.buffer.byteLength).toBe(100_000);
    expect(bytes[59_999]).toBe(1);
    expect(bytes[60_000]).toBe(2);
  });

  test.each([
    [
      "UTF-8",
      (stream: ReadableStream<Uint8Array>, deadlineAtMs: number) =>
        readBoundedUtf8Stream(stream, { deadlineAtMs }),
    ],
    [
      "raw",
      (stream: ReadableStream<Uint8Array>, deadlineAtMs: number) =>
        readBoundedByteStream(stream, { deadlineAtMs }),
    ],
  ])(
    "cancels and releases an acquired %s reader when the deadline already expired",
    async (_kind, read) => {
      const cancel = jest.fn(() => Promise.resolve());
      const releaseLock = jest.fn();
      const readerRead = jest.fn();
      const getReader = jest.fn(() => ({ read: readerRead, cancel, releaseLock }));
      const stream = { getReader } as unknown as ReadableStream<Uint8Array>;

      await expect(read(stream, Date.now() - 1)).rejects.toMatchObject({ code: "timed_out" });
      expect(getReader).toHaveBeenCalledTimes(1);
      expect(readerRead).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(releaseLock).toHaveBeenCalledTimes(1);
    },
  );

  test("fails closed on a zero-progress byte stream", async () => {
    let reads = 0;
    const stream = {
      getReader: () => ({
        read: () => {
          reads += 1;
          return Promise.resolve({ done: false, value: new Uint8Array(0) });
        },
        cancel: jest.fn(() => Promise.resolve()),
        releaseLock: jest.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;

    await expect(
      readBoundedByteResponse(responseWith(stream), { maxBytes: 1, timeoutMs: 60_000 }),
    ).rejects.toMatchObject({ code: "read_failed" });
    expect(reads).toBeLessThan(100);
  });

  test("never consumes an unbounded whole-buffer response fallback", async () => {
    const arrayBuffer = jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]).buffer));
    const response = responseWith(null, "3", arrayBuffer);

    await expect(readBoundedByteResponse(response, { declaredBytes: 3 })).rejects.toMatchObject({
      code: "unverifiable_size",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("local URI fetch boundary", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test.each([
    "https://example.com/private.txt",
    "http://127.0.0.1/private.txt",
    "data:text/plain,x",
  ])("rejects non-local URI %s before fetch", async (uri) => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const read = fetchBoundedLocalUtf8(uri, { declaredBytes: 1 });

    await expect(read).rejects.toMatchObject<Partial<BoundedFileReadError>>({
      code: "unsafe_source",
    });
    await expect(read).rejects.not.toThrow(uri);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("rejects a remote final response URL and disables redirects", async () => {
    const response = {
      ...responseWith(streamFrom([new Uint8Array([97])]), "1"),
      redirected: false,
      url: "https://example.com/redirected.txt",
    } as Response;
    const fetchSpy = jest.fn().mockResolvedValue(response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      fetchBoundedLocalUtf8("file:///cache/local.txt", { declaredBytes: 1 }),
    ).rejects.toMatchObject({
      code: "unsafe_source",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "file:///cache/local.txt",
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    );
  });

  test("rejects a response marked redirected even when its final URL looks local", async () => {
    const response = {
      ...responseWith(streamFrom([new Uint8Array([97])]), "1"),
      redirected: true,
      url: "file:///cache/local.txt",
    } as Response;
    globalThis.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    await expect(
      fetchBoundedLocalUtf8("file:///cache/local.txt", { declaredBytes: 1 }),
    ).rejects.toMatchObject({ code: "unsafe_source" });
  });

  test("accepts Expo Android's exact internal file URL but rejects a changed path", async () => {
    const local = {
      ...responseWith(streamFrom([new Uint8Array([97])]), "1"),
      redirected: false,
      url: "http://filesystem.local/cache/local.txt",
    } as Response;
    globalThis.fetch = jest.fn().mockResolvedValue(local) as unknown as typeof fetch;

    await expect(
      fetchBoundedLocalUtf8("file:///cache/local.txt", { declaredBytes: 1 }),
    ).resolves.toBe("a");

    const changedPath = {
      ...responseWith(streamFrom([new Uint8Array([97])]), "1"),
      redirected: false,
      url: "http://filesystem.local/cache/other.txt",
    } as Response;
    globalThis.fetch = jest.fn().mockResolvedValue(changedPath) as unknown as typeof fetch;

    await expect(
      fetchBoundedLocalUtf8("file:///cache/local.txt", { declaredBytes: 1 }),
    ).rejects.toMatchObject({ code: "unsafe_source" });
  });

  test("allows a browser blob URI only when the caller opts in", async () => {
    const restoreLocation = installLocationOrigin("https://app.example");
    const response = {
      ...responseWith(streamFrom([new Uint8Array([1, 2, 3])]), "3"),
      redirected: false,
      url: "blob:https://app.example/id",
    } as Response;
    const fetchSpy = jest.fn().mockResolvedValue(response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      await expect(
        fetchBoundedLocalBytes("blob:https://app.example/id", { declaredBytes: 3 }),
      ).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "unsafe_source" });
      await expect(
        fetchBoundedLocalBytes("blob:https://evil.example/id", {
          allowWebBlob: true,
          declaredBytes: 3,
        }),
      ).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "unsafe_source" });
      await expect(
        fetchBoundedLocalBytes("blob:null/id", { allowWebBlob: true, declaredBytes: 3 }),
      ).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "unsafe_source" });
      expect(fetchSpy).not.toHaveBeenCalled();

      await expect(
        fetchBoundedLocalBytes("blob:https://app.example/id", {
          allowWebBlob: true,
          declaredBytes: 3,
        }),
      ).resolves.toEqual(new Uint8Array([1, 2, 3]));
      expect(fetchSpy).toHaveBeenCalledWith(
        "blob:https://app.example/id",
        expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
      );
    } finally {
      restoreLocation();
    }
  });

  test("bounds an unknown-length byte stream before accumulating the overflowing chunk", async () => {
    const response = responseWith(
      streamFrom([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]),
      null,
    );

    await expect(readBoundedByteResponse(response, { maxBytes: 4 })).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({ code: "too_large" });
  });

  test("uses one abortable deadline for local fetch and body consumption", async () => {
    let fetchSignal: AbortSignal | undefined;
    globalThis.fetch = jest.fn((_uri: string, init?: RequestInit) => {
      fetchSignal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    const read = fetchBoundedLocalBytes("file:///slow.bin", {
      declaredBytes: 1,
      timeoutMs: 5,
    });

    await expect(read).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "timed_out" });
    expect(fetchSignal?.aborted).toBe(true);
  });

  test("waits a bounded interval for body cancellation before settling a timeout", async () => {
    const order: string[] = [];
    const cancel = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          order.push("cancel-start");
          setTimeout(() => {
            order.push("cancel-done");
            resolve();
          }, 20);
        }),
    );
    const body = {
      getReader: () => ({
        read: () => new Promise<never>(() => undefined),
        cancel,
        releaseLock: () => order.push("released"),
      }),
    } as unknown as ReadableStream<Uint8Array>;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ...responseWith(body, "1"),
      redirected: false,
      url: "file:///slow-body.bin",
    }) as unknown as typeof fetch;

    await expect(
      fetchBoundedLocalBytes("file:///slow-body.bin", { declaredBytes: 1, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "timed_out" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["cancel-start", "cancel-done", "released"]);
  });

  test("releases a timed-out body after the cleanup grace when cancellation never settles", async () => {
    const cancel = jest.fn(() => new Promise<never>(() => undefined));
    const releaseLock = jest.fn();
    const body = {
      getReader: () => ({
        read: () => new Promise<never>(() => undefined),
        cancel,
        releaseLock,
      }),
    } as unknown as ReadableStream<Uint8Array>;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ...responseWith(body, "1"),
      redirected: false,
      url: "file:///never-cancels.bin",
    }) as unknown as typeof fetch;
    const startedAt = Date.now();

    await expect(
      fetchBoundedLocalBytes("file:///never-cancels.bin", { declaredBytes: 1, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "timed_out" });
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  test("rejects redirected or remote response URLs even after a local request", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ...responseWith(streamFrom([new Uint8Array([1])]), "1"),
      redirected: true,
      url: "https://example.com/secret",
    }) as unknown as typeof fetch;

    await expect(
      fetchBoundedLocalBytes("file:///safe.bin", { declaredBytes: 1 }),
    ).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "unsafe_source" });
  });
});
