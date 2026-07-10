-- 0081_peer_review_dedup.sql
-- Wave-3 audit (concurrency): the peer-respond 'submit' path is a non-atomic
-- check-then-insert with no unique constraint. Two concurrent POSTs for one
-- invitation (informant double-tap, or a browser/network retry of a slow request)
-- both pass the status='pending' guard before either writes, so each inserts an
-- informant_consents + peer_observations row. The aggregate (t5_seen_aggregate,
-- 0064) counts BOTH live rows, double-weighting a single informant's ratings.
--
-- Fix: a partial UNIQUE on invitation_id (active rows only) makes the SECOND
-- insert fail with 23505, so at most one active consent + observation exists per
-- invitation. The consent insert runs first in the edge function, so the loser
-- 23505s there and never reaches the observation insert -> no duplicate, and the
-- existing retry-on-failure flow is preserved (a serialized retry now correctly
-- 409s on status). WHERE withdrawn_at IS NULL keeps a withdrawn row from blocking
-- a hypothetical future re-consent (today a withdrawn invitation is status-gated
-- anyway).

CREATE UNIQUE INDEX IF NOT EXISTS informant_consents_invitation_uniq
  ON public.informant_consents (invitation_id)
  WHERE withdrawn_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS peer_observations_invitation_uniq
  ON public.peer_observations (invitation_id)
  WHERE withdrawn_at IS NULL;
