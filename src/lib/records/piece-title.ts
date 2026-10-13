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
