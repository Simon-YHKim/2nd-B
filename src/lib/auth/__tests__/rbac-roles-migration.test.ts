// 0139: roles exist, the claim is issued, one guard reads it (REQ-260821-02).
//
// Simon confirmed D-1..D-4 as recommended on 2026-08-21. Each answer has a
// consequence in the SQL, and each consequence is checked here, because the
// answers are the kind of thing a later edit erodes by accident rather than on
// purpose. D-1 in particular is a property of what is ABSENT from the file.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const SQL = readFileSync(join(process.cwd(), "db/migrations/0139_rbac_roles.sql"), "utf8").split(CR).join("");
const EXEC = SQL.replace(/^\s*--.*$/gm, "");

describe("D-4: three roles, enforced by the schema", () => {
  test("the CHECK names exactly admin, developer, support", () => {
    expect(EXEC).toMatch(/CHECK \(role IN \('admin', 'developer', 'support'\)\)/);
  });

  test("multiple roles per person are possible", () => {
    // PRIMARY KEY (user_id, role), not a unique user_id. Someone can be both
    // developer and support without a second table or a delimited string.
    expect(EXEC).toMatch(/PRIMARY KEY \(user_id, role\)/);
  });

  test("who granted it and when is recorded", () => {
    expect(EXEC).toMatch(/granted_by uuid/);
    expect(EXEC).toMatch(/granted_at timestamptz NOT NULL DEFAULT now\(\)/);
  });
});

describe("D-1: a role does not open other people's data", () => {
  test("no policy in this file reads any table but user_roles", () => {
    // The strongest form of D-1 available to a structural test: the migration
    // creates policies on exactly one table, and that table holds no personal
    // data. An admin gaining read access to records would have to be a
    // different migration, which is where it would be noticed.
    const policyTargets = [...EXEC.matchAll(/CREATE POLICY \w+ ON (public\.\w+)/g)].map((m) => m[1]);
    expect(policyTargets.length).toBeGreaterThan(0);
    expect([...new Set(policyTargets)]).toEqual(["public.user_roles"]);
  });

  test("RLS is on", () => {
    expect(EXEC).toMatch(/ALTER TABLE public\.user_roles ENABLE ROW LEVEL SECURITY/);
  });

  test("clients cannot write roles at all", () => {
    // No INSERT/UPDATE/DELETE policy means the write is refused regardless of
    // grants. Granting a role should leave a deliberate trace.
    expect(EXEC).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE)/);
    expect(EXEC).toMatch(/REVOKE ALL ON TABLE public\.user_roles FROM anon;/);
  });
});

