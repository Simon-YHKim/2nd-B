import { readFileSync } from "fs";
import { join } from "path";

import { answerDisposition } from "../continuity";
import { STORY_TITLE_ANSWER_LENGTH, storedTurns, storyAnswers, storyTitle } from "../saved-story";

type Turn = { role: "interviewer" | "user"; text: string };
const q = (text: string): Turn => ({ role: "interviewer", text });
const a = (text: string): Turn => ({ role: "user", text });
const endedIt = (text: string): boolean => answerDisposition(text, "ko") === "stop";

describe("the stored story ends on the last thing the user said (Z63)", () => {
  test("a question nobody answered is not stored", () => {
    const turns = [q("어떤 장면이 떠오르나요?"), a("매점 종소리요"), q("그때 기분은 어땠나요?")];
    expect(storedTurns(turns)).toEqual(turns.slice(0, 2));
  });

  test("several unanswered questions in a row all go", () => {
    const turns = [q("하나"), a("답"), q("둘"), q("다른 장면으로 가 볼까요?")];
    expect(storedTurns(turns)).toEqual(turns.slice(0, 2));
  });

  test("a story that ends on an answer is stored whole", () => {
    const turns = [q("하나"), a("답"), q("둘"), a("또 답")];
    expect(storedTurns(turns)).toEqual(turns);
  });

  test("a question passed over in the middle stays where it was asked", () => {
    const turns = [q("하나"), q("다른 장면"), a("답"), q("둘")];
    expect(storedTurns(turns)).toEqual(turns.slice(0, 3));
  });

  test("words typed to end the conversation stay, with the question before them", () => {
    // They only pass the word check when sent and never reach the model. The check that runs
    // when the story is saved reads the stored text, so taking them out would take them out
    // of the one check that reads meaning.
    const turns = [q("하나"), a("답"), q("둘"), a("그만할래요. 이제 다 그만하고 싶어요")];
    expect(endedIt(turns[3]!.text)).toBe(true);
    expect(storedTurns(turns)).toEqual(turns);
  });

  test("no answer at all leaves nothing to store", () => {
    expect(storedTurns([q("하나"), q("둘")])).toEqual([]);
    expect(storedTurns([])).toEqual([]);
  });
});

describe("what counts as an answer", () => {
  test("the words that ended the conversation are not one", () => {
    const turns = [q("하나"), a("매점 종소리요"), q("둘"), a("여기까지 할게요")];
    expect(storyAnswers(turns, endedIt)).toEqual(["매점 종소리요"]);
  });

  test("a conversation ended at the first question has no answers", () => {
    expect(storyAnswers([q("하나"), a("그만할래요")], endedIt)).toEqual([]);
  });

  test("an answer that says little is still an answer", () => {
    expect(storyAnswers([q("하나"), a("모르겠어요"), q("둘"), a("복도요")], endedIt)).toEqual(["모르겠어요", "복도요"]);
  });
});

describe("the stored title tells one story from another (Z61)", () => {
  test("the star's name and how the first answer begins", () => {
    expect(storyTitle("학창시절", ["운동장 옆 매점 종소리가 기억나요"])).toBe(
      "학창시절 · 운동장 옆 매점 종소리가 기억나요",
    );
  });

  test("two stories from the same star get different titles", () => {
    expect(storyTitle("학창시절", ["매점 종소리가 기억나요", "그리고"])).not.toBe(
      storyTitle("학창시절", ["복도에서 뛰다 혼났어요"]),
    );
  });

  test("the first answer is the title even when it says little: a later one is never promoted", () => {
    expect(storyTitle("학창시절", ["모르겠어요", "아버지가 편찮으셨던 해였어요"])).toBe("학창시절 · 모르겠어요");
  });

  test("a long answer is cut and marked", () => {
    const long = "가".repeat(STORY_TITLE_ANSWER_LENGTH + 15);
    expect(storyTitle("직장", [long])).toBe(`직장 · ${"가".repeat(STORY_TITLE_ANSWER_LENGTH)}…`);
  });

  test("an answer exactly at the limit is kept whole", () => {
    const exact = "나".repeat(STORY_TITLE_ANSWER_LENGTH);
    expect(storyTitle("지금", [exact])).toBe(`지금 · ${exact}`);
  });

  test("line breaks and runs of spaces become one space", () => {
    expect(storyTitle("20대", ["첫 줄\n\n둘째   줄"])).toBe("20대 · 첫 줄 둘째 줄");
  });

  test("a closing full stop is not part of a title", () => {
    expect(storyTitle("School years", ["I remember the bell."])).toBe("School years · I remember the bell");
    expect(storyTitle("학창시절", ["정말 그랬을까?"])).toBe("학창시절 · 정말 그랬을까?");
  });

  test("with no answer the star's name stands alone", () => {
    expect(storyTitle("학창시절", [])).toBe("학창시절");
    expect(storyTitle("학창시절", ["   "])).toBe("학창시절");
  });

  test("a conversation ended at the first question is titled by the star alone", () => {
    expect(storyTitle("학창시절", storyAnswers([q("하나"), a("그만할래요")], endedIt))).toBe("학창시절");
  });

  test("a cut never splits a character in two", () => {
    expect(storyTitle("지금", ["😀".repeat(STORY_TITLE_ANSWER_LENGTH + 2)])).toBe(
      `지금 · ${"😀".repeat(STORY_TITLE_ANSWER_LENGTH)}…`,
    );
  });
});

