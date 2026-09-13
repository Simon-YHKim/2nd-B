// Tests for the MIME → text extraction logic in capture-file.ts. The
// extractText() helper is exported so we can test it without going through
// expo-document-picker. PDF and DOCX are intentionally metadata-only because
// compressed document parsers cannot be cancelled within the heap deadline.

import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const originalFetch = globalThis.fetch;

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("../../storage/owned-temp", () => ({
  leaseOwnedTempFile: jest.fn(),
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

import {
  MAX_EXTRACT_BYTES,
  MAX_EXTRACTED_FILE_TEXT_CHARS,
  MAX_IMPORT_FILE_COUNT,
  MAX_IMPORT_TOTAL_BYTES,
  MAX_IMPORT_TOTAL_TEXT_CHARS,
  extractText,
  normalizeFileMimeType,
  normalizeFileTextResult,
  pickAudioFile,
  pickFile,
  pickImportFiles,
} from "../capture-file";

const documentPickerMock = DocumentPicker as unknown as {
  getDocumentAsync: jest.Mock;
};

const ownedTempMock = require("../../storage/owned-temp") as {
  leaseOwnedTempFile: jest.Mock;
};

type ReleasePickedFile = (file: Awaited<ReturnType<typeof pickFile>>) => Promise<void>;

function releasePickedFileUnderTest(): ReleasePickedFile | undefined {
  return (require("../capture-file") as { releasePickedFile?: ReleasePickedFile }).releasePickedFile;
}

function mockFetch(body: string | ArrayBuffer) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body);
  globalThis.fetch = jest.fn((uri: string | URL | Request) =>
    Promise.resolve({
      ok: true,
      redirected: false,
      url: typeof uri === "string" ? uri : uri.toString(),
      headers: { get: jest.fn(() => String(bytes.byteLength)) },
      body: streamFromBytes(bytes),
    }),
  ) as unknown as typeof fetch;
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

function installGlobalValue(name: "location", value: unknown): () => void {
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
  (require("../pdf-worker") as { ensurePdfWorker: jest.Mock }).ensurePdfWorker
    .mockReset()
    .mockResolvedValue(undefined);
  ownedTempMock.leaseOwnedTempFile.mockReset();
});

beforeEach(() => {
  ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: false, error: "unsupported_runtime" });
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

  test("never gives the native TextDecoder more than one bounded block", async () => {
    const bytes = new Uint8Array(64 * 1024 * 3 + 17).fill(97);
    mockFetch(bytes.buffer);
    const decodedInputBytes: number[] = [];
    const originalDecode = TextDecoder.prototype.decode;
    const decodeSpy = jest
      .spyOn(TextDecoder.prototype, "decode")
      .mockImplementation(function (this: TextDecoder, input, options) {
        if (input) decodedInputBytes.push(input.byteLength);
        return originalDecode.call(this, input, options);
      });

    try {
      await expect(
        extractText("file:///bounded.txt", "text/plain", bytes.byteLength),
      ).resolves.toEqual(expect.any(String));
    } finally {
      decodeSpy.mockRestore();
    }

    expect(decodedInputBytes.length).toBeGreaterThan(1);
    expect(Math.max(...decodedInputBytes)).toBeLessThanOrEqual(64 * 1024);
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

    expect(normalizeFileMimeType("application/octet-stream", "line-study.MD")).toBe(
      "text/markdown",
    );
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

    const r = await extractText(
      "file:///long.txt",
      "text/plain",
      new TextEncoder().encode(longText).byteLength,
    );

    expect(r?.startsWith("x".repeat(MAX_EXTRACTED_FILE_TEXT_CHARS))).toBe(true);
    expect(r).toContain(
      `[File text truncated: original ${MAX_EXTRACTED_FILE_TEXT_CHARS + 18} chars]`,
    );
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

  test("web PDF stays metadata-only without fetching or invoking parser setup", async () => {
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const worker = require("../pdf-worker") as { ensurePdfWorker: jest.Mock };
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const r = await extractText("file:///doc.pdf", "APPLICATION/PDF; charset=binary", 8);

    expect(r).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(worker.ensurePdfWorker).not.toHaveBeenCalled();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  test("pickFile preserves PDF metadata while text extraction stays disabled", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///picked.pdf",
          name: "picked.pdf",
          mimeType: "application/pdf",
          size: 65_680,
        },
      ],
    });

    await expect(pickFile()).resolves.toEqual({
      uri: "file:///picked.pdf",
      name: "picked.pdf",
      mimeType: "application/pdf",
      size: 65_680,
      textContent: null,
    });
    expect(documentPickerMock.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ base64: false }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("DOCX stays metadata-only without fetching or starting a parser", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      extractText(
        "file:///doc.docx",
        " APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT ",
        128,
      ),
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
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
      await expect(extractText("blob:https://app.example/id", "text/plain", 9)).resolves.toBe(
        "blob body",
      );
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

describe("picker cache-copy lifecycle", () => {
  test("a single picked cache copy is disposed once even when release races", async () => {
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: true, lease: { dispose } });
    mockFetch("picked file body");
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/owned-note.txt",
          name: "owned-note.txt",
          mimeType: "text/plain",
          size: 16,
        },
      ],
    });

    const file = await pickFile();
    const releasePickedFile = releasePickedFileUnderTest();

    expect(typeof releasePickedFile).toBe("function");
    if (!releasePickedFile) return;
    await Promise.all([releasePickedFile(file), releasePickedFile(file)]);

    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledWith("file:///cache/owned-note.txt");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test("cleanup failure is contained and never logs the URI or raw error", async () => {
    const dispose = jest.fn().mockResolvedValue({
      ok: false,
      error: "file:///cache/private-name.txt bearer-private-marker",
    });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: true, lease: { dispose } });
    mockFetch("private body");
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/private-name.txt",
          name: "private-name.txt",
          mimeType: "text/plain",
          size: 12,
        },
      ],
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const file = await pickFile();
    const releasePickedFile = releasePickedFileUnderTest();
    expect(typeof releasePickedFile).toBe("function");
    if (!releasePickedFile) return;
    await expect(releasePickedFile(file)).resolves.toBeUndefined();

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("cache copy cleanup failed");
    expect(logged).not.toContain("private-name");
    expect(logged).not.toContain("bearer-private-marker");
    warn.mockRestore();
  });

  test("provider/original URIs never gain a deletion lease", async () => {
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: false, error: "unsafe_target" });
    mockFetch("provider body");
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "content://provider/original-note.txt",
          name: "original-note.txt",
          mimeType: "text/plain",
          size: 13,
        },
      ],
    });

    const file = await pickFile();
    const releasePickedFile = releasePickedFileUnderTest();
    expect(typeof releasePickedFile).toBe("function");
    if (!releasePickedFile) return;
    await expect(releasePickedFile(file)).resolves.toBeUndefined();

    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledWith(
      "content://provider/original-note.txt",
    );
  });

  test("capture screen releases stale and terminal picked-file copies", () => {
    const source = readFileSync(resolve(__dirname, "../../../app/capture.tsx"), "utf8");
    const transcription = source.slice(
      source.indexOf("async function transcribePickedAudio"),
      source.indexOf("async function runFilePick"),
    );
    const picker = source.slice(
      source.indexOf("async function runFilePick"),
      source.indexOf("function removeTag"),
    );

    expect(source).toContain('releasePickedFile');
    expect(source).toContain("releaseCurrentPickedFile");
    expect(source).toContain("replacePickedFile(null)");
    expect(source).toContain("pickedFileInUseRef.current !== previous");
    expect(transcription).toContain("pickedFileInUseRef.current = file");
    expect(transcription).toContain("pickedFileInUseRef.current = null");
    expect(transcription).toContain("await releasePickedFile(file)");
    expect(picker).toContain("finally");
    expect(picker).toContain("await releasePickedFile(selectedFile)");
    expect(source).toContain("await releasePickedFile(submittedPickedFile)");
    expect(source).toContain("pickedFileInUseRef.current !== submittedPickedFile");
  });
});

