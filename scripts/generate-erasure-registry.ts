// Shared SQL inventory for the erasure registry (결정 4, docs/S3-SERVER-DELETION.md).
//
// WHY THIS FILE EXISTS. The registry's *classification* is written by a human in
// db/erasure-registry.json, but its *table list* must be derived from the schema,
// never typed. F4 in the design doc is what happens otherwise: eleven owner-
// deletable tables drifted out of the app's hand-maintained delete list and no
// check noticed, because nothing compared the list against db/migrations.
//
// So the list has exactly one derivation, here, and both consumers import it:
//   scripts/generate-erasure-registry.ts  -- refreshes the JSON (writes)
//   scripts/check-erasure-registry.ts     -- fails CI on drift (reads)
// Keeping the parser in one module is the point: two parsers would eventually
// disagree, and the disagreement would be invisible.
//
// SCOPE. `public` schema only. storage.objects and auth.* are owned by Supabase
// and are erased by their own paths (0074/0188 for raw-clippings, the auth.users
// cascade for the rest), so they are deliberately out of the registry.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type OwnerColumn = {
  name: string;
  /** Why this column looks like a per-user owner. Both signals are kept because
   *  each one alone has a known blind spot: a few owner columns carry no FK
   *  (0022 wiki_links.user_id, 0079 rewarded_ssv_txns.user_id), and a few
   *  FK-to-users columns are not the owner (a blocked peer, an observer). */
  evidence: ("name" | "references-users")[];
};

export type DiscoveredTable = {
  table: string;
  /** Migration file the CREATE TABLE lives in. */
  definedIn: string;
  ownerColumns: OwnerColumn[];
};

/** Column names that mean "this row belongs to a user" in this schema.
 *  Derived by reading every CREATE TABLE in db/migrations; extend it when a new
 *  naming shows up rather than special-casing a table in the registry. */
const OWNER_COLUMN_NAMES = new Set([
  "user_id",
  "owner_id",
  "subject_user_id",
  "created_by",
  "author_id",
  "actor_id",
  "profile_user_id",
  "member_user_id",
  "recipient_user_id",
  "target_user_id",
  "reporter_id",
  "reporter_user_id",
  "blocker_id",
  "inviter_id",
  "sender_id",
]);

/** Leading keywords that start a TABLE constraint rather than a column. */
const CONSTRAINT_STARTERS = new Set([
  "constraint",
  "primary",
  "unique",
  "foreign",
  "check",
  "exclude",
  "like",
  "period",
]);

/** Tables that exist in the SQL but must never enter the registry.
 *  Each entry states why; an unexplained entry is a hole, not an exemption. */
export const NOT_A_USER_TABLE: Record<string, string> = {
  users: "프로필 본체. 계정 삭제 cascade 의 뿌리라 콘텐츠 삭제 대상이 아니다 (F5).",
};

/**
 * Strip SQL comments without eating the inside of a dollar-quoted body.
 *
 * Migrations here wrap policy/function bodies in `$mig$ ... $mig$` and `$p$ ...
 * $p$`, and those bodies contain both `--` lines and `(`/`)`. A naive global
 * comment strip would corrupt them, and a naive paren scan would mis-terminate.
 * Dollar quotes therefore survive as-is and the paren scanner skips over them.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const dollar = matchDollarTag(sql, i);
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end === -1) {
        out += sql.slice(i);
        break;
      }
      out += sql.slice(i, end + dollar.length);
      i = end + dollar.length;
      continue;
    }
    if (sql[i] === "'") {
      const end = findSingleQuoteEnd(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      out += " ";
      i = nl;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      out += " ";
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/**
 * Blank out every stretch of SQL that Postgres would NEVER execute as DDL,
 * keeping the byte length so statement offsets stay comparable.
 *
 * WHY THIS EXISTS. `stripSqlComments` copies a string literal through with its
 * contents intact, and copies a dollar-quoted body through whole -- comments and
 * all. So text that merely *mentions* DDL was indistinguishable from DDL, and
 * the r40 gate proved it: one log line
 *
 *   RAISE NOTICE 'CREATE POLICY ghost ON notes FOR ALL TO authenticated USING (false);';
 *
 * registered a policy event for a table that has no policy at all, and G3 --
 * the rule that exists to stop a DELETE from matching 0 rows and reporting
 * success (F1) -- blessed it. A guard that reads prose as schema is not a guard.
 *
 * THE DISTINCTION THIS FUNCTION MAKES EXPLICITLY. Two things look alike inside
 * `$tag$ ... $tag$` and must not be treated alike:
 *
 *   executable   `DO $mig$ BEGIN CREATE POLICY p ON t ...; END $mig$;`
 *                -> real DDL. 0048/0051/0097 and friends write policies this
 *                   way, so the body is DESCENDED INTO and still parsed.
 *   inert        `RAISE NOTICE 'CREATE POLICY ...'` / `-- CREATE POLICY ...`
 *                -> data and prose. Blanked, wherever they sit, including
 *                   inside that same executable body.
 *
 * So the rule is not "skip dollar bodies" and not "blank dollar bodies": it is
 * recurse into them and apply the same inert/executable split one level down.
 * Nested tags (`$mig$ ... $p$ ... $p$ ... $mig$`) recurse the same way.
 *
 * Length is preserved exactly -- a literal becomes `'` + spaces + `'`, a comment
 * becomes spaces -- because `replayMigrations` sorts events by match offset and
 * a shifting offset would reorder statements that Postgres does not reorder.
 */
