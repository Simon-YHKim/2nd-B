import { fileImportSupported, pickTextFile } from "../file-read";
import { MAX_BOUNDED_FILE_BYTES } from "../bounded-file-read";

// The native branch lazily `import("expo-document-picker")`; mock it so the node
// test never loads the real native module (and react-native through it).
const mockGetDocumentAsync = jest.fn();
jest.mock("expo-document-picker", () => ({ getDocumentAsync: mockGetDocumentAsync }));

const mockDisposeOwnedTempFile = jest.fn();
const mockLeaseOwnedTempFile = jest.fn();
jest.mock("../../storage/owned-temp", () => ({
  leaseOwnedTempFile: (...args: unknown[]) => mockLeaseOwnedTempFile(...args),
}));

// jest runs with testEnvironment "node", so there is no DOM and no RN runtime
// (navigator.product !== "ReactNative"). The guard must report unsupported and
// pickTextFile must resolve null (never throw / never touch `document`).
describe("file-read web guard (unsupported env)", () => {
  test("fileImportSupported is false without a DOM or RN runtime", () => {
    expect(fileImportSupported()).toBe(false);
  });

  test("pickTextFile resolves null when unsupported", async () => {
    await expect(pickTextFile()).resolves.toBeNull();
  });
});

// Simulate the native (RN) runtime via navigator.product — the same signal the
// runtime uses — then drive the expo-document-picker + fetch read path.
describe("file-read native picker (expo-document-picker)", () => {
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    mockGetDocumentAsync.mockReset();
    mockDisposeOwnedTempFile.mockReset();
    mockDisposeOwnedTempFile.mockResolvedValue({ ok: true, status: "deleted" });
    mockLeaseOwnedTempFile.mockReset();
    mockLeaseOwnedTempFile.mockImplementation(async (uri: string) =>
      uri.startsWith("file:///cache/")
        ? { ok: true, lease: { dispose: mockDisposeOwnedTempFile } }
        : { ok: false, error: "unsafe_target" },
    );
    Object.defineProperty(globalThis, "navigator", {
      value: { product: "ReactNative" },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    globalThis.fetch = realFetch;
  });

  test("fileImportSupported is true on the native runtime", () => {
    expect(fileImportSupported()).toBe(true);
  });

  test("returns { name, text } for the chosen file (read via fetch)", async () => {
    const bytes = new TextEncoder().encode("# hello");
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/notes.md",
          name: "notes.md",
          mimeType: "text/markdown",
          size: bytes.byteLength,
        },
      ],
    });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      headers: { get: jest.fn(() => String(bytes.byteLength)) },
    }) as unknown as typeof fetch;

    await expect(pickTextFile()).resolves.toEqual({ name: "notes.md", text: "# hello" });
    expect(mockGetDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ copyToCacheDirectory: true, multiple: false }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "file:///cache/notes.md",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockLeaseOwnedTempFile).toHaveBeenCalledWith("file:///cache/notes.md");
    expect(mockDisposeOwnedTempFile).toHaveBeenCalledTimes(1);
  });

  test("does not replace a successful import when cache cleanup fails", async () => {
    const bytes = new TextEncoder().encode("safe text");
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/cleanup-fails.txt",
          name: "cleanup-fails.txt",
          mimeType: "text/plain",
          size: bytes.byteLength,
        },
      ],
    });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      headers: { get: jest.fn(() => String(bytes.byteLength)) },
    }) as unknown as typeof fetch;
    mockDisposeOwnedTempFile.mockRejectedValue(
      new Error("cleanup failed for file:///cache/cleanup-fails.txt"),
    );

    await expect(pickTextFile()).resolves.toEqual({
      name: "cleanup-fails.txt",
      text: "safe text",
    });
    expect(mockDisposeOwnedTempFile).toHaveBeenCalledTimes(1);
  });

  test("rejects picker-declared oversized files before fetch", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/too-large.txt",
          name: "too-large.txt",
          mimeType: "text/plain",
          size: MAX_BOUNDED_FILE_BYTES + 1,
        },
      ],
    });
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(pickTextFile()).rejects.toMatchObject({ code: "too_large" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockDisposeOwnedTempFile).toHaveBeenCalledTimes(1);
  });

  test("preserves the bounded read error when cache cleanup also fails", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/too-large-cleanup-fails.txt",
          name: "too-large-cleanup-fails.txt",
          mimeType: "text/plain",
          size: MAX_BOUNDED_FILE_BYTES + 1,
        },
      ],
    });
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    mockDisposeOwnedTempFile.mockRejectedValue(
      new Error("cleanup failed at file:///cache/too-large-cleanup-fails.txt"),
    );

    await expect(pickTextFile()).rejects.toMatchObject({ code: "too_large" });
    expect(mockDisposeOwnedTempFile).toHaveBeenCalledTimes(1);
  });

  test("rejects remote picker URIs before fetch", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "https://example.com/notes.txt",
          name: "notes.txt",
          mimeType: "text/plain",
          size: 5,
        },
      ],
    });
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const read = pickTextFile();

    await expect(read).rejects.toMatchObject({ code: "unsafe_source" });
    await expect(read).rejects.not.toThrow("https://example.com/notes.txt");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockDisposeOwnedTempFile).not.toHaveBeenCalled();
  });

  test.each([
    ["content provider", "content://provider/report.txt"],
    ["file outside app cache", "file:///private/provider/report.txt"],
  ])("reads a %s URI without taking deletion ownership", async (_case, uri) => {
    const bytes = new TextEncoder().encode("provider text");
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri, name: "report.txt", mimeType: "text/plain", size: bytes.byteLength }],
    });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      headers: { get: jest.fn(() => String(bytes.byteLength)) },
    }) as unknown as typeof fetch;

    await expect(pickTextFile()).resolves.toEqual({ name: "report.txt", text: "provider text" });
    expect(mockLeaseOwnedTempFile).toHaveBeenCalledWith(uri);
    expect(mockDisposeOwnedTempFile).not.toHaveBeenCalled();
  });

  test.each([
    "blob:https://example.com/id",
    "ph://provider/report.txt",
    "assets-library://asset/report.txt",
  ])("never disposes an unsupported provider/original URI: %s", async (uri) => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri, name: "report.txt", mimeType: "text/plain", size: 5 }],
    });
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(pickTextFile()).rejects.toMatchObject({ code: "unsafe_source" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockDisposeOwnedTempFile).not.toHaveBeenCalled();
  });

  test("resolves null when the user cancels", async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickTextFile()).resolves.toBeNull();
  });

  test("resolves null when no asset is returned", async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickTextFile()).resolves.toBeNull();
  });

  test("rejects on a read error so the hub can show the error state", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cache/bad.txt", name: "bad.txt", mimeType: "text/plain", size: 8 }],
    });
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error("read failed")) as unknown as typeof fetch;

    const read = pickTextFile();
    await expect(read).rejects.toMatchObject({ code: "read_failed" });
    await expect(read).rejects.not.toThrow("bad.txt");
    expect(mockDisposeOwnedTempFile).toHaveBeenCalledTimes(1);
  });

  test("disposes the cache copy after a timed-out read", async () => {
    jest.useFakeTimers();
    try {
      mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: "file:///cache/stalled.txt",
            name: "stalled.txt",
            mimeType: "text/plain",
            size: 1,
          },
        ],
      });
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: () => new Promise<never>(() => undefined),
            cancel: jest.fn(() => Promise.resolve()),
            releaseLock: jest.fn(),
          }),
        },
        headers: { get: jest.fn(() => "1") },
      });
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const read = pickTextFile();
      for (let turn = 0; turn < 10 && fetchSpy.mock.calls.length === 0; turn += 1) {
        await Promise.resolve();
      }
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const rejection = expect(read).rejects.toMatchObject({ code: "timed_out" });
      await jest.advanceTimersByTimeAsync(15_000);

      await rejection;
      expect(mockDisposeOwnedTempFile).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("sanitizes document-provider errors that contain a local path", async () => {
    mockGetDocumentAsync.mockRejectedValue(new Error("provider failed at file:///private/person.txt"));

    const read = pickTextFile();

    await expect(read).rejects.toMatchObject({ code: "read_failed" });
    await expect(read).rejects.not.toThrow("private/person.txt");
  });
});
