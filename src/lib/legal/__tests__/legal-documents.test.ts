// U4 guards: the legal snapshots must stay faithful to the docs/legal drafts'
// key commitments, the draft badge must key off the [기입] placeholders, and
// the markdown-lite parser must handle every construct the drafts use.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { PRIVACY_DOC, REFUND_DOC, TERMS_DOC, isDraft } from "../legal-documents";
import { CONSENT_VERSION, PRIVACY_POLICY_VERSION } from "../../supabase/consent";
import {
  parseLegalMarkdown,
  splitLegalLanguageSections,
  stripLegalDocumentIntro,
  type LegalBlock,
  type LegalLanguageSections,
} from "../parse-legal-markdown";

const ROOT = resolve(__dirname, "../../../..");

function revenueCatKeyDeployed(): boolean {
  const workflowDir = resolve(ROOT, ".github/workflows");
  const deploymentSources = [
    readFileSync(resolve(ROOT, "eas.json"), "utf8"),
    ...readdirSync(workflowDir)
      .filter((name) => /\.ya?ml$/i.test(name))
      .map((name) => readFileSync(resolve(workflowDir, name), "utf8")),
  ].join("\n");

  return /EXPO_PUBLIC_REVENUECAT_(?:IOS|ANDROID)_KEY/.test(deploymentSources);
}

