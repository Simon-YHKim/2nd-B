import { parse } from "yaml";
import { buildIdenExport } from "../iden-export";
import { SAMPLE_IDEN } from "../sample";

describe("buildIdenExport", () => {
  it("bundles the .iden text and the standalone HTML sheet", () => {
    const out = buildIdenExport(SAMPLE_IDEN, { request: "plan my week" });
    // .iden is the serialized data twin (machine block round-trips)
    const fm = out.iden.match(/^---\n([\s\S]*?)\n---\n/);
    expect(parse(fm![1]).name).toBe("Simon");
    expect(out.iden.trimEnd().endsWith("plan my week")).toBe(true);
    // html is the self-contained A4 document
    expect(out.html.startsWith("<!doctype html>")).toBe(true);
    expect(out.html).toContain("Simon");
  });

  it("derives a download-friendly filename stem from name + date", () => {
    const out = buildIdenExport(SAMPLE_IDEN);
    expect(out.filenameBase).toBe("simon-iden-2026-06-16");
    expect(out.idenFilename).toBe("simon-iden-2026-06-16.iden");
    expect(out.htmlFilename).toBe("simon-iden-2026-06-16.html");
  });

  it("falls back to a safe slug when the name has no ASCII (e.g. Hangul)", () => {
    const out = buildIdenExport({ ...SAMPLE_IDEN, name: "사이먼" });
    expect(out.filenameBase).toBe("iden-2026-06-16");
  });

  it("falls back to the generic stem for an all-symbol name", () => {
    expect(buildIdenExport({ ...SAMPLE_IDEN, name: "!!!@@@" }).filenameBase).toBe("iden-2026-06-16");
  });

  it("caps a very long name and leaves no trailing dash", () => {
    const out = buildIdenExport({ ...SAMPLE_IDEN, name: "A".repeat(200) + " !!! " });
    expect(out.filenameBase).toBe(`${"a".repeat(60)}-iden-2026-06-16`);
    expect(out.idenFilename.length).toBeLessThan(90);
  });

  it("passes locale through to the rendered sheet", () => {
    const out = buildIdenExport(SAMPLE_IDEN, { locale: "ko" });
    expect(out.locale).toBe("ko");
    expect(out.html).toContain('lang="ko"');
    expect(out.html).toContain("AI 해석"); // KO summary label
  });

  it("reports artifact sizes", () => {
    const out = buildIdenExport(SAMPLE_IDEN);
    expect(out.chars.iden).toBe(out.iden.length);
    expect(out.chars.html).toBe(out.html.length);
    expect(out.chars.html).toBeGreaterThan(out.chars.iden);
  });
});
