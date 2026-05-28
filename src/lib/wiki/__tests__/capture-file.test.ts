// Tests for the MIME → text extraction logic in capture-file.ts. The
// extractText() helper is exported so we can test it without going through
// expo-document-picker. PDF and DOCX paths are mocked at the dynamic-import
// boundary; the assertions only verify dispatching + size cap + null safety.

import { Platform } from "react-native";

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

import { extractText } from "../capture-file";

function mockFetch(body: string | ArrayBuffer) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    text: () => Promise.resolve(typeof body === "string" ? body : ""),
    arrayBuffer: () => Promise.resolve(body instanceof ArrayBuffer ? body : new ArrayBuffer(0)),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
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

  test("file > 10MB cap → null without fetching", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const r = await extractText("file:///big.pdf", "application/pdf", 11 * 1024 * 1024);
    expect(r).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("application/pdf → dynamic import + concatenated page text", async () => {
    mockFetch(new ArrayBuffer(8));
    const r = await extractText("file:///doc.pdf", "application/pdf", 1000);
    expect(r).toContain("page1-word1");
    expect(r).toContain("page2-word2");
  });

  test("application/vnd...wordprocessingml → mammoth.extractRawText", async () => {
    mockFetch(new ArrayBuffer(8));
    const r = await extractText(
      "file:///doc.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      1000,
    );
    expect(r).toBe("Hello DOCX");
  });

  test("native platform → PDF returns null, no extraction", async () => {
    (Platform as { OS: string }).OS = "ios";
    mockFetch(new ArrayBuffer(8));
    const r = await extractText("file:///doc.pdf", "application/pdf", 1000);
    expect(r).toBeNull();
    (Platform as { OS: string }).OS = "web"; // restore
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
