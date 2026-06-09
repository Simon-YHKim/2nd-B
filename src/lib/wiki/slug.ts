// Obsidian-compatible wiki page slug generation.
//
// Rules:
//   - lowercase ASCII letters
//   - keep digits 0-9
//   - keep Hangul (AC00..D7A3, jamo 1100..11FF, compatibility jamo 3130..318F)
//   - everything else → hyphen
//   - collapse runs of hyphens
//   - trim leading/trailing hyphens
//
// Idempotent: toSlug(toSlug(x)) === toSlug(x).

const KEEP = /[a-z0-9ᄀ-ᇿ㄰-㆏가-힣]/;

export function toSlug(input: string): string {
  const lower = input.toLowerCase().normalize("NFC");
  let out = "";
  for (const ch of lower) {
    out += KEEP.test(ch) ? ch : "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function isValidSlug(slug: string): boolean {
  if (slug.length === 0) return false;
  return slug === toSlug(slug);
}

// FNV-1a 32-bit hash → base36. Dependency-free and stable across runs. Used
// only to derive a last-resort slug token; not a security primitive.
function hashToken(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Slug for a user-facing title that must never be empty or collide across
 * distinct titles. Returns toSlug(title) when it keeps anything; otherwise
 * falls back to a stable hash of the NFC-normalized title.
 *
 * toSlug() keeps only ASCII + Hangul, so a title written purely in another
 * script (CJK, Cyrillic, Thai, kana, or pure punctuation) collapses to "".
 * Used as a storage-path / wiki-page key, "" makes every such title collide on
 * one row — silently overwriting each other. The hash fallback gives each
 * distinct title its own slug while staying idempotent for re-runs of the same
 * title. Callers that intentionally treat "" as "no slug" (e.g. optional
 * overrides) should keep using toSlug directly.
 */
export function slugForTitle(title: string): string {
  const base = toSlug(title);
  if (base.length > 0) return base;
  return `n-${hashToken(title.normalize("NFC"))}`;
}
