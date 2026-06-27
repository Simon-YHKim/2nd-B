import { detectDomain, domainTag, withDomainTag } from "../detect-domain";

describe("detectDomain (pure, LLM-free)", () => {
  it("empty / whitespace text -> collect (catch-all)", () => {
    expect(detectDomain("")).toBe("collect");
    expect(detectDomain("   \n ")).toBe("collect");
  });

  it("no keyword match -> collect, never a wrong guess", () => {
    expect(detectDomain("그냥 떠오른 생각을 적어둔다")).toBe("collect");
  });

  it("classifies each domain from distinctive KO keywords", () => {
    expect(detectDomain("오늘 회사에서 면접 준비를 했다")).toBe("career");
    expect(detectDomain("이번 달 지출이 많아서 가계부를 봤다")).toBe("finance");
    expect(detectDomain("주말에 독서하고 강의를 들으며 공부했다")).toBe("growth");
    expect(detectDomain("친구랑 가족 모임에서 오랜만에 만났다")).toBe("relation");
    expect(detectDomain("아침에 헬스장에서 운동하고 산책했다")).toBe("health");
    expect(detectDomain("주말에 영화 보고 게임하며 놀았다")).toBe("recreation");
  });

  it("classifies from EN keywords too (bilingual)", () => {
    expect(detectDomain("Had a job interview with the manager today")).toBe("career");
    expect(detectDomain("Reviewed my budget and savings this month")).toBe("finance");
    expect(detectDomain("Went to the gym for a workout then a walk")).toBe("health");
  });

  it("is case-insensitive", () => {
    expect(detectDomain("INTERVIEW at the OFFICE")).toBe("career");
  });

  it("EN keywords match on word boundaries, not substrings (no false positives)", () => {
    // "framework"/"network" contain "work" (career) and "update" contains
    // "date" (relation) — none are real signals, so -> collect.
    expect(detectDomain("Refactored the framework and fixed the network update")).toBe("collect");
    expect(detectDomain("Please review the candidate shortlist")).toBe("collect");
    // "workout" must NOT lend a phantom career point; gym + workout -> health.
    expect(detectDomain("A long workout at the gym")).toBe("health");
    // real whole-word hits still classify.
    expect(detectDomain("I have a date planned with my partner")).toBe("relation");
  });

  it("breaks ties by Big-Dipper order (career before finance)", () => {
    // one career hit (회사) + one finance hit (월급) -> tie -> career wins
    expect(detectDomain("회사 월급")).toBe("career");
  });

  it("picks the strongest signal when one domain clearly dominates", () => {
    // one career hit (회사) vs two finance hits (투자, 주식) -> finance
    expect(detectDomain("회사 끝나고 투자랑 주식 공부")).toBe("finance");
  });
});

describe("domainTag / withDomainTag", () => {
  it("domainTag builds the canonical slug tag", () => {
    expect(domainTag("career")).toBe("domain:career");
    expect(domainTag("collect")).toBe("domain:collect");
  });

  it("prepends exactly one domain tag and keeps user tags", () => {
    expect(withDomainTag(["mine", "work-notes"], "회사 면접")).toEqual([
      "domain:career",
      "mine",
      "work-notes",
    ]);
  });

  it("strips any caller/user-supplied domain:* tag (no hijack)", () => {
    // user tried to force finance; detector says career; only the detected one survives
    expect(withDomainTag(["domain:finance", "keep"], "면접 회의")).toEqual([
      "domain:career",
      "keep",
    ]);
  });

  it("defaults to domain:collect for untagged, unmatched text", () => {
    expect(withDomainTag(undefined, "음...")).toEqual(["domain:collect"]);
    expect(withDomainTag([], "메모")).toEqual(["domain:collect"]);
  });
});