/** The half of the document the language toggle is currently hiding. */
function otherLanguageLines(split: LegalLanguageSections, showing: "ko" | "en"): string[] {
  return split.sections[showing === "ko" ? "en" : "ko"].map((block) =>
    block.type === "rule" ? "" : "text" in block ? block.text : "",
  );
}

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

  // Simon decided (2026-08-11) that the revised rule applies immediately. The
  // notice was re-issued 2026-08-09, so it is two days, not thirty - and the
  // document therefore must NOT claim a 30-day notice it did not give. Pinning
  // the ABSENCE is the point: a claim we cannot support is worse than none.
  test("the effective date is stated and no notice period is claimed", () => {
    expect(REFUND_DOC.body).toContain("개정 시행일: 2026-08-11");
    expect(REFUND_DOC.body).not.toContain("30일 사전공지");
    expect(REFUND_DOC.body).not.toContain("2026-09-08");
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

  test("privacy policy names the processors and transfer rules used by the current app", () => {
    expect(PRIVACY_DOC.body.match(/OpenAI OpCo, LLC/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(PRIVACY_DOC.body.match(/Functional Software, Inc\. \(dba Sentry/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(PRIVACY_DOC.body).toContain("Firebase Analytics");
    expect(PRIVACY_DOC.body).toContain("제28조의8 제1항 제3호");
    expect(PRIVACY_DOC.body).toContain("Article 28-8(1)3");
    expect(PRIVACY_DOC.body).toContain("건강·활동 측정값은 어떠한 AI 제공자에게도 전송하지 않고");
    expect(PRIVACY_DOC.body).toContain("health and activity measurements are not sent to any AI provider");
    expect(PRIVACY_DOC.body).not.toContain("음성·오디오는 텍스트 전사를 위해 Google에 전송");
    expect(PRIVACY_DOC.body).not.toContain("voice/audio is sent to Google");
  });

  // One-way guard: a RevenueCat key named in checked-in deployment config
  // REQUIRES a disclosure. The reverse is deliberately not asserted: absence of
  // the key in eas.json/workflows does not prove the vendor is permanently
  // inactive, so a disclosure without a key must not fail the build.
  test("a deployable native RevenueCat key requires a disclosure (one-way)", () => {
    if (revenueCatKeyDeployed()) {
      expect(PRIVACY_DOC.body).toMatch(/RevenueCat/);
    }
  });

  test("2026-09-02 revision: version alignment and technically honest sections 4-5", () => {
    const md = readFileSync(resolve(ROOT, "docs/legal/privacy-policy.md"), "utf8");
    // md, app snapshot, and the consent writer all carry the same date.
    expect(md).toContain("_시행일: 2026-09-02 · 최종 개정: 2026-09-02_");
    expect(PRIVACY_DOC.body).toContain("시행일: 2026-09-02");
    expect(PRIVACY_POLICY_VERSION).toBe("2026-09-02");
    // #1589 revises the sign-up consent notice itself (ackOverseas and
    // overseasTransfer.body), so the notice version moves with the policy:
    // final tuple = consent 09-02 / policy 09-02 / terms 08-16.
    expect(CONSENT_VERSION).toBe("2026-09-02");
    // Anthropic is a configured-active AI processor (perPurpose seat map) and
    // must be disclosed in both section 4 and section 5, in both languages.
    expect(PRIVACY_DOC.body.match(/Anthropic PBC/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // Supabase storage is the Seoul region; the flat US-storage claim must not return.
    expect(PRIVACY_DOC.body).toContain("대한민국(서울) 리전");
    expect(PRIVACY_DOC.body).toContain("Seoul (South Korea) region");
    expect(PRIVACY_DOC.body).not.toContain("Supabase, Inc.(미국)는 제1조의");
    // No account-specific Sentry retention claim (the account setting is unverified).
    expect(PRIVACY_DOC.body).not.toMatch(/Sentry 계정에 설정된|Company's Sentry account|최대 90일|no longer than 90 days/);
    // Post-#1586 posture: the latest app does not initialize Sentry.
    expect(PRIVACY_DOC.body).toContain("최신 버전의 앱은 오류 수집 도구(Sentry)를 초기화하지 않습니다");
    expect(PRIVACY_DOC.body).toContain("the latest version of the app does not initialize the error-reporting tool (Sentry)");
    // Firebase/Clarity are currently disabled, not "collected upon consent".
    expect(PRIVACY_DOC.body).toContain("현재 앱에서 비활성화되어 있어 수집하지 않습니다");
    expect(PRIVACY_DOC.body).toContain("Currently disabled in the app; nothing is collected");
    // Paddle is framed as an independent Merchant of Record, not a mere processor.
    expect(PRIVACY_DOC.body).toContain("판매자(Merchant of Record)인 Paddle");
    expect(PRIVACY_DOC.body).toContain("Paddle as the Merchant of Record");
    // GA4 keeps the aggregated-reports caveat instead of a flat 14-month claim.
    expect(PRIVACY_DOC.body).toContain("표준 집계 보고서는 이 보존 설정의 적용을 받지 않습니다");
    expect(PRIVACY_DOC.body).toContain("standard aggregated reports are not governed by that retention setting");
    // xAI is not selected by any deployed env value and must not be listed.
    expect(PRIVACY_DOC.body).not.toMatch(/xAI|X\.AI/);
    // Official privacy contacts for the two active AI recipients, verified
    // against each vendor's published privacy policy (openai.com/policies,
    // anthropic.com/legal/privacy). The document deliberately lists each
    // vendor's privacy@ address as its inquiry route, in KO and EN alike.
    // (Both vendors also publish other official addresses such as dpo@; the
    // choice of privacy@ here is editorial, not a claim that others are
    // unofficial, so their absence is not asserted.)
    expect(PRIVACY_DOC.body.match(/privacy@openai\.com/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(PRIVACY_DOC.body.match(/privacy@anthropic\.com/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
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

  test("removes the duplicated terms title and divider, but hands back the effective date", () => {
    const blocks = parseLegalMarkdown(TERMS_DOC.body);
    const intro = stripLegalDocumentIntro(blocks, TERMS_DOC.title);

    expect(intro.blocks).toEqual(blocks.slice(3));
    expect(intro.blocks[0]).toEqual({ type: "h2", text: "한국어" });
    // The screen is the only place this line can appear -- the header states
    // the title and nothing else. Dropping it is how it disappeared once.
    expect(intro.meta).toMatch(/^(시행일|최종 업데이트):/);
  });

  test("splits the terms into complete Korean and English sections", () => {
    const { blocks } = stripLegalDocumentIntro(parseLegalMarkdown(TERMS_DOC.body), TERMS_DOC.title);
    const split = splitLegalLanguageSections(blocks);

    expect(split).not.toBeNull();
    if (!split) throw new Error("Expected bilingual terms sections");
    const { sections } = split;
    expect(sections.ko[0]).toEqual({ type: "h3", text: "제1조 (목적)" });
    expect(sections.en[0]).toEqual({ type: "h3", text: "1. Purpose" });
    expect(
      sections.ko.some(
        (block) => block.type === "h2" || ("text" in block && block.text === "1. Purpose"),
      ),
    ).toBe(false);
    expect(
      sections.en.some(
        (block) => block.type === "h2" || ("text" in block && block.text === "제1조 (목적)"),
      ),
    ).toBe(false);
    expect(sections.ko[sections.ko.length - 1]?.type).not.toBe("rule");
  });

  test("splits every legal route into complete Korean and English sections", () => {
    for (const doc of [TERMS_DOC, REFUND_DOC, PRIVACY_DOC]) {
      const { blocks } = stripLegalDocumentIntro(parseLegalMarkdown(doc.body), doc.title);
      const split = splitLegalLanguageSections(blocks);

      expect(split).not.toBeNull();
      expect(split?.sections.ko.length).toBeGreaterThan(0);
      expect(split?.sections.en.length).toBeGreaterThan(0);
    }
  });

  // The bug this guards: the refund policy's in-body h1 reads "Refund &
  // Cancellation Policy" while REFUND_DOC.title reads "Refund Policy", so the
  // intro strip never fired for it, and everything ahead of the 한국어 marker --
  // including its 개정 시행일 -- was thrown away by the split instead. Counting
  // sections was not enough to notice; only conservation is.
  test("shows every line of every legal document -- nothing is silently dropped", () => {
    const textOf = (block: LegalBlock): string =>
      block.type === "rule" ? "" : "text" in block ? block.text : "";

    for (const doc of [TERMS_DOC, REFUND_DOC, PRIVACY_DOC]) {
      const parsed = parseLegalMarkdown(doc.body);
      const { blocks, meta } = stripLegalDocumentIntro(parsed, doc.title);
      const split = splitLegalLanguageSections(blocks);
      if (!split) throw new Error(`Expected bilingual sections for ${doc.title}`);

      // What each language actually puts on screen, plus the header's own parts.
      for (const language of ["ko", "en"] as const) {
        const onScreen = [
          doc.title,
          meta ?? "",
          ...[...split.preamble, ...split.sections[language]].map(textOf),
        ];

        const missing = parsed
          .map(textOf)
          .filter((line) => line.length > 0)
          // The other language's body is legitimately hidden behind the toggle,
          // as are the two marker headings, which become the toggle's labels.
          .filter((line) => !otherLanguageLines(split, language).includes(line))
          .filter((line) => line !== "한국어" && line !== "English")
          .filter((line) => !onScreen.some((shown) => shown.includes(line)));

        expect(missing).toEqual([]);
      }
    }
  });

  test("fails open when bilingual section markers are missing, duplicated, or reversed", () => {
    expect(splitLegalLanguageSections(parseLegalMarkdown("## 한국어\n본문"))).toBeNull();
    expect(
      splitLegalLanguageSections(parseLegalMarkdown("## 한국어\nA\n## 한국어\nB\n## English\nC")),
    ).toBeNull();
    expect(
      splitLegalLanguageSections(parseLegalMarkdown("## English\nEnglish body\n## 한국어\n한국어 본문")),
    ).toBeNull();
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
