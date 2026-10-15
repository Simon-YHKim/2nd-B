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
const AVATAR_DRAFT = read("db/migrations/0206_users_avatar_spec.sql");
const AVATAR_EXEC = AVATAR_DRAFT.replace(/^\s*--.*$/gm, "");
const DISPLAY_NAME_DRAFT = read("db/migrations/0207_users_display_name_update.sql");
const DISPLAY_NAME_EXEC = DISPLAY_NAME_DRAFT.replace(/^\s*--.*$/gm, "");
// 0231 (Simon 2026-10-07): the status message column (0230 chat_name, renamed) and its authenticated UPDATE grant.
const CHAT_NAME_EXEC = read("db/migrations/0231_status_message.sql").replace(/^\s*--.*$/gm, "");
const PROFILE_IMPORT_EXEC = read("db/migrations/0239_profile_context_import.sql")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
// 0140's historical grant remains, but 0239 rejects changed direct writes and
// requires the revision RPC. This is the only reviewed grant outside the census.
const TRIGGER_GUARDED_LEGACY_UPDATES = ["profile_details"];

/** Columns named inside a GRANT <verb> (...) on public.users. */
function grantedColumns(verb: "INSERT" | "UPDATE"): string[] {
  const m = EXEC.match(new RegExp(`GRANT ${verb} \\(([^)]*)\\) ON public\\.users`));
  if (!m) throw new Error(`0140 has no GRANT ${verb} (...) on public.users`);
  return m[1].split(",").map((c) => c.trim()).sort();
}

function effectiveGrantedColumns(verb: "INSERT" | "UPDATE"): string[] {
  const granted = new Set(grantedColumns(verb));
  if (verb === "UPDATE") {
    const match = AVATAR_EXEC.match(/GRANT UPDATE \(([^)]*)\) ON public\.users TO authenticated;/);
    if (!match) throw new Error("avatar draft has no authenticated UPDATE grant");
    for (const column of match[1].split(",")) granted.add(column.trim());
    const nameMatch = DISPLAY_NAME_EXEC.match(/GRANT UPDATE \(([^)]*)\) ON public\.users TO authenticated;/);
    if (!nameMatch) throw new Error("display name draft has no authenticated UPDATE grant");
    for (const column of nameMatch[1].split(",")) granted.add(column.trim());
    const chatMatch = CHAT_NAME_EXEC.match(/GRANT UPDATE \(([^)]*)\) ON public\.users TO authenticated;/);
    if (!chatMatch) throw new Error("0231 has no authenticated UPDATE grant");
    for (const column of chatMatch[1].split(",")) granted.add(column.trim());
  }
  return [...granted].sort();
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

describe("the grants cover client writes and the one guarded legacy column", () => {
  test("the scan found something (a silent zero would pass everything below)", () => {
    expect(C.insert.size).toBeGreaterThan(0);
    expect(C.update.size).toBeGreaterThan(0);
  });

  test("every column the client INSERTs is granted", () => {
    // Missing one here = every new OAuth sign-up fails.
    expect(effectiveGrantedColumns("INSERT")).toEqual([...C.insert].sort());
  });

  test("every column the client UPDATEs is granted", () => {
    // Missing one here = a settings screen that silently cannot save.
    expect(effectiveGrantedColumns("UPDATE")).toEqual([...C.update, ...TRIGGER_GUARDED_LEGACY_UPDATES].sort());
  });

  test("the only granted column absent from client writes is the guarded legacy profile column", () => {
    // The other direction matters just as much: a column granted "just in
    // case" is the table-level grant creeping back one name at a time.
    for (const col of effectiveGrantedColumns("INSERT")) expect([...C.insert]).toContain(col);
    expect(effectiveGrantedColumns("UPDATE").filter((col) => !C.update.has(col)))
      .toEqual(TRIGGER_GUARDED_LEGACY_UPDATES);
    expect(TRIGGER_GUARDED_LEGACY_UPDATES).toEqual(["profile_details"]);
  });

  test("the legacy grant cannot bypass the revision RPC's direct-write guard", () => {
    const guard = PROFILE_IMPORT_EXEC.match(/CREATE FUNCTION public\.bump_profile_details_revision\(\) RETURNS trigger([\s\S]*?)END \$\$;/)?.[1];
    expect(guard).toBeDefined();
    // current_user must remain the caller here, including an old authenticated
    // client. A SECURITY DEFINER trigger would turn this role check into a bypass.
    expect(guard).not.toMatch(/SECURITY DEFINER/);
    expect(guard).toMatch(/IF TG_OP='UPDATE' AND current_user IN \('authenticated','anon'\)\s+AND NEW\.profile_details IS DISTINCT FROM OLD\.profile_details THEN\s+RAISE EXCEPTION 'profile_details_use_revision_rpc' USING ERRCODE='42501'; END IF;/);
    expect(PROFILE_IMPORT_EXEC).toMatch(/CREATE TRIGGER profile_details_revision_writer\s+BEFORE INSERT OR UPDATE OF profile_details,profile_details_revision ON public\.users\s+FOR EACH ROW EXECUTE FUNCTION public\.bump_profile_details_revision\(\);/);
    expect(PROFILE_IMPORT_EXEC).not.toMatch(/GRANT UPDATE[^;]*profile_details_revision[^;]*TO (?:anon|authenticated)/);
  });

  test("judge_mode is granted nowhere", () => {
    // The whole point. judge_mode = true is the top paid tier through
    // effective_subscription_tier(), and this is what finally holds it with a
    // privilege instead of a trigger.
    expect(grantedColumns("INSERT")).not.toContain("judge_mode");
    expect(grantedColumns("UPDATE")).not.toContain("judge_mode");
    expect([...C.insert, ...C.update]).not.toContain("judge_mode");
    expect(DISPLAY_NAME_EXEC).not.toMatch(/GRANT UPDATE\s+ON public\.users/);
    expect(DISPLAY_NAME_EXEC).not.toMatch(/GRANT UPDATE[^;]*TO anon/);
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
