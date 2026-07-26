-- 0097_ugc_block_report.sql
-- Play UGC policy (2026-07-26 decision, option C): report + block for the one
-- public user-to-user surface in the app.
--
-- That surface is the community clipper format list: 0027 clipper_templates
-- with is_shared = true publishes a format's name / description / property
-- schema to EVERY authenticated user, and its read policy was
-- `USING (owner_id = auth.uid() OR is_shared = true)` with nothing in between.
-- Google Play requires an in-app way to report content and to block its author
-- wherever public UGC is shown, so this adds both plus a report-count auto-hide.
--
-- Shape notes (why it looks like this and not like the obvious version):
--   * Enforcement lives in the clipper_templates READ POLICY, not in the client.
--     listAccessibleTemplates() has no owner filter at all and leans entirely on
--     RLS, and the app ships a public anon key, so a filter applied only in the
--     UI would be one devtools call away from nothing. The client filter that
--     accompanies this migration is optimistic UX, not the gate.
--   * Report reasons are a fixed CHECK list, never free text. 0064 decision #6
--     already ruled out free text from one user about another precisely because
--     it manufactures a moderation surface (and third-party PII under PIPA).
--     The list is mirrored in src/lib/wiki/moderation.ts.
--   * The report tally lives in its own table rather than as a counter column on
--     clipper_templates. 0027 declares no table grants and relies on RLS alone,
--     so authenticated holds table-wide DML there and a counter column would be
--     author-writable (the exact self-grant hole 0043 had to close twice).
--     clipper_template_moderation grants SELECT only and is written solely by
--     the SECURITY DEFINER trigger below.
--   * 0027 is left untouched on purpose: its structure is pinned verbatim by
--     src/lib/wiki/__tests__/clipper-templates-migration.test.ts. The read
--     policy is DROP/CREATEd here instead, and while recreating it we adopt the
--     0061 initplan rule ((select auth.uid()) rather than bare auth.uid()).
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- Tables
----------------------------------------------------------------------

-- Who I have blocked. One row per (me, author). Insert + delete only: a block
-- is a fact, not a document, so there is nothing to update.
CREATE TABLE IF NOT EXISTS template_blocks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_owner_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_blocks_pair_unique UNIQUE (blocker_id, blocked_owner_id),
  CONSTRAINT template_blocks_not_self CHECK (blocker_id <> blocked_owner_id)
);

-- blocker_id is covered by the leading column of template_blocks_pair_unique;
-- blocked_owner_id is an unindexed FK without this (0083).
CREATE INDEX IF NOT EXISTS template_blocks_blocked_owner_idx
  ON template_blocks (blocked_owner_id);

-- One report per (format, reporter). Reason is a closed list; there is no free
-- text column anywhere in this migration by design.
CREATE TABLE IF NOT EXISTS content_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES clipper_templates(id) ON DELETE CASCADE,
  reporter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       text NOT NULL
    CHECK (reason IN ('spam', 'off_topic', 'offensive', 'impersonation', 'other')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_one_per_reporter UNIQUE (template_id, reporter_id)
);

-- template_id is covered by the leading column of content_reports_one_per_reporter;
-- reporter_id is an unindexed FK without this (0083).
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx
  ON content_reports (reporter_id);

