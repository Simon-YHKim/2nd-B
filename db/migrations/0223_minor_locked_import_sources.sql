-- 0223_minor_locked_import_sources.sql
-- H1 (재설계 통합 회신 v2, Simon 확인 2026-10-07 01:20): the comms/location import lock for
-- minors has a server backstop on relation_people (0094) but not on the summary note the same
-- imports land in `sources`. KakaoTalk, SMS and Google Takeout location imports write one
-- `self_knowledge` source per ratify (src/screens/deepspace/import/ImportHubScreen.tsx ratify →
-- captureFromMarkdown). The hub checks the age before that write; this adds the database check.
--
-- How a row is recognised: src/lib/import/proposals.ts marks those three kinds in the note's
-- frontmatter as `import_kind: kakao | sms | takeout-location`, and captureFromMarkdown keeps
-- the frontmatter in sources.frontmatter (jsonb). The clamp keys off that mark and off
-- users.minor_tier, which 0030/0033/0038 derive from birth_date on the server.
--
-- What this does and does not stop (same posture as 0094): it stops an honest client that loses
-- its own age check, for example a new import path that forgets the hub's lock. A tampered
-- client can drop the mark, and nothing on the server can tell a typed note about places from
-- an import. Unknown age counts as locked (minor_tier IS DISTINCT FROM 'adult'), as the hub does.
--
-- Invoker rights are enough: the trigger reads only the writer's own users row, which the
-- own-row SELECT policy already allows. Additive and idempotent. No existing row carries the
-- mark (the mark starts with this change), so nothing already stored is affected.

CREATE OR REPLACE FUNCTION reject_minor_locked_import_sources() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(NEW.frontmatter) = 'object'
     AND NEW.frontmatter ->> 'import_kind' IN ('kakao', 'sms', 'takeout-location')
     AND EXISTS (
       SELECT 1 FROM users u
       WHERE u.id = NEW.user_id
         AND u.minor_tier IS DISTINCT FROM 'adult'
     )
  THEN
    RAISE EXCEPTION 'minor_import_locked: comms and location imports are locked for minor accounts'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sources_minor_import_clamp ON sources;
CREATE TRIGGER sources_minor_import_clamp
  BEFORE INSERT OR UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION reject_minor_locked_import_sources();