export function maskInertSql(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const dollar = matchDollarTag(sql, i);
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end === -1) {
        // Unterminated tag. Keep descending rather than bailing: the remaining
        // text is still the body, and blanking it wholesale would hide DDL.
        out += dollar + maskInertSql(sql.slice(i + dollar.length));
        return out;
      }
      out += dollar + maskInertSql(sql.slice(i + dollar.length, end)) + dollar;
      i = end + dollar.length;
      continue;
    }
    if (sql[i] === "'") {
      const end = findSingleQuoteEnd(sql, i);
      // `closed` is true for every well-formed literal; the false branch only
      // happens on malformed SQL, where dropping the trailing quote would make
      // the paren scanners swallow the rest of the file.
      const closed = end - i >= 2 && sql[end - 1] === "'";
      out += "'" + " ".repeat(Math.max(end - i - (closed ? 2 : 1), 0)) + (closed ? "'" : "");
      i = end;
      continue;
    }
    // Comments INSIDE a dollar body reach here (stripSqlComments already took
    // the top-level ones). `-- CREATE POLICY ...` in a DO block is the same
    // false green as the string-literal case, one syntax over.
    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      const stop = nl === -1 ? sql.length : nl;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const close = sql.indexOf("*/", i + 2);
      const stop = close === -1 ? sql.length : close + 2;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** The one string `replayMigrations` scans for DDL: comments gone, inert text
 *  blanked, executable dollar bodies still readable. Composed here rather than
 *  folded into `stripSqlComments` so each pass keeps one job, and so a caller
 *  that wants the raw body (tests do) can still get it. */
export function stripForDdlScan(sql: string): string {
  return maskInertSql(stripSqlComments(sql));
}

function matchDollarTag(sql: string, i: number): string | null {
  if (sql[i] !== "$") return null;
  const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
  return m ? m[0] : null;
}

