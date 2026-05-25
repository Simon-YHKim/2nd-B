-- 0001_extensions.sql
-- Enables Postgres extensions used by subsequent migrations.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";      -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- text search on knowledge_sources
