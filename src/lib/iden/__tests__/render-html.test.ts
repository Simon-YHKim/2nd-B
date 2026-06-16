import { renderIdenHtml } from "../render-html";
import { SAMPLE_IDEN } from "../sample";
import type { IdenDoc } from "../types";

const FORBIDDEN = [
  "mental health",
  "therapy",
  "counsel",
  "diagnos",
  "treatment",
  "healing",
  "정신건강",
  "심리치료",
  "심리상담",
  "치유",
];

describe("renderIdenHtml", () => {
  const html = renderIdenHtml(SAMPLE_IDEN);

  it("renders a self-contained A4 document with identity header", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Simon");
    expect(html).toContain("INFP, mediator. Driven by autonomy.");
    expect(html).toContain("IDEN 0.1");
    expect(html).toContain("@page{size:A4");
  });

  it("renders the traits radar in the rail AND bars in the main column", () => {
    expect(html).toContain('aria-label="Traits radar.'); // rail radar (data-rich name)
    expect(html).toContain('class="data"'); // radar data polygon
    expect(html).toContain('<div class="fill" style="width:82%">'); // Openness bar (0.82)
    expect(html).toContain('<div class="fill" style="width:35%">'); // Extraversion bar (0.35)
  });

  it("gives the radar full trait names + values for accessibility (queue D)", () => {
    // The accessible name enumerates every axis by FULL name + value (no 5-char
    // abbreviation), so screen readers get "Conscientiousness", not "Consc".
    expect(html).toContain('aria-label="Traits radar. Openness 82, Conscientiousness 68');
    expect(html).not.toContain(">Consc<"); // the old lossy abbreviation is gone
    expect(html).toContain("<title>Openness 82</title>"); // per-point hover value
    expect(html).toContain('viewBox="0 0 240 196"'); // widened so full names never clip
  });

  it("renders the cores node-graph and the contents donut", () => {
    expect(html).toContain('aria-label="Pattern cores"');
    expect(html).toContain('aria-label="Contents composition"');
    expect(html).toContain('class="dtotal">90</text>'); // donut total (48+30+12)
  });

  it("shows honest provenance for every measured value", () => {
    expect(html).toContain("BFI-44"); // measured instrument
    expect(html).toContain("ECR-S"); // attachment instrument
    expect(html).toContain("self-report"); // drivers
  });

  it("separates the AI narrative under an interpretation label", () => {
    expect(html).toContain("AI-generated interpretation");
    expect(html).toContain("A consistent self-documenter");
  });

  it("uses tokens only (no em dashes, no forbidden lexicon)", () => {
    expect(html).not.toContain("—"); // em dash banned (DESIGN.md + anti-slop)
    const lower = html.toLowerCase();
    for (const term of FORBIDDEN) expect(lower).not.toContain(term.toLowerCase());
  });

  it("is schema-driven: dropping a field drops only its render", () => {
    const trimmed: IdenDoc = { ...SAMPLE_IDEN, fields: SAMPLE_IDEN.fields.filter((f) => f.key !== "contents") };
    const out = renderIdenHtml(trimmed);
    expect(out).not.toContain('aria-label="Contents composition"');
    expect(out).toContain('aria-label="Traits radar.'); // others unaffected
  });

  it("localizes labels for KO while keeping language-neutral data", () => {
    const ko = renderIdenHtml(SAMPLE_IDEN, { locale: "ko" });
    expect(ko).toContain("프로필"); // Profile
    expect(ko).toContain("AI 해석"); // summary label
    expect(ko).toContain("측정 · BFI-44"); // measured + instrument
    expect(ko).toContain('lang="ko"');
  });

  it("escapes HTML-unsafe values", () => {
    const evil: IdenDoc = { ...SAMPLE_IDEN, name: "A<script>B" };
    const out = renderIdenHtml(evil);
    expect(out).toContain("A&lt;script&gt;B");
    expect(out).not.toContain("A<script>B");
  });
});
