import { summarizeAssessmentBody } from "../assessment-summary";

describe("summarizeAssessmentBody", () => {
  test("plain text body returns null (renders as-is)", () => {
    expect(summarizeAssessmentBody("오늘은 비가 왔다. 기분이 차분했다.", "ko")).toBeNull();
    expect(summarizeAssessmentBody("", "en")).toBeNull();
    expect(summarizeAssessmentBody(null, "en")).toBeNull();
  });

  test("MBTI body -> type line", () => {
    const body = JSON.stringify({ type: "INTJ", scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 } });
    const s = summarizeAssessmentBody(body, "ko");
    expect(s?.label).toBe("MBTI 결과");
    expect(s?.lines).toEqual([{ k: "유형", v: "INTJ" }]);
  });

  test("Big Five body -> five trait lines, decimals trimmed", () => {
    const body = JSON.stringify({ scores: { openness: 4, conscientiousness: 3.5, extraversion: 2, agreeableness: 4, neuroticism: 1.5 } });
    const s = summarizeAssessmentBody(body, "en");
    expect(s?.label).toBe("Big Five result");
    expect(s?.lines).toEqual([
      { k: "Openness", v: "4" },
      { k: "Conscientiousness", v: "3.5" },
      { k: "Extraversion", v: "2" },
      { k: "Agreeableness", v: "4" },
      { k: "Neuroticism", v: "1.5" },
    ]);
  });

  test("ECR attachment body -> style + anxiety + avoidance", () => {
    const body = JSON.stringify({ style: "secure", anxiety: 2.5, avoidance: 1.8 });
    const s = summarizeAssessmentBody(body, "ko");
    expect(s?.label).toBe("애착 유형 결과");
    expect(s?.lines).toEqual([
      { k: "유형", v: "secure" },
      { k: "불안", v: "2.5" },
      { k: "회피", v: "1.8" },
    ]);
  });

  test("unknown structured body -> scalar fields, never raw JSON", () => {
    const s = summarizeAssessmentBody(JSON.stringify({ mood: "calm", score: 7, nested: { a: 1 } }), "en");
    expect(s?.label).toBe("Structured result");
    expect(s?.lines).toEqual([{ k: "mood", v: "calm" }, { k: "score", v: "7" }]);
  });

  test("malformed JSON returns null", () => {
    expect(summarizeAssessmentBody("{not valid json", "en")).toBeNull();
  });
});
