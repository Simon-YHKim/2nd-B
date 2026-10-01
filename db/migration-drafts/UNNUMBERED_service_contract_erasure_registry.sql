-- INACTIVE DRAFT. Registry additions only; no product provisioning.
-- Apply after 0189 + 0190, account-deletion fence, consent provenance,
-- Polaris provisioning and rewarded SSV hardening have created all four tables.
-- Promotion merges the sidecar entries into the canonical registry and assigns
-- this registry-only migration to forwardAdditions and the 0189 rollback replay
-- list. Do not reapply product provisioning after dropping the registry.
-- Supabase supplies one transaction. No numbering or activation is performed here.

-- <<< erasure-registry:additions from db/erasure-registry.json >>>
-- Generated additions only. Existing registry rows and user data remain untouched.
DO $erasure_additions$
DECLARE target record;
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN
    RAISE EXCEPTION 'erasure_additions_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'erasure_additions_rpc_must_remain_locked';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('account_deletion_tombstones', 'user_id'),
    ('llm_consent_receipts', 'user_id'),
    ('polaris_generations', 'user_id'),
    ('reward_ssv_issue_rate_limits', 'user_id')
  ) AS additions(table_name,owner_column) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='public' AND c.relname=target.table_name AND c.relkind IN ('r','p')
        AND a.attname=target.owner_column AND a.attnum>0 AND NOT a.attisdropped
        AND a.atttypid='uuid'::regtype) THEN
      RAISE EXCEPTION 'erasure_additions_owner_table_missing';
    END IF;
  END LOOP;
END $erasure_additions$;
WITH incoming (table_name,owner_column,class,delete_order,cascades_from,reason) AS (
  VALUES
    ('account_deletion_tombstones', 'user_id', 'retained', NULL, NULL, 'Durable account-deletion fence. Content deletion leaves it unchanged; it intentionally survives account deletion without an auth FK so late requests cannot recreate deleted account data.'),
    ('llm_consent_receipts', 'user_id', 'retained', NULL, NULL, 'Private provenance and withdrawal state for the retained consent_records ledger. Content deletion preserves it and cannot restore collect-mode legacy access; deletion of the account or source consent record cascades the receipt.'),
    ('polaris_generations', 'user_id', 'retained', NULL, NULL, 'Polaris lifetime allowance and request replay ledger. Content deletion clears evidence hashes and derived cards, fails and refunds active requests; terminal account deletion cascades the ledger.'),
    ('reward_ssv_issue_rate_limits', 'user_id', 'retained', NULL, NULL, 'Bounded rewarded-ticket issuance counter. Content deletion must not reset the issuance limit; account deletion cascades the counter through public.users.')
)
INSERT INTO public.erasure_registry AS r (table_name,owner_column,class,delete_order,cascades_from,reason)
SELECT i.table_name,i.owner_column,i.class,i.delete_order::int,i.cascades_from,i.reason FROM incoming i
ON CONFLICT (table_name) DO UPDATE SET owner_column=EXCLUDED.owner_column,class=EXCLUDED.class,
  delete_order=EXCLUDED.delete_order,cascades_from=EXCLUDED.cascades_from,reason=EXCLUDED.reason;
-- <<< /erasure-registry:additions >>>