describe("D-2: grant by claim, revoke immediately where it matters", () => {
  test("two functions, not one", () => {
    expect(EXEC).toMatch(/FUNCTION public\.has_app_role\(p_role text\)/);
    expect(EXEC).toMatch(/FUNCTION public\.has_app_role_now\(p_role text\)/);
  });

  test("the fast one reads only the claim", () => {
    const fast = EXEC.slice(
      EXEC.indexOf("FUNCTION public.has_app_role(p_role text)"),
      EXEC.indexOf("FUNCTION public.has_app_role_now"),
    );
    expect(fast).toContain("request.jwt.claims");
    expect(fast).not.toContain("FROM public.user_roles");
  });

  test("the immediate one confirms against the table", () => {
    const now = EXEC.slice(EXEC.indexOf("FUNCTION public.has_app_role_now(p_role text)"));
    expect(now).toContain("public.has_app_role(p_role)");
    expect(now).toMatch(/EXISTS \(\s*SELECT 1 FROM public\.user_roles/);
  });

  test("the admin policy uses the immediate one", () => {
    // Revoking someone's admin should stop them reading the role table in the
    // same second, not at token expiry.
    expect(EXEC).toMatch(/CREATE POLICY user_roles_select_admin[\s\S]*?USING \(public\.has_app_role_now\('admin'\)\)/);
  });
});

describe("the claim actually gets issued", () => {
  test("the hook writes app_roles", () => {
    expect(EXEC).toMatch(/FUNCTION public\.custom_access_token_hook\(event jsonb\)/);
    expect(EXEC).toMatch(/jsonb_set\(v_claims, '\{app_roles\}'/);
  });

  test("the hook can read past RLS", () => {
    // Without a policy for supabase_auth_admin the hook returns an empty array
    // for everyone: the mechanism looks wired and grants nothing.
    expect(EXEC).toMatch(/CREATE POLICY user_roles_select_auth_admin ON public\.user_roles\s*\n\s*FOR SELECT TO supabase_auth_admin/);
    expect(EXEC).toMatch(/GRANT  EXECUTE ON FUNCTION public\.custom_access_token_hook\(jsonb\) TO supabase_auth_admin;/);
  });

  test("the claim is always written, even when empty", () => {
    // Lets an operator tell "no roles" from "hook not registered" by looking
    // at a token.
    expect(EXEC).toMatch(/COALESCE\(v_roles, ARRAY\[\]::text\[\]\)/);
  });

  test("nobody but the auth admin can call the hook", () => {
    expect(EXEC).toMatch(/REVOKE EXECUTE ON FUNCTION public\.custom_access_token_hook\(jsonb\) FROM anon;/);
    expect(EXEC).toMatch(/REVOKE EXECUTE ON FUNCTION public\.custom_access_token_hook\(jsonb\) FROM authenticated;/);
  });
});

describe("the INSERT path 0138 leaves open", () => {
  test("a BEFORE INSERT guard exists", () => {
    // 0138's guard is BEFORE UPDATE only, because an UPDATE has an OLD row to
    // restore and an INSERT does not. The client does send judge_mode on
    // sign-up, so without this a crafted request is comped on its first call.
    expect(EXEC).toMatch(/CREATE TRIGGER trg_users_enforce_judge_insert\s*\n\s*BEFORE INSERT ON public\.users/);
    expect(EXEC).toContain("NEW.judge_mode := false;");
  });

  test("it passes service_role and no-JWT paths", () => {
    // Same 42501 trap as everywhere else: pg_cron, psql and migrations have no
    // role claim and must not be blocked.
    const fn = EXEC.slice(EXEC.indexOf("FUNCTION public.enforce_judge_mode_insert()"));
    expect(fn).toMatch(/v_role = 'service_role' OR v_role IS NULL[\s\S]{0,60}RETURN NEW/);
  });

  test("it corrects rather than rejects", () => {
    // Raising would fail the sign-up itself, and a refused comp should not
    // cost someone their account.
    const fn = EXEC.slice(EXEC.indexOf("FUNCTION public.enforce_judge_mode_insert()"));
    expect(fn).not.toMatch(/RAISE\s+EXCEPTION/);
  });
});

describe("grant hygiene", () => {
  test("every new function names anon in its REVOKE", () => {
    // Supabase auto-grants EXECUTE to PUBLIC, which includes anon. REVOKE FROM
    // PUBLIC alone does not remove the anon grant.
    for (const fn of ["has_app_role(text)", "has_app_role_now(text)", "custom_access_token_hook(jsonb)"]) {
      expect(EXEC).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn} FROM anon;`);
    }
  });

  test("search_path is pinned on every function", () => {
    const defs = [...EXEC.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]);
    expect(defs.length).toBeGreaterThanOrEqual(4);
    for (const name of defs) {
      const body = EXEC.slice(EXEC.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`));
      expect(body.slice(0, 600)).toMatch(/SET search_path = ''/);
    }
  });

  test("grants sit at the end of the file", () => {
    // check:definer-grants Rule A matches across statement boundaries without
    // stripping comments, so a GRANT followed by prose is a false positive.
    const firstGrant = EXEC.search(/^(GRANT|REVOKE)/m);
    const lastDdl = Math.max(EXEC.lastIndexOf("CREATE POLICY"), EXEC.lastIndexOf("CREATE TRIGGER"));
    expect(firstGrant).toBeGreaterThan(lastDdl);
  });
});
