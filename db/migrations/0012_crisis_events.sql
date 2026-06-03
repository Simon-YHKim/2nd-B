-- 0012_crisis_events.sql
-- Per docs/handoff/build-rag-wiki.md §6.6 and docs/research/batches/crisis-detection.md
-- §"Logging policy".
--
-- RED-zone crisis events are logged here, separately from ai_audit_log, with
-- minimal categorical info only (never raw user text). RLS allows NO access
-- to authenticated or anon — service-role insert only (via Edge Function in
-- production; via supabase MCP in development).

CREATE TABLE IF NOT EXISTS crisis_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_hash             text,                                              -- non-cryptographic djb2 hash of users.id (obfuscation only, NOT anonymization: 32-bit, collision-prone, re-identifiable); never the raw id. Upgrade to salted SHA-256 if it must resist re-identification.
  occurred_at              timestamptz NOT NULL DEFAULT now(),
  zone                     text NOT NULL CHECK (zone = 'red'),
  classifier_confidence    numeric(4,3) CHECK (classifier_confidence >= 0 AND classifier_confidence <= 1),
  trigger_categories       text[] NOT NULL DEFAULT '{}',                     -- categorical only
  cssrs_level              integer CHECK (cssrs_level BETWEEN 1 AND 6),
  routing_template_version text NOT NULL,                                     -- e.g. 'red-ko-v1'
  locale                   text NOT NULL CHECK (locale IN ('ko', 'en')),
  resolved                 boolean NOT NULL DEFAULT false,
  notes                    text,                                              -- staff annotation only, never user content
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crisis_events_occurred_at_idx
  ON crisis_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS crisis_events_resolved_idx
  ON crisis_events (resolved) WHERE resolved = false;

ALTER TABLE crisis_events ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies for authenticated or anon. Service role bypasses RLS.
-- Documented in docs/research/batches/crisis-detection.md §"Logging policy".
