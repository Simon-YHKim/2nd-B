import { readFileSync } from "fs";
import { join } from "path";

import { STORY_TITLE_ANSWER_LENGTH, storedTurns, storyTitle } from "../saved-story";

type Turn = { role: "interviewer" | "user"; text: string };
const q = (text: string): Turn => ({ role: "interviewer", text });
const a = (text: string): Turn => ({ role: "user", text });
const said = (turns: readonly Turn[]): string[] => turns.filter((turn) => turn.role === "user").map((turn) => turn.text);

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
    expect(storedTurns(turns)).toEqual(turns);
  });

  test("nothing the user said is ever left out", () => {
    const turns = [q("하나"), a("ㄱ"), q("둘"), q("셋"), a("ㄴ"), a("ㄷ"), q("넷"), q("다섯")];
    expect(said(storedTurns(turns))).toEqual(said(turns));
  });

  test("no answer at all leaves nothing to store", () => {
    expect(storedTurns([q("하나"), q("둘")])).toEqual([]);
    expect(storedTurns([])).toEqual([]);
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

  test("the first answer is the title whatever it says: a later one is never promoted", () => {
    expect(storyTitle("학창시절", ["모르겠어요", "아버지가 편찮으셨던 해였어요"])).toBe("학창시절 · 모르겠어요");
    expect(storyTitle("학창시절", ["여기까지 오는 데 친구들이 많이 도와줬어요", "둘째"])).toBe(
      "학창시절 · 여기까지 오는 데 친구들이 많이 도와줬어요",
    );
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
});

describe("where a long answer is cut", () => {
  const fill = (n: number): string => "가".repeat(n);

  test("not through an emoji that takes two code units", () => {
    expect(storyTitle("지금", ["😀".repeat(STORY_TITLE_ANSWER_LENGTH + 2)])).toBe(
      `지금 · ${"😀".repeat(STORY_TITLE_ANSWER_LENGTH)}…`,
    );
  });

  test("not between a letter and the accent that sits on it", () => {
    // "e" followed by a combining acute, placed so that the limit falls between the two.
    const accented = "é";
    const text = `${fill(STORY_TITLE_ANSWER_LENGTH - 1)}${accented}${fill(5)}`;
    const title = storyTitle("지금", [text]);
    // NFC composes this pair into one code point, so it fits whole before the cut.
    expect(title).toBe(`지금 · ${fill(STORY_TITLE_ANSWER_LENGTH - 1)}é…`);
  });

  test("not between a mark that does not compose and its letter", () => {
    // "x" + combining acute has no composed form. The limit falls between the two.
    const text = `${fill(STORY_TITLE_ANSWER_LENGTH - 1)}x́${fill(5)}`;
    expect(storyTitle("지금", [text])).toBe(`지금 · ${fill(STORY_TITLE_ANSWER_LENGTH - 1)}…`);
  });

  test("not inside a family emoji joined by zero-width joiners", () => {
    const family = "\u{1f468}‍\u{1f469}‍\u{1f467}";
    for (const lead of [STORY_TITLE_ANSWER_LENGTH - 1, STORY_TITLE_ANSWER_LENGTH - 2, STORY_TITLE_ANSWER_LENGTH - 3]) {
      const title = storyTitle("지금", [`${fill(lead)}${family}${fill(6)}`]);
      expect(title).toBe(`지금 · ${fill(lead)}…`);
    }
  });

  test("not between an emoji and its skin tone", () => {
    const wave = "\u{1f44b}\u{1f3fd}";
    const title = storyTitle("지금", [`${fill(STORY_TITLE_ANSWER_LENGTH - 1)}${wave}${fill(4)}`]);
    expect(title).toBe(`지금 · ${fill(STORY_TITLE_ANSWER_LENGTH - 1)}…`);
  });

  test("a Hangul syllable typed as separate jamo counts as one character", () => {
    const decomposed = "한".normalize("NFD");
    expect(Array.from(decomposed).length).toBe(3);
    const title = storyTitle("지금", [`${fill(STORY_TITLE_ANSWER_LENGTH - 1)}${decomposed}${fill(4)}`]);
    expect(title).toBe(`지금 · ${fill(STORY_TITLE_ANSWER_LENGTH - 1)}한…`);
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
  const done = /\{done \?[\s\S]*?\) : \(/.exec(SCREEN)?.[0] ?? "";

  test("saving stores the turns up to the last answer under the new title", () => {
    const keep = bodyOf("keepIt");
    expect(keep).toContain("storedTurns(turns)");
    expect(keep).toContain("summary: storyTitle(");
    expect(keep).toContain("homeT(`ds.star.${period}`)");
    // The fixed line every story used to share.
    expect(SCREEN).not.toContain("턴 회상 인터뷰");
    expect(SCREEN).not.toContain("-turn recall interview");
  });

  test("the title and the count read the same turns the stored text does: every user turn", () => {
    // No judgement of what a turn meant goes into either. The stored text labels each user
    // turn as an answer, the count is the number of those, the title is the first of them.
    const keep = bodyOf("keepIt");
    expect(keep).toContain('turns.filter((turn) => turn.role === "user").map((turn) => turn.text)');
    expect(done).toContain('t("drill.saveMeta", { star: homeT(`ds.star.${period}`), n: userTurns })');
    expect(SCREEN).toContain('const userTurns = turns.filter((turn) => turn.role === "user").length;');
    expect(keep).not.toContain("answerDisposition");
    expect(done).not.toContain("answerDisposition");
  });

  test("the kind label other screens read is unchanged", () => {
    // `career-timeline.ts` still tells an English-entered interview by this topic.
    expect(bodyOf("keepIt")).toContain('topic: locale === "ko" ? "회상 인터뷰" : "Recall interview"');
  });

  test("the table is folded behind the line that says what was done today", () => {
    expect(done).toContain("accessibilityState={{ expanded: tableOpen }}");
    expect(done).toMatch(/\{tableOpen \? \(\s*<DrillProgress/);
    expect(SCREEN).toContain("const [tableOpen, setTableOpen] = useState(false);");
  });

  test("this change adds no way out of the screen and no second button", () => {
    // "Don't save" is not in this change: leaving unsaved skips the check that runs when a
    // story is saved, and that needs its own design (review rounds 1 and 2 on #2436).
    expect(done.split("<MdButton").length - 1).toBe(1);
    expect(done).toContain('label={t("approve")}');
    expect(SCREEN).not.toContain("drill.discard");
    // The one new thing to press only opens and closes the table.
    expect(done.split("<Pressable").length - 1).toBe(1);
    expect(done).toContain("onPress={() => setTableOpen((open) => !open)}");
    expect(done.split("onPress=").length - 1).toBe(2);
    expect(done).not.toContain("router.");
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
