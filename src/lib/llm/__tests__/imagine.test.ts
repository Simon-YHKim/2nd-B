import { parseImagineResult, isImagineComplete, renderImagineMarkdown } from "../imagine";

const SAMPLE = [
  "TITLE :: 밤빛 골목의 등불",
  "WORLDLINE :: 작은 기록 하나가 첫 등불을 켜요.",
  "SCENE :: 첫 등불 :: 골목에 등불이 켜져요.",
  "SCENE :: 이어지는 길 :: 길이 이어져요.",
  "OBJECT :: 등불 :: 작은 빛.",
  "CHARACTER :: 벨라 :: 안내자.",
  "NEXTSTEP :: 한 줄 남기기.",
].join("\n");

describe("parseImagineResult", () => {
  test("extracts every section", () => {
    const p = parseImagineResult(SAMPLE);
    expect(p.title).toBe("밤빛 골목의 등불");
    expect(p.worldline).toContain("첫 등불");
    expect(p.scenes).toHaveLength(2);
    expect(p.scenes[0]).toEqual({ title: "첫 등불", description: "골목에 등불이 켜져요." });
    expect(p.objects).toHaveLength(1);
    expect(p.objects[0].name).toBe("등불");
    expect(p.characters[0]).toEqual({ name: "벨라", role: "안내자." });
    expect(p.nextStep).toBe("한 줄 남기기.");
  });

  test("ignores blank + untagged lines, tolerates extra prose", () => {
    const p = parseImagineResult("\nsome stray text\nTITLE :: A\nWORLDLINE :: B\n");
    expect(p.title).toBe("A");
    expect(p.worldline).toBe("B");
    expect(p.scenes).toHaveLength(0);
  });

  test("a scene with no description keeps an empty description", () => {
    const p = parseImagineResult("SCENE :: only title");
    expect(p.scenes[0]).toEqual({ title: "only title", description: "" });
  });

  test("tag matching is case-insensitive", () => {
    expect(parseImagineResult("title :: x").title).toBe("x");
  });
});

describe("isImagineComplete", () => {
  test("true with title + worldline", () => {
    expect(isImagineComplete(parseImagineResult(SAMPLE))).toBe(true);
  });
  test("false on empty", () => {
    expect(isImagineComplete(parseImagineResult(""))).toBe(false);
  });
});

describe("renderImagineMarkdown", () => {
  test("includes the title heading and section headers", () => {
    const md = renderImagineMarkdown(parseImagineResult(SAMPLE), "ko");
    expect(md).toContain("# 밤빛 골목의 등불");
    expect(md).toContain("## 장면");
    expect(md).toContain("## 다음 한 걸음");
  });
});
