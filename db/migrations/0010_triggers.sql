-- 0010_triggers.sql
-- C6 second line of defense: auto_judge_mode trigger sets users.judge_mode
-- from the email domain at insert time. If the client-side computed value
-- disagrees with the trigger, the trigger wins.
-- Also installs the standard updated_at maintainer.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- C6: judge mode auto-flag. Keep the domain list in sync with
-- src/lib/judge/domains.ts (single human-curated source).
CREATE OR REPLACE FUNCTION auto_judge_mode() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.judge_mode := lower(split_part(NEW.email, '@', 2)) = ANY (
    ARRAY['xprize.org', 'devpost.com', 'hacker.fund']
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_auto_judge
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION auto_judge_mode();