describe("pickImportFiles", () => {
  test("canceled pick → empty array", async () => {
    documentPickerMock.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickImportFiles()).resolves.toEqual([]);
    expect(documentPickerMock.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ base64: false }),
    );
  });

  test("reads each asset and skips empty/unreadable ones", async () => {
    // First file has body; second is whitespace-only → dropped.
    const noteA = new TextEncoder().encode("# Note A\n\nbody");
    const empty = new TextEncoder().encode("   \n  ");
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        redirected: false,
        url: "file:///a.md",
        headers: { get: () => "14" },
        body: streamFromBytes(noteA),
      })
      .mockResolvedValueOnce({
        ok: true,
        redirected: false,
        url: "file:///b.md",
        headers: { get: () => "6" },
        body: streamFromBytes(empty),
      }) as unknown as typeof fetch;
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
    const cappedDispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({
      ok: true,
      lease: { dispose: cappedDispose },
    });
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
    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledTimes(MAX_IMPORT_FILE_COUNT);
    expect(cappedDispose).toHaveBeenCalledTimes(MAX_IMPORT_FILE_COUNT);

    ownedTempMock.leaseOwnedTempFile.mockReset().mockResolvedValue({
      ok: false,
      error: "unsupported_runtime",
    });

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
      .mockResolvedValueOnce({
        ok: true,
        redirected: false,
        url: "file:///a.md",
        headers: { get: () => null },
        body: streamFromBytes(first),
      })
      .mockResolvedValueOnce({
        ok: true,
        redirected: false,
        url: "file:///b.md",
        headers: { get: () => null },
        body: streamFromBytes(overflow),
      }) as unknown as typeof fetch;
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
    globalThis.fetch = jest.fn().mockImplementation((uri: string) =>
      Promise.resolve({
        ok: true,
        redirected: false,
        url: uri,
        headers: { get: () => String(bytes.byteLength) },
        body: streamFromBytes(bytes),
      }),
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

    expect(result.reduce((sum, file) => sum + file.text.length, 0)).toBeLessThanOrEqual(
      MAX_IMPORT_TOTAL_TEXT_CHARS,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(12);
  });

  test("disposes every selected cache copy, including skipped assets", async () => {
    const disposals = [
      jest.fn().mockResolvedValue({ ok: true, status: "deleted" }),
      jest.fn().mockResolvedValue({ ok: true, status: "deleted" }),
    ];
    ownedTempMock.leaseOwnedTempFile
      .mockResolvedValueOnce({ ok: true, lease: { dispose: disposals[0] } })
      .mockResolvedValueOnce({ ok: true, lease: { dispose: disposals[1] } });
    const note = new TextEncoder().encode("# Kept");
    globalThis.fetch = jest.fn((uri: string) =>
      Promise.resolve({
        ok: true,
        redirected: false,
        url: uri,
        headers: { get: () => String(note.byteLength) },
        body: streamFromBytes(note),
      }),
    ) as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///cache/kept.md", name: "kept.md", mimeType: "text/markdown", size: 6 },
        { uri: "file:///cache/skipped.bin", name: "skipped.bin", mimeType: "application/octet-stream", size: 4 },
      ],
    });

    await expect(pickImportFiles()).resolves.toEqual([{ name: "kept.md", text: "# Kept" }]);
    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledTimes(2);
    expect(disposals[0]).toHaveBeenCalledTimes(1);
    expect(disposals[1]).toHaveBeenCalledTimes(1);
  });

  test("disposes all copies when aggregate declarations reject the batch before reads", async () => {
    const disposals = Array.from({ length: 3 }, () =>
      jest.fn().mockResolvedValue({ ok: true, status: "deleted" }),
    );
    disposals.forEach((dispose) => {
      ownedTempMock.leaseOwnedTempFile.mockResolvedValueOnce({ ok: true, lease: { dispose } });
    });
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///cache/a.md", name: "a.md", mimeType: "text/markdown", size: MAX_EXTRACT_BYTES },
        { uri: "file:///cache/b.md", name: "b.md", mimeType: "text/markdown", size: MAX_EXTRACT_BYTES },
        { uri: "file:///cache/c.md", name: "c.md", mimeType: "text/markdown", size: 1 },
      ],
    });

    await expect(pickImportFiles()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });
});

describe("pickAudioFile", () => {
  test("leases and releases the picker-owned audio cache copy", async () => {
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: true, lease: { dispose } });
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/call.m4a",
          name: "call.m4a",
          mimeType: "audio/mp4",
          size: 456,
        },
      ],
    });

    const file = await pickAudioFile();
    const releasePickedFile = releasePickedFileUnderTest();
    expect(typeof releasePickedFile).toBe("function");
    if (!releasePickedFile) return;
    await releasePickedFile(file);

    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledWith("file:///cache/call.m4a");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test("offers audio only and normalizes generic Android metadata", async () => {
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///call.m4a",
          name: "call.m4a",
          mimeType: "application/octet-stream",
          size: 456,
        },
      ],
    });

    await expect(pickAudioFile()).resolves.toEqual({
      uri: "file:///call.m4a",
      name: "call.m4a",
      mimeType: "audio/mp4",
      size: 456,
      textContent: null,
    });
    expect(documentPickerMock.getDocumentAsync).toHaveBeenCalledWith({
      type: "audio/*",
      base64: false,
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  test("canceled audio pick returns null", async () => {
    documentPickerMock.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickAudioFile()).resolves.toBeNull();
  });
});
