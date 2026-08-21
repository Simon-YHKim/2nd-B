// The census behind the users table ACL surgery (REQ-260821-02).
//
// WHY THIS EXISTS. anon and authenticated hold table-level arwdDxtm on
// public.users (measured on production 2026-08-21). That is what made 0138's
// column-level REVOKE inert, and it leaves DELETE and TRUNCATE standing behind
// RLS alone. The fix is to revoke the table grant and re-grant exactly the
// columns the client legitimately writes.
//
// That fix is only safe if the column list is right, and a list written once in
// a migration comment rots the moment someone adds a field. So the list lives
// here, derived from the source, and the migration quotes it. Add a new write
// to public.users without updating both and this fails.
//
// It is deliberately a scan and not a hand-maintained array: a hand-maintained
// copy of a fact is the thing this repo has been bitten by before (the edge
// proxy seat lists, 2026-08-18).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Top-level keys of the object literal that starts at `open`. */
function objectKeys(src: string, open: number): string[] {
  let depth = 0;
  const keys: string[] = [];
  let i = open;
  let segmentStart = -1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      depth++;
      if (depth === 1) segmentStart = i + 1;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) break;
      continue;
    }
  }
  if (depth !== 0 || segmentStart < 0) throw new Error("unbalanced object literal");
  const body = src.slice(segmentStart, i);
  // Walk the body at depth 0 only, so nested objects contribute nothing.
  let d = 0;
  let token = "";
  for (const ch of body) {
    if (ch === "{" || ch === "[" || ch === "(") d++;
    else if (ch === "}" || ch === "]" || ch === ")") d--;
    if (d === 0 && ch === ",") {
      token = "";
      continue;
    }
    if (d === 0 && ch === ":" && token.trim()) {
      keys.push(token.trim());
      token = "";
      // Skip to the next top-level comma.
      continue;
    }
    if (d === 0) token += ch;
  }
  return keys.filter((k) => /^[a-z_][a-z0-9_]*$/i.test(k));
}

type Census = { insert: Set<string>; update: Set<string>; deletes: string[] };

function census(): Census {
  const result: Census = { insert: new Set(), update: new Set(), deletes: [] };
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8").split(CR).join("");
    let from = src.indexOf('from("users")');
    while (from !== -1) {
      // The chained call can sit on the next line, so look ahead a little.
      const window = src.slice(from, from + 400);
      const m = window.match(/\.(insert|update|upsert|delete)\s*\(/);
      if (m && m.index !== undefined) {
        const verb = m[1];
        if (verb === "delete") {
          result.deletes.push(file.slice(ROOT.length + 1));
        } else {
          const open = src.indexOf("{", from + m.index);
          for (const k of objectKeys(src, open)) {
            (verb === "update" ? result.update : result.insert).add(k);
          }
        }
      }
      from = src.indexOf('from("users")', from + 1);
    }
  }
  return result;
}

const C = census();
const MIGRATION = readFileSync(join(ROOT, "db/migrations/0139_rbac_roles.sql"), "utf8").split(CR).join("");

describe("what the client writes to public.users", () => {
  test("the scan found something (a silent zero would pass every other test)", () => {
    expect(C.insert.size).toBeGreaterThan(0);
    expect(C.update.size).toBeGreaterThan(0);
  });

  test("INSERT touches exactly these columns", () => {
    expect([...C.insert].sort()).toEqual(["birth_date", "display_name", "email", "id", "locale"]);
  });

  test("UPDATE touches exactly these columns", () => {
    expect([...C.update].sort()).toEqual(["birth_date", "privacy_prefs", "profile_details", "reasoning_prefs"]);
  });

  test("nothing deletes from users", () => {
    // Account deletion goes through the account-deletion path, not a direct
    // client DELETE. This is what makes revoking DELETE and TRUNCATE from
    // anon/authenticated a bounded change rather than a gamble.
    expect(C.deletes).toEqual([]);
  });

  test("judge_mode is no longer sent", () => {
    // It used to be, with a comment claiming the auto_judge_mode trigger was
    // authoritative. 0138 dropped that trigger. A client asking for a
    // privilege and being silently corrected is worse than not asking.
    expect([...C.insert]).not.toContain("judge_mode");
    expect([...C.update]).not.toContain("judge_mode");
  });
});

describe("the migration quotes the same census", () => {
  test("every scanned column appears in 0139's census comment", () => {
    // The migration explains why the surgery is deferred and what it will
    // grant. If the code grows a column and the comment does not, the console
    // would run the surgery against a stale list and break a feature.
    for (const col of [...C.insert, ...C.update]) {
      expect(MIGRATION).toContain(col);
    }
  });

  test("0139 does not perform the surgery yet, and says why", () => {
    // Deferred on purpose: whether the sign-up INSERT arrives as authenticated
    // or as anon cannot be determined from the repo, and getting it wrong is a
    // sign-up outage. It needs a production dry run.
    expect(MIGRATION).not.toMatch(/REVOKE\s+(INSERT|UPDATE)[^\n]*ON public\.users/);
    expect(MIGRATION).toMatch(/dry run against production/i);
  });
});
