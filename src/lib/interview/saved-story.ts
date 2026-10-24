// What a finished interview stores (A-Z first-use check: Z61 and Z63).
//
// Z61: every story was stored under the same line (the answer count and "recall interview"),
// so the wiki list showed a column of identical titles and each one had to be opened to tell
// them apart. Simon's choice (Q-261013-51): the star's name and how the first answer begins.
// The title uses the submitted text, so no model is called to make a title.
//
// Z63: a conversation ended with the button stops on a question nobody answered, and that
// question was the last line of the stored story.
//
// Both read the turns as they are. Nothing here judges what an utterance meant: the stored
// text, its title and the count on the save screen always describe the same turns.

/** How many characters of the first answer the stored title carries. */
export const STORY_TITLE_ANSWER_LENGTH = 40;

interface StoryTurn {
  role: "interviewer" | "user";
  text: string;
}

/** Provenance only: Q7 defers any change to credit/coverage until M6. */
export function interviewAnswerLabel(fromOpener: boolean | undefined, locale: "ko" | "en"): string {
  return locale === "ko"
    ? fromOpener ? "답변(제안 그대로)" : "답변"
    : fromOpener ? "A (suggested, sent as is)" : "A";
}

/**
 * The turns worth storing: everything up to the last thing the user said.
 *
 * Only questions are ever left out. Words typed to end the conversation ("that's enough") are
 * the user's own and stay, with the question before them: the check that runs when a story is
 * saved reads the stored text, and for those words it is the only check that reads meaning.
 */
export function storedTurns<T extends StoryTurn>(turns: readonly T[]): T[] {
  let end = turns.length;
  while (end > 0 && turns[end - 1]?.role === "interviewer") end -= 1;
  return turns.slice(0, end);
}

/**
 * The stored title: the star's name, then how the first answer begins.
 *
 * The first thing the user said is taken as it is, whatever it says: the choice was "the first
 * answer", and passing it over would put a later answer, one the user may not expect to see in
 * a list, into the title. An answer longer than STORY_TITLE_ANSWER_LENGTH is cut there and
 * marked with an ellipsis.
 */
export function storyTitle(star: string, answers: readonly string[]): string {
  const first = answers.map((text) => text.replace(/\s+/g, " ").trim()).find((text) => text.length > 0);
  return first ? `${star} · ${headOf(first)}` : star;
}

// A code point that belongs to the one before it: a combining mark, a variation selector, a
// joiner, a skin tone, a tag (the letters inside a flag such as England's).
const ATTACHES = /^[\p{M}‍️\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]$/u;
const JOINER = "‍";
// The sign that joins two consonants into one in the Indic scripts.
const JOINS_NEXT = /^[्্੍્୍்్್്්]$/u;

/** One half of a flag: flags are written as two of these. */
function isRegional(char: string | undefined): boolean {
  const code = char?.codePointAt(0) ?? 0;
  return code >= 0x1f1e6 && code <= 0x1f1ff;
}

/** True when cutting before `chars[end]` would land inside one visible character. */
function splitsCharacter(chars: readonly string[], end: number): boolean {
  const next = chars[end] ?? "";
  const prev = chars[end - 1] ?? "";
  if (ATTACHES.test(next) || prev === JOINER || JOINS_NEXT.test(prev)) return true;
  if (!isRegional(prev) || !isRegional(next)) return false;
  // Between two halves of the same flag only when an odd number of halves comes before the cut.
  let halves = 0;
  for (let i = end - 1; i >= 0 && isRegional(chars[i]); i -= 1) halves += 1;
  return halves % 2 === 1;
}

function headOf(text: string): string {
  // Composed first, so a Hangul syllable typed as separate jamo is one code point.
  const chars = Array.from(text.normalize("NFC"));
  if (chars.length <= STORY_TITLE_ANSWER_LENGTH) return chars.join("").replace(/[.。]$/, "");
  let end = STORY_TITLE_ANSWER_LENGTH;
  while (end > 0 && splitsCharacter(chars, end)) end -= 1;
  return `${chars.slice(0, end).join("").trimEnd()}…`;
}
