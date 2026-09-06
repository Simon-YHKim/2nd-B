import { fileImportSupported, pickTextFile } from "../file-read";
import { MAX_BOUNDED_FILE_BYTES } from "../bounded-file-read";

// The native branch lazily `import("expo-document-picker")`; mock it so the node
// test never loads the real native module (and react-native through it).
const mockGetDocumentAsync = jest.fn();
jest.mock("expo-document-picker", () => ({ getDocumentAsync: mockGetDocumentAsync }));

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
  });

  test("sanitizes document-provider errors that contain a local path", async () => {
    mockGetDocumentAsync.mockRejectedValue(new Error("provider failed at file:///private/person.txt"));

    const read = pickTextFile();

    await expect(read).rejects.toMatchObject({ code: "read_failed" });
    await expect(read).rejects.not.toThrow("private/person.txt");
  });
});
