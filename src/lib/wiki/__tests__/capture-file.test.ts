// Tests for the MIME → text extraction logic in capture-file.ts. The
// extractText() helper is exported so we can test it without going through
// expo-document-picker. PDF and DOCX paths are mocked at the dynamic-import
// boundary; the assertions only verify dispatching + size cap + null safety.

import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";

const originalFetch = globalThis.fetch;

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("../pdf-worker", () => ({
  ensurePdfWorker: jest.fn(() => Promise.resolve()),
}));

jest.mock(
  "pdfjs-dist",
  () => ({
    // ⚠ getter-only 다 — **이 저장소가 겪은 버그를 테스트가 가리지 않도록.**
    // 진짜 pdfjs 는 ESM 네임스페이스라 이 속성에 대입하면 TypeError 가 난다.
    // 예전 목은 평범한 쓰기 가능 객체여서, 프로덕션에서 던지는 대입이 테스트에서만
    // 조용히 성공했다. 그래서 "웹 PDF 가 안 된다"가 초록 CI 뒤에 숨어 있었다.
    // 누군가 GlobalWorkerOptions 대입을 되살리면 여기서 먼저 빨개진다.
    get GlobalWorkerOptions(): { workerSrc?: string } {
      return {};
    },
    getDocument: jest.fn(() => ({
      destroy: jest.fn(() => Promise.resolve()),
      promise: Promise.resolve({
        numPages: 2,
        getPage: (n: number) =>
          Promise.resolve({
            getTextContent: () =>
              Promise.resolve({
                items: [{ str: `page${n}-word1` }, { str: `page${n}-word2` }],
              }),
          }),
      }),
    })),
  }),
  { virtual: true },
);

jest.mock(
  "mammoth",
  () => ({
    extractRawText: jest.fn(() => Promise.resolve({ value: "  Hello DOCX  " })),
  }),
  { virtual: true },
);

import {
  FILE_EXTRACTION_TIMEOUT_MS,
  MAX_EXTRACT_BYTES,
  MAX_EXTRACTED_FILE_TEXT_CHARS,
  MAX_IMPORT_FILE_COUNT,
  MAX_IMPORT_TOTAL_BYTES,
  MAX_IMPORT_TOTAL_TEXT_CHARS,
  MAX_PDF_PAGES,
  extractText,
  normalizeFileMimeType,
  normalizeFileTextResult,
  pickFile,
  pickImportFiles,
} from "../capture-file";

const documentPickerMock = DocumentPicker as unknown as {
  getDocumentAsync: jest.Mock;
};

function mockFetch(body: string | ArrayBuffer) {
  const bytes =
    typeof body === "string"
      ? new TextEncoder().encode(body)
      : new Uint8Array(body);
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    redirected: false,
    url: "",
    headers: { get: jest.fn(() => String(bytes.byteLength)) },
    body: streamFromBytes(bytes),
  }) as unknown as typeof fetch;
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let consumed = false;
  return {
    getReader: () => ({
      read: jest.fn(() => {
        if (consumed) return Promise.resolve({ done: true, value: undefined });
        consumed = true;
        return Promise.resolve({ done: false, value: bytes });
      }),
      cancel: jest.fn(() => Promise.resolve()),
      releaseLock: jest.fn(),
    }),
  } as unknown as ReadableStream<Uint8Array>;
}

interface TestZipOptions {
  encrypted?: boolean;
  method?: 0 | 8;
  payload?: Uint8Array;
  payloadBytes?: number;
  reportedCentralBytesDelta?: number;
  uncompressedBytes?: number;
  zip64?: boolean;
}

