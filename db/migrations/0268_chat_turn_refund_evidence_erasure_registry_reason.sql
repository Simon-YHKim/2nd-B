-- 0268_chat_turn_refund_evidence_erasure_registry_reason.sql
-- S reason-only revision: apply after 0266. No table or function changes.
-- One generated revision per migration preserves the 0258 -> S -> F reason chain.
-- Keep in rollback/0189_down.sql so a registry rebuild restores the current reason.
-- CLI owns the transaction; Relay also verifies committed prerequisites and schema.

-- <<< erasure-registry:revisions from db/erasure-registry.json >>>
-- Generated reason revisions only. Owner, class, order and cascade stay as they were;
-- no row is added or removed and user data remains untouched.
DO $erasure_revisions$
DECLARE
  target record;
  v_rows bigint;
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN
    RAISE EXCEPTION 'erasure_revisions_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'erasure_revisions_rpc_must_remain_locked';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('chat_turn_reservations', 'user_id', 'account_delete_only', NULL::int, NULL::text,
     'Per-turn chat count reservations: ids, the counted day and times, no content. No owner policy; only server functions touch it (0255). Rows older than two days are removed by the next bump; account deletion cascades.',
     'Per-turn chat count and refund evidence: ids, counted day, times, attempt count, server-return flags and binding closure, no content. No owner policy; only server functions touch it. Closed attempted rows keep eligible late-return evidence without reopening binding. Rows older than two days are removed by the next bump; without another bump they remain until account deletion, which cascades. Content erasure leaves this bookkeeping intact.')
  ) AS revisions(table_name,owner_column,class,delete_order,cascades_from,previous_reason,reason) LOOP
    UPDATE public.erasure_registry AS r SET reason = target.reason
     WHERE r.table_name = target.table_name AND r.owner_column = target.owner_column
       AND r.class = target.class AND r.delete_order IS NOT DISTINCT FROM target.delete_order
       AND r.cascades_from IS NOT DISTINCT FROM target.cascades_from
       AND r.reason IN (target.previous_reason, target.reason);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'erasure_revisions_row_not_in_recorded_state: %', target.table_name;
    END IF;
  END LOOP;
END $erasure_revisions$;
-- <<< /erasure-registry:revisions >>>
