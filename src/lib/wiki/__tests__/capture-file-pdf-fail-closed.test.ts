import { readFileSync } from "fs";

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

import { extractText } from "../capture-file";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("production PDF extraction stays fail-closed without a parser mock", async () => {
  const fetchSpy = jest.fn();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  await expect(
    extractText("file:///compressed-bomb.pdf", "application/pdf", 65_680),
  ).resolves.toBeNull();

  expect(fetchSpy).not.toHaveBeenCalled();
  const source = readFileSync(require.resolve("../capture-file"), "utf8");
  expect(source).not.toMatch(/pdfjs-dist|ensurePdfWorker|pdfjs\.getDocument/);
});