function makeStoredZip(options: TestZipOptions = {}): ArrayBuffer {
  const name = new TextEncoder().encode("[Content_Types].xml");
  const payload = options.payload ?? new Uint8Array(options.payloadBytes ?? 8).fill(65);
  const localBytes = 30 + name.byteLength + payload.byteLength;
  const centralBytes = 46 + name.byteLength;
  const out = new Uint8Array(localBytes + centralBytes + 22);
  const view = new DataView(out.buffer);
  const flags = options.encrypted ? 1 : 0;
  const method = options.method ?? 0;
  const uncompressedBytes = options.zip64 ? 0xffffffff : (options.uncompressedBytes ?? payload.byteLength);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, flags, true);
  view.setUint16(8, method, true);
  view.setUint32(18, payload.byteLength, true);
  view.setUint32(22, uncompressedBytes, true);
  view.setUint16(26, name.byteLength, true);
  out.set(name, 30);
  out.set(payload, 30 + name.byteLength);

  const centralOffset = localBytes;
  view.setUint32(centralOffset, 0x02014b50, true);
  view.setUint16(centralOffset + 4, 20, true);
  view.setUint16(centralOffset + 6, 20, true);
  view.setUint16(centralOffset + 8, flags, true);
  view.setUint16(centralOffset + 10, method, true);
  view.setUint32(centralOffset + 20, payload.byteLength, true);
  view.setUint32(centralOffset + 24, uncompressedBytes, true);
  view.setUint16(centralOffset + 28, name.byteLength, true);
  view.setUint32(centralOffset + 42, 0, true);
  out.set(name, centralOffset + 46);

  const eocdOffset = centralOffset + centralBytes;
  view.setUint32(eocdOffset, 0x06054b50, true);
  view.setUint16(eocdOffset + 8, options.zip64 ? 0xffff : 1, true);
  view.setUint16(eocdOffset + 10, options.zip64 ? 0xffff : 1, true);
  view.setUint32(eocdOffset + 12, centralBytes + (options.reportedCentralBytesDelta ?? 0), true);
  view.setUint32(eocdOffset + 16, centralOffset, true);

  return out.buffer;
}

function makeDeflatedZip(actualTextBytes: number, reportedTextBytes = actualTextBytes): ArrayBuffer {
  const source = new Uint8Array(actualTextBytes).fill(65);
  const { deflateRawSync } = require("node:zlib") as {
    deflateRawSync(input: Uint8Array): Uint8Array;
  };
  return makeStoredZip({
    method: 8,
    payload: new Uint8Array(deflateRawSync(source)),
    uncompressedBytes: reportedTextBytes,
  });
}

function installGlobalValue(name: "DecompressionStream" | "location", value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  };
}

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  documentPickerMock.getDocumentAsync.mockReset();
  (Platform as { OS: string }).OS = "web";
  (require("pdfjs-dist") as { getDocument: jest.Mock }).getDocument.mockClear();
  (require("mammoth") as { extractRawText: jest.Mock }).extractRawText.mockClear();
  (require("../pdf-worker") as { ensurePdfWorker: jest.Mock }).ensurePdfWorker.mockReset().mockResolvedValue(undefined);
});

