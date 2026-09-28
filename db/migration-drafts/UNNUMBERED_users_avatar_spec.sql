-- User-owned avatar settings. Keep this draft unnumbered until the console
-- session reserves the next migration number and applies it before the app
-- starts reading or writing avatar_spec (docs/SESSION-OWNERSHIP.md).
--
-- The 144 approved PNGs are review renders, not layers or stored images. Only
-- the small avatar recipe is stored here. A NULL value means the user has not
-- saved an avatar yet; the app may render its approved default locally.
-- Existing users_self_select/users_self_update policies (0009) restrict this
-- column to the signed-in row. Do not add a public or cross-user read policy.

BEGIN;
SET LOCAL lock_timeout = '10s';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_spec jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_avatar_spec_shape'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_avatar_spec_shape
      CHECK (
        avatar_spec IS NULL OR COALESCE((
          jsonb_typeof(avatar_spec) = 'object'
          AND jsonb_typeof(avatar_spec -> 'v') = 'number'
          AND avatar_spec ->> 'v' = '64'
          AND avatar_spec ->> 'type' IN ('human', 'animal')
          AND octet_length(avatar_spec::text) <= 4096
        ), false)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.users.avatar_spec IS
  'Private, user-owned approved 64-cell avatar recipe. NULL means no saved '
  'choice. The app narrows every field before rendering or writing. Do not '
  'treat the avatar job costume as verified occupation or expose this column '
  'to other users without a separate visibility decision.';

-- 0140 removed table-wide UPDATE. Grant this new, non-privileged column only
-- to authenticated users; users_self_update still enforces id = auth.uid().
GRANT UPDATE (avatar_spec) ON public.users TO authenticated;

COMMIT;
