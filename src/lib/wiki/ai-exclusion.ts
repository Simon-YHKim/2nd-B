// Imported health measurements never go to an AI provider.
//
// The privacy policy promises it (§12, 2026-09-07 revision: health and activity measurements
// are not sent to any AI provider) and the sign-up detail repeats it. An Apple Health import is
// still kept as the person's own record; what refuses it are the paths that hand a source's
// body to a model:
// - reasoning sends the title alone (app/reasoning.tsx),
// - phase 1 (summary and questions) declines (lib/wiki/phase1.ts),
// - wiki promotion declines, which also keeps the body out of embeddings and of the chat
//   context built from wiki pages (lib/wiki/phase2.ts),
// - the import screen does not queue it for automatic reasoning.
// New imports carry the frontmatter mark (lib/import/proposals.ts proposalsToMarkdown).
// Sources imported before the mark are recognised by the line the import writes for each
// measurement.
import { HEALTH_PROPOSAL_SUB } from "../import/proposals";

export const AI_EXCLUDED_KEY = "ai_excluded";
export type AiExclusion = "health_measurements";

export function isAiExcludedSource(frontmatter: unknown, body?: string | null): boolean {
  if (frontmatter !== null && typeof frontmatter === "object" && (frontmatter as Record<string, unknown>)[AI_EXCLUDED_KEY] === "health_measurements") {
    return true;
  }
  return typeof body === "string" && body.includes(`_(${HEALTH_PROPOSAL_SUB})_`);
}

export class SourceAiExcludedError extends Error {
  constructor(public readonly sourceId: string) {
    super(`Source ${sourceId} holds health measurements and is not sent to an AI provider`);
    this.name = "SourceAiExcludedError";
  }
}
