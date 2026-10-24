// Disposable loopback clone only; never accepts a remote database URL.
// node db/tests/sources_system_tags_contract.mjs 5432 postgres t54_sources_test_ci
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [port, user, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? "") || Number(port) > 65535
  || !/^[a-z_][a-z0-9_]*$/.test(user ?? "") || !/^t54_sources_test[a-z0-9_]*$/.test(database ?? "")) {
  throw new Error("Use an explicit disposable t54_sources_test database on loopback.");
}
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(here, "../migrations/0264_sources_system_tags.sql"), "utf8");
const recordsMigration = readFileSync(resolve(here, "../migrations/0218_records_system_tags.sql"), "utf8");
const shape = migration.match(/ADD CONSTRAINT sources_system_tags_0264_expected (CHECK \([\s\S]*?\n\)) NOT VALID;/)?.[1];
const recordsShape = recordsMigration.match(/ADD CONSTRAINT records_system_tags_shape (CHECK \([\s\S]*?\n\));/)?.[1];
if (!shape || !recordsShape || shape.replace(/\s+/g, " ") !== recordsShape.replace(/\s+/g, " ")) {
  throw new Error("0264 must retain the exact 0218 marker shape");
}
const regression = readFileSync(resolve(here, "sources_system_tags_regression.sql"), "utf8")
  .replace(/^BEGIN;\r?\n/m, "").replace(/^ROLLBACK;\r?\n/m, "");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key) || key === "PGPASSWORD"));
const args = ["-X", "--no-password", "-h", "127.0.0.1", "-p", port, "-U", user,
  "-d", database, "-v", "ON_ERROR_STOP=1", "-At"];