-- The tally. Written ONLY by bump_clipper_template_reports() below; readable by
-- everyone because the read policy on clipper_templates has to consult it.
-- It holds counts, never reporter identity.
CREATE TABLE IF NOT EXISTS clipper_template_moderation (
  template_id   uuid PRIMARY KEY REFERENCES clipper_templates(id) ON DELETE CASCADE,
  report_count  integer NOT NULL DEFAULT 0,
  hidden_at     timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clipper_template_moderation_hidden_idx
  ON clipper_template_moderation (template_id) WHERE hidden_at IS NOT NULL;

----------------------------------------------------------------------
-- Auto-hide trigger
--   Threshold 3 is mirrored by COMMUNITY_REPORT_HIDE_THRESHOLD in
--   src/lib/wiki/moderation.ts and cross-checked by
--   src/lib/wiki/__tests__/ugc-block-report-migration.test.ts.
--   SECURITY DEFINER because the caller is a plain authenticated user who must
--   NOT be able to write the tally directly.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bump_clipper_template_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.clipper_template_moderation AS m (template_id, report_count, updated_at)
  VALUES (NEW.template_id, 1, now())
  ON CONFLICT (template_id) DO UPDATE
    SET report_count = m.report_count + 1,
        updated_at   = now()
  RETURNING m.report_count INTO v_count;

  IF v_count >= 3 THEN
    UPDATE public.clipper_template_moderation
       SET hidden_at  = COALESCE(hidden_at, now()),
           updated_at = now()
     WHERE template_id = NEW.template_id;
  END IF;

  RETURN NEW;
END;
$$;

-- House rule (0039 / 0095): REVOKE FROM PUBLIC alone is insufficient because
-- Supabase default privileges auto-GRANT EXECUTE to anon + authenticated on
-- every new function. Nobody calls this directly - it fires from the trigger.
REVOKE EXECUTE ON FUNCTION public.bump_clipper_template_reports() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_clipper_template_reports() FROM anon;
REVOKE EXECUTE ON FUNCTION public.bump_clipper_template_reports() FROM authenticated;

DROP TRIGGER IF EXISTS trg_content_reports_bump_count ON content_reports;
CREATE TRIGGER trg_content_reports_bump_count
  AFTER INSERT ON content_reports
  FOR EACH ROW EXECUTE FUNCTION public.bump_clipper_template_reports();

----------------------------------------------------------------------
-- Grants
--   0092_runtime_flags pattern: strip everything, then hand back the exact verbs
--   each role needs. content_reports is append-only for clients (no UPDATE, no
--   DELETE) so a reporter cannot walk back a report to unhide content, and
--   clipper_template_moderation is read-only for clients.
----------------------------------------------------------------------

REVOKE ALL ON TABLE public.template_blocks FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.template_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.template_blocks TO service_role;

REVOKE ALL ON TABLE public.content_reports FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.content_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_reports TO service_role;

REVOKE ALL ON TABLE public.clipper_template_moderation FROM anon, authenticated;
GRANT SELECT ON TABLE public.clipper_template_moderation TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clipper_template_moderation TO service_role;

----------------------------------------------------------------------
-- Row-Level Security
----------------------------------------------------------------------

ALTER TABLE template_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_blocks_owner_select ON template_blocks;
CREATE POLICY template_blocks_owner_select ON template_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS template_blocks_owner_insert ON template_blocks;
CREATE POLICY template_blocks_owner_insert ON template_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS template_blocks_owner_delete ON template_blocks;
CREATE POLICY template_blocks_owner_delete ON template_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = (select auth.uid()));

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_reports_reporter_select ON content_reports;
CREATE POLICY content_reports_reporter_select ON content_reports
  FOR SELECT TO authenticated
  USING (reporter_id = (select auth.uid()));

DROP POLICY IF EXISTS content_reports_reporter_insert ON content_reports;
CREATE POLICY content_reports_reporter_insert ON content_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (select auth.uid()));

ALTER TABLE clipper_template_moderation ENABLE ROW LEVEL SECURITY;

-- Counts only, no reporter identity, and the clipper_templates read policy has
-- to be able to consult it as the querying user.
DROP POLICY IF EXISTS clipper_template_moderation_read ON clipper_template_moderation;
CREATE POLICY clipper_template_moderation_read ON clipper_template_moderation
  FOR SELECT TO authenticated
  USING (true);

----------------------------------------------------------------------
-- The gate: replace 0027's clipper_templates read policy
--
--   own rows                       -> always visible (an author must still be
--                                     able to edit / unshare / delete a format
--                                     that has been reported)
--   shared rows                    -> visible unless I blocked the author,
--                                     unless I reported the format myself, or
--                                     unless it crossed the report threshold
--
-- Each subquery is filtered on (select auth.uid()) so it stays inside the
-- referenced table's own RLS - policy expressions run as the querying user, so
-- content_reports_reporter_select / template_blocks_owner_select still apply.
----------------------------------------------------------------------

DROP POLICY IF EXISTS clipper_templates_read ON clipper_templates;
CREATE POLICY clipper_templates_read ON clipper_templates
  FOR SELECT TO authenticated
  USING (
    owner_id = (select auth.uid())
    OR (
      is_shared = true
      AND NOT EXISTS (
        SELECT 1 FROM public.template_blocks b
         WHERE b.blocker_id = (select auth.uid())
           AND b.blocked_owner_id = clipper_templates.owner_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.content_reports r
         WHERE r.template_id = clipper_templates.id
           AND r.reporter_id = (select auth.uid())
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.clipper_template_moderation m
         WHERE m.template_id = clipper_templates.id
           AND m.hidden_at IS NOT NULL
      )
    )
  );
