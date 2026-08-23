// 0140: the table-level grant comes off public.users.
//
// This is the migration that makes 0138's column REVOKE mean something. Until
// now anon and authenticated held arwdDxtm on that table - DELETE and TRUNCATE
// included - and a column-level REVOKE cannot cut a table-level GRANT, so
// judge_mode was held by a trigger rather than by a privilege.
//
// The failure mode this file guards is specific and expensive: the GRANT lists
// are the only thing standing between "the client can still save a profile"
// and a sign-up outage. If the app grows a write these lists do not cover, the
// symptom is a save that fails for everyone, in production, after a migration
// that looked like a cleanup. So the lists are checked against the SOURCE SCAN
// rather than against a copy of themselves.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const SQL = read("db/migrations/0140_users_table_acl.sql");
const EXEC = SQL.replace(/^\s*--.*$/gm, "");

/** Columns named inside a GRANT <verb> (...) on public.users. */
function grantedColumns(verb: "INSERT" | "UPDATE"): string[] {
  const m = EXEC.match(new RegExp(`GRANT ${verb} \\(([^)]*)\\) ON public\\.users`));
  if (!m) throw new Error(`0140 has no GRANT ${verb} (...) on public.users`);
  return m[1].split(",").map((c) => c.trim()).sort();
}

// The same scan users-write-census.test.ts performs, kept here so this file can
// fail on its own terms: a migration whose grants disagree with the code is a
// production outage, and it must not depend on another suite running first.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function objectKeys(src: string, open: number): string[] {
  let depth = 0;
  let i = open;
  let segmentStart = -1;
  for (; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      if (depth === 1) segmentStart = i + 1;
    } else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || segmentStart < 0) throw new Error("unbalanced object literal");
  const body = src.slice(segmentStart, i);
  const keys: string[] = [];
  let d = 0;
  let token = "";
  for (const ch of body) {
    if (ch === "{" || ch === "[" || ch === "(") d++;
    else if (ch === "}" || ch === "]" || ch === ")") d--;
    if (d === 0 && ch === ",") { token = ""; continue; }
    if (d === 0 && ch === ":" && token.trim()) { keys.push(token.trim()); token = ""; continue; }
    if (d === 0) token += ch;
  }
  return keys.filter((k) => /^[a-z_][a-z0-9_]*$/i.test(k));
}

function census(): { insert: Set<string>; update: Set<string>; deletes: string[] } {
  const result = { insert: new Set<string>(), update: new Set<string>(), deletes: [] as string[] };
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8").split(CR).join("");
    let from = src.indexOf('from("users")');
    while (from !== -1) {
      const window = src.slice(from, from + 400);
      const m = window.match(/\.(insert|update|upsert|delete)\s*\(/);
      if (m && m.index !== undefined) {
        if (m[1] === "delete") result.deletes.push(file.slice(ROOT.length + 1));
        else {
          const open = src.indexOf("{", from + m.index);
          for (const k of objectKeys(src, open)) {
            (m[1] === "update" ? result.update : result.insert).add(k);
          }
        }
      }
      from = src.indexOf('from("users")', from + 1);
    }
  }
  return result;
}

const C = census();

describe("the grants cover exactly what the client writes", () => {
  test("the scan found something (a silent zero would pass everything below)", () => {
    expect(C.insert.size).toBeGreaterThan(0);
    expect(C.update.size).toBeGreaterThan(0);
  });

  test("every column the client INSERTs is granted", () => {
    // Missing one here = every new OAuth sign-up fails.
    expect(grantedColumns("INSERT")).toEqual([...C.insert].sort());
  });

  test("every column the client UPDATEs is granted", () => {
    // Missing one here = a settings screen that silently cannot save.
    expect(grantedColumns("UPDATE")).toEqual([...C.update].sort());
  });

  test("nothing granted that the client does not write", () => {
    // The other direction matters just as much: a column granted "just in
    // case" is the table-level grant creeping back one name at a time.
    for (const col of grantedColumns("INSERT")) expect([...C.insert]).toContain(col);
    for (const col of grantedColumns("UPDATE")) expect([...C.update]).toContain(col);
  });

  test("judge_mode is granted nowhere", () => {
    // The whole point. judge_mode = true is the top paid tier through
    // effective_subscription_tier(), and this is what finally holds it with a
    // privilege instead of a trigger.
    expect(grantedColumns("INSERT")).not.toContain("judge_mode");
    expect(grantedColumns("UPDATE")).not.toContain("judge_mode");
    expect([...C.insert, ...C.update]).not.toContain("judge_mode");
  });

  test("no client DELETE exists, and DELETE is revoked", () => {
    expect(C.deletes).toEqual([]);
    expect(EXEC).toMatch(/REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.users FROM anon, authenticated;/);
  });
});

describe("the roles are split the way the dry run measured", () => {
  test("only authenticated gets write columns back", () => {
    // Measured on production 2026-08-23: email sign-up inserts from a
    // SECURITY DEFINER trigger owned by postgres, and OAuth sign-up carries a
    // session. There is no anon write path to preserve.
    for (const verb of ["INSERT", "UPDATE"] as const) {
      const m = EXEC.match(new RegExp(`GRANT ${verb} \\([^)]*\\) ON public\\.users TO (\\w+);`));
      expect(m?.[1]).toBe("authenticated");
    }
    expect(EXEC).not.toMatch(/GRANT (INSERT|UPDATE)[^;]*TO anon/);
  });

  test("service_role is left whole", () => {
    // Webhooks, the sign-up trigger's owner path and every definer function
    // reach this table as service_role or postgres.
    expect(EXEC).toMatch(/GRANT ALL ON TABLE public\.users TO service_role;/);
  });

  test("SELECT is deliberately untouched", () => {
    // RLS governs which rows come back. Narrowing reads is a different
    // decision and belongs with whoever defines what a support role may see.
    expect(EXEC).not.toMatch(/REVOKE[^;]*SELECT[^;]*ON public\.users/);
  });
});

describe("the trap that only shows up later", () => {
  test("the SECURITY DEFINER dependency is written down", () => {
    // supabase_auth_admin comes out of this with no INSERT, which is fine ONLY
    // because the sign-up trigger runs as its definer owner. Someone flipping
    // that function to SECURITY INVOKER breaks sign-up, and the error will
    // point at the trigger rather than at this migration.
    expect(SQL).toContain("SECURITY INVOKER");
    expect(SQL).toMatch(/sign-up breaks/);
  });

  test("0138's triggers are not removed by this migration", () => {
    // They become belt-and-suspenders here, not redundant. A column that
    // grants the top paid tier is worth more than one belt.
    expect(EXEC).not.toMatch(/DROP TRIGGER/);
    expect(EXEC).not.toMatch(/DROP FUNCTION/);
  });
});
