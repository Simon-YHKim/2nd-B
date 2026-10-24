-- T39 E1-S rollback. Switch callers to legacy and drain enforce requests FIRST.
-- Apply as one transaction; no CASCADE, data deletion, refund or slot reset.
-- Previously committed registrations/quota remain facts. 0255 and 0259 stay usable.
-- Number this rollback together with its forward draft at Relay rollout.
DROP FUNCTION IF EXISTS public.begin_chat_turn_attempt_with_quota(uuid, uuid, uuid, text, text);
