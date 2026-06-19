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

jest.mock(
  "pdfjs-dist",
  () => ({
    GlobalWorkerOptions: {} as { workerSrc?: string },
    getDocument: jest.fn(() => ({
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
  MAX_EXTRACT_BYTES,
  MAX_EXTRACTED_FILE_TEXT_CHARS,
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
  globalThis.fetch = jest.fn().mockResolvedValue({
    headers: { get: jest.fn(() => null) },
    text: () => Promise.resolve(typeof body === "string" ? body : ""),
    arrayBuffer: () => Promise.resolve(body instanceof ArrayBuffer ? body : new ArrayBuffer(0)),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  documentPickerMock.getDocumentAsync.mockReset();
  (Platform as { OS: string }).OS = "web";
});

describe("extractText", () => {
  test("text/plain → fetch().text()", async () => {
    mockFetch("hello world");
    const r = await extractText("file:///x.txt", "text/plain", 100);
    expect(r).toBe("hello world");
  });

  test("text/markdown → fetch().text()", async () => {
    mockFetch("# Title\n\nbody");
    const r = await extractText("file:///x.md", "text/markdown", 100);
    expect(r).toContain("# Title");
  });

  test("normalizes MIME case and parameters before text extraction", async () => {
    mockFetch("hello charset");
    const r = await extractText("file:///x.txt", " TEXT/PLAIN; charset=UTF-8 ", 100);
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
      100,
    );
    expect(r).toBe("from markdown extension");
  });

  test("caps extracted text with an explicit marker before it reaches capture body", async () => {
    const longText = `${"x".repeat(MAX_EXTRACTED_FILE_TEXT_CHARS + 17)}\n`;
    mockFetch(longText);

    const r = await extractText("file:///long.txt", "text/plain", 100);

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
    const text = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue({
      headers: { get: jest.fn(() => String(MAX_EXTRACT_BYTES + 1)) },
      text,
    }) as unknown as typeof fetch;

    const r = await extractText("file:///unknown-size.txt", "text/plain", 0);

    expect(r).toBeNull();
    expect(text).not.toHaveBeenCalled();
  });

  test("binary extraction re-checks fetched bytes when metadata was missing", async () => {
    const pdfjs = require("pdfjs-dist") as { getDocument: jest.Mock };
    const arrayBuffer = jest.fn(() => Promise.resolve(new ArrayBuffer(MAX_EXTRACT_BYTES + 1)));
    globalThis.fetch = jest.fn().mockResolvedValue({
      headers: { get: jest.fn(() => null) },
      arrayBuffer,
    }) as unknown as typeof fetch;

    const r = await extractText("file:///unknown-size.pdf", "application/pdf", 0);

    expect(r).toBeNull();
    expect(arrayBuffer).toHaveBeenCalled();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  test("application/pdf → dynamic import + concatenated page text", async () => {
    mockFetch(new ArrayBuffer(8));
    const r = await extractText("file:///doc.pdf", "APPLICATION/PDF; charset=binary", 1000);
    expect(r).toContain("page1-word1");
    expect(r).toContain("page2-word2");
  });

  test("application/vnd...wordprocessingml → mammoth.extractRawText", async () => {
    mockFetch(new ArrayBuffer(8));
    const r = await extractText(
      "file:///doc.docx",
      " APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT ",
      1000,
    );
    expect(r).toBe("Hello DOCX");
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
          size: 123,
        },
      ],
    });

    await expect(pickFile()).resolves.toEqual({
      uri: "file:///picked.txt",
      name: "picked.txt",
      mimeType: "text/plain",
      size: 123,
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
          size: 456,
        },
      ],
    });

    await expect(pickFile()).resolves.toEqual({
      uri: "file:///picked.md",
      name: "picked.md",
      mimeType: "text/markdown",
      size: 456,
      textContent: "picked markdown body",
    });
  });

  test("native platform → PDF returns null, no extraction", async () => {
    (Platform as { OS: string }).OS = "ios";
    mockFetch(new ArrayBuffer(8));
    const r = await extractText("file:///doc.pdf", "application/pdf", 1000);
    expect(r).toBeNull();
  });

  test("fetch throws → returns null (never propagates)", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
    const r = await extractText("file:///x.txt", "text/plain", 100);
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
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({ headers: { get: () => null }, text: () => Promise.resolve("# Note A\n\nbody") })
      .mockResolvedValueOnce({ headers: { get: () => null }, text: () => Promise.resolve("   \n  ") }) as unknown as typeof fetch;
    documentPickerMock.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///a.md", name: "a.md", mimeType: "text/markdown", size: 50 },
        { uri: "file:///b.md", name: "b.md", mimeType: "text/markdown", size: 5 },
      ],
    });

    await expect(pickImportFiles()).resolves.toEqual([{ name: "a.md", text: "# Note A\n\nbody" }]);
  });
});
