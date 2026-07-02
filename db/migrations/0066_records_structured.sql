-- 0066: structured form payloads on records (Simon-ratified 2026-07-03).
-- Form-shaped captures (4W1H, career 3C4P Drill Down, future templates) keep a
-- human-readable flattened body AND a machine-readable JSON payload, so the
-- system and the AI can consume the structure instead of re-parsing prose.
--
-- Additive + nullable: existing rows and every current insert path are
-- untouched. RLS on records applies to the new column automatically (row
-- policies are column-agnostic). Shape is owned by src/lib/capture/structured.ts:
--   { "form": "fourw" | "career_3c4p", "version": 1, "fields": { key: value } }

alter table public.records
  add column if not exists structured jsonb;

comment on column public.records.structured is
  'Optional machine-readable form payload ({form, version, fields}); the flattened human text stays in body. Shape: src/lib/capture/structured.ts';
