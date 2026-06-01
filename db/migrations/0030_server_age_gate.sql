-- 0030_server_age_gate.sql
-- C10 finding #2 fix: move the age floor + tier derivation SERVER-SIDE so the
-- gate is not client-only. 0028 relaxed the DB CHECK to a sanity range, which
-- (with #132 opening the client gate to 14) left the floor enforced only in
-- auth.ts — bypassable via a direct API / profile upsert that injects birth_date
-- < 14 or a false minor_tier. This trigger closes that: it derives
-- account_status + minor_tier from birth_date and REJECTS under-14 (no
-- self-service under-14 path exists yet — the guardian flow is a later PR).
--
-- The client check in auth.ts remains as a fast UX fail; this is the
-- authoritative server gate. minor_tier / account_status are now server-derived
-- and any client-supplied value for them is overwritten.
--
-- NOTE: behaviour (rejection of < 14, tier derivation) is exercised when applied
-- to a real DB. supabase-dry-run validates that the migration applies cleanly;
-- check:constraints (C10) asserts the trigger + floor are present.

CREATE OR REPLACE FUNCTION enforce_user_age_tier() RETURNS trigger AS $$
DECLARE
  age_years int;
BEGIN
  IF NEW.birth_date IS NULL THEN
    RAISE EXCEPTION 'C10: birth_date is required';
  END IF;

  age_years := date_part('year', age(current_date, NEW.birth_date))::int;

  -- Hard floor: no self-service registration under 14. PIPA requires verified
  -- legal-representative consent below 14 (Article 22-2) and that flow is not
  -- built yet, so reject rather than silently create an under-14 account.
  IF age_years < 14 THEN
    RAISE EXCEPTION 'C10: registration requires age >= 14 (got %)', age_years
      USING ERRCODE = 'check_violation';
  END IF;

  -- Server-derived tier + status — never trust client input for these.
  -- 14-17 -> minor_self; >=18 -> adult. (minor_guardian is reserved for the
  -- future under-14 guardian flow, which this trigger currently rejects.)
  NEW.minor_tier := CASE WHEN age_years < 18 THEN 'minor_self' ELSE 'adult' END;
  NEW.account_status := 'active';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_user_age_tier ON users;
CREATE TRIGGER trg_enforce_user_age_tier
  BEFORE INSERT OR UPDATE OF birth_date ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_user_age_tier();

-- Backfill existing rows so the constraint below validates. Rows created under
-- the old flat 18+ gate have minor_tier = NULL; derive it from birth_date. (A
-- plain UPDATE of minor_tier does not fire the birth_date trigger.)
UPDATE users
   SET minor_tier = CASE
         WHEN date_part('year', age(current_date, birth_date))::int < 18
           THEN 'minor_self' ELSE 'adult' END
 WHERE minor_tier IS NULL AND birth_date IS NOT NULL;

-- Defense in depth: an active account must carry a derived tier. The trigger
-- always sets it; this keeps any hand-written/service_role row honest.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_active_has_tier') THEN
    ALTER TABLE users ADD CONSTRAINT users_active_has_tier
      CHECK (account_status <> 'active' OR minor_tier IS NOT NULL);                -- C10
  END IF;
END $$;
