-- 0102_rls_wrap_auth_uid.sql
-- Wrap auth.uid() in a scalar subquery across every RLS policy that calls it.
--
-- Supabase's performance advisor (auth_rls_initplan) flags a policy whose USING /
-- WITH CHECK expression calls auth.uid() directly: Postgres re-evaluates the
-- function once PER ROW instead of once per statement. Written as
-- (select auth.uid()) the planner hoists it into an InitPlan and evaluates it
-- exactly once, so a scan over N rows makes 1 call instead of N.
--
-- WHY NOW, when the tables are nearly empty and the cost is currently zero: this
-- is a mechanical rewrite that touches every access-control policy in the schema.
-- Doing it at 14 users, before any traffic, means a mistake is cheap to spot and
-- cheap to undo. The same edit under load is a much worse night.
--
-- SEMANTICS ARE UNCHANGED. auth.uid() is STABLE and takes no arguments, so its
-- value is fixed for the duration of a statement either way. The subquery changes
-- when it is computed, never what it returns. No policy gains or loses a row.
--
-- ALTER POLICY (not DROP + CREATE) is used deliberately: it rewrites only the
-- expressions and leaves the command, the role list, and PERMISSIVE/RESTRICTIVE
-- exactly as they were. There is no window in which a table sits unprotected.
--
-- Generated from pg_policies on 2026-08-03, then reviewed statement by statement.
-- Policies already written as ( SELECT auth.uid() AS uid ) are included so every
-- policy ends up in one normal form; for those the change is textual only.
--
-- 57 policies across 44 tables. Verified idempotent: re-running is a no-op.

begin;

ALTER POLICY audit_owner_select ON public.ai_audit_log USING ((user_id = (select auth.uid())));
ALTER POLICY chat_usage_owner_select ON public.chat_usage USING ((user_id = (select auth.uid())));
ALTER POLICY clipper_templates_delete ON public.clipper_templates USING ((owner_id = (select auth.uid())));
ALTER POLICY clipper_templates_insert ON public.clipper_templates WITH CHECK ((owner_id = (select auth.uid())));
ALTER POLICY clipper_templates_read ON public.clipper_templates USING (((owner_id = (select auth.uid())) OR ((is_shared = true) AND (NOT (EXISTS ( SELECT 1
   FROM template_blocks b
  WHERE ((b.blocker_id = (select auth.uid())) AND (b.blocked_owner_id = clipper_templates.owner_id))))) AND (NOT (EXISTS ( SELECT 1
   FROM content_reports r
  WHERE ((r.template_id = clipper_templates.id) AND (r.reporter_id = (select auth.uid())))))) AND (NOT (EXISTS ( SELECT 1
   FROM clipper_template_moderation m
  WHERE ((m.template_id = clipper_templates.id) AND (m.hidden_at IS NOT NULL))))))));
ALTER POLICY clipper_templates_update ON public.clipper_templates USING ((owner_id = (select auth.uid()))) WITH CHECK ((owner_id = (select auth.uid())));
ALTER POLICY consent_changes_insert_own ON public.consent_changes WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY consent_changes_select_own ON public.consent_changes USING ((user_id = (select auth.uid())));
ALTER POLICY consent_records_insert_own ON public.consent_records WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY consent_records_select_own ON public.consent_records USING ((user_id = (select auth.uid())));
ALTER POLICY content_reports_reporter_insert ON public.content_reports WITH CHECK ((reporter_id = (select auth.uid())));
ALTER POLICY content_reports_reporter_select ON public.content_reports USING ((reporter_id = (select auth.uid())));
ALTER POLICY esm_owner_all ON public.esm_responses USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY gemini_spend_owner_select ON public.gemini_spend_daily USING ((user_id = (select auth.uid())));
ALTER POLICY health_samples_owner_all ON public.health_samples USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ingest_log_insert_own ON public.ingest_log WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ingest_log_select_own ON public.ingest_log USING ((user_id = (select auth.uid())));
ALTER POLICY ks_auth_insert ON public.knowledge_sources WITH CHECK ((added_by = (select auth.uid())));
ALTER POLICY ks_auth_select ON public.knowledge_sources USING (((added_by IS NULL) OR (added_by = (select auth.uid())) OR (verified_at IS NOT NULL)));
ALTER POLICY ks_owner_update ON public.knowledge_sources USING (((added_by = (select auth.uid())) OR (verified_by = (select auth.uid())))) WITH CHECK (((added_by = (select auth.uid())) OR (verified_by = (select auth.uid()))));
ALTER POLICY memorized_patterns_insert_own ON public.memorized_patterns WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY memorized_patterns_select_own ON public.memorized_patterns USING ((user_id = (select auth.uid())));
ALTER POLICY ops_daily_brief_owner_all ON public.ops_daily_brief USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ops_ledger_owner_all ON public.ops_ledger USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ops_meal_plan_owner_all ON public.ops_meal_plan USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ops_milestones_owner_all ON public.ops_milestones USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ops_reading_owner_all ON public.ops_reading USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ops_routine_logs_owner_all ON public.ops_routine_logs USING ((user_id = (select auth.uid()))) WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM ops_routines r
  WHERE ((r.id = ops_routine_logs.routine_id) AND (r.user_id = (select auth.uid()))))) AND ((source_sample_id IS NULL) OR (EXISTS ( SELECT 1
   FROM health_samples s
  WHERE ((s.id = ops_routine_logs.source_sample_id) AND (s.user_id = (select auth.uid()))))))));
