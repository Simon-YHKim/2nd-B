-- Close the subscription_event_at self-insert gap.
-- block_self_tier_insert() resets tier/expires/provider/xp but not
-- subscription_event_at, so a non-service_role caller inserting its own
-- public.users row under users_self_insert can seed an arbitrary future
-- timestamp. Every later genuine Paddle event then fails 0109's ordering
-- predicate and is dropped as stale, leaving a paying user on free.
create or replace function public.block_self_tier_insert()
returns trigger language plpgsql set search_path to '' as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
  new.subscription_tier := 'free';
  new.subscription_expires_at := null;
  new.subscription_provider := null;
  new.subscription_event_at := null;
  new.total_xp := 0;
  new.onboarding_quest_completed_at := null;
  return new;
end;
$$;
