-- Forward-only draft: let the signed-in user edit their optional display name.
-- Reserve a migration number and apply this before exposing the editor.
-- 0140 revoked table-wide UPDATE; do not change that historical migration.
-- users_self_update (0009) restricts the row to id = auth.uid().
-- users_display_name_len (0127) still limits the value to 40 characters.

SET LOCAL lock_timeout = '10s';

GRANT UPDATE (display_name) ON public.users TO authenticated;

