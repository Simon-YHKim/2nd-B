// U4 guards: the legal snapshots must stay faithful to the docs/legal drafts'
// key commitments, the draft badge must key off the [기입] placeholders, and
// the markdown-lite parser must handle every construct the drafts use.

import { PRIVACY_DOC, REFUND_DOC, TERMS_DOC, isDraft } from "../legal-documents";
import { parseLegalMarkdown } from "../parse-legal-markdown";

describe("legal document snapshots", () => {
  test("terms carry the core commitments (article 1, the not-a-clinical-service disclaimer, age floor)", () => {
    expect(TERMS_DOC.body).toContain("제1조");
    expect(TERMS_DOC.body).toContain("참고용 정보");
    expect(TERMS_DOC.body).toContain("만 14세");
  });

  test("refund policy carries the 30-day guarantee and cancellation section", () => {
    expect(REFUND_DOC.body).toContain("30");
    expect(REFUND_DOC.body).toContain("환불");
    expect(REFUND_DOC.body).toContain("Money-Back");
  });

  test("privacy policy carries the PIPA essentials (processors, statutory retention, subject rights, age floor)", () => {
    expect(PRIVACY_DOC.body).toContain("Supabase");
    expect(PRIVACY_DOC.body).toContain("Paddle");
    expect(PRIVACY_DOC.body).toContain("Gemini");
    expect(PRIVACY_DOC.body).toContain("5년");
    expect(PRIVACY_DOC.body).toContain("열람·정정·삭제");
    expect(PRIVACY_DOC.body).toContain("만 14세");
  });

  test("all stay draft-flagged while [기입] placeholders remain", () => {
    expect(isDraft(TERMS_DOC)).toBe(true);
    expect(isDraft(REFUND_DOC)).toBe(true);
    expect(isDraft(PRIVACY_DOC)).toBe(true);
    expect(isDraft({ ...TERMS_DOC, body: "완성된 본문" })).toBe(false);
  });

  test("bodies carry no em dash (check:emdash covers src/)", () => {
    expect(TERMS_DOC.body).not.toMatch(/—/);
    expect(REFUND_DOC.body).not.toMatch(/—/);
    expect(PRIVACY_DOC.body).not.toMatch(/—/);
  });
});

describe("parseLegalMarkdown", () => {
  test("maps headings, list items, rules, and paragraphs", () => {
    const blocks = parseLegalMarkdown("# A\n\n## B\n\n### C\n\n- item\n\n---\n\nline one\nline two\n");
    expect(blocks).toEqual([
      { type: "h1", text: "A" },
      { type: "h2", text: "B" },
      { type: "h3", text: "C" },
      { type: "li", text: "item" },
      { type: "rule" },
      { type: "p", text: "line one line two" },
    ]);
  });

  test("strips bold and italic markers without losing the words", () => {
    const blocks = parseLegalMarkdown("서비스는 **의료·심리상담·진단·치료 서비스가 아니며** 참고용입니다.\n\n_시행일: [기입: YYYY-MM-DD]_\n");
    expect(blocks[0]).toEqual({ type: "p", text: "서비스는 의료·심리상담·진단·치료 서비스가 아니며 참고용입니다." });
    expect(blocks[1]).toEqual({ type: "p", text: "시행일: [기입: YYYY-MM-DD]" });
  });

  test("parses the real terms body into a non-trivial block list", () => {
    const blocks = parseLegalMarkdown(TERMS_DOC.body);
    expect(blocks.length).toBeGreaterThan(20);
    expect(blocks.some((b) => b.type === "h3")).toBe(true);
  });

  test("renders table rows as list items and drops the alignment row", () => {
    const blocks = parseLegalMarkdown("| 수탁사 | 위탁 업무 |\n|---|---|\n| Supabase | 인증·DB |\n");
    expect(blocks).toEqual([
      { type: "li", text: "수탁사 · 위탁 업무" },
      { type: "li", text: "Supabase · 인증·DB" },
    ]);
  });

  test("strips inline-code backticks and CJK-flanking escape backslashes (markup, not copy)", () => {
    const blocks = parseLegalMarkdown("결제는 **Paddle**\\가 처리하며 \`Paddle.net\`이 표기될 수 있습니다.\n");
    expect(blocks[0]).toEqual({ type: "p", text: "결제는 Paddle가 처리하며 Paddle.net이 표기될 수 있습니다." });
  });

  test("parses the real privacy body including its processor table", () => {
    const blocks = parseLegalMarkdown(PRIVACY_DOC.body);
    expect(blocks.length).toBeGreaterThan(20);
    expect(blocks.some((b) => b.type === "li" && b.text.includes("Supabase"))).toBe(true);
    expect(blocks.some((b) => "text" in b && b.text.includes("|"))).toBe(false);
  });
});