describe("extractText", () => {
  test("text/plain → bounded local byte stream", async () => {
    mockFetch("hello world");
    const r = await extractText("file:///x.txt", "text/plain", 11);
    expect(r).toBe("hello world");
  });

  test("text/markdown → fetch().text()", async () => {
    mockFetch("# Title\n\nbody");
    const r = await extractText("file:///x.md", "text/markdown", 13);
    expect(r).toContain("# Title");
  });

  test("normalizes MIME case and parameters before text extraction", async () => {
    mockFetch("hello charset");
    const r = await extractText("file:///x.txt", " TEXT/PLAIN; charset=UTF-8 ", 13);
    expect(r).toBe("hello charset");
    expect(normalizeFileMimeType(" Application/PDF; version=1.7 ")).toBe("application/pdf");
    expect(normalizeFileMimeType("   ")).toBe("application/octet-stream");
  });

  test("infers supported MIME from filename when picker returns generic metadata", async () => {
    mockFetch("from markdown extension");

    expect(normalizeFileMimeType("application/octet-stream", "line-study.MD")).toBe("text/markdown");
    expect(normalizeFileMimeType(undefined, "scan.PDF")).toBe("application/pdf");
    expect(normalizeFileMimeType("text/plain", "wrong.pdf")).toBe("text/plain");

    const r = await extractText(
      "file:///line-study.md",
      normalizeFileMimeType("application/octet-stream", "line-study.md"),
      23,
    );
    expect(r).toBe("from markdown extension");
  });

  test("caps extracted text with an explicit marker before it reaches capture body", async () => {
    const longText = `${"x".repeat(MAX_EXTRACTED_FILE_TEXT_CHARS + 17)}\n`;
    mockFetch(longText);

    const r = await extractText("file:///long.txt", "text/plain", new TextEncoder().encode(longText).byteLength);

    expect(r?.startsWith("x".repeat(MAX_EXTRACTED_FILE_TEXT_CHARS))).toBe(true);
    expect(r).toContain(`[File text truncated: original ${MAX_EXTRACTED_FILE_TEXT_CHARS + 18} chars]`);
    expect(normalizeFileTextResult("short text")).toBe("short text");
  });

  test("file > 10MB cap → null without fetching", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const r = await extractText("file:///big.pdf", "application/pdf", 11 * 1024 * 1024);
    expect(r).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("invalid picker size metadata is treated as unsafe and does not fetch", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(extractText("file:///unknown.txt", "text/plain", Number.NaN)).resolves.toBeNull();
    await expect(extractText("file:///negative.txt", "text/plain", -1)).resolves.toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("content-length over the cap returns null before reading text", async () => {
    const getReader = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn(() => String(MAX_EXTRACT_BYTES + 1)) },
      body: { getReader },
    }) as unknown as typeof fetch;

    const r = await extractText("file:///unknown-size.txt", "text/plain", 0);

    expect(r).toBeNull();
    expect(getReader).not.toHaveBeenCalled();
  });

  test("binary extraction re-checks fetched bytes when metadata was missing", async () => {
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const arrayBuffer = jest.fn(() => Promise.resolve(new ArrayBuffer(MAX_EXTRACT_BYTES + 1)));
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn(() => null) },
      body: streamFromBytes(new Uint8Array(MAX_EXTRACT_BYTES + 1)),
      arrayBuffer,
    }) as unknown as typeof fetch;

    const r = await extractText("file:///unknown-size.pdf", "application/pdf", 0);

    expect(r).toBeNull();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  test("application/pdf → dynamic import + concatenated page text", async () => {
    mockFetch(new ArrayBuffer(8));
    const r = await extractText("file:///doc.pdf", "APPLICATION/PDF; charset=binary", 8);
    expect(r).toContain("page1-word1");
    expect(r).toContain("page2-word2");
  });

  test("application/vnd...wordprocessingml → mammoth.extractRawText", async () => {
    const docx = makeDeflatedZip(128);
    mockFetch(docx);
    const r = await extractText(
      "file:///doc.docx",
      " APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT ",
      docx.byteLength,
    );
    expect(r).toBe("Hello DOCX");
  });

  test("rejects deflate output that exceeds its claimed central-directory size", async () => {
    const mammoth = require("mammoth") as { extractRawText: jest.Mock };
    const docx = makeDeflatedZip(10_000, 100);
    mockFetch(docx);

    await expect(
      extractText(
        "file:///lying-size.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        docx.byteLength,
      ),
    ).resolves.toBeNull();
    expect(mammoth.extractRawText).not.toHaveBeenCalled();
  });

  test("fails safely when streaming deflate verification is unavailable", async () => {
    const restore = installGlobalValue("DecompressionStream", undefined);
    const mammoth = require("mammoth") as { extractRawText: jest.Mock };
    const docx = makeDeflatedZip(128);
    mockFetch(docx);

    try {
      await expect(
        extractText(
          "file:///unsupported.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          docx.byteLength,
        ),
      ).resolves.toBeNull();
      expect(mammoth.extractRawText).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test("stops PDF traversal when the cumulative text cap is reached and cleans up", async () => {
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const cleanup = jest.fn();
    const destroy = jest.fn(() => Promise.resolve());
    const getPage = jest.fn(() =>
      Promise.resolve({
        getTextContent: () =>
          Promise.resolve({ items: [{ str: "x".repeat(MAX_EXTRACTED_FILE_TEXT_CHARS + 1) }] }),
        cleanup,
      }),
    );
    pdfjs.getDocument.mockReturnValueOnce({
      destroy,
      promise: Promise.resolve({ numPages: MAX_PDF_PAGES + 5, getPage }),
    });
    mockFetch(new ArrayBuffer(8));

    const result = await extractText("file:///large.pdf", "application/pdf", 8);

    expect(result?.length).toBeGreaterThan(0);
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test("never traverses more than the PDF page ceiling", async () => {
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const destroy = jest.fn(() => Promise.resolve());
    const getPage = jest.fn((page: number) =>
      Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: `p${page}` }] }),
        cleanup: jest.fn(),
      }),
    );
    pdfjs.getDocument.mockReturnValueOnce({
      destroy,
      promise: Promise.resolve({ numPages: MAX_PDF_PAGES + 5, getPage }),
    });
    mockFetch(new ArrayBuffer(8));

    await expect(extractText("file:///many-pages.pdf", "application/pdf", 8)).resolves.not.toBeNull();
    expect(getPage).toHaveBeenCalledTimes(MAX_PDF_PAGES);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["encrypted", makeStoredZip({ encrypted: true })],
    ["ZIP64", makeStoredZip({ zip64: true })],
    ["compression-ratio bomb", makeStoredZip({ payloadBytes: 1, uncompressedBytes: 10_000 })],
    ["truncated central directory", makeStoredZip({ reportedCentralBytesDelta: 1 })],
  ])("rejects %s DOCX before mammoth", async (_caseName, docx) => {
    const mammoth = require("mammoth") as { extractRawText: jest.Mock };
    mockFetch(docx);

    await expect(
      extractText(
        "file:///unsafe.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        docx.byteLength,
      ),
    ).resolves.toBeNull();
    expect(mammoth.extractRawText).not.toHaveBeenCalled();
  });

  test.each(["https://example.com/a.txt", "http://127.0.0.1/a.txt", "data:text/plain,a"])(
    "rejects non-local capture source %s before fetch",
    async (uri) => {
      const fetchSpy = jest.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      await expect(extractText(uri, "text/plain", 1)).resolves.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  test("permits an explicitly web-scoped blob capture source", async () => {
    const restore = installGlobalValue("location", { origin: "https://app.example" });
    try {
      mockFetch("blob body");
      await expect(extractText("blob:https://app.example/id", "text/plain", 9)).resolves.toBe("blob body");
    } finally {
      restore();
    }
  });

  test.each(["blob:https://evil.example/id", "blob:null/id"])(
    "rejects foreign or opaque blob source %s before fetch",
    async (uri) => {
      const restore = installGlobalValue("location", { origin: "https://app.example" });
      const fetchSpy = jest.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
      try {
        await expect(extractText(uri, "text/plain", 1)).resolves.toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    },
  );

  test("one extraction deadline destroys a stalled PDF parser", async () => {
    jest.useFakeTimers();
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const destroy = jest.fn(() => Promise.resolve());
    pdfjs.getDocument.mockReturnValueOnce({
      destroy,
      promise: new Promise<never>(() => undefined),
    });
    mockFetch(new ArrayBuffer(8));

    const result = extractText("file:///stalled.pdf", "application/pdf", 8);
    for (let turn = 0; turn < 20 && pdfjs.getDocument.mock.calls.length === 0; turn++) {
      await Promise.resolve();
    }
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(FILE_EXTRACTION_TIMEOUT_MS);

    await expect(result).resolves.toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test("cleans up immediately when a PDF task is registered after the deadline fired", async () => {
    jest.useFakeTimers();
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const destroy = jest.fn(() => Promise.resolve());
    pdfjs.getDocument.mockImplementationOnce(() => {
      jest.advanceTimersByTime(FILE_EXTRACTION_TIMEOUT_MS);
      return { destroy, promise: new Promise<never>(() => undefined) };
    });
    mockFetch(new ArrayBuffer(8));

    await expect(extractText("file:///late-task.pdf", "application/pdf", 8)).resolves.toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test("does not create a PDF task when worker setup resolves after the shared deadline", async () => {
    jest.useFakeTimers();
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const worker = require("../pdf-worker") as { ensurePdfWorker: jest.Mock };
    let releaseWorker: (() => void) | undefined;
    worker.ensurePdfWorker.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseWorker = resolve)),
    );
    mockFetch(new ArrayBuffer(8));

    const result = extractText("file:///late-worker.pdf", "application/pdf", 8);
    for (let turn = 0; turn < 20 && worker.ensurePdfWorker.mock.calls.length === 0; turn++) {
      await Promise.resolve();
    }
    jest.advanceTimersByTime(FILE_EXTRACTION_TIMEOUT_MS);
    await expect(result).resolves.toBeNull();
    releaseWorker?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  test("the shared deadline also bounds stalled mammoth parsing", async () => {
    jest.useFakeTimers();
    const mammoth = require("mammoth") as { extractRawText: jest.Mock };
    mammoth.extractRawText.mockReturnValueOnce(new Promise<never>(() => undefined));
    const docx = makeStoredZip();
    mockFetch(docx);

    const result = extractText(
      "file:///stalled.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docx.byteLength,
    );
    for (let turn = 0; turn < 50 && mammoth.extractRawText.mock.calls.length === 0; turn++) {
      await Promise.resolve();
    }
    expect(mammoth.extractRawText).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(FILE_EXTRACTION_TIMEOUT_MS);

    await expect(result).resolves.toBeNull();
  });

  test("pickFile returns normalized MIME metadata and extracted text", async () => {
    mockFetch("picked file body");
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///picked.txt",
          name: "picked.txt",
          mimeType: " Text/Plain; Charset=UTF-8 ",
          size: 16,
        },
      ],
    });

    await expect(pickFile()).resolves.toEqual({
      uri: "file:///picked.txt",
      name: "picked.txt",
      mimeType: "text/plain",
      size: 16,
      textContent: "picked file body",
    });
  });

  test("pickFile uses filename inference when MIME is missing or generic", async () => {
    mockFetch("picked markdown body");
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///picked.md",
          name: "picked.md",
          mimeType: "application/octet-stream",
          size: 20,
        },
      ],
    });

    await expect(pickFile()).resolves.toEqual({
      uri: "file:///picked.md",
      name: "picked.md",
      mimeType: "text/markdown",
      size: 20,
      textContent: "picked markdown body",
    });
  });

  test("native platform → PDF returns null, no extraction", async () => {
    (Platform as { OS: string }).OS = "ios";
    mockFetch(new ArrayBuffer(8));
    const r = await extractText("file:///doc.pdf", "application/pdf", 8);
    expect(r).toBeNull();
  });

  test("fetch throws → returns null (never propagates)", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
    const r = await extractText("file:///x.txt", "text/plain", 1);
    expect(r).toBeNull();
  });

  test("unknown MIME → null", async () => {
    mockFetch(new ArrayBuffer(8));
    const r = await extractText("file:///x.bin", "application/octet-stream", 100);
    expect(r).toBeNull();
  });
});

