-- 0147: make manual relation-person saves converge after an ambiguous timeout.
--
-- A native/web request can reach Postgres and still time out before the client
-- receives the response. The add-person UI deliberately retries with the same
-- row id; this monotonic revision lets a later retry win without allowing a
-- late, older request to overwrite it. Existing clients omit the column and
-- therefore keep the backwards-compatible revision 0 default.

ALTER TABLE public.relation_people
  ADD COLUMN IF NOT EXISTS client_revision int NOT NULL DEFAULT 0;
