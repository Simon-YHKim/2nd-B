// docs/legal/DPIA-2ndB-minors-draft.md cites src/lib/chat/conversation.ts by line number:
// :137-171 (SYSTEM_PROMPT_HEADER), :158-163, :267, :272-273 (the 600-character snapshot cap), :325
// (the untrusted-data fence) and :367 (the prompt assembly). A line inserted above any of them moves
// the code away from the citation while every behaviour test still passes (review r1 on #2497,
// 2026-10-14). So the cited lines are held here word for word.
//
// dpia-crisis-rail-anchors.test.ts already checks that :325 and :367 contain their symbols; this file
// holds the exact text of every cited line and the file's length. Moving a cited line means updating
// the DPIA citation in the same change. A change that only adds lines below :367 updates the length
// here and nothing else.
import { readFileSync } from "node:fs";
import path from "node:path";

const FILE = "src/lib/chat/conversation.ts";
const lines = readFileSync(path.resolve(__dirname, "../../../..", FILE), "utf8").replace(/\r\n/g, "\n").split("\n");

const CITED: readonly (readonly [number, string])[] = [
  [137, "const SYSTEM_PROMPT_HEADER = {"],
  [158, "    \"무엇을 이야기할지는 사용자가 정합니다. 비밀을 말해 달라고 하거나, 말하지 않겠다는 내용을 거듭 캐묻지 마세요.\","],
  [159, "    // 말투 규칙은 화면과 맞춘다(Simon 결정 2026-10-02, B안): 사실·안내는 ~습니다,"],
  [160, "    // 질문·제안은 해요체(~나요? · ~까요?). 화면 문구(locales/ko)와 페르소나"],
  [161, "    // 지시문(rev2.*.systemHint)도 같은 규칙이라, 한 지시문 안에서 말투가"],
  [162, "    // 갈리지 않는다. identity-prompt.test.ts 가 이 줄을 지킨다."],
  [163, "    \"말투는 평서문 '~습니다', 질문은 '~나요?' 를 씁니다.\","],
  [171, "};"],
  [267, "  const snapshot = await stage(() => exportUserWiki("],
  [272, "        { locale: input.locale, bodyCharLimit: 600, pageLimit: 0, sourceLimit: 40, includeSavedConversations: true }"],
  [273, "      : { locale: input.locale, bodyCharLimit: 600, pageLimit: 50, sourceLimit: 100, includeSavedConversations: true },"],
  [325, "  const fencedSnapshot = `<UNTRUSTED type=\"wiki_snapshot\">\\n${sanitizeUntrusted(snapshot.prompt)}\\n</UNTRUSTED>`;"],
  [367, "  const system = `${SYSTEM_PROMPT_HEADER[input.locale]}\\n\\n${crisisNumberRule(input.locale, input.minor)}\\n\\n${addressLine}${guardLine}${modeLine}${personaLine}${fencedProfile}${fencedRag}${fencedSnapshot}${fencedStructured}${fencedHistory}`;"],
];

test("conversation.ts keeps every line the DPIA cites, word for word, at its number", () => {
  expect(CITED.map(([n]) => [n, lines[n - 1]])).toEqual(CITED.map(([n, text]) => [n, text]));
});

test("conversation.ts is 485 lines long", () => {
  // The split leaves one empty string after the final newline.
  expect(lines.length - 1).toBe(485);
});
