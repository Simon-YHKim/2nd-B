// What a finished interview stores (A-Z first-use check: Z61 and Z63).
//
// Z61: every story was stored under the same line (the answer count and "recall interview"),
// so the wiki list showed a column of identical titles and each one had to be opened to tell
// them apart. Simon's choice (Q-261013-51): the star's name and how the first answer begins.
// The words are the user's own, so no model is called to make a title.
//
// Z63: a conversation ended with the button stops on a question nobody answered, and that
// question was the last line of the stored story.

/** How many characters of the first answer the stored title carries. */
export const STORY_TITLE_ANSWER_LENGTH = 40;

interface StoryTurn {
  role: "interviewer" | "user";
  text: string;
}

/**
 * The turns worth storing: everything up to the last thing the user said.
 *
 * Words typed to end the conversation ("that's enough") are the user's own and stay, with
 * the question before them. The check that runs when a story is saved reads the stored text,
 * and for those words it is the only check that reads meaning, so they are not taken out.
 */
export function storedTurns<T extends StoryTurn>(turns: readonly T[]): T[] {
  let end = turns.length;
  while (end > 0 && turns[end - 1]?.role === "interviewer") end -= 1;
  return turns.slice(0, end);
}

/**
 * The answers of a conversation, in order. The words that ended it are a choice, not an
 * answer: they are neither counted nor used as the title.
 */
export function storyAnswers<T extends StoryTurn>(
  turns: readonly T[],
  endedIt: (text: string) => boolean,
): string[] {
  return turns.filter((turn) => turn.role === "user" && !endedIt(turn.text)).map((turn) => turn.text);
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
