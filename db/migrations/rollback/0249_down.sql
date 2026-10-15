-- G2-06: non-destructive rollback only, after separate operations approval.
-- Restore the previous reviewed Edge first; legacy RPCs remain callable.
-- Retain lease columns, v2 functions, audit lineage and terminal states.
-- Never clear dispatch/classifying/blocked markers or reopen paid attempts.
-- Prefer forward repair. Removing this schema requires a separately reviewed
-- backup/restore plan; old Edge may leave existing v2 keys waiting.
DO $$ BEGIN RAISE NOTICE '0249 retained: restore reviewed Edge or apply a forward repair'; END $$;
