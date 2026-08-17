-- 0131 -- housekeeping for the INFO advisory that 0126 introduced.

-- 0126 created public.community_rooms with a foreign key created_by -> users(id)
-- but never added a covering index, even though every other community FK got
-- one (members, messages, invites, blocks, reports). Without it, each users-row
-- delete has to seq-scan community_rooms to check the constraint, and the linter
-- flags it as unindexed_foreign_keys. Same class of fix as 0105 and 0111 did for
-- the other FKs. Idempotent, additive, no data change.
create index if not exists community_rooms_created_by_idx
  on public.community_rooms (created_by);