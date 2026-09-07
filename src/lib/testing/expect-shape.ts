// A failing test has one job beyond going red: telling you what to do next.
//
// The pattern this replaces does not do that job:
//
//   expect(nodes.some((n) => n.type === "AccountDeletionNoticePanel")).toBe(true);
//
// When it fails, jest says exactly this and nothing else:
//
//   Expected: true
//   Received: false
//
// You learn that the panel was not there. You do not learn what WAS there — a
// loader? a redirect? an empty list because the render threw? Each of those
// needs a different next move, and the assertion collapses them into one
// signal, which is the defect class this whole review has been chasing.
//
// `expectShape` asserts the same thing and, on failure, prints the list it
// actually got, projected onto the keys you asked about.
//
// ⚠ MEASURED BEFORE WRITING. The originally-recorded motivation was that
// `toContain` checks an array's *existence* rather than its *shape*. That is 2
// sites in this repo (`SELF_UNDERSTANDING_STARS.map(s => s.id)` and the Android
// permission list), and both are correct as written — the claim there really is
// about the projected value. The pattern that does earn a helper is
// `.some(...) → toBe(true)`, 25 sites, and its problem is the message rather
// than the assertion. So this helper is scoped to that: same guarantee, better
// failure. The 25 sites were NOT converted wholesale; the ones converted are
// where a reader of the failure has to choose a next step.
//
// Messages are English: this is developer-facing diagnostic text in `src/`,
// where `korean-in-code.test.ts` requires an English path.

/** Format a value compactly enough to sit in a failure message. */
function brief(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined || typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  return JSON.stringify(value);
}

function project(item: unknown, keys: readonly string[]): string {
  if (item === null || typeof item !== "object") return brief(item);
  const row = item as Record<string, unknown>;
  return `{ ${keys.map(k => `${k}: ${brief(row[k])}`).join(", ")} }`;
}

const MAX_SHOWN = 8;

/**
 * Assert that `items` holds at least one element matching every key of `shape`,
 * and return that element so the caller can keep asserting on it.
 *
 * On failure the message names what the list actually held, projected onto the
 * keys of `shape` — so "it wasn't there", "it was there but wrong" and "the list
 * was empty" read as three different failures instead of one `false`.
 */
export function expectShape<T extends object>(
  items: readonly T[],
  shape: Partial<T>,
  label = "item",
): T {
  const keys = Object.keys(shape) as (keyof T & string)[];
  if (keys.length === 0) {
    throw new Error("expectShape: empty shape - say which properties you are looking for");
  }
  const match = items.find(item => keys.every(k => (item as Partial<T>)[k] === shape[k]));
  if (match) return match;

  const shown = items.slice(0, MAX_SHOWN).map(i => `  ${project(i, keys)}`);
  const more = items.length > MAX_SHOWN ? `\n  ... and ${items.length - MAX_SHOWN} more` : "";
  const body =
    items.length === 0
      ? "  (the list is EMPTY - the render or query may have returned nothing at all)"
      : shown.join("\n") + more;

  throw new Error(
    `expectShape: no ${label} matched.\n` +
      `wanted: ${project(shape, keys)}\n` +
      `the list actually held (${items.length}):\n${body}`,
  );
}

/**
 * The negative: assert no element matches. Same reasoning — on failure it shows
 * the offending element rather than a bare `true`.
 */
export function expectNoShape<T extends object>(
  items: readonly T[],
  shape: Partial<T>,
  label = "item",
): void {
  const keys = Object.keys(shape) as (keyof T & string)[];
  if (keys.length === 0) {
    throw new Error("expectNoShape: empty shape");
  }
  const match = items.find(item => keys.every(k => (item as Partial<T>)[k] === shape[k]));
  if (!match) return;
  throw new Error(
    `expectNoShape: a ${label} that must not be here IS here.\n` +
      `forbidden: ${project(shape, keys)}\n` +
      `found: ${project(match, Object.keys(match) as string[])}`,
  );
}
