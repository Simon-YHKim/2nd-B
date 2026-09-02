// Relation manage layer: the writer for relation_people (migration 0058), the
// structured backing for the 관계 (relation) domain star. Mirrors the ops
// manage-layer discipline (src/lib/finance/ledger.ts): no LLM, no external API,
// owner-only RLS does authorization, and the pure normalizer is separated from
// the Supabase calls so it is node-testable without a client.
//
// loadDomainLevels already READS this table to brighten the relation star; this
// module is the missing WRITE path so a user can actually record their people.
// Vocabulary stays lifestyle-neutral (closeness / contact cadence), never clinical.

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import { withTimeout } from "../async/with-timeout";

// Must match the CHECK constraints in db/migrations/0058_relation_people.sql.
export type RelationKind = "family" | "partner" | "friend" | "colleague" | "mentor" | "other";
export type ContactCadence = "daily" | "weekly" | "monthly" | "rarely";

const RELATION_KINDS: readonly RelationKind[] = [
  "family", "partner", "friend", "colleague", "mentor", "other",
];
const CONTACT_CADENCES: readonly ContactCadence[] = ["daily", "weekly", "monthly", "rarely"];
const PEOPLE_LIST_TIMEOUT_MS = 20_000;
const PEOPLE_SAVE_TIMEOUT_MS = 20_000;

