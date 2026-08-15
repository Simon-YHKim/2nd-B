-- 0110 -- two independent fixes, both "the DB had no backstop for a race the
-- application layer assumed away".

-- (a) peer-respond read invite.status='pending', then inserted a consent row and
-- an observation row, then set status='accepted' as the LAST statement. Classic
-- read-check-write with no row lock and no uniqueness backstop: two submissions
-- of the same invite token in flight together both see 'pending', both pass the
-- check, and both insert. The subject's T5 aggregate then counts one informant
-- twice, which is a scientific-validity defect, not just a duplicate row.
-- Verified 0 existing duplicates and 0 null invitation_ids before adding these.
alter table public.peer_observations
  add constraint peer_observations_invitation_uq unique (invitation_id);

alter table public.informant_consents
  add constraint informant_consents_invitation_uq unique (invitation_id);

comment on constraint peer_observations_invitation_uq on public.peer_observations is
  'One observation per invitation. Backstop for the read-check-write race in the peer-respond edge function: a concurrent double submit now fails the second insert instead of double-counting an informant.';

-- Atomic claim helper so the application can stop relying on read-then-write.
-- Returns true only for the caller that actually moved the invitation out of
-- 'pending' inside this statement; every concurrent loser gets false.
create or replace function public.claim_peer_invitation(p_invitation_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    update public.peer_invitations
       set status = 'accepted', responded_at = now()
     where id = p_invitation_id
       and status = 'pending'
       and (expires_at is null or expires_at > now())
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_peer_invitation(uuid) from public;
revoke all on function public.claim_peer_invitation(uuid) from anon;
revoke all on function public.claim_peer_invitation(uuid) from authenticated;

-- (b) The LLM proxies bump gemini_spend_daily BEFORE the upstream call and never
-- give it back. Every upstream_unreachable / upstream_error / 429 / malformed
-- payload therefore burns a unit of the user's daily cap for an answer they
-- never received. During a vendor outage a free user can exhaust all 200 calls
-- without one successful response. The reasoning ledger already had
-- refund_reasoning_spend for exactly this; the call ledger never got its twin.
create or replace function public.refund_gemini_spend(p_user_id uuid, p_day date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  v_calls int;
BEGIN
  UPDATE public.gemini_spend_daily
     SET calls = greatest(calls - 1, 0), updated_at = now()
   WHERE user_id = p_user_id AND day = p_day
  RETURNING calls INTO v_calls;
  RETURN coalesce(v_calls, 0);
END;
$$;

comment on function public.refund_gemini_spend(uuid, date) is
  'Give back one unit of the daily call allowance when the upstream call produced nothing billable. Floors at 0 so repeated refunds cannot mint allowance. service_role only.';

revoke all on function public.refund_gemini_spend(uuid, date) from public;
revoke all on function public.refund_gemini_spend(uuid, date) from anon;
revoke all on function public.refund_gemini_spend(uuid, date) from authenticated;
