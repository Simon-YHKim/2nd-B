-- rollback/0223_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately.
--
-- Removes the database check only. The hub screen still refuses comms/location imports for
-- minors before it writes, and the client still writes the `import_kind` mark, which is harmless
-- without the trigger. No data is lost.

DROP TRIGGER IF EXISTS sources_minor_import_clamp ON sources;
DROP FUNCTION IF EXISTS reject_minor_locked_import_sources();
