// Source chips for SecondB replies. The chat system prompt asks the model
// to cite the user's own wiki pages via [[double-bracket]] slugs. This pure
// helper pulls those citations out so the chat UI can render small "내 조각
//에서 온 답" source chips (handoff §7-4) and show clean prose without the
// raw brackets.

import { canDecideJosa, josaFor, type JosaPair } from "@/lib/i18n/josa";

export interface ParsedReply {
  /** Reply text with [[slug]] markers replaced by a friendly label. */
  display: string;
  /** Ordered, de-duplicated slugs the reply cited. Empty if none. */
  chips: string[];
}

const CITATION = /\[\[([^\]]+)\]\]/g;
const UNTITLED_SLUG = /^untitled(?:-[a-f0-9]{8})?$/i;

export function formatSourceCitationLabel(rawSlug: string, recordLabel?: string): string {
  const slug = rawSlug.trim();
  // ingest-helpers uses (untitled); phase2 appends the source UUID's first
  // eight hex digits on collision. Other titles containing "untitled" are real.
  if (recordLabel !== undefined && UNTITLED_SLUG.test(slug)) return recordLabel;
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

const CITATION_JOSA: Record<string, JosaPair> = {
  과: "와과", 와: "와과", 을: "을를", 를: "을를", 은: "은는", 는: "은는",
  이: "이가", 가: "이가", 으로: "으로로", 로: "으로로", 이나: "이나나", 나: "이나나",
};
// Whole particles only. Words such as 이야기/가다 and compound particles stay as written.
// Connector punctuation (such as an underscore) may continue a word.
const ATTACHED_JOSA = /^(으로|이나|[과와을를은는이가로나])(?=$|\s|(?!\p{Pc})\p{P})/u;

function replaceCitationNames(text: string, recordLabel: string): string {
  let display = text;
  for (const match of Array.from(text.matchAll(new RegExp(MARKER, "g"))).reverse()) {
    let start = match.index;
    const end = start + match[0].length;
    const slug = match[0].slice(2, -2).trim();
    const label = formatSourceCitationLabel(slug, recordLabel);
    let right = display.slice(end);
    if (label !== slug && canDecideJosa(label)) {
      const particle = right.match(ATTACHED_JOSA)?.[0];
      if (particle) right = josaFor(label, CITATION_JOSA[particle]) + right.slice(particle.length);
    }

    const before = display.slice(0, start);
    const repeated = `${recordLabel} `;
    // A real title can equal the fallback too; only untitled placeholders collapse.
    if (UNTITLED_SLUG.test(slug) && recordLabel && before.endsWith(repeated)
      && !/[\p{L}\p{M}\p{N}\p{Pc}]$/u.test(before.slice(0, -repeated.length))) {
      start -= repeated.length;
    }
    display = display.slice(0, start) + label + right;
  }
  return display;
}

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
    if (!remove) continue;
    const left = display.slice(0, start).replace(/[ \t]+$/, "");
    let right = display.slice(end).replace(/^[ \t]+/, "");
    // "First. [[source]]." should not leave a second full stop.
    if (/[.。]$/.test(left) && right[0] === left.at(-1) && right[1] !== right[0]) right = right.slice(1);
    const gap = left && !/[\r\n]$/.test(left) && right && !/^[\s.,!?;:。！？、，；：]/.test(right) ? " " : "";
    display = left + gap + right;
  }
  return replaceCitationNames(display, recordLabel);
}
