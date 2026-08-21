-- 0128_health_pref_backstop.sql
-- H9: close the ADULT half of the health-data lock.
--
-- 0100 added a DB backstop for minors and stated the threat model precisely: the
-- health_import pref lives only in the client choke point (health/ingest.ts
-- healthImportAllowed), so a tampered or direct-PostgREST client can INSERT into
-- health_samples past it. 0100 then closed that hole for minors only, by keying
-- off users.minor_tier.
--
-- For an ADULT the hole stayed open. health_samples RLS (0049) is owner-only, so
-- an adult account with health_import = false — the DEFAULT, meaning every adult
-- who has never opted in — could still write health rows straight to PostgREST.
-- Those rows feed the health domain-star brightness and routine auto-completion,
-- and they are 민감정보 the user never consented to us holding. The privacy policy
-- says this data is read "only when an adult turns the connection on in the app";
-- until now only the app itself was enforcing that sentence.
--
-- Same shape as 0100 and deliberately so: one trigger function, both checks, one
-- pass over the users row. Fails CLOSED — a NULL/absent privacy_prefs or a
-- missing key reads as not-opted-in, which is the right default for sensitive
-- data and matches the pref's own OFF default (0050).
--
-- Invoker-rights (no SECURITY DEFINER): reads only the writer's OWN users row,
-- which health_samples' owner-only RLS already permits. Additive + idempotent.

CREATE OR REPLACE FUNCTION reject_minor_health_rows() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_opted_in boolean;
BEGIN
  SELECT u.minor_tier,
         COALESCE((u.privacy_prefs ->> 'health_import')::boolean, false)
    INTO v_tier, v_opted_in
    FROM users u
   WHERE u.id = NEW.user_id;

  -- No users row visible: fail closed rather than assume an adult opt-in.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'health_locked: no profile found for this account'
      USING ERRCODE = 'P0001';
  END IF;

  -- Minors: fully locked, no pref can unlock it (0050 seeds health_import false
  -- and MINOR_PROMOTABLE_KEYS excludes it, so there is no minor path at all).
  IF v_tier IS DISTINCT FROM 'adult' THEN
    RAISE EXCEPTION 'minor_health_locked: health data (sensitive/민감정보) is locked for minor accounts'
      USING ERRCODE = 'P0001';
  END IF;

  -- Adults: the app-level opt-in is now enforced here too, not only in the
  -- client. This is the sentence the privacy policy already makes.
  IF NOT v_opted_in THEN
    RAISE EXCEPTION 'health_consent_required: health data (sensitive/민감정보) requires the health_import opt-in'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged from 0100; recreated so applying this file
-- alone (out of order, on a fresh DB) still leaves a working backstop.
DROP TRIGGER IF EXISTS health_samples_minor_backstop ON health_samples;
CREATE TRIGGER health_samples_minor_backstop
  BEFORE INSERT OR UPDATE ON health_samples
  FOR EACH ROW EXECUTE FUNCTION reject_minor_health_rows();

-- 0101 revoked PUBLIC/anon EXECUTE on this function; a CREATE OR REPLACE keeps
-- the existing grants, but re-assert them so a fresh apply is not looser than an
-- upgraded one (new functions auto-grant EXECUTE to anon).
REVOKE ALL ON FUNCTION reject_minor_health_rows() FROM public;
REVOKE ALL ON FUNCTION reject_minor_health_rows() FROM anon;
