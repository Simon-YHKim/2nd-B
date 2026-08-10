-- 0117_community_chat.sql
-- Community chat v1 (2026-08-10 Simon direction: 7th home slot = community).
-- Text-only rooms, two kinds: 'dm' (1:1, capped at 2 members) and 'group'
-- (다:1, capped at 32). No voice, no media, no public directory.
--
-- Shape notes (mirrors the house rules):
--   * No user discovery/search. Rooms are joined ONLY through invite links,
--     exactly like 0064 peer invites: the raw token exists in the share sheet
--     link alone; the DB stores its SHA-256 hex. Join validates server-side.
--   * Membership writes go through SECURITY DEFINER RPCs only — there is no
--     INSERT policy on rooms/members/invites, so RLS default-deny closes the
--     direct path even though the app ships a public anon key (0097 lesson:
--     the READ/WRITE policy is the gate, the client filter is optimistic UX).
--   * Adults only, fail-closed: every RPC asserts users.minor_tier = 'adult'
--     (0030 derives it server-side from birth_date; NULL/other -> reject).
--     Client hides the surface for minors too, but the RPC is the gate.
--   * Display names are pseudonymous aliases (community_profiles). Real names,
--     emails, and contacts never enter these tables. Report reasons are the
--     0097 closed list — no free text from one user about another (PIPA).
--   * Messages are append-only + delete-own (Play UGC: a user can remove
--     their own content). No edits in v1. Blocks filter at RLS level.
--   * 0061/0102 initplan rule everywhere: (select auth.uid()).
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- Tables
----------------------------------------------------------------------