describe("pickImportFiles", () => {
  test("canceled pick → empty array", async () => {
    documentPickerMock.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickImportFiles()).resolves.toEqual([]);
  });

  test("reads each asset and skips empty/unreadable ones", async () => {
    // First file has body; second is whitespace-only → dropped.
    const noteA = new TextEncoder().encode("# Note A\n\nbody");
    const empty = new TextEncoder().encode("   \n  ");
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, headers: { get: () => "14" }, body: streamFromBytes(noteA) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => "6" }, body: streamFromBytes(empty) }) as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///a.md", name: "a.md", mimeType: "text/markdown", size: 14 },
        { uri: "file:///b.md", name: "b.md", mimeType: "text/markdown", size: 6 },
      ],
    });

    await expect(pickImportFiles()).resolves.toEqual([{ name: "a.md", text: "# Note A\n\nbody" }]);
  });

  test("fails closed before reading when file count or declared aggregate exceeds its cap", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: Array.from({ length: MAX_IMPORT_FILE_COUNT + 1 }, (_, index) => ({
        uri: `file:///${index}.md`,
        name: `${index}.md`,
        mimeType: "text/markdown",
        size: 1,
      })),
    });
    await expect(pickImportFiles()).resolves.toEqual([]);

    documentPickerMock.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: "file:///a.md", name: "a.md", mimeType: "text/markdown", size: MAX_EXTRACT_BYTES },
        { uri: "file:///b.md", name: "b.md", mimeType: "text/markdown", size: MAX_EXTRACT_BYTES },
        { uri: "file:///c.md", name: "c.md", mimeType: "text/markdown", size: 1 },
      ],
    });
    expect(MAX_IMPORT_TOTAL_BYTES).toBe(MAX_EXTRACT_BYTES * 2);
    await expect(pickImportFiles()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("stops safely when unknown actual bytes exceed the remaining aggregate budget", async () => {
    const first = new Uint8Array(MAX_EXTRACT_BYTES).fill(97);
    const overflow = new Uint8Array(MAX_EXTRACT_BYTES + 1).fill(98);
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null }, body: streamFromBytes(first) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null }, body: streamFromBytes(overflow) }) as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///a.md", name: "a.md", mimeType: "text/markdown" },
        { uri: "file:///b.md", name: "b.md", mimeType: "text/markdown" },
      ],
    });

    const result = await pickImportFiles();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("a.md");
    expect(result[0].text.length).toBeLessThanOrEqual(MAX_EXTRACTED_FILE_TEXT_CHARS + 80);
  });

  test("stops before retaining text beyond the aggregate output cap", async () => {
    const text = "x".repeat(MAX_EXTRACTED_FILE_TEXT_CHARS);
    const bytes = new TextEncoder().encode(text);
    globalThis.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, headers: { get: () => String(bytes.byteLength) }, body: streamFromBytes(bytes) }),
    ) as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: Array.from({ length: 12 }, (_, index) => ({
        uri: `file:///${index}.md`,
        name: `${index}.md`,
        mimeType: "text/markdown",
        size: bytes.byteLength,
      })),
    });

    const result = await pickImportFiles();

    expect(result.reduce((sum, file) => sum + file.text.length, 0)).toBeLessThanOrEqual(MAX_IMPORT_TOTAL_TEXT_CHARS);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(12);
  });
});
