// Cheap, no-Gemini path to the seven DOMAIN-star levels + 북극성 brightness, for
// the constellation home (which mounts on every app open). The layer-A mirror of
// load-star-levels.ts: where that derives the hidden psychological constructs
// (layer B) from elicitation signals, this derives the visible life-domain stars
// (layer A) purely from how much the user has put into each domain.
//
// Reads only the records' `domain:` tag + their organizing user-tags — no LLM,
// no narrative summary — so the home sky reflects COVERAGE, never inference
// confidence (the brightness-honesty rule). domainConfidence / domainLevel /
// northStarBrightness do the deterministic math.

import { getSupabaseClient } from "../supabase/client";
import { isDomainId, type DomainEntry, type DomainId } from "./domain-stars";
import { type LadderLevel } from "./brightness";
import { domainStarLevels, northStarBrightness } from "./north-star";

export interface DomainBrightness {
  domainLevels: Record<DomainId, LadderLevel>;
  northStarBrightness: number;
}

const DOMAIN_TAG_PREFIX = "domain:";

// System tags that mark HOW a record was captured, not whether the user
// organized it. Stripped before the organized-ratio signal so the auto
// `domain:` tag (and capture-mode markers) can't make a raw brain-dump look
// curated — otherwise every record would read as "organized" and the §4.5 ②
// L3/L4 downgrade for raw-heavy domains would never fire.
const SYSTEM_TAGS = new Set(["voice", "todo", "interview"]);

function isSystemTag(tag: string): boolean {
  const t = tag.toLowerCase();
  return t.startsWith(DOMAIN_TAG_PREFIX) || SYSTEM_TAGS.has(t);
}

/** The DomainId encoded in a record's tags, or null if none / unknown slug. */
function domainOf(tags: readonly string[]): DomainId | null {
  for (const tag of tags) {
    if (tag.toLowerCase().startsWith(DOMAIN_TAG_PREFIX)) {
      const slug = tag.slice(DOMAIN_TAG_PREFIX.length).toLowerCase();
      if (isDomainId(slug)) return slug;
    }
  }
  return null;
}

interface DomainRow {
  created_at?: string | null;
  tags?: string[] | null;
}

export async function loadDomainLevels(userId: string): Promise<DomainBrightness> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("records")
    .select("id, created_at, tags")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as DomainRow[];

  const entriesByDomain: Partial<Record<DomainId, DomainEntry[]>> = {};
  for (const row of rows) {
    const tags = row.tags ?? [];
    const domain = domainOf(tags);
    // Records captured before the migration (no domain: tag) simply don't
    // count yet — an honest dark star, not a fabricated one.
    if (!domain) continue;
    const userTags = tags.filter((t) => !isSystemTag(t));
    (entriesByDomain[domain] ??= []).push({
      domain,
      createdAt: row.created_at ?? undefined,
      tags: userTags,
    });
  }

  const domainLevels = domainStarLevels(entriesByDomain);
  return { domainLevels, northStarBrightness: northStarBrightness(domainLevels) };
}
