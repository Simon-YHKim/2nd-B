import { readFileSync } from "fs";
import { join } from "path";

import { STORY_TITLE_ANSWER_LENGTH, storedTurns, storyTitle } from "../saved-story";

type Turn = { role: "interviewer" | "user"; text: string };
const q = (text: string): Turn => ({ role: "interviewer", text });
const a = (text: string): Turn => ({ role: "user", text });

describe("the stored story ends on the last answer (Z63)", () => {
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

  test("the words that ended the conversation are the user's own and stay", () => {
    // Typed instead of pressed: the screen stores them as a turn. Taking them out here would
    // also take them out of the check that reads the stored text when it is saved.
    const turns = [q("하나"), a("답"), q("둘"), a("이제 그만할래요")];
    expect(storedTurns(turns)).toEqual(turns);
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
    const one = storyTitle("학창시절", ["매점 종소리가 기억나요", "그리고"]);
    const two = storyTitle("학창시절", ["복도에서 뛰다 혼났어요"]);
    expect(one).not.toBe(two);
  });

  test("a long answer is cut and marked", () => {
    const long = "가".repeat(STORY_TITLE_ANSWER_LENGTH + 15);
    const title = storyTitle("직장", [long]);
    expect(title).toBe(`직장 · ${"가".repeat(STORY_TITLE_ANSWER_LENGTH)}…`);
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

  test("the first answer is the title even when it says little: a later one is never promoted", () => {
    expect(storyTitle("학창시절", ["모르겠어요", "아버지가 편찮으셨던 해였어요"])).toBe("학창시절 · 모르겠어요");
  });

  test("an empty first answer is not an answer", () => {
    expect(storyTitle("학창시절", ["  ", "매점 종소리요"])).toBe("학창시절 · 매점 종소리요");
  });

  test("with no answer the star's name stands alone", () => {
    expect(storyTitle("학창시절", [])).toBe("학창시절");
    expect(storyTitle("학창시절", ["   "])).toBe("학창시절");
  });

  test("a cut never splits a character in two", () => {
    const title = storyTitle("지금", ["😀".repeat(STORY_TITLE_ANSWER_LENGTH + 2)]);
    expect(title).toBe(`지금 · ${"😀".repeat(STORY_TITLE_ANSWER_LENGTH)}…`);
  });
});

// The screen is not rendered here (render tests are blocked in this repo), so the wiring is
// read from the source: what the save path stores, and that the other path stores nothing.
const ROOT = join(__dirname, "..", "..", "..", "..");
const SCREEN = readFileSync(join(ROOT, "src", "app", "interview.tsx"), "utf8").replace(/\r\n/g, "\n");

function bodyOf(name: string): string {
  const start = SCREEN.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = SCREEN.indexOf("\n  }\n", start);
  expect(end).toBeGreaterThan(start);
  return SCREEN.slice(start, end);
}

describe("the save screen (Z61 · Z63 · Z64)", () => {
  test("saving stores the turns up to the last answer under the new title", () => {
    const keep = bodyOf("keepIt");
    expect(keep).toContain("storedTurns(turns)");
    expect(keep).toContain("summary: storyTitle(");
    expect(keep).toContain("homeT(`ds.star.${period}`)");
    // The words that ended the conversation are not an answer, so they are never the title.
    expect(keep).toContain('turn.role === "user" && answerDisposition(turn.text, locale) !== "stop"');
    // The fixed line every story used to share.
    expect(SCREEN).not.toContain("턴 회상 인터뷰");
    expect(SCREEN).not.toContain("-turn recall interview");
  });

  test("the kind label other screens read is unchanged", () => {
    // `career-timeline.ts` still tells an English-entered interview by this topic.
    expect(bodyOf("keepIt")).toContain('topic: locale === "ko" ? "회상 인터뷰" : "Recall interview"');
  });

  test("leaving without saving writes nothing", () => {
    const leave = bodyOf("leaveUnsaved");
    for (const write of ["createRecord", "addCoverage", "recordSevenTiers", "playSaveCue", "setToast"]) {
      expect(leave).not.toContain(write);
    }
    // It goes where a save goes.
    expect(leave).toContain('router.replace("/star/growth")');
    expect(leave).toContain("router.replace(`/me/${period}`)");
  });

  test("there are two buttons, and the second one asks once more", () => {
    const done = /\{done \?[\s\S]*?\) : \(/.exec(SCREEN)?.[0] ?? "";
    expect(done).toContain('label={t("approve")}');
    expect(done).toContain('label={t("drill.discard")}');
    // Nothing answered means nothing to lose, so that case leaves at once.
    expect(done).toContain("userTurns === 0 ? leaveUnsaved() : setDiscardAsk(true)");
    expect(SCREEN).toContain("visible={discardAsk}");
    expect(SCREEN).toContain('{t("drill.discardConfirm")}');
  });

  test("the table is folded behind the line that says what was done today", () => {
    const done = /\{done \?[\s\S]*?\) : \(/.exec(SCREEN)?.[0] ?? "";
    expect(done).toContain("accessibilityState={{ expanded: tableOpen }}");
    expect(done).toContain('t("drill.saveMeta", { star: homeT(`ds.star.${period}`), n: userTurns })');
    expect(done).toMatch(/\{tableOpen \? \(\s*<DrillProgress/);
    expect(SCREEN).toContain("const [tableOpen, setTableOpen] = useState(false);");
  });
});

describe("the new lines exist in every language", () => {
  const LANGS = ["en", "ko", "es", "id", "pt"] as const;
  const drill = (lang: string): Record<string, string> =>
    (JSON.parse(readFileSync(join(ROOT, "locales", lang, "interview.json"), "utf8")) as { drill: Record<string, string> }).drill;

  test.each(LANGS)("%s", (lang) => {
    const d = drill(lang);
    expect(d.saveMeta).toContain("{{star}}");
    expect(d.saveMeta).toContain("{{n}}");
    expect(d.discard?.length).toBeGreaterThan(0);
    expect(d.discardConfirm?.length).toBeGreaterThan(0);
  });

  test("Korean is the wording Simon chose from the mock", () => {
    const d = drill("ko");
    expect(d.saveMeta).toBe("{{star}} · 답 {{n}}개");
    expect(d.discard).toBe("저장 안 함");
    expect(d.discardConfirm).toBe("오늘 이야기가 사라집니다.");
  });
});
