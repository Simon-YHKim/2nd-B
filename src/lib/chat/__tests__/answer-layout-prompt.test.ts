// A-Z first-use check, Z33: answers read like a report, one sentence per line with spaces left at
// the end of each line. The model is told how to lay an answer out, and the screen does not draw
// the spaces (display-text.test.ts). What the instruction does with the real model was measured
// before the merge; this file only keeps the sentence where the engine reads it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chatDisplayText } from "../display-text";
import { parseTwiBranches } from "../twi-branches";

const SRC = readFileSync(resolve(__dirname, "../conversation.ts"), "utf8");

/** The SYSTEM_PROMPT_HEADER literal only (same cut as identity-prompt.test.ts). */
function header(): string {
  const start = SRC.indexOf("const SYSTEM_PROMPT_HEADER = {");
  const end = SRC.indexOf("\n};", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

test("Korean answers are not written one sentence per line, and lists keep their lines", () => {
  expect(header()).toContain("문장마다 줄을 바꾸지 마세요. 줄바꿈은 문단을 나누거나, 목록·단계를 한 줄에 하나씩 적을 때만 씁니다.");
});

test("English answers get the same instruction", () => {
  expect(header()).toContain("Do not put each sentence on its own line. Use a line break only between paragraphs, or to write list items or steps one per line.");
});

test("the instruction does not ask for one paragraph: that wording flattened step-by-step answers", () => {
  // Measured 2026-10-14 with the real model: a first wording that said to write in flowing
  // paragraphs put three requested steps on one line both times.
  expect(header()).not.toContain("문단으로 이어 쓰세요");
  expect(header()).not.toContain("flowing paragraphs");
});

test("the new-angle mode still asks for its next steps on lines of their own", () => {
  // parseTwiBranches lifts the lines that start with the arrow into chips; the layout instruction
  // must leave that contract alone.
  const mode = SRC.slice(SRC.indexOf("const MODE_INSTRUCTION"), SRC.indexOf("const BLOCKED_HINT"));
  expect(mode).toContain("each on its own line, each line starting with '→ '.");
  expect(mode).toContain("한 줄에 하나씩 '→ '로 시작해 적으세요.");
});

test("lines that start with the arrow are still lifted into next steps after the screen trims line ends", () => {
  // What the model sends in that mode (measured): spaces at the end of every line.
  const reply = "퇴근 뒤 30분만 바꿔 보는 방법이 있습니다.   \n→ 퇴근 뒤 30분만 바꿔보기   \n→ 걷기 10분   \n→ 폰 내려놓기";
  const branches = parseTwiBranches(reply);
  expect(branches.branches).toEqual(["퇴근 뒤 30분만 바꿔보기", "걷기 10분", "폰 내려놓기"]);
  expect(chatDisplayText(branches.display)).toBe("퇴근 뒤 30분만 바꿔 보는 방법이 있습니다.");
});
