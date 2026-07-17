// Markdown-lite parser for the legal document snapshots (U4). The drafts use
// only headings, paragraphs, lists, rules, tables, and bold/italic emphasis --
// so a 60-line line-based pass beats a markdown dependency (blueprint §5: no
// new deps without need). Pure and unit-tested; the screen maps blocks to <Text>.

export type LegalBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "li"; text: string }
  | { type: "p"; text: string }
  | { type: "rule" };

const HEADING_TYPES = ["h1", "h2", "h3"] as const;

// Emphasis markers render as plain text (legal copy needs accuracy, not weight).
// Inline-code backticks and the `**bold**\한글` escape-backslash workaround (a
// CommonMark CJK-flanking fix the drafts need) are markup too, never copy.
function stripEmphasis(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\/g, "")
    .trim();
}

export function parseLegalMarkdown(md: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length > 0) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  for (const rawLine of md.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flush();
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: HEADING_TYPES[h[1].length - 1], text: stripEmphasis(h[2]) });
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      flush();
      blocks.push({ type: "li", text: stripEmphasis(li[1]) });
      continue;
    }
    // Table rows render as list items (mobile has no room for real columns):
    // cells joined with a middot, the |---| alignment row dropped.
    if (line.startsWith("|")) {
      flush();
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
      if (cells.length > 0 && !cells.every((c) => /^:?-{3,}:?$/.test(c))) {
        blocks.push({ type: "li", text: stripEmphasis(cells.join(" · ")) });
      }
      continue;
    }
    para.push(stripEmphasis(line));
  }
  flush();
  return blocks;
}