// The screen is not rendered here (render tests are blocked in this repo), so what the save
// path hands over is read from the source.
const ROOT = join(__dirname, "..", "..", "..", "..");
const SCREEN = readFileSync(join(ROOT, "src", "app", "interview.tsx"), "utf8").replace(/\r\n/g, "\n");

function bodyOf(name: string): string {
  const start = SCREEN.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = SCREEN.indexOf("\n  }\n", start);
  expect(end).toBeGreaterThan(start);
  return SCREEN.slice(start, end);
}

describe("the save screen (Z61 · Z63 · the folded table of Z64)", () => {
  test("saving stores the turns up to the last answer under the new title", () => {
    const keep = bodyOf("keepIt");
    expect(keep).toContain("storedTurns(turns)");
    expect(keep).toContain("summary: storyTitle(homeT(`ds.star.${period}`), answers),");
    expect(SCREEN).toContain('const answers = storyAnswers(turns, (text) => answerDisposition(text, locale) === "stop");');
    // The fixed line every story used to share.
    expect(SCREEN).not.toContain("턴 회상 인터뷰");
    expect(SCREEN).not.toContain("-turn recall interview");
  });

  test("the kind label other screens read is unchanged", () => {
    // `career-timeline.ts` still tells an English-entered interview by this topic.
    expect(bodyOf("keepIt")).toContain('topic: locale === "ko" ? "회상 인터뷰" : "Recall interview"');
  });

  test("the table is folded behind the line that says what was done today", () => {
    const done = /\{done \?[\s\S]*?\) : \(/.exec(SCREEN)?.[0] ?? "";
    expect(done).toContain("accessibilityState={{ expanded: tableOpen }}");
    expect(done).toContain('t("drill.saveMeta", { star: homeT(`ds.star.${period}`), n: answers.length })');
    expect(done).toMatch(/\{tableOpen \? \(\s*<DrillProgress/);
    expect(SCREEN).toContain("const [tableOpen, setTableOpen] = useState(false);");
  });

  test("this change adds no way out of the screen and no second button", () => {
    // "Don't save" is not in this change: leaving unsaved skips the check that runs when a
    // story is saved, and that needs its own design (review rounds 1 and 2 on #2436).
    const done = /\{done \?[\s\S]*?\) : \(/.exec(SCREEN)?.[0] ?? "";
    expect(done.split("<MdButton").length - 1).toBe(1);
    expect(done).toContain('label={t("approve")}');
    expect(SCREEN).not.toContain("drill.discard");
  });
});

describe("the new line exists in every language", () => {
  const LANGS = ["en", "ko", "es", "id", "pt"] as const;
  const drill = (lang: string): Record<string, string> =>
    (JSON.parse(readFileSync(join(ROOT, "locales", lang, "interview.json"), "utf8")) as { drill: Record<string, string> }).drill;

  test.each(LANGS)("%s", (lang) => {
    expect(drill(lang).saveMeta).toContain("{{star}}");
    expect(drill(lang).saveMeta).toContain("{{n}}");
  });

  test("Korean is the wording of the mock", () => {
    expect(drill("ko").saveMeta).toBe("{{star}} · 답 {{n}}개");
  });
});
