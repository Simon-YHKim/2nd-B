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
-- WHY THIS IS A LOOP AND NOT 57 LITERAL STATEMENTS: the first draft hardcoded one
-- ALTER per policy, read off the live database. The `sql` CI job, which replays
-- db/migrations into an empty Postgres, rejected it at
-- `ALTER POLICY ... ON public.persona_entity` - that table exists in production
-- but no migration ever created it (same for persona_reasoning_trace and
-- persona_relation; they were applied out of band). A hardcoded list is therefore
-- only valid against one particular database. Reading pg_policies at run time and
-- rewriting whatever is actually present is correct in both worlds, is idempotent,
-- and keeps working as policies are added later.
--
-- The persona_* drift is a real finding and is NOT fixed here: this migration must
-- not quietly invent three tables. It needs its own migration written from the
-- live definitions.

begin;

do $rewrite$
declare
  r         record;
  new_qual  text;
  new_check text;
  stmt      text;
  changed   integer := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
    order by tablename, policyname
  loop
    -- pg_policies renders an already-wrapped call as "( SELECT auth.uid() AS uid)".
    -- Park that form on a sentinel first so the bare-call replace cannot double-wrap
    -- it, then bring both forms back as the same normal form. The sentinel is not
    -- dollar-quote shaped, so it cannot terminate this block.
    new_qual := case when r.qual is null then null else
      replace(
        replace(
          replace(r.qual, '( SELECT auth.uid() AS uid)', '~~WRAPPED~~'),
          'auth.uid()', '(select auth.uid())'),
        '~~WRAPPED~~', '(select auth.uid())')
    end;

    new_check := case when r.with_check is null then null else
      replace(
        replace(
          replace(r.with_check, '( SELECT auth.uid() AS uid)', '~~WRAPPED~~'),
          'auth.uid()', '(select auth.uid())'),
        '~~WRAPPED~~', '(select auth.uid())')
    end;

    if new_qual is not distinct from r.qual
       and new_check is not distinct from r.with_check then
      continue;
    end if;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    if new_qual  is not null then stmt := stmt || ' USING ('      || new_qual  || ')'; end if;
    if new_check is not null then stmt := stmt || ' WITH CHECK (' || new_check || ')'; end if;

    execute stmt;
    changed := changed + 1;
  end loop;

  raise notice '0102: rewrote % polic%', changed, case when changed = 1 then 'y' else 'ies' end;
end
$rewrite$;

-- Post-condition. If any policy still calls auth.uid() outside a subquery the
-- migration aborts and rolls back, so a partial rewrite can never be committed.
-- Same sentinel trick: strip the wrapped form, then look for a bare call in what
-- is left.
do $check$
declare
  leftover  integer;
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
