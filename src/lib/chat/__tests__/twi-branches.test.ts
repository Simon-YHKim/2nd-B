import { parseTwiBranches } from "../twi-branches";

describe("트위비 3-branch parser (P5f)", () => {
  test("lifts up to three trailing branch lines out of the display text", () => {
    const reply = [
      "기록을 보면 아침 시간이 늘 비어 있어요.",
      "",
      "→ 아침 20분을 스케치 시간으로 묶어 보기",
      "→ 지난 메모 세 개를 하나의 위키 페이지로 합치기",
      "→ 이번 주 한 번, 산책 코스를 반대로 걷기",
    ].join("\n");
    const parsed = parseTwiBranches(reply);
    expect(parsed.display).toBe("기록을 보면 아침 시간이 늘 비어 있어요.");
    expect(parsed.branches).toEqual([
      "아침 20분을 스케치 시간으로 묶어 보기",
      "지난 메모 세 개를 하나의 위키 페이지로 합치기",
      "이번 주 한 번, 산책 코스를 반대로 걷기",
    ]);
  });

  test("a reply without branch lines passes through untouched", () => {
    const reply = "그건 이렇게 볼 수도 있어요. → 라는 기호가 문장 중간에 있어도요.";
    const parsed = parseTwiBranches(reply);
    expect(parsed.display).toBe(reply);
    expect(parsed.branches).toEqual([]);
  });

  test("only the TRAILING run counts; caps at three; tolerates blank gaps", () => {
    const reply = [
      "→ 본문 중간의 화살표 줄은 답변의 일부예요.",
      "정리하면 이렇습니다.",
      "",
      "→ 후보 하나",
      "",
      "→ 후보 둘",
    ].join("\n");
    const parsed = parseTwiBranches(reply);
    expect(parsed.display).toContain("본문 중간의 화살표 줄");
    expect(parsed.display).toContain("정리하면 이렇습니다.");
    expect(parsed.branches).toEqual(["후보 하나", "후보 둘"]);
  });

  test("4+ candidates: keeps the first three in order, no stray arrow line in display", () => {
    // 트위비 is asked for up to three but LLMs violate that intermittently; the
    // parser must stay robust — clear ALL trailing arrow lines from display and keep
    // the first three (in reply order), not the last three with a stranded line.
    const reply = [
      "정리하면 이렇습니다.",
      "→ 후보 하나",
      "→ 후보 둘",
      "→ 후보 셋",
      "→ 후보 넷",
    ].join("\n");
    const parsed = parseTwiBranches(reply);
    expect(parsed.display).toBe("정리하면 이렇습니다."); // no leftover "→ ..." line
    expect(parsed.branches).toEqual(["후보 하나", "후보 둘", "후보 셋"]);
  });

  test("empty and whitespace input are safe", () => {
    expect(parseTwiBranches("")).toEqual({ display: "", branches: [] });
    expect(parseTwiBranches("   \n  ")).toEqual({ display: "", branches: [] });
  });
});
