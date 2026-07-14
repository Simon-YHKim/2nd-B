// The /formats screen offered "PDF". It has never produced a PDF:
//
//   } else if (format === "pdf") {
//     const r = await exportIden(userId, { locale });
//     setResult({ text: r.html, name: r.htmlFilename });   // <- .html
//   }
//
// Pick PDF, download a .html file. There is no PDF generator anywhere in the app --
// expo-print is not installed, and adding a dependency to make a mislabeled button true
// would be the wrong way round. The export IS a print-ready HTML page (its own copy said
// "읽기 · 인쇄용"), so the button now says HTML and the copy says how to get a PDF from it.
//
// The rule this pins: an export format's NAME must match the extension it actually
// produces. A button that lies about its output is the same defect class as a star that
// lies about its brightness -- it just costs less.

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const SCREEN = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";

describe("an export format is named after what it actually produces", () => {
  const src = read(SCREEN);
  const start = src.indexOf("type ExportFormat");
  const block = src.slice(start, src.indexOf("\n  }", src.indexOf("async function runExport")));

  test("the guard is reading the real export block", () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("runExport");
    expect(block.length).toBeGreaterThan(300);
  });

  test('there is no "PDF" option, because there is no PDF', () => {
    expect(block).not.toMatch(/id:\s*"pdf"/);
    expect(block).not.toMatch(/name:\s*"PDF"/);
    // And no PDF generator was smuggled in to justify one.
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["expo-print"]).toBeUndefined();
  });

  test("the html option hands back html", () => {
    expect(block).toMatch(/id:\s*"html",\s*name:\s*"HTML"/);
    // The branch that runs for it must set r.html / r.htmlFilename, not some other payload.
    const branch = block.slice(block.indexOf('format === "html"'));
    expect(branch.slice(0, 200)).toMatch(/r\.html\b/);
    expect(branch.slice(0, 200)).toMatch(/r\.htmlFilename\b/);
  });

  test("the copy tells the user how to actually get a PDF", () => {
    // Dropping the PDF label without saying where the PDF went would just move the
    // confusion. Every locale has to answer the question the rename raises.
    for (const locale of ["en", "ko", "es", "id", "pt"]) {
      const bundle = read(`locales/${locale}/deepspace.json`);
      expect(bundle).toContain("htmlDesc");
      expect(bundle).not.toContain("pdfDesc");
      expect(bundle.toLowerCase()).toContain("pdf"); // the desc still explains PDF-from-print
    }
  });
});
