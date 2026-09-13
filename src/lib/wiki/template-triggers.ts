// Match a captured URL against the URL-glob triggers a user authored on their
// own clipper formats. detectClipperKind only knows the bundled host rules, so
// without this an authored trigger is stored but never routes a capture. Pure +
// deterministic; the classify orchestrator wires it in.

const MAX_URL_LENGTH = 8_192;
const MAX_GLOB_LENGTH = 2_048;
const MAX_LITERAL_SEGMENTS = 64;

/** Find one literal segment in a bounded window using linear-time KMP search. */
function findSegment(text: string, segment: string, start: number, end: number): number {
  if (segment.length === 0) return start;
  if (start > end - segment.length) return -1;

  const fallback = new Uint16Array(segment.length);
  for (let i = 1, matched = 0; i < segment.length; i += 1) {
    while (matched > 0 && segment[i] !== segment[matched]) {
      matched = fallback[matched - 1];
    }
    if (segment[i] === segment[matched]) matched += 1;
    fallback[i] = matched;
  }

  for (let i = start, matched = 0; i < end; i += 1) {
    while (matched > 0 && text[i] !== segment[matched]) {
      matched = fallback[matched - 1];
    }
    if (text[i] === segment[matched]) matched += 1;
    if (matched === segment.length) return i - segment.length + 1;
  }
  return -1;
}

/** Match a full string against a "*"-only glob without compiling user input. */
function matchesGlob(url: string, glob: string): boolean {
  const text = url.toLowerCase();
  const pattern = glob.toLowerCase();
  if (text.length > MAX_URL_LENGTH || pattern.length > MAX_GLOB_LENGTH) return false;

  const segments = pattern.split("*").filter((segment) => segment.length > 0);
  if (segments.length > MAX_LITERAL_SEGMENTS) return false;
  if (!pattern.includes("*")) return text === pattern;
  if (segments.length === 0) return true;

  let firstMiddle = 0;
  let lastMiddle = segments.length;
  let cursor = 0;
  let searchEnd = text.length;

  if (!pattern.startsWith("*")) {
    const prefix = segments[0];
    if (!text.startsWith(prefix)) return false;
    cursor = prefix.length;
    firstMiddle = 1;
  }

  if (!pattern.endsWith("*")) {
    const suffix = segments[segments.length - 1];
    const suffixStart = text.length - suffix.length;
    if (suffixStart < cursor || !text.endsWith(suffix)) return false;
    searchEnd = suffixStart;
    lastMiddle -= 1;
  }

  for (let i = firstMiddle; i < lastMiddle; i += 1) {
    const foundAt = findSegment(text, segments[i], cursor, searchEnd);
    if (foundAt === -1) return false;
    cursor = foundAt + segments[i].length;
  }
  return cursor <= searchEnd;
}

/** Does a URL match a single glob trigger? Blank globs never match. */
export function urlMatchesTrigger(url: string, glob: string): boolean {
  if (typeof url !== "string" || typeof glob !== "string") return false;
  if (url.length > MAX_URL_LENGTH || glob.length > MAX_GLOB_LENGTH) return false;
  const g = glob.trim();
  if (g.length === 0) return false;
  return matchesGlob(url.trim(), g);
}

/** The first template whose any trigger matches the URL, else null. Generic over
 *  the row shape so callers can pass full templates. */
export function matchTemplateByUrl<T extends { triggers: readonly string[] }>(
  url: string,
  templates: readonly T[],
): T | null {
  if (typeof url !== "string" || url.length > MAX_URL_LENGTH) return null;
  const u = url.trim();
  if (u.length === 0) return null;
  for (const t of templates) {
    if (t.triggers.some((g) => urlMatchesTrigger(u, g))) return t;
  }
  return null;
}
