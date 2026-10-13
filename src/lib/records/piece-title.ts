/**
 * True when a piece's title only repeats how its body starts, so drawing both shows the
 * same words twice. That is every piece with no title of its own (the detail screen then
 * falls back to the first line, cut at 80 characters) and every stored summary that was
 * copied from the body. A-Z first-use check, round 5 (Z86): "the title and the body say the
 * same thing twice?"
 *
 * Whitespace is compared loosely: the title is one line, the body may wrap.
 */
export function titleRepeatsBody(title: string, body: string | null | undefined): boolean {
  const flat = (text: string): string => text.replace(/\s+/g, " ").trim();
  const head = flat(title.replace(/…$/, ""));
  return head.length > 0 && flat(body ?? "").startsWith(head);
}

/** How many characters of a note's body the capture screen stores as its topic. */
export const DERIVED_TOPIC_LENGTH = 80;

/**
 * What to store when a record's body is edited. A note saved from the capture screen has no
 * title field: its topic is the first 80 characters of its body. Editing the body used to leave
 * that copy behind, so the list and the detail kept the old words (A-Z first-use check, round 4,
 * Z48: "did my edit not save?"). A topic that repeats the old body follows the new one; a topic
 * of its own is the writer's and stays.
 */
export function editedBodyPatch(
  previous: { topic?: string | null; body?: string | null },
  nextBody: string,
): { body: string; topic?: string } {
  const topic = previous.topic?.trim();
  if (!topic || !titleRepeatsBody(topic, previous.body)) return { body: nextBody };
  return { body: nextBody, topic: nextBody.slice(0, DERIVED_TOPIC_LENGTH) };
}
