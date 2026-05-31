// Data-access layer for clipper_templates (migration 0027) — the user-created
// and community-shared clipper formats.
//
// The canonical 8 formats live bundled in clipper-templates.ts (offline-safe);
// this table holds the EXTRA formats a user's AI proposes for novel material and
// optionally shares to the whole community. RLS does the authorization: a SELECT
// returns the caller's own rows plus any `is_shared` row; writes are owner-only.
//
// Mapping is defensive — jsonb columns (name / what / ai_properties) can hold
// anything, so every read is normalized into the same shape the bundled
// templates use, keeping the rest of the app oblivious to the storage origin.

import { getSupabaseClient } from "../supabase/client";
import { TARGET_CATEGORIES, type ClipperAiProperty, type TargetCategory } from "./clipper-templates";
import { SOURCE_KINDS, type SourceKind } from "./types";

/** A custom clipper format stored in (and read back from) clipper_templates. */
export interface CustomClipperTemplate {
  id: string;
  ownerId: string;
  slug: string;
  baseKind: SourceKind;
  name: { en: string; ko: string };
  what: { en: string; ko: string };
  triggers: string[];
  defaultTags: string[];
  targetCategory: TargetCategory | "";
  wikiTarget: string;
  aiProperties: ClipperAiProperty[];
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Raw row shape (snake_case) as PostgREST returns it. */
interface TemplateRow {
  id: string;
  owner_id: string;
  slug: string;
  base_kind: string;
  name: unknown;
  what: unknown;
  triggers: unknown;
  default_tags: unknown;
  target_category: string;
  wiki_target: string;
  ai_properties: unknown;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

function asLocalePair(v: unknown): { en: string; ko: string } {
  const o = (v ?? {}) as Record<string, unknown>;
  return { en: typeof o.en === "string" ? o.en : "", ko: typeof o.ko === "string" ? o.ko : "" };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asAiProps(v: unknown): ClipperAiProperty[] {
  if (!Array.isArray(v)) return [];
  const out: ClipperAiProperty[] = [];
  for (const raw of v) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.name !== "string" || o.name.length === 0) continue;
    const type = o.type === "multitext" || o.type === "number" ? o.type : "text";
    out.push({ name: o.name, type, describe: asLocalePair(o.describe) });
  }
  return out;
}

/** Normalize a DB row into the same shape the bundled templates use. Pure. */
export function mapTemplateRow(row: TemplateRow): CustomClipperTemplate {
  const baseKind: SourceKind = SOURCE_KINDS.includes(row.base_kind as SourceKind)
    ? (row.base_kind as SourceKind)
    : "inbox";
  const targetCategory: TargetCategory | "" = TARGET_CATEGORIES.includes(row.target_category as TargetCategory)
    ? (row.target_category as TargetCategory)
    : "";
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    baseKind,
    name: asLocalePair(row.name),
    what: asLocalePair(row.what),
    triggers: asStringArray(row.triggers),
    defaultTags: asStringArray(row.default_tags),
    targetCategory,
    wikiTarget: typeof row.wiki_target === "string" ? row.wiki_target : "",
    aiProperties: asAiProps(row.ai_properties),
    isShared: row.is_shared === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * All formats the user can see: their own + every shared community format
 * (RLS enforces exactly that). Own formats are returned first.
 */
export async function listAccessibleTemplates(userId: string): Promise<CustomClipperTemplate[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("clipper_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const mapped = ((data ?? []) as TemplateRow[]).map(mapTemplateRow);
  return mapped.sort((a, b) => Number(b.ownerId === userId) - Number(a.ownerId === userId));
}

export interface SaveTemplateInput {
  ownerId: string;
  slug: string;
  baseKind: SourceKind;
  name: { en: string; ko: string };
  what: { en: string; ko: string };
  triggers?: string[];
  defaultTags?: string[];
  targetCategory?: TargetCategory | "";
  wikiTarget?: string;
  aiProperties?: ClipperAiProperty[];
  /** Opt-in publish to the community (default private). */
  shared?: boolean;
}

/** Insert or update one of the caller's own formats (upsert on owner+slug). */
export async function saveTemplate(input: SaveTemplateInput): Promise<CustomClipperTemplate> {
  const supabase = getSupabaseClient();
  const payload = {
    owner_id: input.ownerId,
    slug: input.slug,
    base_kind: input.baseKind,
    name: input.name,
    what: input.what,
    triggers: input.triggers ?? [],
    default_tags: input.defaultTags ?? [],
    target_category: input.targetCategory ?? "",
    wiki_target: input.wikiTarget ?? "",
    ai_properties: input.aiProperties ?? [],
    is_shared: input.shared ?? false,
  };
  const { data, error } = await supabase
    .from("clipper_templates")
    .upsert(payload, { onConflict: "owner_id,slug" })
    .select()
    .single();
  if (error) throw error;
  return mapTemplateRow(data as TemplateRow);
}

/** Flip the community-share flag on one of the caller's own formats. */
export async function setTemplateShared(userId: string, id: string, shared: boolean): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("clipper_templates")
    .update({ is_shared: shared })
    .eq("owner_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("clipper_templates")
    .delete()
    .eq("owner_id", userId)
    .eq("id", id);
  if (error) throw error;
}
