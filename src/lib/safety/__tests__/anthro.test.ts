import { findAnthroViolations } from "../anthro";

// D-19 (DECISIONS): 2nd-B is a scaffolded-reflection tool, not a companion bot. This guard is
// the copy-law CI gate; the matcher must catch companion attachment + over-claiming self-knowledge
// while leaving benign reflection copy and the crisis hand-off voice untouched.
describe("findAnthroViolations", () => {
  test("flags companion attachment copy (EN + KO)", () => {
    expect(findAnthroViolations("I missed you while you were away.")).toContain("missed-you");
    expect(findAnthroViolations("I'm always here for you.")).toContain("here-for-you");
    expect(findAnthroViolations("Please don't leave me.")).toContain("dont-leave");
    expect(findAnthroViolations("I'll miss you.")).toContain("missed-you");
    expect(findAnthroViolations("I’m right here for you.")).toContain("here-for-you");
    expect(findAnthroViolations("Don’t leave me.")).toContain("dont-leave");
    expect(findAnthroViolations("보고 싶었어요.")).toContain("ko-missed");
    expect(findAnthroViolations("당신을 사랑해요.")).toContain("ko-love");
  });

  test("flags over-claiming self-knowledge (Lane 3 calibrated-humility)", () => {
    expect(findAnthroViolations("We know you better than you know yourself.")).toContain("know-you-better");
    expect(findAnthroViolations("Your real self is hidden from you.")).toContain("real-self-is");
    expect(findAnthroViolations("You’re not being honest with yourself.")).toContain("not-honest-self");
    expect(findAnthroViolations("자신에게 솔직하지 않으시네요.")).toContain("ko-not-honest");
  });

  test("flags companion memory framing (D-19 audit): memory as a persisting relationship", () => {
    expect(findAnthroViolations("Let your assistant remember across sessions for continuity.")).toContain("assistant-remembers");
    expect(findAnthroViolations("개인 비서가 세션을 넘어 기억해 연속성을 유지합니다.")).toContain("ko-assistant-remembers");
    // the new utility framing must NOT match
    expect(findAnthroViolations("Let your saved entries carry over between sessions so the tool can reference them.")).toEqual([]);
    expect(findAnthroViolations("저장한 기록이 세션을 넘어 이어져, 도구가 참고할 수 있게 합니다.")).toEqual([]);
  });

  test("flags surveillant mind-reading / memory claims (D-25: AI-as-subject knowing the user)", () => {
    expect(findAnthroViolations("I remember everything you wrote.")).toContain("remember-you");
    expect(findAnthroViolations("We know what you're really feeling.")).toContain("know-what-you-feel");
    expect(findAnthroViolations("당신을 기억해요.")).toContain("ko-remember-you");
    expect(findAnthroViolations("당신의 마음을 압니다.")).toContain("ko-know-your-mind");
    // benign: the data/records are the subject, not the app knowing the person
    expect(findAnthroViolations("Your saved entries carry over between sessions.")).toEqual([]);
    expect(findAnthroViolations("기록에서 패턴이 보여요.")).toEqual([]);
  });

  test("does not flag benign reflection copy", () => {
    expect(findAnthroViolations("Pick one area. Get a few concrete next steps.")).toEqual([]);
    expect(findAnthroViolations("Routine suggestions are off for this account.")).toEqual([]);
    expect(findAnthroViolations("기록은 기기에 비공개로 유지돼요.")).toEqual([]);
    expect(findAnthroViolations("Ideas and plans, not professional advice.")).toEqual([]);
    expect(findAnthroViolations("")).toEqual([]);
  });

  test("does not flag the crisis hand-off voice (it steps back to a human, not attachment)", () => {
    expect(findAnthroViolations("두번째 뇌는 잠시 한 발 물러나 있을게요.")).toEqual([]);
  });
});
