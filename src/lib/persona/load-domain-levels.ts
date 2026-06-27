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

// One structured manage-layer row (relation_people 0058 / recreation_items 0059).
// These are deterministic, manually-entered domain backing — exactly the
// "organized" evidence the brightness-honesty rule wants — so they count toward
// their domain's coverage alongside the free-text records. The row's mere
// existence (a named person / logged item) makes it organized, so we mark it
// with a non-empty tag set. For recency we prefer the ACTIVITY date
// (last_interaction_on / occurred_on) over created_at, so the recency signal
// tracks real engagement, not when the row was first created.
interface StructuredRow {
  created_at?: string | null;
  /** relation_people: when the user last interacted with this person. */
  last_interaction_on?: string | null;
  /** recreation_items: when this leisure item happened. */
  occurred_on?: string | null;
}

export async function loadDomainLevels(userId: string): Promise<DomainBrightness> {
  const supabase = getSupabaseClient();
  const [recordsRes, relationRes, recreationRes] = await Promise.all([
    supabase
      .from("records")
      .select("id, created_at, tags")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    // Structured backing for the relation/recreation stars. Read-only here; the
    // manage-layer writers (mirroring ops_*) own inserts. A failed/absent table
    // must never blank the home sky, so these degrade to [] independently.
    supabase.from("relation_people").select("created_at, last_interaction_on").eq("user_id", userId),
    supabase.from("recreation_items").select("created_at, occurred_on").eq("user_id", userId),
  ]);
  const rows = (recordsRes.data ?? []) as DomainRow[];

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

  // Fold the structured manage-layer rows into their domains. Each row is
  // organized by construction (a deliberate, named entry), so it carries a
  // sentinel user-tag and lifts coverage exactly like a curated record.
  const STRUCTURED_TAG = ["structured"];
  const foldStructured = (
    domain: DomainId,
    data: unknown,
    activityKey: "last_interaction_on" | "occurred_on",
  ) => {
    for (const r of (data ?? []) as StructuredRow[]) {
      // Recency timestamp = the activity date (last interaction / occurrence)
      // when present, else created_at. So a person created months ago but
      // contacted today keeps the relation star fresh, while an old item logged
      // today does not look fresh just because its row is new.
      (entriesByDomain[domain] ??= []).push({
        domain,
        createdAt: r[activityKey] ?? r.created_at ?? undefined,
        tags: STRUCTURED_TAG,
      });
    }
  };
  foldStructured("relation", relationRes.data, "last_interaction_on");
  foldStructured("recreation", recreationRes.data, "occurred_on");

  // Inject a real Date.now() ONLY here, at the impure Supabase-read boundary, so
  // the §4.5 ④ recency signal is live in production (a domain abandoned months ago
  // dims relative to one fed today) while domain-confidence.ts / north-star.ts stay
  // pure and every other caller is unchanged.
  const domainLevels = domainStarLevels(entriesByDomain, {}, Date.now());
  return { domainLevels, northStarBrightness: northStarBrightness(domainLevels) };
}
