// Extract + parse YAML frontmatter from clipper-emitted markdown.
//
// Format (Obsidian / clipper standard):
//   ---
//   key: value
//   tags:
//     - a
//     - b
//   ---
//
//   body content…
//
// Uses the `yaml` package (already in the dep tree via Expo/Tailwind) for
// robust scalar/list/multiline handling — the clipper templates emit a
// non-trivial subset (block lists, quoted strings, ISO timestamps, etc.).

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Opening fence is anchored to the start of the string (no `m` flag) so a
// `---` rule in the middle of a body doesn't get treated as frontmatter.
// The closing fence accepts the empty-block case via an optional `\r?\n`
// between captured content and the closing `---`. Trailing `\r?\n\r?\n?`
// swallows up to one blank line between the closing fence and the body.
const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)(?:\r?\n)?---\s*(?:\r?\n\r?\n?|$)/;

export interface FrontmatterResult {
  /** Parsed frontmatter object, or {} when absent / unparseable. */
  frontmatter: Record<string, unknown>;
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /** True when a `--- … ---` block was present at the very top. */
  hadFrontmatter: boolean;
}

/**
 * Pull frontmatter and body apart. Tolerant of:
 *   - missing frontmatter (returns hadFrontmatter=false, frontmatter={})
 *   - CRLF line endings
 *   - non-object frontmatter (e.g. just a string) — treated as absent
 */
export function splitFrontmatter(input: string): FrontmatterResult {
  const m = input.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: {}, body: input, hadFrontmatter: false };

  const yamlText = m[1];
  const body = input.slice(m[0].length);

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return { frontmatter: {}, body, hadFrontmatter: true };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { frontmatter: {}, body, hadFrontmatter: true };
  }

  return { frontmatter: parsed as Record<string, unknown>, body, hadFrontmatter: true };
}

/** Inverse of splitFrontmatter — emit canonical clipper-style markdown. */
export function joinFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const keys = Object.keys(frontmatter);
  if (keys.length === 0) return body;
  // yaml.stringify always ends with a single newline.
  const yamlBlock = stringifyYaml(frontmatter);
  return `---\n${yamlBlock}---\n\n${body}`;
}

/**
 * Subset of the clipper common workflow fields, type-narrowed. Returns
 * `null` for any field that's missing or the wrong shape — callers can
 * fall back to defaults without crashing on partially-filled frontmatter.
 */
export interface ClipperCommonFields {
  title: string | null;
  url: string | null;
  tags: string[];
  status: string | null;
  ingested: boolean | null;
  simon_relevance: number | null;
  target_category: string | null;
  wiki_target: string | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.length > 0) out.push(item);
  }
  return out;
}

/**
 * Extract the common workflow fields the clipper templates always emit.
 * Per-kind fields (channel, doi, authors, etc.) stay on the raw
 * frontmatter object — callers can read them by kind.
 *
 * Both `simon-relevance` and `simon_relevance` are accepted (hyphen is
 * the clipper default, but JSON-friendly underscore is allowed). Same
 * for `target-category` / `target_category` and `wiki-target` / `wiki_target`.
 */
export function extractCommonFields(fm: Record<string, unknown>): ClipperCommonFields {
  return {
    title: asString(fm.title),
    url: asString(fm.url) ?? asString(fm.source),
    tags: asStringArray(fm.tags),
    status: asString(fm.status),
    ingested: asBoolean(fm.ingested),
    simon_relevance: asNumber(fm["simon-relevance"]) ?? asNumber(fm.simon_relevance),
    target_category: asString(fm["target-category"]) ?? asString(fm.target_category),
    wiki_target: asString(fm["wiki-target"]) ?? asString(fm.wiki_target),
  };
}
