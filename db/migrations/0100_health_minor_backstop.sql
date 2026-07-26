-- 0100_health_minor_backstop.sql
-- (Renumbered 0099 -> 0100 to avoid a collision with the open PR #1133's
-- 0099_ai_audit_health_view.sql; ordering is not significant for this trigger.)
-- Deep-hunt F5: the minor health-data (PIPA 민감정보) lock existed ONLY in the client
-- choke point (health/ingest.ts ingestHealthSamples reads the health_import pref) plus
-- that pref being server-clamped false for minors (0050). But health_samples RLS
-- (0049) is owner-only with NO minor_tier check, so a tampered / direct-PostgREST
-- minor client could INSERT health rows straight past ingestHealthSamples -- the same
-- threat model 0094 closes for imported comms. These rows then feed the health
-- domain-star brightness + routine auto-completion. This adds the missing DB backstop.
--
-- Unlike 0094 (which clamps only 'imported:%'-tagged rows), health is FULLY locked for
-- minors: there is no minor path to health at all (0050 seeds health_import false and
-- MINOR_PROMOTABLE_KEYS excludes it), so the trigger rejects ANY minor write.
--
-- Keys off users.minor_tier -- the value the 0030/0033/0038 age-gate triggers derive
-- from birth_date server-side (unforgeable), never a client field. `IS DISTINCT FROM
-- 'adult'` fails CLOSED on a NULL tier (same convention as 0094), which is the safe
-- choice for sensitive data. Invoker-rights (no SECURITY DEFINER): reads only the
-- writer's OWN users row under health_samples' owner-only RLS, which own-row SELECT
-- already permits. Additive + idempotent.

CREATE OR REPLACE FUNCTION reject_minor_health_rows() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = NEW.user_id
      AND u.minor_tier IS DISTINCT FROM 'adult'
  ) THEN
    RAISE EXCEPTION 'minor_health_locked: health data (sensitive/민감정보) is locked for minor accounts'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS health_samples_minor_backstop ON health_samples;
CREATE TRIGGER health_samples_minor_backstop
  BEFORE INSERT OR UPDATE ON health_samples
  FOR EACH ROW EXECUTE FUNCTION reject_minor_health_rows();
