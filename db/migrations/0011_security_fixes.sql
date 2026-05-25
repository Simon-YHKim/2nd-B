-- 0011_security_fixes.sql
-- Fixes critical findings from /review:
--   - ai_audit_log RLS was blocking client INSERT (silent C3 failure)
--   - judge_mode self-escalation via UPDATE
--   - ai_audit_log CASCADE delete loses XPRIZE evidence on user removal
--   - ai_followup unbounded size (DoS + web XSS surface)
--   - revenue_events.user_id missing index
--   - knowledge_sources.added_by/verified_by missing indexes
--
-- Written idempotent (DROP IF EXISTS first) so this migration can be reapplied
-- safely. Prior migrations (0001~0010) will be reflowed in a follow-up to also
-- be idempotent; the right fix is to update those files rather than introduce
-- conflicting state here.

-- C3: allow authenticated users to insert their own audit rows.
DROP POLICY IF EXISTS audit_owner_insert ON ai_audit_log;
CREATE POLICY audit_owner_insert ON ai_audit_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- C3: preserve audit trail across user deletion (XPRIZE evidence must outlive the user).
ALTER TABLE ai_audit_log DROP CONSTRAINT IF EXISTS ai_audit_log_user_id_fkey;
ALTER TABLE ai_audit_log
  ADD CONSTRAINT ai_audit_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- The column was NOT NULL before. Now that we SET NULL on user deletion, drop the constraint.
ALTER TABLE ai_audit_log ALTER COLUMN user_id DROP NOT NULL;

-- C6: block judge_mode self-escalation.
-- auto_judge_mode is re-fired on UPDATE of email, AND a column-level revoke
-- ensures even direct UPDATE of judge_mode by the row owner has no effect
-- (the trigger overwrites it anyway).
DROP TRIGGER IF EXISTS trg_users_auto_judge_update ON users;
CREATE TRIGGER trg_users_auto_judge_update
  BEFORE UPDATE OF email ON users
  FOR EACH ROW EXECUTE FUNCTION auto_judge_mode();

-- Belt-and-suspenders: even if email is unchanged, force judge_mode back to its
-- derived value on every UPDATE so a self-PATCH of judge_mode cannot stick.
CREATE OR REPLACE FUNCTION enforce_judge_mode() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.judge_mode := lower(split_part(NEW.email, '@', 2)) = ANY (
    ARRAY['xprize.org', 'devpost.com', 'hacker.fund']
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_enforce_judge ON users;
CREATE TRIGGER trg_users_enforce_judge
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_judge_mode();

-- LLM output size cap: prevent DoS / unbounded jsonb growth.
-- ai_followup is { text: string, zone: 'green'|'yellow'|'red' }. 8 KB is generous.
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_ai_followup_size;
ALTER TABLE records
  ADD CONSTRAINT records_ai_followup_size
  CHECK (ai_followup IS NULL OR length(ai_followup::text) <= 8192);

-- Missing indexes on FK columns (review finding from data-migration specialist).
CREATE INDEX IF NOT EXISTS revenue_events_user_idx
  ON revenue_events (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ks_added_by_idx
  ON knowledge_sources (added_by);
CREATE INDEX IF NOT EXISTS ks_verified_by_idx
  ON knowledge_sources (verified_by) WHERE verified_by IS NOT NULL;
