// Self-understanding constellation (북두칠성) selector.
//
// The Big Dipper's seven stars each map to one stage of getting to know
// yourself inside 2nd-B. A star lights up when its stage is satisfied by REAL
// Supabase data (RLS-scoped to the signed-in user). This module owns the
// "is each stage done?" logic; rendering lives in components/premium/background.
//
// Two distinct numbers come out of here, and they mean different things:
//   • litCount  — how many stars are lit. Each star lights INDEPENDENTLY from
//     its own stage being done (per-stage gating). This is what the SVG layer
//     reads to decide which stars glow.
//   • level     — the longest UNBROKEN run of done stages from stage 1, used
//     only as "how far along the journey are you" copy. It deliberately STOPS
//     at a `gated` stage (self_context, see below) so it never advertises a
//     milestone the product can't yet deliver.
//
// Why the split: stage 3 (self_context) has no INSERT path in the app yet
// (Phase 2 skeleton). If stars used strict sequential gating, stages 4-7 could
// NEVER light because stage 3 is unreachable — so stars use per-stage done.
// `gated` stages still cap the sequential `level` and keep their star dim; we
// never fake-light a gated star.

import { getSupabaseClient } from "../supabase/client";

// A thin shape of the Supabase client surface this module uses, so the count
// helpers can be unit-tested with a lightweight mock and type-checked without
// pulling the full SupabaseClient generics. `eq()` returns a node that is BOTH
// awaitable (terminus) and chainable (further `.eq()`), mirroring PostgREST's
// builder so the consent stage can chain three filters.
export interface CountResult {
  count: number | null;
  error: unknown;
}
export interface CountFilter extends PromiseLike<CountResult> {
  eq(column: string, value: unknown): CountFilter;
}
export interface CountableClient {
  from(table: string): {
    select(columns: string, opts: { count: "exact"; head: true }): {
      eq(column: string, value: unknown): CountFilter;
    };
  };
}

export type StageKey =
  | "consent_profile"
  | "first_capture"
  | "self_context"
  | "pattern_memory"
  | "wiki_grounding"
  | "graph_linking"
  | "persona_reflection";

export interface StageSpec {
  key: StageKey;
  /** Big Dipper star this stage lights, handle → bowl order. */
  star: string;
  /** Stage has no achievement path in-app yet → star stays dim, caps `level`. */
  gated?: boolean;
  /** Count of the user's qualifying rows. ≥1 ⇒ stage done. */
  count(sb: CountableClient, uid: string): PromiseLike<number>;
}

/**
 * Run a head:true exact-count query and normalise to a plain number. Throws on
 * a Supabase error so the caller's per-stage catch can absorb it (graceful
 * dim) rather than letting one failed query blank the whole constellation.
 */
async function countRows(
  sb: CountableClient,
  table: string,
  uid: string,
  column = "user_id",
): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq("user_id", uid);
  if (error) throw error;
  return count ?? 0;
}

// Handle → bowl order, 1:1 with the SVG points. Queries mirror the agreed
// achievement definitions exactly — see the per-line notes for the schema
// gotchas that make the obvious query wrong.
export const STAGES: StageSpec[] = [
  {
    // Consent acknowledged (required + LLM-processing acks both true).
    key: "consent_profile",
    star: "Alkaid",
    count: async (sb, uid) => {
      const { count, error } = await sb
        .from("consent_records")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("required_ack", true)
        .eq("llm_processing_ack", true);
      if (error) throw error;
      return count ?? 0;
    },
  },
  {
    // First captured record of any kind.
    key: "first_capture",
    star: "Mizar",
    count: (sb, uid) => countRows(sb, "records", uid),
  },
  {
    // Self-context separation. ⚠ No INSERT path in-app yet (Phase 2 skeleton)
    // → unreachable, so this stage is gated: star stays dim and the sequential
    // `level` stops here. The query is still real (will start passing once an
    // insert path ships) but `gated` keeps us honest until then.
    key: "self_context",
    star: "Alioth",
    gated: true,
    count: (sb, uid) => countRows(sb, "self_contexts", uid),
  },
  {
    // A memorized repeating pattern. evidence_batches is NOT part of the
    // definition — count memorized_patterns directly.
    key: "pattern_memory",
    star: "Megrez",
    count: (sb, uid) => countRows(sb, "memorized_patterns", uid),
  },
  {
    // Knowledge grounded into a wiki page. ⚠ NO kind filter — wiki_pages.kind
    // is source/entity/concept, so filtering by a "self_knowledge" kind would
    // always return 0. Any wiki page for the user counts.
    key: "wiki_grounding",
    star: "Phecda",
    count: (sb, uid) => countRows(sb, "wiki_pages", uid),
  },
  {
    // Graph linking between pages. ⚠ wiki_links has NO `id` column (composite
    // PK) → count over `from_page`, not the default.
    key: "graph_linking",
    star: "Merak",
    count: (sb, uid) => countRows(sb, "wiki_links", uid, "from_page"),
  },
  {
    // 세컨비's reflection of you: a persona exists. version / xp_events are NOT
    // signals — a single persona row is enough.
    key: "persona_reflection",
    star: "Dubhe",
    count: (sb, uid) => countRows(sb, "personas", uid),
  },
];

export interface StageState {
  key: StageKey;
  star: string;
  done: boolean;
  gated: boolean;
}

export interface ConstellationState {
  /** Longest unbroken run of done stages from stage 1, stopping at the first
   *  not-done OR gated stage. Journey-progress copy only — NOT star lighting. */
  level: number;
  /** Total number of done stages = number of lit stars. */
  litCount: number;
  stages: StageState[];
}

/**
 * Resolve the constellation state for a user from live Supabase counts.
 *
 * - `uid === null` (signed out / offline) → every stage done:false, level 0.
 *   The caller renders dim outlines; we never blank or hard-fail the app.
 * - All seven counts run in PARALLEL. Each query failure is absorbed
 *   individually (logged, treated as done:false) so one flaky table can't take
 *   down the rest of the constellation.
 * - Stars light per-stage (`done`). `level` is the sequential run that halts at
 *   the first not-done OR gated stage. `litCount` is the total done count.
 */
export async function selectConstellationLevel(uid: string | null): Promise<ConstellationState> {
  if (!uid) {
    return {
      level: 0,
      litCount: 0,
      stages: STAGES.map((s) => ({
        key: s.key,
        star: s.star,
        done: false,
        gated: Boolean(s.gated),
      })),
    };
  }

  const sb = getSupabaseClient() as unknown as CountableClient;

  const dones = await Promise.all(
    STAGES.map(async (s) => {
      try {
        const n = await s.count(sb, uid);
        return n >= 1;
      } catch (e) {
        if (typeof console !== "undefined") {
          console.warn(`[constellation] count failed for stage ${s.key}`, e);
        }
        return false;
      }
    }),
  );

  const stages: StageState[] = STAGES.map((s, i) => ({
    key: s.key,
    star: s.star,
    done: dones[i],
    gated: Boolean(s.gated),
  }));

  // Sequential level: walk from stage 1, stop at the first stage that is either
  // not done OR gated. A gated stage halts the run even if its (real) query
  // happened to pass, so the journey copy never claims a milestone the product
  // can't yet deliver.
  let level = 0;
  for (const s of stages) {
    if (s.gated || !s.done) break;
    level += 1;
  }

  const litCount = stages.reduce((acc, s) => acc + (s.done ? 1 : 0), 0);

  return { level, litCount, stages };
}
