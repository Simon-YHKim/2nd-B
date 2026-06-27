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

// Must match the CHECK constraints in db/migrations/0058_relation_people.sql.
export type RelationKind = "family" | "partner" | "friend" | "colleague" | "mentor" | "other";
export type ContactCadence = "daily" | "weekly" | "monthly" | "rarely";

const RELATION_KINDS: readonly RelationKind[] = [
  "family", "partner", "friend", "colleague", "mentor", "other",
];
const CONTACT_CADENCES: readonly ContactCadence[] = ["daily", "weekly", "monthly", "rarely"];

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

/** Record a person. Empty display_name is rejected (caller should validate UI-side). */
export async function createPerson(userId: string, input: NewPerson): Promise<Person> {
  const norm = normalizePersonInput(input);
  if (!norm.display_name) throw new Error("display_name is required");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relation_people")
    .insert({ user_id: userId, ...norm })
    .select()
    .single();
  if (error) throw error;
  return rowToPerson(data as Record<string, unknown>);
}

/** All of the user's people, most-recently-interacted first (nulls last). */
export async function listPeople(userId: string): Promise<Person[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relation_people")
    .select("*")
    .eq("user_id", userId)
    .order("last_interaction_on", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToPerson(r as Record<string, unknown>));
}

/** Patch a person; partial fields are normalized and updated_at is bumped. */
export async function updatePerson(
  userId: string,
  id: string,
  patch: Partial<NewPerson>,
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
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relation_people")
    .update(update)
    .eq("user_id", userId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToPerson(data as Record<string, unknown>);
}

/** Delete one person (RLS guarantees it must be the owner's). */
export async function deletePerson(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("relation_people").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