ALTER POLICY ops_routines_owner_all ON public.ops_routines USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY peer_invitations_insert_own ON public.peer_invitations WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY peer_invitations_select_own ON public.peer_invitations USING ((user_id = (select auth.uid())));
ALTER POLICY peer_invitations_update_own ON public.peer_invitations USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY persona_entity_owner ON public.persona_entity USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY persona_trace_owner ON public.persona_reasoning_trace USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY persona_relation_owner ON public.persona_relation USING (((select auth.uid()) = user_id)) WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY personas_owner_all ON public.personas USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY reasoning_run_proposals_owner_select ON public.reasoning_run_proposals USING ((EXISTS ( SELECT 1
   FROM reasoning_runs r
  WHERE ((r.id = reasoning_run_proposals.run_id) AND (r.user_id = (select auth.uid()))))));
ALTER POLICY reasoning_runs_owner_select ON public.reasoning_runs USING ((user_id = (select auth.uid())));
ALTER POLICY records_owner_all ON public.records USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY recreation_items_owner_all ON public.recreation_items USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY relation_people_owner_all ON public.relation_people USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY self_contexts_owner_all ON public.self_contexts USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY sources_owner_all ON public.sources USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY srs_cards_owner_all ON public.srs_cards USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY srs_reviews_owner_all ON public.srs_reviews USING ((user_id = (select auth.uid()))) WITH CHECK (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM srs_cards c
  WHERE ((c.id = srs_reviews.card_id) AND (c.user_id = (select auth.uid())))))));
ALTER POLICY star_tier_history_owner_all ON public.star_tier_history USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY template_blocks_owner_delete ON public.template_blocks USING ((blocker_id = (select auth.uid())));
ALTER POLICY template_blocks_owner_insert ON public.template_blocks WITH CHECK ((blocker_id = (select auth.uid())));
ALTER POLICY template_blocks_owner_select ON public.template_blocks USING ((blocker_id = (select auth.uid())));
ALTER POLICY testimonials_owner_all ON public.testimonials USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY usage_counters_owner_select ON public.usage_counters USING ((user_id = (select auth.uid())));
ALTER POLICY users_self_insert ON public.users WITH CHECK ((id = (select auth.uid())));
ALTER POLICY users_self_select ON public.users USING ((id = (select auth.uid())));
ALTER POLICY users_self_update ON public.users USING ((id = (select auth.uid()))) WITH CHECK ((id = (select auth.uid())));
ALTER POLICY wiki_links_owner_all ON public.wiki_links USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY wiki_pages_owner_all ON public.wiki_pages USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY xp_events_owner_select ON public.xp_events USING ((user_id = (select auth.uid())));

-- Post-condition. If any policy still calls auth.uid() outside a subquery the
-- migration aborts and rolls back, so a partial rewrite can never be committed.
-- pg_policies renders the wrapped form as "( SELECT auth.uid() AS uid)", so the
-- check strips that first and then looks for a bare call in what is left.
do $check$
declare
  leftover integer;
  offenders text;
begin
  select count(*), coalesce(string_agg(tablename || '.' || policyname, ', '), '')
    into leftover, offenders
  from pg_policies
  where schemaname = 'public'
    and replace(
          coalesce(qual, '') || ' ' || coalesce(with_check, ''),
          '( SELECT auth.uid() AS uid)', ''
        ) ~ 'auth\.uid\(\)';

  if leftover > 0 then
    raise exception
      '0102: % policy expression(s) still call auth.uid() per row: %',
      leftover, offenders;
  end if;
end
$check$;

commit;
