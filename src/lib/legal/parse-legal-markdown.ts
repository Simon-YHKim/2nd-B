// Markdown-lite parser for the legal document snapshots (U4). The drafts use
// only headings, paragraphs, lists, rules, tables, and bold/italic emphasis --
// so a 60-line line-based pass beats a markdown dependency (blueprint §5: no
// new deps without need). Pure and unit-tested; the screen maps blocks to <Text>.

export type LegalBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "li"; text: string }
  | { type: "p"; text: string }
  | { type: "rule" };

export type LegalDocumentLanguage = "ko" | "en";
export type LegalLanguageSections = Record<LegalDocumentLanguage, LegalBlock[]>;

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

/**
 * Removes the redundant in-body title, date metadata, and divider when the
 * screen already renders the document title in its own header.
 */
export function stripLegalDocumentIntro(blocks: LegalBlock[], title: string): LegalBlock[] {
  const first = blocks[0];
  if (first?.type !== "h1" || first.text !== title) return blocks;

  let contentStart = 1;
  const metadata = blocks[contentStart];
  if (metadata?.type === "p" && /^(시행일|최종 업데이트):/.test(metadata.text)) {
    contentStart += 1;
  }
  if (blocks[contentStart]?.type === "rule") contentStart += 1;

  return blocks.slice(contentStart);
}

/**
 * Splits a bilingual legal document at its exact level-two language headings.
 * Malformed or incomplete markers fail open so a document is never truncated.
 */
export function splitLegalLanguageSections(blocks: LegalBlock[]): LegalLanguageSections | null {
  const koreanMarkers: number[] = [];
  const englishMarkers: number[] = [];

  blocks.forEach((block, index) => {
    if (block.type !== "h2") return;
    if (block.text === "한국어") koreanMarkers.push(index);
    if (block.text === "English") englishMarkers.push(index);
  });

  if (koreanMarkers.length !== 1 || englishMarkers.length !== 1) return null;
  const koreanStart = koreanMarkers[0];
  const englishStart = englishMarkers[0];
  if (koreanStart >= englishStart) return null;

  const trimBoundaryRules = (section: LegalBlock[]): LegalBlock[] => {
    let start = 0;
    let end = section.length;
    while (section[start]?.type === "rule") start += 1;
    while (section[end - 1]?.type === "rule") end -= 1;
    return section.slice(start, end);
  };

  const ko = trimBoundaryRules(blocks.slice(koreanStart + 1, englishStart));
  const en = trimBoundaryRules(blocks.slice(englishStart + 1));
  return ko.length > 0 && en.length > 0 ? { ko, en } : null;
}
