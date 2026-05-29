import {
  buildExtractionPrompt,
  parseIngestResult,
  renderIngestMarkdown,
  IMPORT_SECTIONS,
} from "../import-external";

describe("buildExtractionPrompt", () => {
  it("produces a JSON-schema prompt in Korean", () => {
    const p = buildExtractionPrompt("ko");
    expect(p).toContain('"section"');
    expect(p).toContain('"summary"');
    expect(p).toContain("임상");
  });
  it("includes the subject name when given", () => {
    expect(buildExtractionPrompt("en", "Simon")).toContain('"Simon"');
  });
  it("does not leak technical jargon", () => {
    const p = buildExtractionPrompt("en").toLowerCase();
    for (const term of ["vector", "embedding", "classifier", "rag"]) {
      expect(p).not.toContain(term);
    }
  });
});

describe("parseIngestResult", () => {
  it("parses a clean JSON reply", () => {
    const raw = JSON.stringify({
      summary: "Curious and reflective.",
      track: "pro",
      tags: ["#Career", "growth mindset"],
      items: [
        { section: "trait", title: "Openness", detail: "Loves new ideas", confidence: "high" },
        { section: "bogus", title: "X", detail: "Y", confidence: "weird" },
      ],
    });
    const r = parseIngestResult(raw);
    expect(r.summary).toBe("Curious and reflective.");
    expect(r.track).toBe("pro");
    // tags normalized + deduped + "imported" carried
    expect(r.tags).toContain("imported");
    expect(r.tags).toContain("career");
    expect(r.tags).toContain("growth-mindset");
    expect(r.items).toHaveLength(2);
    // unknown section falls back to context; bad confidence -> medium
    expect(r.items[1].section).toBe("context");
    expect(r.items[1].confidence).toBe("medium");
  });

  it("tolerates a fenced code block", () => {
    const raw = "```json\n" + JSON.stringify({ summary: "s", track: "daily", tags: [], items: [] }) + "\n```";
    expect(parseIngestResult(raw).summary).toBe("s");
  });

  it("falls back to a single context item when JSON is unparseable", () => {
    const r = parseIngestResult("not json at all", "raw pasted notes");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].section).toBe("context");
    expect(r.tags).toContain("imported");
  });

  it("defaults track to daily and never drops the imported tag", () => {
    const r = parseIngestResult(JSON.stringify({ summary: "", track: "??", tags: ["a"], items: [] }));
    expect(r.track).toBe("daily");
    expect(r.tags[0]).toBe("imported");
  });
});

describe("renderIngestMarkdown", () => {
  it("groups items by section in canonical order with headings", () => {
    const md = renderIngestMarkdown(
      {
        summary: "Portrait.",
        track: "daily",
        tags: ["imported"],
        items: [
          { section: "value", title: "Autonomy", detail: "self-directed", confidence: "high" },
          { section: "trait", title: "Openness", detail: "curious", confidence: "medium" },
        ],
      },
      "en",
    );
    // trait section heading appears before value (canonical order)
    expect(md.indexOf("Trait")).toBeLessThan(md.indexOf("Value"));
    expect(md).toContain("Openness");
    expect(md).toContain("Autonomy");
    expect(md).toContain("Portrait.");
  });

  it("covers every section label", () => {
    expect(IMPORT_SECTIONS.length).toBe(6);
  });
});
