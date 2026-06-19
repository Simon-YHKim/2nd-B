// Manual import: split a pasted markdown blob into individual notes for the
// /import "review before import" flow, then hand each note to captureFromMarkdown
// (the same raw-text -> source pipeline the clipper uses). Pure + dependency-free
// so the screen logic stays testable.
//
// Splitting convention: a horizontal-rule line (`---` on its own line) separates
// notes. This is the common way people concatenate notes for export. A leading
// YAML frontmatter block is protected so its closing `---` fence is NOT treated
// as a separator. A single note with its own frontmatter joined to others is the
// one case this can't disambiguate — import those singly.

/** Detach a leading `---\n...\n---\n` YAML frontmatter block, if present. */
function splitLeadingFrontmatter(text: string): { lead: string; rest: string } {
  const fm = /^---\n[\s\S]*?\n---\n/.exec(text);
  if (!fm) return { lead: "", rest: text };
  return { lead: fm[0], rest: text.slice(fm[0].length) };
}

/** Split a pasted markdown blob into trimmed, non-empty note chunks. */
export function splitImportNotes(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { lead, rest } = splitLeadingFrontmatter(trimmed);
  const parts = rest
    .split(/\n[ \t]*-{3,}[ \t]*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    const onlyLead = lead.trim();
    return onlyLead ? [onlyLead] : [];
  }
  // Re-attach the protected frontmatter to the first note so it stays intact.
  if (lead) parts[0] = `${lead}${parts[0]}`;
  return parts;
}

/** A short display title for one note in the preview list. Prefers a frontmatter
 *  `title:`, then the first meaningful line (with markdown heading marks stripped),
 *  else the fallback. Never returns an empty string. */
export function previewTitle(note: string, fallback: string, maxLen = 80): string {
  const trimmed = note.trim();
  const fm = /^---\n([\s\S]*?)\n---/.exec(trimmed);
  if (fm) {
    const m = /^title:\s*(.+)$/m.exec(fm[1]);
    if (m) {
      const t = m[1].trim().replace(/^["']|["']$/g, "").trim();
      if (t) return t.slice(0, maxLen);
    }
  }
  const body = fm ? trimmed.slice(fm[0].length) : trimmed;
  for (const line of body.split("\n")) {
    const l = line.trim().replace(/^#+\s*/, "").replace(/^[-*>]\s*/, "").trim();
    if (l && !/^-{3,}$/.test(l)) return l.slice(0, maxLen);
  }
  return fallback;
}
