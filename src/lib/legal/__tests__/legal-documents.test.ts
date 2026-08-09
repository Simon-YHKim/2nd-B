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

  test("refund policy carries the money-back guarantee and cancellation section", () => {
    expect(REFUND_DOC.body).toContain("7");
    expect(REFUND_DOC.body).toContain("환불");
    expect(REFUND_DOC.body).toContain("Money-Back");
  });

  // The 2026-09-08 revision narrowed the money-back window from 30 days to 7
  // (the statutory 청약철회 period) AND made it CONDITIONAL on usage staying
  // inside the free-plan range (0114 refund_eligibility enforces both).
  // A conditional promise is only lawful with the disclosure that goes with it,
  // so these pins keep the four load-bearing sentences from being edited away:
  // the condition itself, the statutory basis for restricting withdrawal, the
  // free-plan trial that basis depends on, and the fact that refunds are not
  // shut off entirely.
  test("refund policy states the usage condition AND the disclosures it rests on", () => {
    expect(REFUND_DOC.body).toContain("무료 플랜이 같은 기간 제공하는 범위 안");
    expect(REFUND_DOC.body).toContain("within what the free plan provides over the same span");
    // 전자상거래법 제17조: the exception being relied on, and the 제6항 measures.
    expect(REFUND_DOC.body).toContain("제17조제2항제5호");
    expect(REFUND_DOC.body).toContain("디지털 콘텐츠의 제공이 개시된 경우");
    expect(REFUND_DOC.body).toContain("무료 플랜을 통한 한시적 이용");
    expect(REFUND_DOC.body).toContain("ongoing limited-use access through the free plan");
    // Section 4 (duplicate charge / outage) survives the condition, and the
    // 7-day statutory right survives inside the free range.
    expect(REFUND_DOC.body).toContain("환불이 원천 차단되는 것은 아닙니다");
    expect(REFUND_DOC.body).toContain("refunds are not shut off");
    expect(REFUND_DOC.body).toContain("7일 청약철회권");
    // The window itself is now 7 days, and the old 30-day promise must not
    // survive anywhere in the refund document.
    expect(REFUND_DOC.body).toContain("7일 이내 전액 환불");
    expect(REFUND_DOC.body).toContain("full refund within 7 days");
    expect(REFUND_DOC.body).not.toContain("30일 이내 전액 환불");
    expect(REFUND_DOC.body).not.toContain("full refund within 30 days");
    // Self-serve entry point + the honest framing of what submitting means.
    expect(REFUND_DOC.body).toContain("[설정 → 구독 관리]");
    expect(REFUND_DOC.body).toContain("접수 즉시 환불이 확정되는 것은 아니고");
    expect(REFUND_DOC.body).toContain("submitting is not the same as being refunded");
  });

  test("the adverse-change notice period is stated (이용약관 제3조② 30일 사전공지)", () => {
    expect(REFUND_DOC.body).toContain("개정 시행일: 2026-09-08");
    expect(REFUND_DOC.body).toContain("30일 사전공지");
  });

  test("privacy policy carries the PIPA essentials (processors, statutory retention, subject rights, age floor)", () => {
    expect(PRIVACY_DOC.body).toContain("Supabase");
    expect(PRIVACY_DOC.body).toContain("Paddle");
    expect(PRIVACY_DOC.body).toContain("Gemini");
    expect(PRIVACY_DOC.body).toContain("5년");
    expect(PRIVACY_DOC.body).toContain("열람·정정·삭제");
    expect(PRIVACY_DOC.body).toContain("만 14세");
    // 건강·활동 데이터(민감정보) 고지 (S1, PIPA gap fix): 수집 항목 + 민감정보 + AI 미전송.
    expect(PRIVACY_DOC.body).toContain("민감정보");
    expect(PRIVACY_DOC.body).toContain("건강·활동 데이터");
    expect(PRIVACY_DOC.body).toContain("Health & activity data");
  });

  test("finalized 2026-07-17: no [기입]/[fill] markers remain, badge off", () => {
    // 법률 6정보 기입 완료 (하양 프로덕션 · 배소하 · 안양시 · hayangzip · 김양환).
    expect(isDraft(TERMS_DOC)).toBe(false);
    expect(isDraft(REFUND_DOC)).toBe(false);
    expect(isDraft(PRIVACY_DOC)).toBe(false);
    // The badge mechanism still works if a marker ever returns.
    expect(isDraft({ ...TERMS_DOC, body: "본문 [기입: 예시]" })).toBe(true);
  });

  test("the six facts are actually present in the bodies", () => {
    for (const doc of [TERMS_DOC, REFUND_DOC, PRIVACY_DOC]) {
      expect(doc.body).toContain("하양 프로덕션");
      expect(doc.body).toContain("kim0405@hayangzip.com");
    }
    expect(TERMS_DOC.body).toContain("배소하");
    expect(TERMS_DOC.body).toContain("경기도 안양시");
    expect(TERMS_DOC.body).toContain("면제 사업자");
    expect(TERMS_DOC.body).toContain("205-10-98603"); // 사업자등록번호, issued 2026-07-22
    // The old "발급 진행 중" placeholder must never come back: it is a false
    // statement to a paying customer now that the number exists.
    expect(TERMS_DOC.body).not.toContain("발급 진행 중");
    expect(TERMS_DOC.body).toContain("₩9,900/월");
    expect(TERMS_DOC.body).toContain("₩19,900/월");
    // Still the headline promise, now a 7-day window qualified by the usage
    // condition pinned in the dedicated test above.
    expect(REFUND_DOC.body).toContain("7일 이내 전액 환불");
    expect(PRIVACY_DOC.body).toContain("김양환");
    // 전화 미표기 (email-first): no phone placeholders or numbers.
    for (const doc of [TERMS_DOC, REFUND_DOC, PRIVACY_DOC]) {
      expect(doc.body).not.toMatch(/전화번호|support phone/);
    }
  });

  test("retired lifetime plan; canonical tier names (PR-2 · #1140, Simon 2026-07-29)", () => {
    // 평생 이용권 판매 종료. 법무 문서(약관·환불정책) 어디에도 남지 않는다.
    for (const doc of [TERMS_DOC, REFUND_DOC]) {
      expect(doc.body).not.toContain("평생");
      expect(doc.body).not.toContain("Lifetime");
      expect(doc.body).not.toContain("₩99,000");
    }
    // 공개 티어명 = 정본 라벨(tier-map.ts): 항해자/Voyager · 북극성/North Star. 구 Plus/Pro는 제거.
    for (const label of ["항해자", "북극성", "Voyager", "North Star"]) {
      expect(TERMS_DOC.body).toContain(label);
    }
    expect(TERMS_DOC.body).not.toMatch(/\bPlus\b/);
    expect(TERMS_DOC.body).not.toMatch(/\bPro\b/);
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