function findSingleQuoteEnd(sql: string, start: number): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (sql[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

/** Read from `openParen` (index of `(`) to its match, skipping dollar-quoted
 *  bodies and string literals. Returns the inclusive-exclusive body span. */
function matchParen(sql: string, openParen: number): number {
  let depth = 0;
  let i = openParen;
  while (i < sql.length) {
    const dollar = matchDollarTag(sql, i);
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      i = end === -1 ? sql.length : end + dollar.length;
      continue;
    }
    if (sql[i] === "'") {
      i = findSingleQuoteEnd(sql, i);
      continue;
    }
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** Split a CREATE TABLE body on top-level commas. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'") {
      const end = findSingleQuoteEnd(body, i);
      current += body.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function ownerEvidence(columnName: string, definition: string): OwnerColumn | null {
  const evidence: OwnerColumn["evidence"] = [];
  if (OWNER_COLUMN_NAMES.has(columnName)) evidence.push("name");
  const isUuid = /\buuid\b/i.test(definition);
  const referencesUsers = /\breferences\s+(?:(?:public|auth)\s*\.\s*)?users\s*\(/i.test(definition);
  if (isUuid && referencesUsers) evidence.push("references-users");
  if (evidence.length === 0) return null;
  // A name match on a non-uuid column is a false positive waiting to happen.
  if (!isUuid) return null;
  return { name: columnName, evidence };
}

/** Final RLS policy state for one policy name on one table.
 *
 *  `using` is the verbatim USING expression, or null when the policy has none.
 *  It is here because a policy HEADER answers the wrong question: `FOR ALL TO
 *  authenticated USING (false)` reads exactly like an owner-delete policy and
 *  lets through no rows at all. The r40 gate mutated a real policy to
 *  `USING (false)` and G3 stayed green, which is defect F1 wearing a policy
 *  name. A policy with no USING is just as suspect in the other direction:
 *  Postgres leaves its row filter unset, so a FOR ALL policy without one would
 *  let the caller delete everyone's rows. Both cases need the expression. */
export type PolicyState = { command: string; roles: string; using: string | null; file: string };

/** Every privilege `GRANT ALL` on a table expands to. */
const ALL_TABLE_PRIVILEGES = ["select", "insert", "update", "delete", "truncate", "references", "trigger"];

/** The grantees whose table privileges decide whether an END USER can delete.
 *  `service_role` and `supabase_auth_admin` are deliberately absent: they
 *  bypass RLS and are never the owner-facing path the registry classifies. */
export const ACL_GRANTEES = ["anon", "authenticated", "public"] as const;

/**
 * What every new table in `public` already carries before a single migration
 * runs, because Supabase's ALTER DEFAULT PRIVILEGES put it there.
 *
 * This is NOT in db/migrations and cannot be: the platform sets it up. The repo
 * says so in as many words at 0113_notices.sql:99-100 -- "anon is named
 * explicitly because Supabase default privileges auto-GRANT to it on every new
 * table, and the app ships a public anon key" -- and the REVOKE-then-GRANT
 * pattern in 0092/0097/0113 only makes sense against this baseline. Start from
 * an empty set instead and every one of those REVOKEs becomes a no-op while 25
 * of the 26 erasable tables turn red for a privilege nobody took away.
 *
 * PUBLIC starts empty: Postgres grants the pseudo-role nothing on a table.
 *
 * WHY A STATIC BASELINE AND NOT THE CI CATALOG. The obvious alternative is to
 * ask the scratch database (`has_table_privilege`). Measured 2026-09-20: the
 * Supabase compatibility stub in .github/workflows/supabase-dry-run.yml creates
 * the four roles and grants them USAGE on auth/storage and nothing whatever on
 * public tables, so has_table_privilege() there would report FALSE for all 26
 * and be measuring the stub. Adding a blanket GRANT to the stub to fix that
 * would make the assertion measure the line above it. So the honest static
 * model is a REVOKE DETECTOR: it answers "did a migration take DELETE away",
 * which is exactly the mutation the r40 gate walked through G3 untouched.
 */
const SUPABASE_DEFAULT_TABLE_PRIVILEGES: Record<string, string[]> = {
  anon: [...ALL_TABLE_PRIVILEGES],
  authenticated: [...ALL_TABLE_PRIVILEGES],
  public: [],
};

/** Object kinds a GRANT/REVOKE can name that are not tables. Matched as a
 *  safety net under the `ON <name>` pattern so `GRANT EXECUTE ON FUNCTION ...`
 *  and `GRANT USAGE ON SCHEMA ...` can never be read as a table grant. */
const NON_TABLE_GRANT_OBJECTS = new Set([
  "function", "schema", "sequence", "database", "type", "domain", "routine",
  "procedure", "tablespace", "foreign", "large", "all", "language", "parameter",
]);

function normalizeSqlName(raw: string): string {
  return raw.trim().replace(/^public\s*\.\s*/i, "").replace(/^"|"$/g, "").toLowerCase();
}

/** Split a GRANT/REVOKE privilege list into verbs, expanding ALL.
 *
 *  A column-qualified entry (`INSERT (id, email)`) is dropped: DELETE has no
 *  column form, so it can never decide this question, and reading 0139's
 *  `GRANT INSERT (id, email, ...) ON public.users` as a table-wide INSERT would
 *  be simply wrong. Split is top-level so the column list stays one token. */
function parsePrivilegeList(raw: string): string[] {
  const out: string[] = [];
  for (const item of splitTopLevel(raw)) {
    const token = item.trim().toLowerCase();
    if (!token) continue;
    if (token.includes("(")) continue;
    if (token === "all" || token === "all privileges") {
      out.push(...ALL_TABLE_PRIVILEGES);
      continue;
    }
    out.push(token);
  }
  return out;
}

/**
 * Can an end user DELETE rows of this table at the GRANT level?
 *
 * RLS and table privileges are two independent gates and a delete needs to pass
 * both. G3 used to look only at the first, so a bare
 * `REVOKE DELETE ON TABLE public.notes FROM authenticated` left the policy
 * standing, the guard green, and every DELETE matching 0 rows -- F1 again, from
 * the side the policy cannot see (r40 gate, M2).
 *
 * `authenticated` OR PUBLIC, because a grant to the pseudo-role reaches every
 * role, and a REVOKE from one of the two does not touch the other.
 */
export function ownerRoleCanDelete(replay: SchemaReplay, table: string): boolean {
  const byGrantee = replay.tablePrivileges.get(table);
  // Absent means no migration ever granted or revoked on it, so the Supabase
  // default still stands. Absence is not "no privileges".
  if (!byGrantee) return true;
  return (
    (byGrantee.get("authenticated")?.has("delete") ?? false) ||
    (byGrantee.get("public")?.has("delete") ?? false)
  );
}

/** A surviving foreign key, as the replay below reconstructs it.
 *
 *  `onDelete` is what makes an edge matter to the erasure registry: a CASCADE
 *  child of a deleted parent disappears without any explicit DELETE naming it,
 *  so neither its ROW_COUNT nor its "kept" classification can be believed
 *  unless something checks the edge. That is rules G8 and G9. */
export type ForeignKeyEdge = {
  child: string;
  childColumns: string[];
  parent: string;
  onDelete: "cascade" | "set null" | "set default" | "restrict" | "no action";
  definedIn: string;
  constraintName: string | null;
};

export type SchemaReplay = {
  tables: Map<string, DiscoveredTable>;
  /** table -> policy name -> state. Only surviving policies are present. */
  policies: Map<string, Map<string, PolicyState>>;
  foreignKeys: ForeignKeyEdge[];
  /** table -> grantee -> privileges held after the last GRANT/REVOKE in apply
   *  order. A table ABSENT from this map was never named by either, so it still
   *  stands at the Supabase default -- read it through `ownerRoleCanDelete`,
   *  never by treating a missing entry as "no privileges". */
  tablePrivileges: Map<string, Map<string, Set<string>>>;
};

type ReplayEvent = { at: number; apply: () => void };

function parseOnDelete(tail: string): ForeignKeyEdge["onDelete"] {
  const m = /\bon\s+delete\s+(cascade|set\s+null|set\s+default|restrict|no\s+action)/i.exec(tail);
  if (!m) return "no action"; // the SQL default
  return m[1].toLowerCase().replace(/\s+/g, " ") as ForeignKeyEdge["onDelete"];
}

function parseColumnList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase())
    .filter(Boolean);
}

/**
 * Replay every db/migrations/*.sql **in statement order** and return the final
 * schema state the registry is checked against.
 *
 * WHY STATEMENT ORDER. The previous shape processed one regex kind at a time --
 * every CREATE TABLE in a file, then every ALTER, then every DROP; and for
 * policies, every DROP POLICY and then every CREATE POLICY. The winner was the
 * order the regexes happened to run in, not the order Postgres would execute.
 * So `DROP TABLE x; CREATE TABLE x (...)` reported x as gone and
 * `CREATE POLICY p; DROP POLICY p` reported p as alive -- both false green, and
 * both re-open exactly the holes (F1, F4) this inventory exists to close.
 *
 * Every regex below therefore runs over the SAME stripped string and its match
 * `.index` becomes an event offset; the events are sorted once and applied in
 * order. stripSqlComments does not preserve byte offsets (a comment collapses
 * to one space), which is fine: offsets only ever need to be comparable to one
 * another WITHIN a file, and they are, because one strip feeds all of them.
 */
export function replayMigrations(migrationsDir: string): SchemaReplay {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const tables = new Map<string, DiscoveredTable>();
  const policies = new Map<string, Map<string, PolicyState>>();
  const tablePrivileges = new Map<string, Map<string, Set<string>>>();
  let foreignKeys: ForeignKeyEdge[] = [];

  const policySlot = (table: string): Map<string, PolicyState> => {
    const existing = policies.get(table);
    if (existing) return existing;
    const fresh = new Map<string, PolicyState>();
    policies.set(table, fresh);
    return fresh;
  };

  /** Seeded with the Supabase default the first time a GRANT or REVOKE names
   *  the table, so a REVOKE has something to take away. */
  const privSlot = (table: string): Map<string, Set<string>> => {
    const existing = tablePrivileges.get(table);
    if (existing) return existing;
    const fresh = new Map<string, Set<string>>();
    for (const grantee of ACL_GRANTEES) {
      fresh.set(grantee, new Set(SUPABASE_DEFAULT_TABLE_PRIVILEGES[grantee]));
    }
    tablePrivileges.set(table, fresh);
    return fresh;
  };

  const addOwner = (table: string, file: string, owner: OwnerColumn): void => {
    const existing = tables.get(table);
    if (existing) {
      if (!existing.ownerColumns.some((c) => c.name === owner.name)) existing.ownerColumns.push(owner);
    } else {
      tables.set(table, { table, definedIn: file, ownerColumns: [owner] });
    }
  };

  const dropTable = (table: string): void => {
    // Postgres takes the policies, the constraints AND the grants with the
    // table. Clearing the privilege slot matters: a re-created table gets fresh
    // default privileges, so a REVOKE before the DROP must not outlive it.
    tables.delete(table);
    policies.delete(table);
    tablePrivileges.delete(table);
    foreignKeys = foreignKeys.filter((fk) => fk.child !== table && fk.parent !== table);
  };

  for (const file of files) {
    const sql = stripForDdlScan(readFileSync(join(migrationsDir, file), "utf8"));
    const events: ReplayEvent[] = [];
    let m: RegExpExecArray | null;

    // `UNLOGGED` is a durable table and must be parsed; `TEMP`/`TEMPORARY` are
    // session-scoped (0135 creates one) and can never be a user's data. Spelling
    // the modifiers out beats a bare `create table` match: a future
    // `CREATE UNLOGGED TABLE x (user_id uuid ...)` would otherwise be skipped in
    // silence, which is the exact failure (F4) this inventory exists to stop.
    const createRe =
      /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:("?)([A-Za-z_][\w]*)\1\s*\.\s*)?("?)([A-Za-z_][\w]*)\3\s*\(/gi;
    while ((m = createRe.exec(sql)) !== null) {
      const schema = (m[2] ?? "public").toLowerCase();
      const table = m[4].toLowerCase();
      const open = sql.indexOf("(", m.index + m[0].length - 1);
      const close = matchParen(sql, open);
      if (close === -1) continue;
      createRe.lastIndex = close + 1;
      if (schema !== "public") continue;
      const body = sql.slice(open + 1, close);
      const at = m.index;

      const ownerColumns: OwnerColumn[] = [];
      const edges: ForeignKeyEdge[] = [];
      for (const part of splitTopLevel(body)) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const nameMatch = /^"?([A-Za-z_][\w]*)"?\s+([\s\S]*)$/.exec(trimmed);
        if (!nameMatch) continue;
        const head = nameMatch[1].toLowerCase();
        const rest = nameMatch[2];

        if (CONSTRAINT_STARTERS.has(head)) {
          // Table-level: [CONSTRAINT n] FOREIGN KEY (a, b) REFERENCES p (x, y) ...
          const fk =
            /\bforeign\s+key\s*\(([^)]*)\)\s*references\s+(?:(?:public)\s*\.\s*)?"?([A-Za-z_][\w]*)"?\s*(?:\(([^)]*)\))?([\s\S]*)$/i.exec(
              trimmed,
            );
          if (fk) {
            const named = /^constraint\s+"?([A-Za-z_][\w]*)"?/i.exec(trimmed);
            edges.push({
              child: table,
              childColumns: parseColumnList(fk[1]),
              parent: fk[2].toLowerCase(),
              onDelete: parseOnDelete(fk[4]),
              definedIn: file,
              constraintName: named ? named[1].toLowerCase() : null,
            });
          }
          continue;
        }

        const owner = ownerEvidence(head, rest);
        if (owner) ownerColumns.push(owner);

        // Column-level: col type REFERENCES p (x) ON DELETE ...
        const inline =
          /\breferences\s+(?:(?:public)\s*\.\s*)?"?([A-Za-z_][\w]*)"?\s*(?:\(([^)]*)\))?([\s\S]*)$/i.exec(rest);
        if (inline) {
          edges.push({
            child: table,
            childColumns: [head],
            parent: inline[1].toLowerCase(),
            onDelete: parseOnDelete(inline[3]),
            definedIn: file,
            constraintName: null,
          });
        }
      }

      events.push({
        at,
        apply: () => {
          // `CREATE TABLE IF NOT EXISTS` over a live table is a no-op in
          // Postgres, so merge rather than reset; a real re-create only ever
          // follows a DROP, which already cleared the slot.
          const existing = tables.get(table);
          if (existing) {
            for (const col of ownerColumns) {
              if (!existing.ownerColumns.some((c) => c.name === col.name)) existing.ownerColumns.push(col);
            }
          } else if (ownerColumns.length > 0) {
            tables.set(table, { table, definedIn: file, ownerColumns: [...ownerColumns] });
          }
          for (const edge of edges) {
            if (!foreignKeys.some((f) => f.child === edge.child && f.parent === edge.parent
                && f.childColumns.join(",") === edge.childColumns.join(","))) {
              foreignKeys.push(edge);
            }
          }
        },
      });
    }

    // ALTER TABLE, clause by clause.
    //
    // ⚠ ONE statement can carry SEVERAL comma-separated clauses, and this repo
    // writes them that way (0186:43-47 adds two FKs in one statement; 0177 and
    // 0187 do the same with CHECKs). Matching `ALTER TABLE t ADD ... ([^;]*)`
    // once per statement therefore reads the FIRST clause and swallows the rest
    // INTO ITS OWN TAIL -- so a later clause's FK is invisible, and worse, a
    // later clause's `ON DELETE CASCADE` gets attributed to the first one.
    // Measured before this was fixed: the parser reported
    // knowledge_sources.verified_by -> users as NO ACTION where pg_constraint
    // says SET NULL, because 0186 writes it as the second clause.
    //
    // The same tail bug hit ADD COLUMN, and there it is worse than invisible:
    // `ADD COLUMN session_id uuid, ADD COLUMN user_id uuid REFERENCES users(id)`
    // credited user_id's evidence to session_id, so the guard would reject the
    // correct owner column and accept the wrong one -- and an owner column that
    // is not the owner makes every DELETE match 0 rows, which is defect F1 again.
    //
    // So: match the statement, split its body on top-level commas, and read each
    // clause on its own. `only` is accepted here too; leaving it off ADD COLUMN
    // (while the FK and DROP CONSTRAINT patterns had it) silently dropped whole
    // tables out of the inventory.
    const alterRe =
      /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:(?:public)\s*\.\s*)?"?([A-Za-z_][\w]*)"?\s+([^;]*)/gi;
    while ((m = alterRe.exec(sql)) !== null) {
      const table = m[1].toLowerCase();
      const at = m.index;
      for (const clause of splitTopLevel(m[2])) {
        const trimmed = clause.trim();
        if (!trimmed) continue;

        const addColumn =
          /^add\s+column\s+(?:if\s+not\s+exists\s+)?"?([A-Za-z_][\w]*)"?([\s\S]*)$/i.exec(trimmed);
        if (addColumn) {
          const columnName = addColumn[1].toLowerCase();
          const rest = addColumn[2];
          const owner = ownerEvidence(columnName, rest);
          const inline =
            /references\s+(?:(?:public)\s*\.\s*)?"?([A-Za-z_][\w]*)"?\s*(?:\(([^)]*)\))?([\s\S]*)$/i.exec(rest);
          events.push({
            at,
            apply: () => {
              if (owner) addOwner(table, file, owner);
              if (inline) {
                foreignKeys.push({
                  child: table,
                  childColumns: [columnName],
                  parent: inline[1].toLowerCase(),
                  onDelete: parseOnDelete(inline[3]),
                  definedIn: file,
                  constraintName: null,
                });
              }
            },
          });
          continue;
        }

        const addFk =
          /^add\s+(?:constraint\s+"?([A-Za-z_][\w]*)"?\s+)?foreign\s+key\s*\(([^)]*)\)\s*references\s+(?:(?:public)\s*\.\s*)?"?([A-Za-z_][\w]*)"?\s*(?:\(([^)]*)\))?([\s\S]*)$/i.exec(
            trimmed,
          );
        if (addFk) {
          const edge: ForeignKeyEdge = {
            child: table,
            childColumns: parseColumnList(addFk[2]),
            parent: addFk[3].toLowerCase(),
            onDelete: parseOnDelete(addFk[5]),
            definedIn: file,
            constraintName: addFk[1] ? addFk[1].toLowerCase() : null,
          };
          events.push({ at, apply: () => { foreignKeys.push(edge); } });
          continue;
        }

        const dropConstraint =
          /^drop\s+constraint\s+(?:if\s+exists\s+)?"?([A-Za-z_][\w]*)"?/i.exec(trimmed);
        if (dropConstraint) {
          const name = dropConstraint[1].toLowerCase();
          events.push({
            at,
            apply: () => {
              foreignKeys = foreignKeys.filter((fk) => !(fk.child === table && fk.constraintName === name));
            },
          });
        }
      }
    }

    // `DROP TABLE a, b;` drops both; matching only the first name is how a
    // table walks back into the inventory after it is gone.
    const dropTableRe =
      /\bdrop\s+table\s+(?:if\s+exists\s+)?((?:(?:public\s*\.\s*)?"?[A-Za-z_][\w]*"?\s*,\s*)*(?:public\s*\.\s*)?"?[A-Za-z_][\w]*"?)/gi;
    while ((m = dropTableRe.exec(sql)) !== null) {
      const names = m[1]
        .split(",")
        .map((n) => n.trim().replace(/^public\s*\.\s*/i, "").replace(/^"|"$/g, "").toLowerCase())
        .filter(Boolean);
      events.push({ at: m.index, apply: () => { for (const n of names) dropTable(n); } });
    }

    const dropPolicyRe =
      /\bdrop\s+policy\s+(?:if\s+exists\s+)?"?([A-Za-z_][\w]*)"?\s+on\s+(?:(?:public|storage)\s*\.\s*)?"?([A-Za-z_][\w]*)"?/gi;
    while ((m = dropPolicyRe.exec(sql)) !== null) {
      const name = m[1].toLowerCase();
      const table = m[2].toLowerCase();
      events.push({ at: m.index, apply: () => { policySlot(table).delete(name); } });
    }

    // The tail is bounded because a policy body can be long; everything we need
    // (FOR <cmd>, TO <roles>) sits before the first USING / WITH CHECK. The
    // terminator is CAPTURED (m[4]) rather than discarded, because which one
    // ended the header tells us whether a USING expression follows -- and that
    // expression, not the header, is what decides which rows the policy lets
    // through (r40 gate, M2).
    const createPolicyRe =
      /\bcreate\s+policy\s+"?([A-Za-z_][\w]*)"?\s+on\s+(?:(?:public|storage)\s*\.\s*)?"?([A-Za-z_][\w]*)"?([\s\S]{0,240}?)(using|with\s+check|;|\$p\$)/gi;
    while ((m = createPolicyRe.exec(sql)) !== null) {
      const name = m[1].toLowerCase();
      const table = m[2].toLowerCase();
      const tail = m[3];
      // Postgres defaults an unqualified policy to FOR ALL.
      const command = (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(tail)?.[1] ?? "all").toLowerCase();
      const roles = (/\bto\s+([a-z_,\s]+)/i.exec(tail)?.[1] ?? "public").trim();
      // Read the whole parenthesised expression with the paren matcher, not a
      // bounded regex: a real USING can nest parens, NOT EXISTS and sub-selects
      // (0097's clipper_templates_read does all three), and a truncated
      // expression is worse than none -- it would normalise to something the
      // allowlist might accept.
      let using: string | null = null;
      if (/^using$/i.test(m[4])) {
        const afterUsing = m.index + m[0].length;
        const open = sql.indexOf("(", afterUsing);
        // Only whitespace may sit between `USING` and its `(`; anything else
        // means the `(` belongs to a later statement.
        if (open !== -1 && sql.slice(afterUsing, open).trim() === "") {
          const close = matchParen(sql, open);
          if (close !== -1) using = sql.slice(open + 1, close);
        }
      }
      events.push({ at: m.index, apply: () => { policySlot(table).set(name, { command, roles, using, file }); } });
    }

    // GRANT / REVOKE on a TABLE, replayed in the same ordered event stream.
    //
    // WHY IT IS HERE AT ALL. RLS answers "which rows", the grant answers
    // "may you at all", and a DELETE needs both. G3 read only the policy, so
    // the r40 gate slipped `REVOKE DELETE ON TABLE public.notes FROM
    // authenticated` past it with the policy still in place: the guard stayed
    // green on a table whose every DELETE now matches 0 rows.
    //
    // WHY IN ORDER. 0092/0097/0113 all write REVOKE ALL and then GRANT the
    // exact verbs back. Read out of order, the REVOKE wins and template_blocks
    // -- which really can be deleted by its owner -- turns red.
    //
    // Only `public` tables are matched. `ON FUNCTION|SCHEMA|SEQUENCE|...` is
    // excluded by the shape of the pattern and again by NON_TABLE_GRANT_OBJECTS,
    // and storage.* is out of the registry's scope by design.
    const aclRe =
      /\b(grant|revoke)\s+(?:grant\s+option\s+for\s+)?((?:[a-z]+(?:\s+privileges)?(?:\s*\([^)]*\))?\s*,\s*)*[a-z]+(?:\s+privileges)?(?:\s*\([^)]*\))?)\s+on\s+(?:table\s+)?((?:(?:public\s*\.\s*)?"?[A-Za-z_][\w]*"?\s*,\s*)*(?:public\s*\.\s*)?"?[A-Za-z_][\w]*"?)\s+(?:to|from)\s+((?:"?[A-Za-z_][\w]*"?\s*,\s*)*"?[A-Za-z_][\w]*"?)/gi;
    while ((m = aclRe.exec(sql)) !== null) {
      const verb = m[1].toLowerCase();
      const privileges = parsePrivilegeList(m[2]);
      const names = m[3].split(",").map(normalizeSqlName).filter(Boolean);
      const grantees = m[4].split(",").map(normalizeSqlName).filter(Boolean);
      if (privileges.length === 0 || names.length === 0 || grantees.length === 0) continue;
      if (names.some((n) => NON_TABLE_GRANT_OBJECTS.has(n))) continue;
      events.push({
        at: m.index,
        apply: () => {
          for (const table of names) {
            const slot = privSlot(table);
            for (const grantee of grantees) {
              const held = slot.get(grantee);
              // service_role / supabase_auth_admin are not tracked on purpose.
              if (!held) continue;
              for (const privilege of privileges) {
                if (verb === "grant") held.add(privilege);
                else held.delete(privilege);
              }
            }
          }
        },
      });
    }

    events.sort((a, b) => a.at - b.at);
    for (const e of events) e.apply();
  }

  return { tables, policies, foreignKeys, tablePrivileges };
}

