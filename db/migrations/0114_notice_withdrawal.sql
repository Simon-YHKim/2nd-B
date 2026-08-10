-- 0114_notice_withdrawal.sql
-- Retracting a published notice, without destroying the record of when it was
-- published.
--
-- 0113 shipped no withdrawal mechanism, so docs/OPERATIONS-NOTICES.md told
-- operators to push published_at 100 years into the future. That does hide the
-- row, because the read policy is `published_at <= now()`, but it costs three
-- things:
--
--   * It overwrites the only record of when the notice actually went out.
--     Restoring it then means inventing a date, and the archive re-orders
--     itself around the invented one.
--   * A retracted notice becomes indistinguishable from a SCHEDULED one. Both
--     read as "published_at in the future", so the operator's "what is queued?"
--     query returns withdrawn incidents mixed in with real upcoming
--     announcements - and the obvious fix (bump the date again) silently
--     un-retracts nothing while looking like it did.
--   * It is a magic number. Nothing in the schema says that 100 years means
--     retracted, so it survives only as long as somebody remembers to say so.
--
-- withdrawn_at states the fact instead. NULL = live. Setting it hides the row
-- from every client on their next fetch; setting it back to NULL restores the
-- notice with its original published_at intact.
--
-- Shape notes:
--   * The gate is the READ POLICY, not the client. That is what lets this
--     migration stand alone: builds already in users' hands respect a
--     withdrawal the moment this is applied, with no app release and no store
--     submission, which is the entire point of the notices feature. Nothing in
--     src/lib/notices/ needs to change, and deliberately does not - adding
--     `withdrawn_at` to the client's explicit column list would make every
--     already-shipped build fail its SELECT with 42703 against an environment
--     where this migration has not landed yet, and fetchNotices() fails soft,
--     so the visible result would be every notice disappearing at once.
--   * Read receipts are untouched. They are append-only by design (0113), and
--     a user who read a notice before it was retracted did read it. If the same
--     content has to go out again it is a NEW notice, which is already what the
--     runbook says about edits.
--   * No new index. The predicate rides on the existing notices_published_at_idx
--     scan and this table holds announcements, not events - a partial index
--     would cost more to maintain than the sequential filter it saves.
--
-- Idempotent, forward-only. Safe to re-apply.

----------------------------------------------------------------------
-- Column
----------------------------------------------------------------------

ALTER TABLE public.notices
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

COMMENT ON COLUMN public.notices.withdrawn_at IS
  'NULL = live. Set to retract a published notice while keeping published_at; set back to NULL to restore it. Enforced by the notices_published_select policy, not by the client.';

----------------------------------------------------------------------
-- Read policy
--   DROP/CREATE rather than edited in place: Postgres has no
--   ALTER POLICY ... ADD, and 0113's policy text is pinned verbatim by
--   src/lib/notices/__tests__/notices-migration.test.ts, which must keep
--   passing against 0113's own file.
--
--   Still TO authenticated, still no INSERT/UPDATE/DELETE policy, so writes
--   from a client stay rejected regardless of grants and anon still holds
--   neither policy nor grant.
----------------------------------------------------------------------

DROP POLICY IF EXISTS notices_published_select ON notices;
CREATE POLICY notices_published_select ON notices
  FOR SELECT TO authenticated
  USING (published_at <= now() AND withdrawn_at IS NULL);
