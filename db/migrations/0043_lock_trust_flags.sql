-- 0043_lock_trust_flags.sql
-- Security audit 2026-06-10 (adversarial RLS deep-dive) — two self-grant gaps.
--
-- P2 — knowledge_sources self-verification (cross-user evidence poisoning):
--   ks_owner_update (0009) checks only added_by = auth.uid(), and the relaxed
--   C8 pair (0014: verified_by IS NULL OR verified_at IS NOT NULL) accepts
--   verified_at alone. So any authenticated user could UPDATE their own row to
--   verified_at = now() — or INSERT it pre-stamped — and the 0041 read gate's
--   `verified_at IS NOT NULL` branch then exposes that row to EVERY user.
--   queryRows routes by framework/locale/age (never owner), so the poisoned
--   row lands in other users' Advisor prompts as cited "curated research"
--   (the <UNTRUSTED> fence blocks instruction-injection but not fake-DOI
--   false-evidence). This re-opened exactly the reach 0041 closed.
--   Fix: column-level REVOKE (0025 pattern) — verification is service-role
--   curation only — plus a defense-in-depth trigger (scrub on INSERT so a
--   legitimate submission that accidentally carries the fields still lands;
--   RAISE on UPDATE, mirroring block_self_tier_change).
--
-- P3 — testimonials self-approval (moderation bypass):
--   testimonials_owner_all (0009) WITH CHECK gates only user_id, so a user
--   could INSERT/UPDATE their own row with approved_for_public = true and the
--   anon public-select policy (0009) publishes it unmoderated. No client flow
--   sets the flag (grep: types.gen.ts only), so locking breaks nothing.
--   Fix: same REVOKE + trigger pair (force-false on INSERT, RAISE on UPDATE).
--
-- Companion code change: loader.queryRows now also filters to trusted rows
-- (added_by IS NULL OR verified_at IS NOT NULL) as defense in depth.
-- Idempotent. Applied + verified on prod before the commit that carries this file.

----------------------------------------------------------------------
-- P2: knowledge_sources — verification is service-role-only
----------------------------------------------------------------------

REVOKE INSERT (verified_by, verified_at), UPDATE (verified_by, verified_at)
  ON public.knowledge_sources FROM authenticated;

CREATE OR REPLACE FUNCTION public.block_ks_self_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Overwrite (not RAISE) so a legitimate user submission that accidentally
    -- carries the fields still lands — unverified, as it should be.
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'knowledge_sources verification may only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ks_block_self_verify ON public.knowledge_sources;
CREATE TRIGGER trg_ks_block_self_verify
  BEFORE INSERT OR UPDATE ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.block_ks_self_verify();

----------------------------------------------------------------------
-- P3: testimonials — publication approval is service-role-only
----------------------------------------------------------------------

REVOKE INSERT (approved_for_public), UPDATE (approved_for_public)
  ON public.testimonials FROM authenticated;

CREATE OR REPLACE FUNCTION public.block_testimonial_self_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.approved_for_public := false;
    RETURN NEW;
  END IF;
  IF NEW.approved_for_public IS DISTINCT FROM OLD.approved_for_public THEN
    RAISE EXCEPTION 'testimonials approval may only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_testimonials_block_self_approve ON public.testimonials;
CREATE TRIGGER trg_testimonials_block_self_approve
  BEFORE INSERT OR UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.block_testimonial_self_approve();
