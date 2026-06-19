import { splitImportNotes, previewTitle } from "../import-notes";

describe("splitImportNotes", () => {
  test("empty / whitespace -> no notes", () => {
    expect(splitImportNotes("")).toEqual([]);
    expect(splitImportNotes("   \n  ")).toEqual([]);
  });

  test("single note with no separator stays one note", () => {
    expect(splitImportNotes("# Hello\n\nbody text")).toEqual(["# Hello\n\nbody text"]);
  });

  test("splits on a horizontal-rule line and drops empties", () => {
    expect(splitImportNotes("note one\n---\nnote two\n\n---\n\nnote three")).toEqual([
      "note one",
      "note two",
      "note three",
    ]);
  });

  test("leading frontmatter is protected and stays with the first note", () => {
    const text = "---\ntitle: Carl Jung\n---\nshadow body\n---\nsecond note";
    expect(splitImportNotes(text)).toEqual([
      "---\ntitle: Carl Jung\n---\nshadow body",
      "second note",
    ]);
  });

  test("a single frontmatter-only note is not split by its own fences", () => {
    expect(splitImportNotes("---\ntitle: X\n---\nbody")).toEqual(["---\ntitle: X\n---\nbody"]);
  });
});

describe("previewTitle", () => {
  test("prefers frontmatter title (quotes stripped)", () => {
    expect(previewTitle('---\ntitle: "Carl Jung"\n---\nbody', "fallback")).toBe("Carl Jung");
  });

  test("falls back to first heading line with marks stripped", () => {
    expect(previewTitle("## My note\n\nrest", "fallback")).toBe("My note");
  });

  test("skips frontmatter body and uses the first real line", () => {
    expect(previewTitle("---\ntags: [a]\n---\n\n- first bullet", "fallback")).toBe("first bullet");
  });

  test("empty note returns the fallback", () => {
    expect(previewTitle("   ", "Untitled")).toBe("Untitled");
  });
});
