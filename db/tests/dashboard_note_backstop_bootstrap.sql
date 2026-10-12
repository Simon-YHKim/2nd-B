\set ON_ERROR_STOP on
\ir dashboard_generation_bootstrap.sql
CREATE TEMP TABLE dashboard_request_0247 AS
  SELECT pg_get_functiondef(oid) AS definition,proacl FROM pg_proc
  WHERE oid='public.dashboard_generation_request(uuid,text,text,text)'::regprocedure;
\ir ../migrations/0248_dashboard_note_backstop.sql
\ir dashboard_note_backstop_regression.sql