-- Pseudonymous display identity. One row per user, created via RPC on first
-- community use. Alias is a curated star-style label chosen client-side;
-- uniqueness keeps rooms readable (client retries with a numeric suffix).
CREATE TABLE IF NOT EXISTS community_profiles (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alias       text NOT NULL UNIQUE
              CHECK (char_length(alias) BETWEEN 2 AND 24),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_rooms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL CHECK (kind IN ('dm', 'group')),
  -- dm rooms carry no title (the peer's alias is the title); group titles are
  -- required and bounded.
  title            text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_rooms_title_by_kind CHECK (
    (kind = 'dm' AND title IS NULL)
    OR (kind = 'group' AND title IS NOT NULL AND char_length(title) BETWEEN 1 AND 40)
  )
);

CREATE TABLE IF NOT EXISTS community_room_members (
  room_id    uuid NOT NULL REFERENCES community_rooms(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- room_id is covered by the PK's leading column; user_id needs its own (0083).
CREATE INDEX IF NOT EXISTS community_room_members_user_idx
  ON community_room_members (user_id);

CREATE TABLE IF NOT EXISTS community_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES community_rooms(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_messages_room_created_idx
  ON community_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_messages_sender_idx
  ON community_messages (sender_id);

-- Invite links. Raw token lives only in the shared link; this stores SHA-256
-- hex. dm invites are single-use by construction (see RPC).
CREATE TABLE IF NOT EXISTS community_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES community_rooms(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  max_uses    integer NOT NULL DEFAULT 8 CHECK (max_uses BETWEEN 1 AND 32),
  used_count  integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_invites_room_idx
  ON community_invites (room_id);
CREATE INDEX IF NOT EXISTS community_invites_created_by_idx
  ON community_invites (created_by);

-- Who I have blocked (community-wide, not per room). Insert + delete only.
CREATE TABLE IF NOT EXISTS community_blocks (
  blocker_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT community_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS community_blocks_blocked_idx
  ON community_blocks (blocked_id);

-- One report per (message, reporter). Closed reason list, mirrored in
-- src/lib/wiki/moderation.ts (same list as 0097 content_reports).
CREATE TABLE IF NOT EXISTS community_message_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  reporter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       text NOT NULL CHECK (reason IN ('spam', 'off_topic', 'offensive', 'impersonation', 'other')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_message_reports_once UNIQUE (message_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS community_message_reports_reporter_idx
  ON community_message_reports (reporter_id);

----------------------------------------------------------------------
-- Helper functions (used by policies; DEFINER avoids RLS self-recursion)
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_is_member(p_room uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_room_members m
    WHERE m.room_id = p_room AND m.user_id = p_user
  );
$$;

REVOKE ALL     ON FUNCTION public.community_is_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_is_member(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.community_is_member(uuid, uuid) TO authenticated;

-- Adults only, fail-closed: anything but an explicit 'adult' tier rejects.
CREATE OR REPLACE FUNCTION public.community_assert_adult()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_tier text;
BEGIN
  SELECT minor_tier INTO v_tier FROM public.users WHERE id = auth.uid();
  IF v_tier IS DISTINCT FROM 'adult' THEN
    RAISE EXCEPTION 'community_adult_only';
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.community_assert_adult() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_assert_adult() FROM anon;
GRANT  EXECUTE ON FUNCTION public.community_assert_adult() TO authenticated;

----------------------------------------------------------------------
-- RLS
----------------------------------------------------------------------

ALTER TABLE community_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_room_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_blocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_message_reports ENABLE ROW LEVEL SECURITY;

-- profiles: mine, or someone I share a room with (alias is what members see).
DROP POLICY IF EXISTS community_profiles_select ON community_profiles;
CREATE POLICY community_profiles_select ON community_profiles
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM community_room_members mine
      JOIN community_room_members theirs ON theirs.room_id = mine.room_id
      WHERE mine.user_id = (select auth.uid())
        AND theirs.user_id = community_profiles.user_id
    )
  );
-- INSERT/UPDATE only through community_ensure_profile() — no direct policy.

-- rooms: members read; all writes via RPC.
DROP POLICY IF EXISTS community_rooms_select ON community_rooms;
CREATE POLICY community_rooms_select ON community_rooms
  FOR SELECT USING (public.community_is_member(id, (select auth.uid())));

-- members: visible to fellow members; leaving = deleting my own row.
DROP POLICY IF EXISTS community_room_members_select ON community_room_members;
CREATE POLICY community_room_members_select ON community_room_members
  FOR SELECT USING (public.community_is_member(room_id, (select auth.uid())));

DROP POLICY IF EXISTS community_room_members_leave ON community_room_members;
CREATE POLICY community_room_members_leave ON community_room_members
  FOR DELETE USING (user_id = (select auth.uid()));

-- messages: members read, minus senders I blocked. Send = member + adult +
-- me as sender. Delete-own only.
DROP POLICY IF EXISTS community_messages_select ON community_messages;
CREATE POLICY community_messages_select ON community_messages
  FOR SELECT USING (
    public.community_is_member(room_id, (select auth.uid()))
    AND NOT EXISTS (
      SELECT 1 FROM community_blocks b
      WHERE b.blocker_id = (select auth.uid()) AND b.blocked_id = community_messages.sender_id
    )
  );

DROP POLICY IF EXISTS community_messages_insert ON community_messages;
CREATE POLICY community_messages_insert ON community_messages
  FOR INSERT WITH CHECK (
    sender_id = (select auth.uid())
    AND public.community_is_member(room_id, (select auth.uid()))
    AND (SELECT u.minor_tier FROM users u WHERE u.id = (select auth.uid())) = 'adult'
  );

DROP POLICY IF EXISTS community_messages_delete_own ON community_messages;
CREATE POLICY community_messages_delete_own ON community_messages
  FOR DELETE USING (sender_id = (select auth.uid()));

-- invites: the creator manages their own; join goes through the RPC.
DROP POLICY IF EXISTS community_invites_select ON community_invites;
CREATE POLICY community_invites_select ON community_invites
  FOR SELECT USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS community_invites_delete ON community_invites;
CREATE POLICY community_invites_delete ON community_invites
  FOR DELETE USING (created_by = (select auth.uid()));

-- blocks: mine only.
DROP POLICY IF EXISTS community_blocks_select ON community_blocks;
CREATE POLICY community_blocks_select ON community_blocks
  FOR SELECT USING (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS community_blocks_insert ON community_blocks;
CREATE POLICY community_blocks_insert ON community_blocks
  FOR INSERT WITH CHECK (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS community_blocks_delete ON community_blocks;
CREATE POLICY community_blocks_delete ON community_blocks
  FOR DELETE USING (blocker_id = (select auth.uid()));

-- reports: write-mostly ledger; a reporter can re-read their own rows so the
-- UI can show the reported state.
DROP POLICY IF EXISTS community_message_reports_select ON community_message_reports;
CREATE POLICY community_message_reports_select ON community_message_reports
  FOR SELECT USING (reporter_id = (select auth.uid()));

DROP POLICY IF EXISTS community_message_reports_insert ON community_message_reports;
CREATE POLICY community_message_reports_insert ON community_message_reports
  FOR INSERT WITH CHECK (
    reporter_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM community_messages m
      WHERE m.id = community_message_reports.message_id
        AND public.community_is_member(m.room_id, (select auth.uid()))
    )
  );

----------------------------------------------------------------------
-- room activity trigger
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_touch_room()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.community_rooms
     SET last_message_at = NEW.created_at
   WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_messages_touch_room ON community_messages;
CREATE TRIGGER community_messages_touch_room
  AFTER INSERT ON community_messages
  FOR EACH ROW EXECUTE FUNCTION public.community_touch_room();

----------------------------------------------------------------------
-- RPCs (the only membership write path)
----------------------------------------------------------------------

-- First-use profile. Idempotent: an existing row wins over the proposed alias
-- (aliases are stable once chosen). Unique-violation on a fresh alias raises
-- for the client to retry with a suffix.
CREATE OR REPLACE FUNCTION public.community_ensure_profile(p_alias text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_alias text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'community_auth_required'; END IF;
  PERFORM public.community_assert_adult();

  SELECT alias INTO v_alias FROM public.community_profiles WHERE user_id = auth.uid();
  IF v_alias IS NOT NULL THEN RETURN v_alias; END IF;

  IF p_alias IS NULL OR char_length(btrim(p_alias)) NOT BETWEEN 2 AND 24 THEN
    RAISE EXCEPTION 'community_alias_invalid';
  END IF;

  INSERT INTO public.community_profiles (user_id, alias)
  VALUES (auth.uid(), btrim(p_alias));
  RETURN btrim(p_alias);
END;
$$;

-- Create a room (dm or group). Caps rooms created per user (anti-abuse).
CREATE OR REPLACE FUNCTION public.community_create_room(p_kind text, p_title text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_room uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'community_auth_required'; END IF;
  PERFORM public.community_assert_adult();
  IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'community_profile_required';
  END IF;
  IF p_kind NOT IN ('dm', 'group') THEN RAISE EXCEPTION 'community_kind_invalid'; END IF;
  IF (SELECT count(*) FROM public.community_rooms r WHERE r.created_by = auth.uid()) >= 20 THEN
    RAISE EXCEPTION 'community_room_cap';
  END IF;

  INSERT INTO public.community_rooms (kind, title, created_by)
  VALUES (
    p_kind,
    CASE WHEN p_kind = 'group' THEN left(btrim(p_title), 40) ELSE NULL END,
    auth.uid()
  )
  RETURNING id INTO v_room;

  INSERT INTO public.community_room_members (room_id, user_id, role)
  VALUES (v_room, auth.uid(), 'owner');

  RETURN v_room;
END;
$$;

-- Mint an invite link for a room I own. The client generates the raw token
-- and sends ONLY its SHA-256 hex here (the raw token never reaches the DB).
-- dm rooms force max_uses = 1 and refuse once full.
CREATE OR REPLACE FUNCTION public.community_create_invite(p_room uuid, p_token_hash text, p_max_uses integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text;
  v_members integer;
  v_uses integer;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'community_auth_required'; END IF;
  PERFORM public.community_assert_adult();
  IF NOT EXISTS (
    SELECT 1 FROM public.community_room_members m
    WHERE m.room_id = p_room AND m.user_id = auth.uid() AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'community_owner_required';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'community_token_invalid';
  END IF;

  SELECT kind INTO v_kind FROM public.community_rooms WHERE id = p_room;
  SELECT count(*) INTO v_members FROM public.community_room_members WHERE room_id = p_room;
  IF v_kind = 'dm' AND v_members >= 2 THEN RAISE EXCEPTION 'community_room_full'; END IF;
  IF (
    SELECT count(*) FROM public.community_invites i
    WHERE i.room_id = p_room AND i.expires_at > now() AND i.used_count < i.max_uses
  ) >= 5 THEN
    RAISE EXCEPTION 'community_invite_cap';
  END IF;

  v_uses := CASE WHEN v_kind = 'dm' THEN 1 ELSE LEAST(GREATEST(COALESCE(p_max_uses, 8), 1), 32) END;

  INSERT INTO public.community_invites (room_id, created_by, token_hash, expires_at, max_uses)
  VALUES (p_room, auth.uid(), lower(p_token_hash), now() + interval '14 days', v_uses)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Join by raw token from the shared link. Hashing happens here, server-side,
-- so a leaked hash column alone never becomes a usable credential.
-- search_path is a FIXED list (not caller-controlled) because pgcrypto's
-- digest() may live in the extensions schema on Supabase.
CREATE OR REPLACE FUNCTION public.community_join(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
DECLARE
  v_hash text;
  v_invite record;
  v_kind text;
  v_members integer;
  v_cap integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'community_auth_required'; END IF;
  PERFORM public.community_assert_adult();
  IF NOT EXISTS (SELECT 1 FROM public.community_profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'community_profile_required';
  END IF;
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'community_token_invalid';
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT i.* INTO v_invite
  FROM public.community_invites i
  WHERE i.token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'community_invite_unknown'; END IF;
  IF v_invite.expires_at <= now() THEN RAISE EXCEPTION 'community_invite_expired'; END IF;

  -- Re-joining an existing room is a no-op success and burns no use.
  IF EXISTS (
    SELECT 1 FROM public.community_room_members m
    WHERE m.room_id = v_invite.room_id AND m.user_id = auth.uid()
  ) THEN
    RETURN v_invite.room_id;
  END IF;

  IF v_invite.used_count >= v_invite.max_uses THEN RAISE EXCEPTION 'community_invite_spent'; END IF;

  -- The invite creator and the joiner must not have blocked each other.
  IF EXISTS (
    SELECT 1 FROM public.community_blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = v_invite.created_by)
       OR (b.blocker_id = v_invite.created_by AND b.blocked_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'community_invite_unknown';
  END IF;

  SELECT kind INTO v_kind FROM public.community_rooms WHERE id = v_invite.room_id;
  v_cap := CASE WHEN v_kind = 'dm' THEN 2 ELSE 32 END;
  SELECT count(*) INTO v_members FROM public.community_room_members WHERE room_id = v_invite.room_id;
  IF v_members >= v_cap THEN RAISE EXCEPTION 'community_room_full'; END IF;

  INSERT INTO public.community_room_members (room_id, user_id, role)
  VALUES (v_invite.room_id, auth.uid(), 'member');

  UPDATE public.community_invites
     SET used_count = used_count + 1
   WHERE id = v_invite.id;

  RETURN v_invite.room_id;
END;
$$;

----------------------------------------------------------------------
-- Function grants (0112 lesson: REVOKE anon explicitly, every time)
----------------------------------------------------------------------

REVOKE ALL     ON FUNCTION public.community_touch_room() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_touch_room() FROM anon, authenticated;

REVOKE ALL     ON FUNCTION public.community_ensure_profile(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_ensure_profile(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.community_ensure_profile(text) TO authenticated;

REVOKE ALL     ON FUNCTION public.community_create_room(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_create_room(text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.community_create_room(text, text) TO authenticated;

REVOKE ALL     ON FUNCTION public.community_create_invite(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_create_invite(uuid, text, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.community_create_invite(uuid, text, integer) TO authenticated;

REVOKE ALL     ON FUNCTION public.community_join(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_join(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.community_join(text) TO authenticated;
