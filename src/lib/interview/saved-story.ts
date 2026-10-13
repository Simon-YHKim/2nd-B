// What a finished interview stores (A-Z first-use check: Z61 and Z63).
//
// Z61: every story was stored under the same line ("1턴 회상 인터뷰"), so the wiki list
// showed a column of identical titles and each one had to be opened to tell them apart.
// Simon's choice (Q-261013-51): the star's name and how the first answer begins. The words
// are the user's own, so no model is called to make a title.
//
// Z63: a conversation the user ends stops on a question nobody answered, and that question
// was the last line of the stored story.

/** How many characters of the first answer the stored title carries. */
export const STORY_TITLE_ANSWER_LENGTH = 40;

interface StoryTurn {
  role: "interviewer" | "user";
  text: string;
}

/** The turns worth storing: everything up to the last answer. */
export function storedTurns<T extends StoryTurn>(turns: readonly T[]): T[] {
  let end = turns.length;
  while (end > 0 && turns[end - 1]?.role === "interviewer") end -= 1;
  return turns.slice(0, end);
}

/**
 * The stored title: the star's name, then how the first answer begins.
 *
 * The first answer is taken as it is, even when it says little: the choice was "the first
 * answer", and passing it over would put a later answer, one the user may not expect to
 * see in a list, into the title. An answer longer than STORY_TITLE_ANSWER_LENGTH is cut
 * there and marked with an ellipsis.
 */
export function storyTitle(star: string, answers: readonly string[]): string {
  const first = answers.map((text) => text.replace(/\s+/g, " ").trim()).find((text) => text.length > 0);
  return first ? `${star} · ${headOf(first)}` : star;
}

function headOf(text: string): string {
  // By code point, so a cut never lands inside a surrogate pair.
  const chars = Array.from(text);
  if (chars.length <= STORY_TITLE_ANSWER_LENGTH) return text.replace(/[.。]$/, "");
  return `${chars.slice(0, STORY_TITLE_ANSWER_LENGTH).join("").trimEnd()}…`;
}
