-- 0009_rls_policies.sql
-- All user-scoped tables get RLS enabled. Default policy: row owner reads/writes own.
-- revenue_events writes happen via service_role (Edge Function); end users can read
-- nothing here. knowledge_sources is shared-read for authenticated users.

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas           ENABLE ROW LEVEL SECURITY;

-- users: self-read/update
CREATE POLICY users_self_select ON users
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY users_self_update ON users
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY users_self_insert ON users
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- records: owner
CREATE POLICY records_owner_all ON records
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ai_audit_log: owner read-only; inserts via service_role from Edge Function context
CREATE POLICY audit_owner_select ON ai_audit_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- revenue_events: no end-user access
-- (intentionally no policies for authenticated; service_role bypasses RLS)

-- testimonials: owner read/write; public read only for approved_for_public rows
CREATE POLICY testimonials_owner_all ON testimonials
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY testimonials_public_select ON testimonials
  FOR SELECT TO anon USING (approved_for_public = true);

-- knowledge_sources: shared-read for authenticated; insert by authenticated; update by owner or verifier
CREATE POLICY ks_auth_select ON knowledge_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ks_auth_insert ON knowledge_sources
  FOR INSERT TO authenticated WITH CHECK (added_by = auth.uid());
CREATE POLICY ks_owner_update ON knowledge_sources
  FOR UPDATE TO authenticated
  USING (added_by = auth.uid() OR verified_by = auth.uid())
  WITH CHECK (added_by = auth.uid() OR verified_by = auth.uid());

-- personas: owner
CREATE POLICY personas_owner_all ON personas
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
