-- 0113_notices.sql
-- In-app notices: operator-published announcements plus a per-user read ledger.
--
-- Why this exists: until now the only notice source in the app was the
-- PRODUCT_NOTICES array literal in src/app/notices.tsx, which ships inside the
-- binary. Anything an operator wants to say after a release (an incident, a
-- maintenance window, a policy change) therefore required a store submission.
-- This table makes a notice publishable with one INSERT; the runbook is
-- docs/OPERATIONS-NOTICES.md.
--
-- Shape notes (why it looks like this and not like the obvious version):
--   * kind is a two-value enum, not free text, because it drives behaviour and
--     not just a label: 'major' is allowed to interrupt the user with a popup on
--     home entry, 'minor' is inbox-only and never interrupts. A typo in a free
--     text column would silently downgrade an incident notice to invisible.
--   * Bodies are stored per language (ko/en) rather than as a jsonb bag keyed by
--     locale. C7 makes EN and KO both mandatory, so NOT NULL columns state that
--     invariant in the schema instead of leaving it to the operator to remember.
--     The other three shipped locales (es/id/pt) fall back to EN, same as the
--     bundled notices already do.
--   * min_app_version is a client-side gate, deliberately. The server cannot
--     know which build is asking (PostgREST sees an anon-key JWT, not a version),
--     so the column is advisory data the client filters on. It exists so that a
--     notice about a feature that only exists in 1.5.0 does not confuse someone
--     still on 1.4.0. Making it a hard gate would require a version claim in the
--     JWT, which this project does not mint.
--   * There is no UPDATE or DELETE grant for authenticated on user_notice_reads.
--     A read is a fact, not a document (same reasoning as 0097's content_reports).
--     Append-only also means the client can INSERT and swallow the unique
--     violation instead of needing an UPDATE grant for an upsert.
--   * No SECURITY DEFINER function is introduced here on purpose. The read
--     ledger is writable directly by its owner under RLS, so there is nothing
--     that needs to run with elevated rights.
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- Enum
--   CREATE TYPE has no IF NOT EXISTS, so guard it. Mirrored by NOTICE_KINDS in
--   src/lib/notices/types.ts and cross-checked by
--   src/lib/notices/__tests__/notices-migration.test.ts.
----------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE notice_kind AS ENUM ('major', 'minor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

----------------------------------------------------------------------
-- Tables
----------------------------------------------------------------------

-- The announcements themselves. Written only by service_role (SQL editor or an
-- Edge Function); every authenticated user reads the published ones.
CREATE TABLE IF NOT EXISTS notices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             notice_kind NOT NULL,
  title_ko         text NOT NULL CHECK (length(btrim(title_ko)) > 0),
  title_en         text NOT NULL CHECK (length(btrim(title_en)) > 0),
  -- Markdown. The client renders a deliberately small subset: blank-line
  -- separated paragraphs plus "- " bullet lines. See noticeBodyToBlocks() in
  -- src/lib/notices/markdown.ts.
  body_ko          text NOT NULL CHECK (length(btrim(body_ko)) > 0),
  body_en          text NOT NULL CHECK (length(btrim(body_en)) > 0),
  -- Future-dated rows are invisible until the timestamp passes, which is how a
  -- maintenance notice gets queued ahead of time.
  published_at     timestamptz NOT NULL DEFAULT now(),
  -- NULL = show to every build. Otherwise "major.minor.patch"; the CHECK keeps a
  -- typo from producing a gate the client silently fails open on.
  min_app_version  text CHECK (min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- The list screen and the popup both order by published_at DESC and filter on
-- published_at <= now(), which is exactly this index.
CREATE INDEX IF NOT EXISTS notices_published_at_idx
  ON notices (published_at DESC);

-- One row per (user, notice). Insert only; see the header note.
CREATE TABLE IF NOT EXISTS user_notice_reads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notice_id  uuid NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notice_reads_pair_unique UNIQUE (user_id, notice_id)
);

-- user_id is covered by the leading column of user_notice_reads_pair_unique;
-- notice_id is an unindexed FK without this (0083 / 0105).
CREATE INDEX IF NOT EXISTS user_notice_reads_notice_idx
  ON user_notice_reads (notice_id);

----------------------------------------------------------------------
-- Grants
--   0092 / 0097 pattern: strip everything, then hand back the exact verbs each
--   role needs. anon is named explicitly because Supabase default privileges
--   auto-GRANT to it on every new table, and the app ships a public anon key.
----------------------------------------------------------------------

REVOKE ALL ON TABLE public.notices FROM anon, authenticated;
GRANT SELECT ON TABLE public.notices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notices TO service_role;

REVOKE ALL ON TABLE public.user_notice_reads FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.user_notice_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_notice_reads TO service_role;

----------------------------------------------------------------------
-- Row-Level Security
----------------------------------------------------------------------

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Published rows are readable by every signed-in user. There is intentionally
-- no INSERT / UPDATE / DELETE policy: with RLS on and no write policy, writes
-- from authenticated are rejected regardless of grants, and service_role
-- bypasses RLS entirely. anon has no policy at all and no grant.
DROP POLICY IF EXISTS notices_published_select ON notices;
CREATE POLICY notices_published_select ON notices
  FOR SELECT TO authenticated
  USING (published_at <= now());

ALTER TABLE user_notice_reads ENABLE ROW LEVEL SECURITY;

-- 0061 / 0102 initplan rule: (select auth.uid()), never bare auth.uid().
DROP POLICY IF EXISTS user_notice_reads_self_select ON user_notice_reads;
CREATE POLICY user_notice_reads_self_select ON user_notice_reads
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- WITH CHECK pins the row to the caller, so a user cannot record a read on
-- behalf of somebody else. Combined with the missing UPDATE / DELETE policies
-- and the missing grants, a read row is write-once by its owner.
DROP POLICY IF EXISTS user_notice_reads_self_insert ON user_notice_reads;
CREATE POLICY user_notice_reads_self_insert ON user_notice_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
