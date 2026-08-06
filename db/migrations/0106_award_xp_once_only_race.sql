-- 0106_award_xp_once_only_race.sql
-- Close the once_only race in award_xp (idempotency audit, 2026-08-07).
--
-- THE RACE: for a rule with once_only = true, the function guarded with
-- `IF EXISTS (select 1 from xp_events ...)` and then inserted. Two concurrent
-- calls (double-tap, retried request) can both pass the EXISTS check before
-- either inserts — the action awards twice. xp_events has no unique
-- constraint that could catch this, and adding UNIQUE (user_id, action)
-- outright would break repeatable actions, which insert many rows by design.
--
-- THE FIX: a per-(user, action) transaction-scoped advisory lock taken only
-- on the once_only path. The second concurrent call blocks until the first
-- commits, then its EXISTS check sees the row and returns duplicate:true.
-- Zero schema change, zero effect on repeatable actions.
--
-- Everything else is byte-identical to the previous definition (0101 lineage).

create or replace function public.award_xp(p_action text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_rule  public.xp_rules%ROWTYPE;
  v_total int;
  v_level int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'award_xp: not authenticated';
  END IF;
  SELECT * INTO v_rule FROM public.xp_rules WHERE action = p_action;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_xp: unknown action %', p_action;
  END IF;
  IF v_rule.once_only THEN
    -- Serialize concurrent awards of the same once-only action for the same
    -- user. hashtextextended gives a stable 64-bit key; the lock releases on
    -- commit/rollback automatically.
    PERFORM pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_uid::text || ':' || p_action, 0));
    IF EXISTS (
      SELECT 1 FROM public.xp_events WHERE user_id = v_uid AND action = p_action
    ) THEN
      SELECT total_xp INTO v_total FROM public.users WHERE id = v_uid;
      RETURN jsonb_build_object('awarded', 0, 'total_xp', v_total,
        'level', public.level_for_xp(v_total), 'duplicate', true);
    END IF;
  END IF;
  PERFORM set_config('app.allow_xp_write', '1', true);
  UPDATE public.users SET total_xp = total_xp + v_rule.xp_value
    WHERE id = v_uid RETURNING total_xp INTO v_total;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'award_xp: no users row for %', v_uid;
  END IF;
  v_level := public.level_for_xp(v_total);
  INSERT INTO public.xp_events (user_id, action, xp_delta, total_after, level_after)
    VALUES (v_uid, p_action, v_rule.xp_value, v_total, v_level);
  RETURN jsonb_build_object('awarded', v_rule.xp_value, 'total_xp', v_total,
    'level', v_level, 'duplicate', false);
END;
$function$;
