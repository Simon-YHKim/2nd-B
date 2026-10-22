// docs/legal/DPIA-2ndB-minors-draft.md cites src/lib/chat/conversation.ts by line number:
// :137-171 (SYSTEM_PROMPT_HEADER), :158-163, :258, :263-264 (the 600-character snapshot cap), :288
// (the untrusted-data fence) and :330 (the prompt assembly; T39 A2-S moved the context load and the
// assembly into their own functions, so these four moved up with the text unchanged). A line inserted above any of them moves
// the code away from the citation while every behaviour test still passes (review r1 on #2497,
// 2026-10-14). So the cited lines are held here word for word.
//
// dpia-crisis-rail-anchors.test.ts already checks that :288 and :330 contain their symbols; this file
// holds the exact text of every cited line and the file's length. Moving a cited line means updating
// the DPIA citation in the same change. A change that only adds lines below :330 updates the length
// here and nothing else.
import { readFileSync } from "node:fs";
import path from "node:path";

const FILE = "src/lib/chat/conversation.ts";
const lines = readFileSync(path.resolve(__dirname, "../../../..", FILE), "utf8").replace(/\r\n/g, "\n").split("\n");

const CITED: readonly (readonly [number, string])[] = [
  [138, "const SYSTEM_PROMPT_HEADER = {"],
  [159, "    \"무엇을 이야기할지는 사용자가 정합니다. 비밀을 말해 달라고 하거나, 말하지 않겠다는 내용을 거듭 캐묻지 마세요.\","],
  [160, "    // 대화 답의 말투는 편한 반말 + 「브로」다(Simon 결정 2026-10-18 Q-261018-55 다). 10-02 B안"],
  [161, "    // (사실 ~습니다 · 질문 ~나요?)은 화면 문구에 그대로 남고 대화 답에서만 뒤집었다. 페르소나"],
  [162, "    // 지시문(rev2.meta/twi.systemHint)도 같은 말투로 맞췄다. 위기 고정 안내는 모델이 쓰지 않으므로"],
  [163, "    // 이 줄과 무관하다. identity-prompt.test.ts 가 이 줄을 지킨다."],
  [164, "    \"말투는 편한 반말을 씁니다. 인사나 할 일 정리처럼 가볍고 편한 대화에서는 '오우, 브로'·'좋아, 브로' 같은 호칭을 가끔 섞되, 매번 붙이지는 마세요. 사용자가 존댓말이나 다른 호칭을 원하거나 호칭을 싫어하면 바로 따르세요. 사용자가 많이 힘들거나 아프거나 위험한 이야기를 하면 농담과 호칭을 빼고 차분하게 말하세요.\","],
  [172, "};"],
  [259, "  const snapshot = await stage(() => exportUserWiki("],
  [264, "        { locale: input.locale, bodyCharLimit: 600, pageLimit: 0, sourceLimit: 40, includeSavedConversations: true }"],
  [265, "      : { locale: input.locale, bodyCharLimit: 600, pageLimit: 50, sourceLimit: 100, includeSavedConversations: true },"],
  [288, "  const fencedSnapshot = `<UNTRUSTED type=\"wiki_snapshot\">\\n${sanitizeUntrusted(snapshot.prompt)}\\n</UNTRUSTED>`;"],
  [330, "  const system = `${SYSTEM_PROMPT_HEADER[input.locale]}\\n\\n${crisisNumberRule(input.locale, input.minor)}\\n\\n${addressLine}${guardLine}${modeLine}${personaLine}${fencedProfile}${fencedRag}${fencedSnapshot}${fencedStructured}${fencedHistory}`;"],
];

test("conversation.ts keeps every line the DPIA cites, word for word, at its number", () => {
  expect(CITED.map(([n]) => [n, lines[n - 1]])).toEqual(CITED.map(([n, text]) => [n, text]));
});

test("conversation.ts is 523 lines long", () => {
  // The split leaves one empty string after the final newline.
  expect(lines.length - 1).toBe(523);
});

test("DPIA's instruction citation agrees with the pinned conversation lines", () => {
  const doc = readFileSync(path.resolve(__dirname, "../../../../docs/legal/DPIA-2ndB-minors-draft.md"), "utf8");
  expect(doc.includes("conversation.ts:159-164")).toBe(true);
  expect(doc.includes("conversation.ts:158-163")).toBe(false);
});