let assertions = 0;
function execute(sql) {
  const result = spawnSync("psql", args, { input: sql, encoding: "utf8", env, windowsHide: true, timeout: 60_000 });
  if (result.error) throw result.error;
  return result;
}
function green(label, sql) {
  const result = execute(`BEGIN;\n${sql}\nROLLBACK;`);
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr}`);
  assertions++;
  console.log(`PASS ${label}`);
}
const schemaSnapshot = `SELECT jsonb_build_object(
  'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,
    pg_get_expr(d.adbin,d.adrelid),col_description(a.attrelid,a.attnum)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.sources'::regclass AND a.attnum>0 AND NOT a.attisdropped),
  'checks',(SELECT jsonb_agg(jsonb_build_array(conname,convalidated,pg_get_constraintdef(oid)) ORDER BY conname)
    FROM pg_constraint WHERE conrelid='public.sources'::regclass),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='sources'),
  'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.sources'::regclass),
  'acl',(SELECT relacl::text FROM pg_class WHERE oid='public.sources'::regclass),
  'rows',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.sources s)) AS value`;

function rejectionSql(setup, expected, candidate = migration) {
  return `${setup}
    CREATE TEMP TABLE t54_before ON COMMIT DROP AS ${schemaSnapshot};
    DO $rejection$ DECLARE caught boolean:=false; BEGIN
      BEGIN EXECUTE $candidate$${candidate}$candidate$;
      EXCEPTION WHEN OTHERS THEN
        IF position('${expected}' IN SQLERRM)=0 THEN RAISE; END IF;
        caught:=true;
      END;
      IF NOT caught THEN RAISE EXCEPTION 'expected migration rejection: ${expected}'; END IF;
    END $rejection$;
    DO $unchanged$ BEGIN
      IF (${schemaSnapshot}) IS DISTINCT FROM (SELECT value FROM t54_before) THEN
        RAISE EXCEPTION 'rejected migration changed prior schema or rows';
      END IF;
    END $unchanged$;`;
}

green("full regression", regression);
green("scratch grants enable real RLS probes and roll back to the prior ACL", `
  CREATE TEMP TABLE t54_prior_acl ON COMMIT DROP AS
    SELECT oid,relacl FROM pg_class WHERE oid IN ('public.sources'::regclass,'public.users'::regclass);
  SAVEPOINT t54_grants;
  REVOKE ALL ON public.sources, public.users FROM PUBLIC, authenticated;
  ${regression}
  ROLLBACK TO SAVEPOINT t54_grants;
  DO $acl$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_class c JOIN t54_prior_acl prior USING(oid)
      WHERE c.relacl IS DISTINCT FROM prior.relacl) THEN
      RAISE EXCEPTION 'scratch grant fixture leaked privileges';
    END IF;
  END $acl$;`);
green("reapply twice preserves every source row, policy, grant and trigger", `
  CREATE TEMP TABLE t54_before ON COMMIT DROP AS ${schemaSnapshot};
  ${migration}
  ${migration}
  DO $same$ BEGIN
    IF (${schemaSnapshot}) IS DISTINCT FROM (SELECT value FROM t54_before) THEN
      RAISE EXCEPTION 'reapply changed source state';
    END IF;
  END $same$;`);

const noColumn = "ALTER TABLE public.sources DROP COLUMN system_tags;";
const shapeDrop = "ALTER TABLE public.sources DROP CONSTRAINT sources_system_tags_shape;";
const cases = [
  ["records prerequisite", "ALTER TABLE public.records RENAME COLUMN system_tags TO t54_previous_system_tags;", "records.system_tags (0218) is required"],
  ["wrong type", `${noColumn} ALTER TABLE public.sources ADD COLUMN system_tags integer[] NOT NULL DEFAULT '{}';`, "existing sources.system_tags differs"],
  ["nullable column", "ALTER TABLE public.sources ALTER COLUMN system_tags DROP NOT NULL;", "existing sources.system_tags differs"],
  ["missing default", "ALTER TABLE public.sources ALTER COLUMN system_tags DROP DEFAULT;", "existing sources.system_tags differs"],
  ["nonempty default", "ALTER TABLE public.sources ALTER COLUMN system_tags SET DEFAULT ARRAY['memo'];", "existing sources.system_tags differs"],
  ["conflicting check", `${shapeDrop} ALTER TABLE public.sources ADD CONSTRAINT sources_system_tags_shape CHECK (true);`, "existing sources_system_tags_shape differs"],
  ["unvalidated check", `${shapeDrop} ALTER TABLE public.sources ADD CONSTRAINT sources_system_tags_shape ${shape} NOT VALID;`, "existing sources_system_tags_shape differs"],
  ["classifier trigger", `
    CREATE FUNCTION pg_temp.t54_classifier() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN NEW.system_tags:=ARRAY['memo']; RETURN NEW; END $fn$;
    CREATE TRIGGER t54_classifier BEFORE INSERT ON public.sources FOR EACH ROW EXECUTE FUNCTION pg_temp.t54_classifier();`,
    "a sources user trigger references system_tags"],
  ["records prerequisite nullable", "ALTER TABLE public.records ALTER COLUMN system_tags DROP NOT NULL;", "records.system_tags (0218) is required"],
  ["records prerequisite default", "ALTER TABLE public.records ALTER COLUMN system_tags SET DEFAULT ARRAY['memo'];", "records.system_tags (0218) is required"],
  ["records prerequisite wrong type", `ALTER TABLE public.records RENAME COLUMN system_tags TO t54_previous_system_tags;
    ALTER TABLE public.records ADD COLUMN system_tags integer[] NOT NULL DEFAULT '{}';`, "records.system_tags (0218) is required"],
  ["non-inherited check", `${shapeDrop} ALTER TABLE public.sources ADD CONSTRAINT sources_system_tags_shape ${shape} NO INHERIT;`, "existing sources_system_tags_shape differs"],
];
for (const [label, setup, expected] of cases) green(`${label} rejects and rolls back`, rejectionSql(setup, expected));

// Simulate the actual predecessor column boundary while retaining all other
// migrated objects, including sources owner RLS and profile-import guards.
green("predecessor rows retain old markers and arbitrary user tags", `${noColumn}
  INSERT INTO auth.users(id,email) VALUES('5a5a0264-0000-4000-8000-000000000003','sources-tags-old@example.invalid');
  INSERT INTO public.users(id,email,birth_date,locale)
    VALUES('5a5a0264-0000-4000-8000-000000000003','sources-tags-old@example.invalid','1990-01-01','en') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.sources(id,user_id,kind,title,storage_path,tags)
    VALUES('5a5a0264-0000-4000-8000-0000000000a3','5a5a0264-0000-4000-8000-000000000003',
      'inbox','predecessor','t54/old.md',ARRAY['memo','reasoning:ratified','NULL','a,b','"',E'\\\\','{}','한글']);
  CREATE TEMP TABLE t54_old_rows ON COMMIT DROP AS SELECT id,to_jsonb(s) value FROM public.sources s;
  ${migration}
  DO $old$ BEGIN
    IF EXISTS(SELECT 1 FROM public.sources s JOIN t54_old_rows old USING(id)
      WHERE to_jsonb(s)-'system_tags' IS DISTINCT FROM old.value OR s.system_tags IS DISTINCT FROM '{}'::text[]) THEN
      RAISE EXCEPTION 'predecessor rows changed';
    END IF;
  END $old$;`);

// Managed-import guards must continue rejecting direct ratification. This uses
// the real numbered trigger from the all-migrations clone, never a new guard.
green("managed import rejects direct marker update", `
  INSERT INTO auth.users(id,email) VALUES('5a5a0264-0000-4000-8000-000000000004','sources-tags-managed@example.invalid');
  INSERT INTO public.users(id,email,birth_date,locale)
    VALUES('5a5a0264-0000-4000-8000-000000000004','sources-tags-managed@example.invalid','1990-01-01','en') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.sources(id,user_id,kind,title,storage_path,frontmatter)
    VALUES('5a5a0264-0000-4000-8000-0000000000a4','5a5a0264-0000-4000-8000-000000000004',
      'inbox','managed','t54/managed.md','{"profile_context_no_expansion":true}');
  -- Match the regression fixture's scratch-only table rights. This transaction
  -- rolls them back, and the existing managed-import trigger must still refuse.
  GRANT SELECT, UPDATE ON public.sources TO authenticated;
  GRANT SELECT ON public.users TO authenticated;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub','5a5a0264-0000-4000-8000-000000000004',true);
  DO $managed$ BEGIN
    BEGIN
      UPDATE public.sources SET system_tags=ARRAY['reasoning:ratified'] WHERE id='5a5a0264-0000-4000-8000-0000000000a4';
      RAISE EXCEPTION 'managed source accepted direct ratification';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM<>'profile_import_use_batch_operation' THEN RAISE; END IF;
    END;
  END $managed$;
  RESET ROLE;`);

const mutations = [
  ["remove records prerequisite", migration.replace(/IF NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_attribute[\s\S]*?END IF;/, ""),
    (sql) => rejectionSql(cases[0][1], cases[0][2], sql)],
  ["remove trigger postcondition", migration.replace(/IF EXISTS \(\s*SELECT 1 FROM pg_catalog\.pg_trigger[\s\S]*?END IF;/, ""),
    (sql) => rejectionSql(cases[7][1], cases[7][2], sql)],
  ["allow 17 markers", migration.replace("cardinality(system_tags) > 16", "cardinality(system_tags) > 17")],
  ["allow domain markers", migration.replace("WHEN lower(array_to_string(system_tags, ',')) ~ '(^|,)domain:' THEN false", "")],
  ["allow NULL elements", migration.replace("WHEN array_position(system_tags, NULL) IS NOT NULL THEN false", "WHEN array_position(system_tags, NULL) IS NOT NULL THEN true")],
  ["remove owner RLS", `${migration}\nALTER TABLE public.sources DISABLE ROW LEVEL SECURITY;`],
  ["bypass minor import trigger", `${migration}
    CREATE OR REPLACE FUNCTION public.reject_minor_locked_import_sources() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public AS $bypass$ BEGIN RETURN NEW; END $bypass$;`],
];
let killed = 0;
for (const [label, candidate, test] of mutations) {
  if (candidate === migration) throw new Error(`Mutation did not edit SQL: ${label}`);
  const sql = test ? test(candidate) : `${noColumn}\n${candidate}\n${regression}`;
  const result = execute(`BEGIN;\n${sql}\nROLLBACK;`);
  if (result.status === 0) throw new Error(`Mutation survived: ${label}`);
  if (!/expected migration rejection|shape accepted|cross-owner update escaped RLS|minor source update escaped import lock/.test(result.stderr)) {
    throw new Error(`Mutation failed for an unrelated reason (${label}): ${result.stderr}`);
  }
  killed++;
  console.log(`KILLED ${label}`);
}
const scratchGrants = [
  ["sources", "GRANT SELECT, UPDATE ON public.sources TO authenticated;"],
  ["users", "GRANT SELECT ON public.users TO authenticated;"],
];
for (const [table, grant] of scratchGrants) {
  const missingFixtureGrant = regression.replace(grant, "");
  if (missingFixtureGrant === regression) throw new Error(`Scratch-grant mutation did not edit ${table}`);
  const fixtureMutation = execute(`BEGIN;
    REVOKE ALL ON public.sources, public.users FROM PUBLIC, authenticated;
    ${missingFixtureGrant}
    ROLLBACK;`);
  if (fixtureMutation.status === 0 || !fixtureMutation.stderr.includes(`permission denied for table ${table}`)) {
    throw new Error(`Scratch-grant mutation survived or failed for another reason (${table}): ${fixtureMutation.stderr}`);
  }
  killed++;
  console.log(`KILLED remove scratch ${table} grants`);
}
console.log(`PASS T54 SQL: ${assertions} contracts; ${killed}/${mutations.length + scratchGrants.length} mutations killed`);