/** Parse every db/migrations/*.sql in apply order and return the public tables
 *  that carry at least one per-user owner column, minus tables a later
 *  migration dropped. */
export function discoverOwnedTables(migrationsDir: string): DiscoveredTable[] {
  return [...replayMigrations(migrationsDir).tables.values()]
    .filter((t) => !(t.table in NOT_A_USER_TABLE))
    .sort((a, b) => a.table.localeCompare(b.table));
}

export function migrationsDir(root: string): string {
  return join(root, "db", "migrations");
}

// ---------------------------------------------------------------------------
// The registry itself: db/erasure-registry.json is the ONE original.
//
// Everything below turns that original into the form the database needs. It is
// never the other way round: nothing here writes the JSON back from SQL. That
// direction matters because a two-way sync has two writers, and two writers on
// one fact is how the delete list drifted out of the schema in the first place.
// ---------------------------------------------------------------------------

export const ERASURE_CLASSES = ["client_erasable", "retained", "account_delete_only"] as const;
export type ErasureClass = (typeof ERASURE_CLASSES)[number];

export type RegistryEntry = {
  owner: string;
  class: ErasureClass;
  /** Only for `client_erasable`: FK and CHECK constraints make the order real.
   *  wiki_pages must go before sources (wiki_pages_source_kind_pair), children
   *  before parents (G8). */
  order?: number;
  /** Set only on a KEPT table (`retained` / `account_delete_only`) that an
   *  ON DELETE CASCADE from an erased parent empties anyway. Naming the parent
   *  is not a reclassification -- the table keeps its class and gains no DELETE
   *  policy. It moves the row out of the receipt's `kept` list into `cascaded`,
   *  so the receipt stops calling a destroyed table kept (G9). */
  cascadesFrom?: string;
  reason: string;
};

