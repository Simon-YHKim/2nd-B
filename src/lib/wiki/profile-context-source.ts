// Imported profile context already has its own source page and withdrawal ledger.
// Generic ingestion must not create shared entities or replace that managed page.
// This is a regeneration guard, not a prohibition on reading confirmed context in chat.
export function isProfileContextImportSource(frontmatter: unknown): boolean {
  return frontmatter !== null && typeof frontmatter === "object" && !Array.isArray(frontmatter)
    && Object.prototype.hasOwnProperty.call(frontmatter, "profile_context_import_id");
}

export class SourceImportManagedError extends Error {
  constructor(public readonly sourceId: string) {
    super(`Source ${sourceId} is managed by its profile import`);
    this.name = "SourceImportManagedError";
  }
}