export interface Person {
  id: string;
  user_id: string;
  display_name: string;
  relation_kind: RelationKind;
  /** 1..5 subjective closeness, or null. */
  closeness: number | null;
  contact_cadence: ContactCadence | null;
  /** YYYY-MM-DD, or null. */
  last_interaction_on: string | null;
  note: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface NewPerson {
  display_name: string;
  relation_kind?: RelationKind;
  closeness?: number | null;
  contact_cadence?: ContactCadence | null;
  last_interaction_on?: string | null;
  note?: string | null;
  tags?: string[];
}

// --- pure normalizer (node-testable, no Supabase) ----------------------

// The DB row shape produced from a NewPerson, with every field coerced to satisfy
// the 0058 CHECK constraints (kind/cadence enums, closeness 1..5). Invalid enum
// values fall back (kind → 'other', cadence → null) and out-of-range closeness is
// dropped to null rather than throwing, so a sloppy caller never trips the DB.
export interface NormalizedPerson {
  display_name: string;
  relation_kind: RelationKind;
  closeness: number | null;
  contact_cadence: ContactCadence | null;
  last_interaction_on: string | null;
  note: string | null;
  tags: string[];
}

// The UI keeps these values in refs, but the transitions stay framework-free so
// close/reopen and double-press races can be exercised deterministically in Jest.
export interface MutablePeopleSaveRef<T> {
  current: T;
}

export interface PersonSaveIdentity {
  id: string;
  rev: number;
}

export interface PersonSaveAttempt extends PersonSaveIdentity {
  gen: number;
}

export function beginPersonSaveAttempt(
  attemptGenRef: MutablePeopleSaveRef<number>,
  saveIdRef: MutablePeopleSaveRef<PersonSaveIdentity | null>,
  inFlightRef: MutablePeopleSaveRef<boolean>,
  createId: () => string,
): PersonSaveAttempt | null {
  if (inFlightRef.current) return null;
  const identity = saveIdRef.current ?? { id: createId(), rev: 0 };
  identity.rev += 1;
  saveIdRef.current = identity;
  inFlightRef.current = true;
  const gen = ++attemptGenRef.current;
  return { id: identity.id, rev: identity.rev, gen };
}

export function isCurrentPersonSaveAttempt(
  attemptGenRef: MutablePeopleSaveRef<number>,
  attempt: PersonSaveAttempt,
): boolean {
  return attemptGenRef.current === attempt.gen;
}

export function rotatePersonSaveIdentity(
  attemptGenRef: MutablePeopleSaveRef<number>,
  saveIdRef: MutablePeopleSaveRef<PersonSaveIdentity | null>,
  attempt: PersonSaveAttempt,
): boolean {
  if (!isCurrentPersonSaveAttempt(attemptGenRef, attempt)) return false;
  saveIdRef.current = null;
  return true;
}

export function releasePersonSaveAttempt(
  attemptGenRef: MutablePeopleSaveRef<number>,
  inFlightRef: MutablePeopleSaveRef<boolean>,
  attempt: PersonSaveAttempt,
): boolean {
  if (!isCurrentPersonSaveAttempt(attemptGenRef, attempt)) return false;
  inFlightRef.current = false;
  return true;
}

export function abandonPersonSaveAttempt(
  attemptGenRef: MutablePeopleSaveRef<number>,
  saveIdRef: MutablePeopleSaveRef<PersonSaveIdentity | null>,
  inFlightRef: MutablePeopleSaveRef<boolean>,
): void {
  attemptGenRef.current += 1;
  saveIdRef.current = null;
  inFlightRef.current = false;
}

export function normalizePersonInput(input: NewPerson): NormalizedPerson {
  const kind = input.relation_kind && RELATION_KINDS.includes(input.relation_kind)
    ? input.relation_kind
    : "other";
  const cadence = input.contact_cadence && CONTACT_CADENCES.includes(input.contact_cadence)
    ? input.contact_cadence
    : null;
  let closeness: number | null = null;
  if (input.closeness != null) {
    const n = Math.round(input.closeness);
    closeness = n >= 1 && n <= 5 ? n : null;
  }
  const note = input.note?.trim() ? input.note.trim() : null;
  const tags = Array.from(
    new Set((input.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0)),
  );
  return {
    display_name: input.display_name.trim(),
    relation_kind: kind,
    closeness,
    contact_cadence: cadence,
    last_interaction_on: input.last_interaction_on ?? null,
    note,
    tags,
  };
}

function rowToPerson(row: Record<string, unknown>): Person {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    display_name: String(row.display_name ?? ""),
    relation_kind: (row.relation_kind as RelationKind) ?? "other",
    closeness: row.closeness == null ? null : Number(row.closeness),
    contact_cadence: (row.contact_cadence as ContactCadence | null) ?? null,
    last_interaction_on: (row.last_interaction_on as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
  };
}

// --- Supabase-backed queries (RLS owner-only, migration 0058) ----------

/**
 * Record a person. A caller-supplied request id enables retry convergence; the
 * automatic import path omits it and keeps the original DB-generated-id insert.
 */
export async function createPerson(
  userId: string,
  input: NewPerson,
  requestId?: string,
  rev?: number,
): Promise<Person> {
  const norm = normalizePersonInput(input);
  if (!norm.display_name) throw new Error("display_name is required");
  const supabase = getSupabaseClient();
  const builder = requestId
    ? supabase
      .from("relation_people")
      .upsert(
        { id: requestId, user_id: userId, ...norm, client_revision: rev ?? 1 },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select()
    : supabase
      .from("relation_people")
      .insert({ user_id: userId, ...norm })
      .select();

  // Supabase query builders are re-executed every time their then() is observed.
  // Materialize exactly once so the late-success observer cannot duplicate POST.
  const raw = Promise.resolve(builder);
  void raw.then(({ data, error }) => {
    if (!error && Array.isArray(data) && data.length === 1) {
      invalidateDomainLevels(userId);
    }
  }).catch(() => {
    // The caller owns the error. This observer only repairs cache state when a
    // timed-out request later proves that its INSERT committed.
  });

  const { data, error } = await withTimeout(
    raw,
    PEOPLE_SAVE_TIMEOUT_MS,
    "people save",
  );
  if (error) throw error;
  const inserted = Array.isArray(data) ? data : [];
  if (inserted.length === 1) {
    return rowToPerson(inserted[0] as Record<string, unknown>);
  }
  if (!requestId) {
    throw new Error("relation_people insert returned no row");
  }

  // ignoreDuplicates returns [] when this logical request id already exists.
  // Let only a higher client revision revise the row, then read the winner.
  const revision = rev ?? 1;
  const updateRaw = Promise.resolve(
    supabase
      .from("relation_people")
      .update({ ...norm, client_revision: revision })
      .eq("user_id", userId)
      .eq("id", requestId)
      .lt("client_revision", revision)
      .select(),
  );
  void updateRaw.then(({ data, error }) => {
    if (!error && Array.isArray(data) && data.length === 1) {
      invalidateDomainLevels(userId);
    }
  }).catch(() => {
    // As above, observe a late successful PATCH without owning caller errors.
  });
  const { data: updatedData, error: updateError } = await withTimeout(
    updateRaw,
    PEOPLE_SAVE_TIMEOUT_MS,
    "people reconcile",
  );
  if (updateError) throw updateError;
  const updated = Array.isArray(updatedData) ? updatedData : [];
  if (updated.length === 1) {
    return rowToPerson(updated[0] as Record<string, unknown>);
  }

  const { data: currentData, error: currentError } = await withTimeout(
    supabase
      .from("relation_people")
      .select("*")
      .eq("user_id", userId)
      .eq("id", requestId),
    PEOPLE_SAVE_TIMEOUT_MS,
    "people final read",
  );
  if (currentError) throw currentError;
  const current = Array.isArray(currentData) ? currentData : [];
  if (current.length === 0) throw new Error("relation_people row vanished");
  return rowToPerson(current[0] as Record<string, unknown>);
}

/** All of the user's people, most-recently-interacted first (nulls last). */
export async function listPeople(userId: string): Promise<Person[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await withTimeout(
    supabase
      .from("relation_people")
      .select("*")
      .eq("user_id", userId)
      .order("last_interaction_on", { ascending: false, nullsFirst: false }),
    PEOPLE_LIST_TIMEOUT_MS,
    "people list",
  );
  if (error) throw error;
  return (data ?? []).map((r) => rowToPerson(r as Record<string, unknown>));
}

/** Patch a person; partial fields are normalized and updated_at is bumped. */
export const AUTHORITATIVE_WRITE_REVISION = 2_147_483_647;

export async function updatePerson(
  userId: string,
  id: string,
  patch: Partial<NewPerson>,
  opts?: { authoritative?: boolean },
): Promise<Person> {
  const norm = normalizePersonInput({ display_name: patch.display_name ?? "", ...patch });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.display_name != null) update.display_name = norm.display_name;
  if (patch.relation_kind != null) update.relation_kind = norm.relation_kind;
  if (patch.closeness !== undefined) update.closeness = norm.closeness;
  if (patch.contact_cadence !== undefined) update.contact_cadence = norm.contact_cadence;
  if (patch.last_interaction_on !== undefined) update.last_interaction_on = norm.last_interaction_on;
  if (patch.note !== undefined) update.note = norm.note;
  if (patch.tags !== undefined) update.tags = norm.tags;
  if (opts?.authoritative) update.client_revision = AUTHORITATIVE_WRITE_REVISION;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relation_people")
    .update(update)
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  // last_interaction_on / count changed → the relation star's recency/coverage
  // may shift, so refresh the cached home levels.
  invalidateDomainLevels(userId);
  return rowToPerson(data as Record<string, unknown>);
}

/** Delete one person (RLS guarantees it must be the owner's). */
export async function deletePerson(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("relation_people").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  invalidateDomainLevels(userId);
}
