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
 * Extract the first http(s) URL found anywhere in the markdown, so a clipped
 * block can still record its source_url. Returns null when none present.
 */
export function firstUrlIn(input: string): string | null {
  const m = input.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}
