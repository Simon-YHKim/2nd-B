-- 0094_minor_import_clamp.sql
-- P0④ 잔여 (2026-07-18 handoff item B): the comms/location import lock for
-- minors existed ONLY in the client (ImportHubScreen minorLocked + C10 copy
-- "Comms/location import is locked for minors"). A tampered client could still
-- upsert the kakao-derived relation signals server-side. This adds the DB
-- backstop, mirroring the 0050 health_import posture: a minor account can
-- never hold imported comms derivatives.
--
-- Enforcement keys off users.minor_tier — the row the 0030/0033/0038 age-gate
-- triggers derive from birth_date server-side (unforgeable), never off any
-- client-supplied field. The clamp targets ONLY import-derived rows (an
-- 'imported:%' tag, e.g. 'imported:kakao' from 연동 P0③): manually-entered
-- relation people stay allowed for minors — the lock is about bulk comms
-- ingestion (PIPA posture), not about a teen writing down a friend.
--
-- No SECURITY DEFINER: the trigger reads only the writer's OWN users row
-- (NEW.user_id = auth.uid() under relation_people's owner-only RLS), which
-- own-row SELECT policy already permits. Additive + idempotent.

CREATE OR REPLACE FUNCTION reject_minor_imported_relation_rows() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.tags) AS t WHERE t LIKE 'imported:%')
     AND EXISTS (
       SELECT 1 FROM users u
       WHERE u.id = NEW.user_id
         AND u.minor_tier IS DISTINCT FROM 'adult'
     )
  THEN
    RAISE EXCEPTION 'minor_import_locked: imported comms derivatives are locked for minor accounts'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relation_people_minor_import_clamp ON relation_people;
CREATE TRIGGER relation_people_minor_import_clamp
  BEFORE INSERT OR UPDATE ON relation_people
  FOR EACH ROW EXECUTE FUNCTION reject_minor_imported_relation_rows();
