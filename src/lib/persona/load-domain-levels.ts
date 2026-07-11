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
  /** recreation_items / ops_ledger: when the item / ledger entry happened. */
  occurred_on?: string | null;
  /** ops_reading: when the shelf row was last updated (status change). */
  updated_at?: string | null;
}

async function fetchDomainLevels(userId: string): Promise<DomainBrightness> {
  const supabase = getSupabaseClient();
  const [recordsRes, relationRes, recreationRes, ledgerRes, readingRes, healthDeviceRes] =
    await Promise.all([
      supabase
        .from("records")
        .select("id, created_at, tags")
        .eq("user_id", userId)
        // Newest first: if PostgREST's max-rows cap truncates a heavy user's
        // history, keep the MOST RECENT records so the §4.5 ④ recency signal (a
        // domain fed today vs. abandoned months ago) stays correct. Ascending
        // would silently keep the OLDEST rows and freeze the home sky in the past.
        .order("created_at", { ascending: false }),
      // Structured backing for the relation/recreation stars. Read-only here; the
      // manage-layer writers (mirroring ops_*) own inserts. A failed/absent table
      // must never blank the home sky, so these degrade to [] independently.
      supabase.from("relation_people").select("created_at, last_interaction_on").eq("user_id", userId),
      supabase.from("recreation_items").select("created_at, occurred_on").eq("user_id", userId),
      // Manual, low-volume manage-layer rows that ARE the user's deliberate
      // self-report coverage for finance (ops_ledger) and growth (ops_reading) —
      // folded as "organized" entries exactly like relation_people/recreation_items
      // (same introspective method; per-row effort bounds volume). Recency key:
      // ledger = occurred_on, reading = updated_at.
      supabase.from("ops_ledger").select("created_at, occurred_on").eq("user_id", userId),
      supabase.from("ops_reading").select("created_at, updated_at").eq("user_id", userId),
      // DEVICE-measured health is the one INDEPENDENT, objective channel. It is
      // NEVER folded as coverage rows: auto-ingest is high-volume (one HealthKit
      // sync emits dozens of rows), so counting it would inflate the most sensitive
      // star to L4 on "owns a wearable" alone — detonating the brightness-honesty
      // rule. Instead it contributes ONE boolean (existence) toward the
      // crossSourceAgreement +1 tier (below). Only device sources count; manual is
      // self-report and mock is seed/test, both excluded at the query. .limit(1)
      // keeps existence O(1) and volume-proof (1 row and 10k give the same boolean).
      supabase
        .from("health_samples")
        .select("source")
        .eq("user_id", userId)
        .in("source", ["healthkit", "health_connect", "strava"])
        .limit(1),
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
    activityKey: "last_interaction_on" | "occurred_on" | "updated_at",
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
  // Finance & growth: the same organized-fold. Deliberate manual self-report
  // (logged transactions / shelf entries), so the count-based coverage band is
  // honest here — they ADD coverage volume but do NOT earn a triangulation tier
  // (single method). Per the judge-panel verdict (psychometric/honesty/UX).
  foldStructured("finance", ledgerRes.data, "occurred_on");
  foldStructured("growth", readingRes.data, "updated_at");

  // Activate the (previously dead) crossSourceAgreement +1 tier — for HEALTH only,
  // and only as genuine method-triangulation: a DEVICE-measured sample (objective)
  // AND >=1 self-report health record (introspective) must BOTH be present. Device
  // data alone never lifts health past its record-derived level; co-presence of two
  // independent methods is the incremental-validity finding encoded honestly, and
  // one device row equals ten thousand (boolean), so brightness stays inflation-
  // proof under passive volume. Each read degraded to []/false above, so an
  // absent/failed table can neither blank nor fabricate a star.
  const hasDeviceHealth = ((healthDeviceRes.data ?? []) as unknown[]).length > 0;
  const hasHealthRecord = (entriesByDomain.health ?? []).length > 0;
  const opts: Partial<Record<DomainId, { crossSourceAgreement?: boolean }>> =
    hasDeviceHealth && hasHealthRecord ? { health: { crossSourceAgreement: true } } : {};

  // Inject a real Date.now() ONLY here, at the impure Supabase-read boundary, so
  // the §4.5 ④ recency signal is live in production (a domain abandoned months ago
  // dims relative to one fed today) while domain-confidence.ts / north-star.ts stay
  // pure and every other caller is unchanged.
  const domainLevels = domainStarLevels(entriesByDomain, opts, Date.now());
  return { domainLevels, northStarBrightness: northStarBrightness(domainLevels) };
}

// ── Per-user TTL cache + in-flight dedup ───────────────────────────────
// The six-table scan above runs on every home mount (DeepSpaceShell), again on
// every star tap (/star/[domain]), and serially inside every advisor chat reply
// (gemini.ts) where it lands on the time-to-first-token path. None of that data
// changes second-to-second, so a short per-userId cache collapses the repeat
// scans while keeping the sky honest: any domain-affecting write calls
// invalidateDomainLevels(userId) so the next read refetches. In-flight dedup
// makes concurrent callers (home + advisor firing together) share one scan.
const CACHE_TTL_MS = 45_000;

interface CacheEntry {
  expiresAt: number;
  value: DomainBrightness;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<DomainBrightness>>();

/**
 * Cheap, cached, deduped read of the seven DOMAIN-star levels + 북극성 brightness.
 * Same signature as the underlying scan so every caller benefits transparently:
 * a hit inside the TTL returns the memoized value, concurrent misses share one
 * in-flight scan, and a stale/failed scan is never cached (retried next call).
 */
export function loadDomainLevels(userId: string): Promise<DomainBrightness> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);

  const pending = inflight.get(userId);
  if (pending) return pending;

  const promise = fetchDomainLevels(userId).then(
    (value) => {
      // Only publish/clear if this is still the current in-flight scan. An
      // invalidateDomainLevels() during the read replaces the slot, so a scan
      // that started before the write must not re-populate the cache with stale
      // data.
      if (inflight.get(userId) === promise) {
        cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
        inflight.delete(userId);
      }
      return value;
    },
    (err) => {
      if (inflight.get(userId) === promise) inflight.delete(userId);
      throw err;
    },
  );
  inflight.set(userId, promise);
  return promise;
}

/**
 * Drop cached domain levels so the next loadDomainLevels() refetches. Called
 * from the domain-affecting write paths (record save, relation/recreation/ops
 * writers) so the home constellation is not stale right after the user adds
 * data. No argument clears every user (e.g. on sign-out / test reset).
 */
export function invalidateDomainLevels(userId?: string): void {
  if (userId === undefined) {
    cache.clear();
    inflight.clear();
    return;
  }
  cache.delete(userId);
  inflight.delete(userId);
}
