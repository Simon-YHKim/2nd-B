// Match a captured URL against the URL-glob triggers a user authored on their
// own clipper formats. detectClipperKind only knows the bundled host rules, so
// without this an authored trigger is stored but never routes a capture. Pure +
// deterministic; the classify orchestrator wires it in.

/** Convert one "*"-glob to a case-insensitive, full-string RegExp. Every regex
 *  metacharacter other than "*" is escaped, so the glob matches literally apart
 *  from its wildcards. */
function globToRegExp(glob: string): RegExp {
  const body = glob
    .split("*")
    .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`, "i");
}

/** Does a URL match a single glob trigger? Blank globs never match. */
export function urlMatchesTrigger(url: string, glob: string): boolean {
  const g = glob.trim();
  if (g.length === 0) return false;
  try {
    return globToRegExp(g).test(url.trim());
  } catch {
    return false;
  }
}

/** The first template whose any trigger matches the URL, else null. Generic over
 *  the row shape so callers can pass full templates. */
export function matchTemplateByUrl<T extends { triggers: readonly string[] }>(
  url: string,
  templates: readonly T[],
): T | null {
  const u = url.trim();
  if (u.length === 0) return null;
  for (const t of templates) {
    if (t.triggers.some((g) => urlMatchesTrigger(u, g))) return t;
  }
  return null;
}
