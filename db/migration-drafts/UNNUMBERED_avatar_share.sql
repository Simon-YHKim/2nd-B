-- Avatar Share server contract. Number and apply only in the console-owned
-- server-first rollout (docs/SESSION-OWNERSHIP.md). No public asset is visible
-- until a service-role reviewer explicitly changes pending to approved.
--
-- Pixel contract v1: exactly 4096 ASCII cells, '.' transparency or 0-9A-F
-- indices into src/lib/avatar-share/pixels.ts. At most 1024 painted cells.
-- There is no PNG/SVG/URL upload or executable content in this feature.
-- Keep this file and the erasure-registry forward draft together when numbering.

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.avatar_share_pixels_valid(p_pixels text)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT
SET search_path = ''
AS $$
  SELECT pg_catalog.octet_length(p_pixels) = 4096
     AND p_pixels ~ '^[.0-9A-F]+$'
     AND pg_catalog.char_length(pg_catalog.replace(p_pixels, '.', '')) BETWEEN 1 AND 1024;
$$;
REVOKE ALL ON FUNCTION public.avatar_share_pixels_valid(text)
  FROM PUBLIC, anon, authenticated;
-- A service-role review UPDATE rechecks the table CHECK; it needs EXECUTE.
GRANT EXECUTE ON FUNCTION public.avatar_share_pixels_valid(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.avatar_share_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  slot            text NOT NULL CHECK (slot IN ('hair', 'accessory', 'garment')),
  pixels          text NOT NULL CHECK (public.avatar_share_pixels_valid(pixels)),
  palette_version smallint NOT NULL DEFAULT 1 CHECK (palette_version = 1),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  report_count    integer NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  hidden_at       timestamptz,
  consent_version text NOT NULL CHECK (consent_version = 'avatar-share-v1'),
  consented_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  CONSTRAINT avatar_share_title_bounded CHECK (
    title = pg_catalog.btrim(title)
    AND pg_catalog.char_length(title) BETWEEN 1 AND 32
    AND pg_catalog.octet_length(title) <= 128
    AND title !~ '[[:cntrl:]]'
  ),
  CONSTRAINT avatar_share_review_state CHECK (
    (status = 'pending' AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS avatar_share_assets_gallery_idx
  ON public.avatar_share_assets (slot, created_at DESC, id)
  WHERE status = 'approved' AND hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS avatar_share_assets_owner_idx
  ON public.avatar_share_assets (owner_id, created_at DESC);

-- The review action may change only review fields. Once submitted, both its
-- drawing and its title are immutable: an author cannot swap reviewed pixels.
CREATE OR REPLACE FUNCTION public.guard_avatar_share_asset_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.slot IS DISTINCT FROM OLD.slot
    OR NEW.pixels IS DISTINCT FROM OLD.pixels
    OR NEW.palette_version IS DISTINCT FROM OLD.palette_version
    OR NEW.consent_version IS DISTINCT FROM OLD.consent_version
    OR NEW.consented_at IS DISTINCT FROM OLD.consented_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'avatar_share_submitted_content_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_avatar_share_asset_revision()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_avatar_share_asset_revision ON public.avatar_share_assets;
CREATE TRIGGER guard_avatar_share_asset_revision
  BEFORE UPDATE ON public.avatar_share_assets
  FOR EACH ROW EXECUTE FUNCTION public.guard_avatar_share_asset_revision();

CREATE TABLE IF NOT EXISTS public.avatar_share_reports (
  asset_id    uuid NOT NULL REFERENCES public.avatar_share_assets(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- A creator report points to one visible asset as the creator identity.
  -- The same reporter cannot report both targets on one asset to inflate tally.
  target      text NOT NULL DEFAULT 'asset' CHECK (target IN ('asset', 'creator')),
  reason      text NOT NULL
                CHECK (reason IN ('spam', 'off_topic', 'offensive', 'impersonation', 'other')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS avatar_share_reports_reporter_idx
  ON public.avatar_share_reports (reporter_id);

CREATE TABLE IF NOT EXISTS public.avatar_share_blocks (
  blocker_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_owner_id),
  CONSTRAINT avatar_share_blocks_not_self CHECK (blocker_id <> blocked_owner_id)
);
CREATE INDEX IF NOT EXISTS avatar_share_blocks_blocked_idx
  ON public.avatar_share_blocks (blocked_owner_id);

-- A row lock serializes simultaneous submissions by one account. The window
-- survives deleting an asset, so removing a rejected item cannot reset quota.
CREATE TABLE IF NOT EXISTS public.avatar_share_submission_limits (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  claimed_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avatar_share_submission_claims_bounded CHECK (
    pg_catalog.cardinality(claimed_at) BETWEEN 0 AND 3
    AND pg_catalog.array_position(claimed_at, NULL) IS NULL
  )
);

ALTER TABLE public.avatar_share_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_share_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_share_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_share_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_share_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_share_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_share_submission_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatar_share_submission_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.avatar_share_assets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON TABLE public.avatar_share_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.avatar_share_assets TO service_role;
REVOKE ALL ON TABLE public.avatar_share_reports
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.avatar_share_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.avatar_share_reports TO service_role;
REVOKE ALL ON TABLE public.avatar_share_blocks
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.avatar_share_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.avatar_share_blocks TO service_role;
REVOKE ALL ON TABLE public.avatar_share_submission_limits
  FROM PUBLIC, anon, authenticated, service_role;

-- These two small owner-only tables are safe for the asset read policy to
-- consult. No report text is stored; the reason is a closed enum.
CREATE POLICY avatar_share_reports_select ON public.avatar_share_reports
  FOR SELECT TO authenticated USING (reporter_id = (select auth.uid()));
-- Resolve the full public gate under a narrow definer function. A direct users
-- join inside asset RLS would see only the caller's own users row; a direct
-- asset self-join would recurse. This boolean reveals only the same answer a
-- client SELECT would get for this one asset, including the author's current
-- adult/active status after any later age or account correction.
CREATE OR REPLACE FUNCTION public.can_view_avatar_share_asset(p_asset_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.avatar_share_assets AS asset
    JOIN public.users AS me ON me.id = auth.uid()
    JOIN public.users AS owner ON owner.id = asset.owner_id
    WHERE asset.id = p_asset_id
      AND me.account_status = 'active' AND me.minor_tier = 'adult'
      AND owner.account_status = 'active' AND owner.minor_tier = 'adult'
      AND asset.status = 'approved' AND asset.hidden_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.avatar_share_blocks AS blocked
        WHERE blocked.blocker_id = me.id
          AND blocked.blocked_owner_id = asset.owner_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.avatar_share_reports AS reported
        WHERE reported.reporter_id = me.id
          AND reported.asset_id = asset.id
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_avatar_share_asset(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_avatar_share_asset(uuid)
  TO authenticated;

-- A report INSERT policy that SELECTs assets directly forms an RLS recursion.
-- Keep its own narrow author check under the same definer boundary.
CREATE OR REPLACE FUNCTION public.can_report_avatar_share_asset(p_asset_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.can_view_avatar_share_asset(p_asset_id)
    AND EXISTS (
      SELECT 1 FROM public.avatar_share_assets AS asset
      WHERE asset.id = p_asset_id AND asset.owner_id <> auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.can_report_avatar_share_asset(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_report_avatar_share_asset(uuid)
  TO authenticated;
CREATE POLICY avatar_share_reports_insert ON public.avatar_share_reports
  FOR INSERT TO authenticated WITH CHECK (
    reporter_id = (select auth.uid())
    AND public.can_report_avatar_share_asset(asset_id)
  );

CREATE POLICY avatar_share_blocks_select ON public.avatar_share_blocks
  FOR SELECT TO authenticated USING (blocker_id = (select auth.uid()));
CREATE POLICY avatar_share_blocks_insert ON public.avatar_share_blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id = (select auth.uid()));
CREATE POLICY avatar_share_blocks_delete ON public.avatar_share_blocks
  FOR DELETE TO authenticated USING (blocker_id = (select auth.uid()));

-- Private submissions stay visible to their creator. Published content is
-- readable only by adults who have not blocked its creator, reported it, or
-- crossed the server hide threshold. RLS is the gate, not a client filter.
CREATE POLICY avatar_share_assets_select ON public.avatar_share_assets
  FOR SELECT TO authenticated USING (
    owner_id = (select auth.uid())
    OR public.can_view_avatar_share_asset(id)
  );
CREATE POLICY avatar_share_assets_delete ON public.avatar_share_assets
  FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.hide_reported_avatar_share_asset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The UPDATE locks the asset row, so simultaneous distinct reports cannot
  -- lose increments. The third report hides it globally in the same commit.
  UPDATE public.avatar_share_assets AS asset
     SET report_count = asset.report_count + 1,
         hidden_at = CASE WHEN asset.report_count + 1 >= 3
                          THEN COALESCE(asset.hidden_at, pg_catalog.clock_timestamp())
                          ELSE asset.hidden_at END
   WHERE asset.id = NEW.asset_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hide_reported_avatar_share_asset()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS avatar_share_report_hide ON public.avatar_share_reports;
CREATE TRIGGER avatar_share_report_hide
  AFTER INSERT ON public.avatar_share_reports
  FOR EACH ROW EXECUTE FUNCTION public.hide_reported_avatar_share_asset();

CREATE OR REPLACE FUNCTION public.submit_avatar_share_asset(
  p_slot text, p_title text, p_pixels text,
  p_rights_confirmed boolean, p_consent_version text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz;
  v_claims timestamptz[];
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'avatar_share_auth_required' USING ERRCODE = '28000';
  END IF;
  IF p_slot IS NULL OR p_slot NOT IN ('hair', 'accessory', 'garment')
    OR p_title IS NULL OR p_title IS DISTINCT FROM pg_catalog.btrim(p_title)
    OR pg_catalog.char_length(p_title) NOT BETWEEN 1 AND 32
    OR pg_catalog.octet_length(p_title) > 128 OR p_title ~ '[[:cntrl:]]'
    OR public.avatar_share_pixels_valid(p_pixels) IS DISTINCT FROM true
    OR p_rights_confirmed IS DISTINCT FROM true
    OR p_consent_version IS DISTINCT FROM 'avatar-share-v1' THEN
    RAISE EXCEPTION 'avatar_share_submission_invalid' USING ERRCODE = '22023';
  END IF;
  -- SHARE serializes this adult check with birth-date/account-status UPDATE
  -- as well as account deletion. KEY SHARE would not block a non-key UPDATE.
  PERFORM 1 FROM public.users AS me
   WHERE me.id = v_uid AND me.account_status = 'active'
     AND me.minor_tier = 'adult'
   FOR SHARE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.account_deletion_tombstones AS tombstone
     WHERE tombstone.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'avatar_share_adult_account_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.avatar_share_submission_limits (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT claimed_at INTO v_claims
    FROM public.avatar_share_submission_limits
   WHERE user_id = v_uid FOR UPDATE;
  IF v_claims IS NULL THEN
    RAISE EXCEPTION 'avatar_share_rate_state_missing' USING ERRCODE = 'P0001';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  SELECT COALESCE(pg_catalog.array_agg(claim ORDER BY claim), '{}'::timestamptz[])
    INTO v_claims
    FROM pg_catalog.unnest(v_claims) AS claim
   WHERE claim >= v_now - interval '24 hours';
  IF pg_catalog.cardinality(v_claims) >= 3 THEN
    RAISE EXCEPTION 'avatar_share_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.avatar_share_assets
       WHERE owner_id = v_uid) >= 30 THEN
    RAISE EXCEPTION 'avatar_share_asset_limit' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.avatar_share_submission_limits
     SET claimed_at = pg_catalog.array_append(v_claims, v_now), updated_at = v_now
   WHERE user_id = v_uid;
  INSERT INTO public.avatar_share_assets
    (owner_id, title, slot, pixels, palette_version, status,
     consent_version, consented_at, created_at)
  VALUES
    (v_uid, p_title, p_slot, p_pixels, 1, 'pending',
     'avatar-share-v1', v_now, v_now)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_avatar_share_asset(text,text,text,boolean,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_avatar_share_asset(text,text,text,boolean,text)
  TO authenticated;

COMMENT ON TABLE public.avatar_share_assets IS
  'Versioned, moderated 64-cell user-drawn layers. No public read before review.';
COMMENT ON FUNCTION public.submit_avatar_share_asset(text,text,text,boolean,text) IS
  'Authenticated adult submission only; records v1 reuse consent and enforces a serialized 3-per-24h limit.';
