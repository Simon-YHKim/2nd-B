// Single home for tag-string normalization: lowercase, drop a leading '#',
// collapse anything outside [a-z0-9 hangul -] to hyphens, and trim hyphens.
// Shared so a tag entered in capture, proposed by the AI, or edited in the
// format manager all normalize the same way. (propose-template.ts and
// classify-clipper.ts still carry identical local copies — folding them onto
// this is a safe follow-up.)
export function sanitizeTag(s: string): string {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9가-힣\-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
