import {
  BoundedFileReadError,
  MAX_BOUNDED_FILE_BYTES,
  fetchBoundedLocalUtf8,
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
          index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined },
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

    await expect(readBoundedUtf8Stream(malformed)).rejects.toMatchObject<Partial<BoundedFileReadError>>({
      code: "invalid_encoding",
    });
  });

  test("decodes a multibyte character split across stream chunks", async () => {
    const split = streamFrom([new Uint8Array([0xed, 0x95]), new Uint8Array([0x9c, 0xea, 0xb8, 0x80])]);

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

  test("rejects content-length mismatches after a streamed read", async () => {
    const response = responseWith(streamFrom([new Uint8Array([111, 107])]), "3");

    await expect(readBoundedUtf8Response(response)).rejects.toMatchObject<Partial<BoundedFileReadError>>({
      code: "size_mismatch",
    });
  });

  test("only buffers a non-streaming response with trusted picker size and rechecks actual bytes", async () => {
    const arrayBuffer = jest.fn(() => Promise.resolve(new Uint8Array([97, 98, 99]).buffer));
    const response = responseWith(null, "3", arrayBuffer);

    await expect(readBoundedUtf8Response(response)).rejects.toMatchObject<Partial<BoundedFileReadError>>({
      code: "unverifiable_size",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();

    await expect(readBoundedUtf8Response(response, { declaredBytes: 2 })).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({ code: "size_mismatch" });
    expect(arrayBuffer).not.toHaveBeenCalled();

    await expect(readBoundedUtf8Response(response, { declaredBytes: 3 })).resolves.toBe("abc");
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  test("rejects mismatched or over-limit actual bytes immediately after a buffered fallback", async () => {
    const shortResponse = responseWith(
      null,
      "3",
      jest.fn(() => Promise.resolve(new Uint8Array([97, 98]).buffer)),
    );
    await expect(readBoundedUtf8Response(shortResponse, { declaredBytes: 3 })).rejects.toMatchObject<
      Partial<BoundedFileReadError>
    >({ code: "size_mismatch" });

    const oversizedResponse = responseWith(
      null,
      "4",
      jest.fn(() => Promise.resolve(new Uint8Array([97, 98, 99, 100, 101]).buffer)),
    );
    await expect(
      readBoundedUtf8Response(oversizedResponse, { declaredBytes: 4, maxBytes: 4 }),
    ).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "too_large" });
  });

  test("reads a Blob in bounded chunks and verifies its actual size", async () => {
    const blob = new Blob([new Uint8Array([0x73, 0x61, 0x66, 0x65])]);

    await expect(readBoundedUtf8Blob(blob)).resolves.toBe("safe");
  });
});

describe("local URI fetch boundary", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test.each(["https://example.com/private.txt", "http://127.0.0.1/private.txt", "data:text/plain,x"])(
    "rejects non-local URI %s before fetch",
    async (uri) => {
      const fetchSpy = jest.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const read = fetchBoundedLocalUtf8(uri, { declaredBytes: 1 });

      await expect(read).rejects.toMatchObject<Partial<BoundedFileReadError>>({ code: "unsafe_source" });
      await expect(read).rejects.not.toThrow(uri);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
