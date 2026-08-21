-- 0140_users_avatar.sql
-- Profile character + one occupational role layer (Simon 2026-08-21).
--
-- `avatar` is deliberately self-contained JSON. It can be rendered as a full
-- 64x64 sprite or a 40x40 head crop without another table join. The key set is
-- narrowed again in src/lib/avatar/profile-avatar.ts on every read and write.
-- Appearance choices are cosmetics and never participate in profile-star
-- brightness. The existing profile_details.occupation field remains the one
-- factual occupation source; this migration only updates it when the user
-- explicitly changes the role layer.
--
-- RLS / future sharing: users_self_select remains owner-only. public.users also
-- contains email, birth_date and private preferences, so it must never be made
-- broadly readable just to show an avatar. A future community/share surface
-- must expose only avatar through its own consent-aware projection or RPC. No
-- such cross-user read is granted before those visibility rules are decided.

BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_avatar_shape;

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_shape CHECK (
    jsonb_typeof(avatar) = 'object'
    AND pg_column_size(avatar) <= 8192
    AND (
      avatar - ARRAY[
        'v', 'seed', 'type', 'skin', 'hairColor', 'eye', 'cloth', 'cloth2',
        'fur', 'hair', 'acc', 'face', 'expr', 'species', 'job', 'wearUniform'
      ]::text[]
    ) = '{}'::jsonb
    AND (NOT (avatar ? 'v') OR avatar ->> 'v' = '64')
    AND (NOT (avatar ? 'type') OR avatar ->> 'type' IN ('human', 'animal'))
  );

COMMENT ON COLUMN public.users.avatar IS
  'PIXEL-CLAY v4 profile character and optional human job-layer key. Integer '
  '64x64 Rect data is generated client-side; readers and writers must pass '
  'through resolveProfileAvatar. Cosmetic fields do not affect profile-star '
  'brightness. Owner-readable only: future cross-user surfaces must use a '
  'separate consent-aware projection, never broaden public.users SELECT.';

-- One call persists the visual JSON and, only for an explicit role action,
-- updates the factual occupation in the same transaction. This prevents an
-- avatar.job / profile_details.occupation split if the network drops halfway.
CREATE OR REPLACE FUNCTION public.save_profile_avatar(
  p_avatar jsonb,
  p_sync_occupation boolean DEFAULT false,
  p_occupation text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_occupation text := NULLIF(btrim(p_occupation), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_avatar IS NULL OR jsonb_typeof(p_avatar) <> 'object' THEN
    RAISE EXCEPTION 'avatar must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF pg_column_size(p_avatar) > 8192 THEN
    RAISE EXCEPTION 'avatar exceeds 8192 bytes' USING ERRCODE = '22001';
  END IF;

  IF p_sync_occupation AND char_length(v_occupation) > 40 THEN
    RAISE EXCEPTION 'occupation exceeds 40 characters' USING ERRCODE = '22001';
  END IF;

  IF p_sync_occupation THEN
    UPDATE public.users
    SET avatar = p_avatar,
        profile_details = CASE
          WHEN v_occupation IS NULL THEN profile_details - 'occupation'
          ELSE jsonb_set(
            profile_details,
            '{occupation}',
            to_jsonb(v_occupation),
            true
          )
        END
    WHERE id = v_user_id;
  ELSE
    UPDATE public.users
    SET avatar = p_avatar
    WHERE id = v_user_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user profile not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_profile_avatar(jsonb, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_avatar(jsonb, boolean, text)
  TO authenticated;

COMMENT ON FUNCTION public.save_profile_avatar(jsonb, boolean, text) IS
  'Atomically saves the caller''s narrowed avatar JSON and, when requested, '
  'syncs profile_details.occupation. The auth.uid predicate is mandatory even '
  'though the function is SECURITY DEFINER.';

COMMIT;