export type Registry = {
  version: number;
  tables: Record<string, RegistryEntry>;
};

export const REGISTRY_PATH = "db/erasure-registry.json";

/** Markers around the block in db/migrations/0189_*.sql that this file emits.
 *  scripts/check-erasure-registry.ts compares the text between them against a
 *  fresh render, so the SQL copy cannot drift from the JSON without CI noticing. */
export const SQL_BEGIN_MARKER = "-- <<< erasure-registry:generated from db/erasure-registry.json >>>";
export const SQL_END_MARKER = "-- <<< /erasure-registry:generated >>>";

export function loadRegistry(root: string): Registry {
  const raw = JSON.parse(readFileSync(join(root, "db", "erasure-registry.json"), "utf8")) as unknown;
  const obj = raw as { version?: unknown; tables?: unknown };
  if (typeof obj.version !== "number" || obj.tables === null || typeof obj.tables !== "object") {
    throw new Error(`${REGISTRY_PATH}: expected {version:number, tables:object}`);
  }
  return { version: obj.version, tables: obj.tables as Record<string, RegistryEntry> };
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Render the canonical seed block for public.erasure_registry.
 *
 * Shape notes, because both are load-bearing:
 *  - One data-modifying CTE does upsert AND prune. Postgres runs every
 *    data-modifying CTE to completion whether or not the outer query reads it,
 *    and they all see the same snapshot, so the DELETE removes exactly the rows
 *    that existed before and are no longer registered. Re-running the migration
 *    therefore converges instead of accumulating.
 *  - Rows are emitted in table-name order so a registry edit produces a diff
 *    that is readable line by line.
 */
export function renderRegistrySql(registry: Registry): string {
  const names = Object.keys(registry.tables).sort();
  const rows = names.map((name) => {
    const e = registry.tables[name];
    const order = e.class === "client_erasable" ? String(e.order) : "NULL";
    const cascade = e.cascadesFrom === undefined ? "NULL" : sqlLiteral(e.cascadesFrom);
    return `    (${sqlLiteral(name)}, ${sqlLiteral(e.owner)}, ${sqlLiteral(e.class)}, ${order}, ${cascade}, ${sqlLiteral(e.reason)})`;
  });
  return [
    SQL_BEGIN_MARKER,
    "-- 손으로 고치지 않는다. db/erasure-registry.json 을 고치고",
    "--   npx tsx scripts/generate-erasure-registry.ts --sql",
    "-- 를 돌려 이 블록을 통째로 갈아 끼운다. check:erasure-registry 가 대조한다.",
    "WITH incoming (table_name, owner_column, class, delete_order, cascades_from, reason) AS (",
    "  VALUES",
    rows.join(",\n"),
    "),",
    "upserted AS (",
    "  INSERT INTO public.erasure_registry AS r (table_name, owner_column, class, delete_order, cascades_from, reason)",
        // delete_order is cast explicitly: a VALUES column whose entries are all
    // untyped NULL resolves to text, which would only break on the day every
    // registered table is retained. Cheaper to never depend on the inference.
    // cascades_from is text already, so its all-NULL case needs no such cast.
    "  SELECT i.table_name, i.owner_column, i.class, i.delete_order::int, i.cascades_from, i.reason",
    "  FROM incoming AS i",
    "  ON CONFLICT (table_name) DO UPDATE",
    "    SET owner_column  = EXCLUDED.owner_column,",
    "        class         = EXCLUDED.class,",
    "        delete_order  = EXCLUDED.delete_order,",
    "        cascades_from = EXCLUDED.cascades_from,",
    "        reason        = EXCLUDED.reason",
    "  RETURNING r.table_name",
    ")",
    "DELETE FROM public.erasure_registry AS r",
    "WHERE NOT EXISTS (SELECT 1 FROM incoming AS i WHERE i.table_name = r.table_name);",
    SQL_END_MARKER,
  ].join("\n");
}

/** Pull the generated block back out of a migration file, markers excluded. */
export function extractRegistrySql(migrationSql: string): string | null {
  const begin = migrationSql.indexOf(SQL_BEGIN_MARKER);
  const end = migrationSql.indexOf(SQL_END_MARKER);
  if (begin === -1 || end === -1 || end < begin) return null;
  return migrationSql.slice(begin, end + SQL_END_MARKER.length);
}

function cli(): void {
  const root = process.cwd();
  const mode = process.argv[2] ?? "--report";
  if (mode === "--sql") {
    console.log(renderRegistrySql(loadRegistry(root)));
    return;
  }
  const discovered = discoverOwnedTables(migrationsDir(root));
  if (mode === "--missing") {
    const registry = loadRegistry(root);
    const missing = discovered.filter((d) => !(d.table in registry.tables));
    if (missing.length === 0) {
      console.log("// 분류되지 않은 표 없음");
      return;
    }
    // Emit stubs a human fills in. `class` is deliberately absent rather than
    // guessed: a default would let a new table inherit a fate nobody chose.
    for (const d of missing) {
      console.log(
        `"${d.table}": { "owner": "${d.ownerColumns[0]?.name ?? "TODO"}", "class": "TODO", "reason": "TODO (${d.definedIn})" },`,
      );
    }
    return;
  }
  if (mode !== "--report") {
    console.error(`usage: tsx scripts/generate-erasure-registry.ts [--report|--sql|--missing]`);
    process.exit(64);
  }
  const registry = loadRegistry(root);
  const counts: Record<string, number> = {};
  for (const e of Object.values(registry.tables)) counts[e.class] = (counts[e.class] ?? 0) + 1;
  console.log(`db/migrations 에서 찾은 소유자 열 보유 public 표: ${discovered.length}`);
  console.log(`${REGISTRY_PATH} 분류: ${Object.keys(registry.tables).length}`);
  for (const c of ERASURE_CLASSES) console.log(`  ${c}: ${counts[c] ?? 0}`);
  for (const d of discovered) {
    const e = registry.tables[d.table];
    const cols = d.ownerColumns.map((c) => c.name).join(", ");
    console.log(`  ${e ? e.class.padEnd(19) : "*** UNCLASSIFIED ***"}  ${d.table}  (${cols})`);
  }
}

if (require.main === module) cli();
