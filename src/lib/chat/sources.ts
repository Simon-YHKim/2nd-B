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

export function formatSourceCitationLabel(rawSlug: string, recordLabel?: string): string {
  const slug = rawSlug.trim();
  // ingest-helpers uses (untitled); phase2 appends the source UUID's first
  // eight hex digits on collision. Other titles containing "untitled" are real.
  if (recordLabel !== undefined && /^untitled(?:-[a-f0-9]{8})?$/i.test(slug)) return recordLabel;
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

// Keep the legacy parser above for copy, capture and conversation history.
// This transform is for the bubble only, AFTER chatDisplayText strips markup.
const MARKER = String.raw`\[\[[^\]\r\n]+\]\]`;
const GROUP = `${MARKER}(?:[ \\t]*(?:[,;][ \\t]*)?${MARKER})*`;
const DISPLAY_CITATIONS = new RegExp(`\\([ \\t]*${GROUP}[ \\t]*\\)|（[ \\t]*${GROUP}[ \\t]*）|${GROUP}`, "g");

function needsCitationName(before: string): boolean {
  // An English preposition/verb may need the citation as its object, including
  // verbs we have never seen. Only familiar standalone clause endings can lose
  // a pre-punctuation citation. Unknown English fragments keep their name;
  // a citation after an already punctuated sentence needs no such guess.
  const englishEnd = before.match(/\b([a-z]+)[ \t]*$/i);
  return englishEnd !== null && !/^(?:first|last|now|today|yesterday|tomorrow|here|there|this|that|it|again|instead|together|daily|early|later)$/i.test(englishEnd[1]);
}

/** Presentation only. Citation identities and the original text stay untouched. */
export function sourceCitationDisplay(text: string, recordLabel: string): string {
  const matches = Array.from(text.matchAll(DISPLAY_CITATIONS));
  let display = text;
  // Work backwards so cleanup cannot invalidate the original match offsets.
  for (const match of matches.reverse()) {
    const start = match.index;
    const end = start + match[0].length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const wrapped = /^[（(]/.test(match[0]);
    const empty = !Array.from(match[0].matchAll(/\[\[([^\]]+)\]\]/g)).some(item => item[1].trim());
    const boundaryBefore = before.trim().length > 0 && (wrapped || /\s$/.test(before));
    const boundaryAfter = /^[ \t]*(?:[.,!?;:。！？、，；：]|\r?\n|$)/.test(after);
    const attachedWord = /^[\p{L}\p{N}_]/u.test(after);
    const remove = empty || (boundaryBefore && (wrapped ? !attachedWord : boundaryAfter) && !needsCitationName(before));
    if (!remove) {
      display = display.slice(0, start) + match[0].replace(CITATION, (_full, slug: string) => formatSourceCitationLabel(slug, recordLabel)) + display.slice(end);
      continue;
    }
    const left = display.slice(0, start).replace(/[ \t]+$/, "");
    let right = display.slice(end).replace(/^[ \t]+/, "");
    // "First. [[source]]." should not leave a second full stop.
    if (/[.。]$/.test(left) && right[0] === left.at(-1) && right[1] !== right[0]) right = right.slice(1);
    const gap = left && !/[\r\n]$/.test(left) && right && !/^[\s.,!?;:。！？、，；：]/.test(right) ? " " : "";
    display = left + gap + right;
  }
  return display;
}
