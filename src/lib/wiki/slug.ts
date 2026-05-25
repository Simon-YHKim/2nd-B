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
