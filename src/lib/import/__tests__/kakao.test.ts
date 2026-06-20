import { extractAppointmentHints, parseKakaoExport } from "../kakao";

const ANDROID_SAMPLE = [
  "홍길동님과 카카오톡 대화",
  "저장한 날짜 : 2024년 1월 6일 오전 1:00",
  "",
  "--------------- 2024년 1월 5일 금요일 ---------------",
  "2024년 1월 5일 오후 3:42, 홍길동 : 안녕",
  "2024년 1월 5일 오후 3:43, 김양환 : 내일 3시에 만날까?",
  "여러 줄도",
  "이어집니다",
  "2024년 1월 5일 오후 9:05, 홍길동 : 좋아",
].join("\n");

describe("parseKakaoExport (KR Android)", () => {
  test("parses header lines, skips meta/separators, joins multi-line", () => {
    const msgs = parseKakaoExport(ANDROID_SAMPLE);
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toMatchObject({ sender: "홍길동", text: "안녕" });
    expect(msgs[1].sender).toBe("김양환");
    expect(msgs[1].text).toContain("내일 3시에 만날까?");
    expect(msgs[1].text).toContain("이어집니다"); // multi-line joined
    expect(msgs[1].atIso).not.toBeNull();
  });

  test("오후 3:42 maps to 15:42 local", () => {
    const [first] = parseKakaoExport("2024년 1월 5일 오후 3:42, A : hi");
    expect(first.atIso).not.toBeNull();
    expect(new Date(first.atIso as string).getHours()).toBe(15);
  });

  test("iOS export format", () => {
    const msgs = parseKakaoExport("2024. 1. 5. 오전 9:00, 이몽룡 : 좋은 아침");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ sender: "이몽룡", text: "좋은 아침" });
    expect(new Date(msgs[0].atIso as string).getHours()).toBe(9);
  });

  test("empty / junk → []", () => {
    expect(parseKakaoExport("")).toEqual([]);
    expect(parseKakaoExport("그냥 텍스트\n또 텍스트")).toEqual([]);
  });
});

describe("extractAppointmentHints (derived signal, no raw kept by caller)", () => {
  test("flags plan/appointment messages only", () => {
    const msgs = parseKakaoExport(ANDROID_SAMPLE);
    const hints = extractAppointmentHints(msgs);
    expect(hints.length).toBe(1);
    expect(hints[0].text).toContain("내일 3시");
  });
});
