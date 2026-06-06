// Source chips for SecondB replies. The chat system prompt asks the model
// to cite the user's own wiki pages via [[double-bracket]] slugs. This pure
// helper pulls those citations out so the chat UI can render small "내 조각
//에서 온 답" source chips (handoff §7-4) and show clean prose without the
// raw brackets.

export interface ParsedReply {
  /** Reply text with [[slug]] markers replaced by a friendly label. */
  display: string;
  /** Ordered, de-duplicated slugs the reply cited. Empty if none. */
  chips: string[];
}

const CITATION = /\[\[([^\]]+)\]\]/g;

export function formatSourceCitationLabel(rawSlug: string): string {
  const slug = rawSlug.trim();
  const spaced = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (spaced.length === 0) return slug;
  if (/^[a-z0-9 ]+$/.test(spaced)) {
    return spaced.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return spaced;
}

export function parseSourceCitations(text: string): ParsedReply {
  const chips: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  CITATION.lastIndex = 0;
  while ((match = CITATION.exec(text)) !== null) {
    const slug = match[1].trim();
    if (slug.length > 0 && !seen.has(slug)) {
      seen.add(slug);
      chips.push(slug);
    }
  }
  const display = text.replace(CITATION, (_full, slug: string) => formatSourceCitationLabel(slug));
  return { display, chips };
}
