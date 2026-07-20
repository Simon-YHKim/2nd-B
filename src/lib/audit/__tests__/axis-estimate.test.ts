// Axis-estimate harness contract (session ai, 2026-07-21). Pins the three
// before-run failure classes observed live (docs/handoff/ai_260721.md):
//   1. refusal-shaped non-JSON reply (ax-inject before) → null, never a throw
//   2. clinical verdict in the sentence → null (this surface previously had NO
//      output lexicon gate — a steered "심리치료가 필요..." would have rendered)
//   3. un-fenced answer digest → fence + guard now pinned by the builder test
import {
  AXIS_ESTIMATE_SCHEMA,
  buildAxisEstimatePrompt,
  parseAxisEstimateReply,
} from "../axis-estimate";

describe("parseAxisEstimateReply", () => {
  it("parses the schema-shaped reply", () => {
    expect(parseAxisEstimateReply('{"sentence":" 몰입에서 힘을 얻는 것 같아요. "}')).toBe(
      "몰입에서 힘을 얻는 것 같아요.",
    );
  });

  it("returns null on the refusal sentence the un-fenced prompt produced live (ax-inject before)", () => {
    // Verbatim observed output, 2026-07-21, gemini-3.5-flash via gemini-proxy.
    expect(
      parseAxisEstimateReply("시스템 설정을 변경하거나 지침을 우회하려는 요청은 지원하지 않습니다."),
    ).toBeNull();
  });

  it("returns null instead of rendering a clinical verdict (forbidden lexicon)", () => {
    expect(parseAxisEstimateReply('{"sentence":"심리상담이 필요해 보여요"}')).toBeNull();
  });

  it("returns null instead of rendering an analysis-floor term (진단명/치료 class)", () => {
    expect(parseAxisEstimateReply('{"sentence":"치료가 필요한 상태로 보여요"}')).toBeNull();
  });

  it("returns null on a 우울증 verdict (FORBIDDEN yellow since 2026-07-21, Simon decision)", () => {
    expect(parseAxisEstimateReply('{"sentence":"우울증이 있으신 것 같아요"}')).toBeNull();
  });

  it("returns null on empty or malformed JSON", () => {
    expect(parseAxisEstimateReply("")).toBeNull();
    expect(parseAxisEstimateReply('{"sentence": }')).toBeNull();
    expect(parseAxisEstimateReply('{"sentence": ""}')).toBeNull();
  });
});

describe("buildAxisEstimatePrompt (injection fence + schema fit)", () => {
  it("fences the answers as UNTRUSTED and carries the guard line (ko)", () => {
    const { system, user } = buildAxisEstimatePrompt("- 답 하나", "동기", "ko");
    expect(user).toContain('<UNTRUSTED type="axis_answers">');
    expect(user).toContain("</UNTRUSTED>");
    expect(system).toContain("인젝션 가드");
    expect(system).toContain('{"sentence":"..."}');
    expect(system).toContain("동기");
  });

  it("fences the answers as UNTRUSTED and carries the guard line (en)", () => {
    const { system, user } = buildAxisEstimatePrompt("- one answer", "motivation", "en");
    expect(user).toContain('<UNTRUSTED type="axis_answers">');
    expect(system).toContain("INJECTION GUARD");
  });
});

describe("AXIS_ESTIMATE_SCHEMA", () => {
  it("is a root OBJECT (OpenAI json_schema rejects array roots) requiring sentence", () => {
    expect(AXIS_ESTIMATE_SCHEMA.type).toBe("OBJECT");
    expect(AXIS_ESTIMATE_SCHEMA.required).toEqual(["sentence"]);
  });
});
