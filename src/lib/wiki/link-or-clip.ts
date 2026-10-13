// Link/Clip unification (capture overhaul, 2026-05-31 user directive).
//
// The capture screen used to split "링크"(link) and "스크랩"(clip) into two
// modes that felt redundant. They're now one mode: paste a URL OR paste the
// markdown your Web Clipper produced, and we figure out which it is.
//
// Pure + tested so the capture UI stays a thin renderer.

/** What the pasted content looks like. */
export type LinkClipKind = "url" | "markdown" | "empty";

const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Classify a single capture input box that accepts either a bare URL or a
 * block of clipper markdown.
 *
 * - "empty"    — nothing meaningful typed yet.
 * - "url"      — the whole trimmed input is a single http(s) URL.
 * - "markdown" — anything else (multi-line, has markdown, or prose).
 */
export function classifyLinkOrClip(input: string): LinkClipKind {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "empty";
  // A single token that is a URL → link. (No spaces, no newlines.)
  if (!/\s/.test(trimmed) && URL_RE.test(trimmed)) return "url";
  return "markdown";
}

/** True when the input should be treated as a bare link to fetch/clip. */
export function isBareUrl(input: string): boolean {
  return classifyLinkOrClip(input) === "url";
}

/**
 * A title line and exactly one address, two blocks apart: the shape a browser's share sends
 * (normalizeSharedCaptureParams joins the title and the address with a blank line). It is a link
 * with a title, not a clipped text: the box says so and the record is saved under the shared
 * title (Z113). Anything else (a second paragraph, an address inside the title, a multi-line
 * title) is not.
 */
export function titledLinkIn(input: string): { title: string; url: string } | null {
  const blocks = input
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  if (blocks.length !== 2) return null;
  const [title, url] = blocks;
  if (/\n/.test(title) || title.length > 200 || /https?:\/\//i.test(title)) return null;
  if (/\s/.test(url) || !URL_RE.test(url)) return null;
  return { title, url };
}

/**
 * Extract the first http(s) URL found anywhere in the markdown, so a clipped
 * block can still record its source_url. Returns null when none present.
 */
export function firstUrlIn(input: string): string | null {
  const m = input.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}
