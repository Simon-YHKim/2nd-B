-- 0085_rewarded_ssv_txns_user_fk.sql
-- Account-deletion completeness (audit): rewarded_ssv_txns (0079) was created with
-- NO foreign key on user_id, so its rows (AdMob SSV transaction ids + user_id)
-- would survive account deletion - the only user-data table not reached by the
-- delete-account cascade (every other user table cascades off public.users or
-- auth.users). Add an ON DELETE CASCADE FK to public.users so the rows erase with
-- the account. The table is empty today (rewarded-ssv ships flag-off), so there is
-- nothing to backfill and no existing row can violate the constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewarded_ssv_txns_user_fk') THEN
    ALTER TABLE public.rewarded_ssv_txns
      ADD CONSTRAINT rewarded_ssv_txns_user_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;
