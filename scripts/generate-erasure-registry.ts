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
 * AND THE DOLLAR TAG DOES NOT DECIDE IT -- THE TOKEN IN FRONT OF IT DOES.
 * `$tag$ ... $tag$` is Postgres' *string literal* syntax. Whether its contents
 * are code depends entirely on where the literal sits, and the r41 gate (F3)
 * measured this hole by writing the single-quote false green one syntax over:
 *
 *   DROP POLICY records_owner_all ON public.records;
 *   DO $x$ BEGIN RAISE NOTICE $msg$CREATE POLICY records_owner_all ...$msg$; END $x$;
 *
 * The policy is really gone; the guard saw the NOTICE text and replayed it as a
 * CREATE. `DECLARE example text := $msg$CREATE POLICY ...$msg$` did the same.
 * So a dollar body counts as code only when the preceding keyword makes it
 * code: `DO $$...$$`, a function body `... AS $$...$$`, or a dynamic
 * `EXECUTE $p$...$p$` (which is how 0074/0186/0188 write the storage policies).
 * Anywhere else -- RAISE, an assignment, a comparison, a function argument,
 * COMMENT ON ... IS -- the body is data and is blanked like a quoted literal.
 *
 * Length is preserved exactly -- a literal becomes `'` + spaces + `'`, a comment
 * becomes spaces -- because `replayMigrations` sorts events by match offset and
 * a shifting offset would reorder statements that Postgres does not reorder.
 */
export function maskInertSql(sql: string): string {
  return maskInertRange(sql, 0, sql.length);
}

/** `DO`, a function body's `AS`, and `EXECUTE` are the three places a
 *  dollar-quoted literal is executed rather than read. Matched against the text
 *  immediately before the opening tag. */
const EXECUTABLE_DOLLAR_PREFIX = /(?:\bdo\b(?:\s+language\s+[a-z_]+)?|\bas\b|\bexecute\b)\s*$/i;

function opensExecutableBody(sql: string, tagStart: number): boolean {
  return EXECUTABLE_DOLLAR_PREFIX.test(sql.slice(Math.max(0, tagStart - 120), tagStart));
}

/** Masks `sql[from, to)` and returns a string of exactly `to - from` characters.
 *  Takes the whole buffer rather than a slice so the dollar-tag rule above can
 *  look at the token in front of a tag even when that token sits in an
 *  enclosing body. */
function maskInertRange(sql: string, from: number, to: number): string {
  let out = "";
  let i = from;
  while (i < to) {
    const dollar = matchDollarTag(sql, i);
    if (dollar) {
      const found = sql.indexOf(dollar, i + dollar.length);
      // Unterminated (or terminated outside this range): the rest of the range
      // is the body. Keep going rather than bailing -- blanking it wholesale
      // would hide DDL, and returning early would lose the tail.
      const closed = found !== -1 && found + dollar.length <= to;
      const bodyFrom = i + dollar.length;
      const bodyTo = closed ? found : to;
      const body = opensExecutableBody(sql, i)
        ? maskInertRange(sql, bodyFrom, bodyTo)
        : " ".repeat(Math.max(bodyTo - bodyFrom, 0));
      out += dollar + body + (closed ? dollar : "");
      i = closed ? found + dollar.length : to;
      continue;
    }
    if (sql[i] === "'") {
      const end = Math.min(findSingleQuoteEnd(sql, i), to);
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
      const stop = Math.min(nl === -1 ? to : nl, to);
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const close = sql.indexOf("*/", i + 2);
      const stop = Math.min(close === -1 ? to : close + 2, to);
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
 *  let the caller delete everyone's rows. Both cases need the expression.
 *
 *  `permissive` is false for `AS RESTRICTIVE`. Postgres ORs the permissive
 *  policies together and then ANDs every restrictive one on top, so a single
 *  restrictive policy can veto rows that an owner policy admits -- and a second
 *  permissive policy can hand back rows the owner policy excludes. Neither
 *  composition is modelled here; both are reported as beyond the model and
 *  decided by the catalog test instead (r41 gate F1).
 *
 *  `usingUnreadable` is true when the header said USING but the expression
 *  could not be extracted. That must never read as "no USING": one means the
 *  parser failed, the other means Postgres leaves the row filter unset. */
export type PolicyState = {
  command: string;
  roles: string;
  using: string | null;
  file: string;
  permissive: boolean;
  usingUnreadable: boolean;
};

/** Something in db/migrations that changes policy or privilege state in a way
 *  this parser does not model. It is never dropped silently: `check:erasure-registry`
 *  turns each one into a failure that hands the question to the catalog test.
 *
 *  `tables` is the set of registry tables the statement demonstrably names;
 *  `null` means the target could not be bounded at all (a dynamic identifier,
 *  a schema-wide grant), which is strictly worse than naming one table. */
export type BeyondModel = {
  kind: "restrictive-policy" | "multiple-delete-policies" | "schema-wide-acl" | "dynamic-ddl" | "unreadable-using";
  file: string;
  detail: string;
  tables: string[] | null;
};

/** A dynamic statement whose literal fragments prove it can only rewrite policy
 *  EXPRESSIONS. See `classifyDynamicDdl`. */
export type ExpressionOnlyRewrite = { file: string; detail: string };

/** Exact-token role match. `/authenticated/.test(roles)` also accepts
 *  `not_authenticated`, which is a different role with different privileges --
 *  measured as a false green by the r41 artifact gate (M2). */
export function policyRolesInclude(roles: string, wanted: string): boolean {
  return roles
    .split(",")
    .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())
    .includes(wanted);
}

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
  return ownerRoleHolds(replay, table, "delete");
}

/**
 * ...and SELECT, which is not a nicety.
 *
 * `DELETE FROM t WHERE owner = auth.uid()` READS `owner`. Postgres' "Policies
 * Applied by Command Type" table marks DELETE's SELECT/ALL USING clause
 * applicable exactly when the command "requires read access to the existing
 * row (for example, a WHERE ... that refers to columns of the relation)", and
 * the privilege gate mirrors it: without SELECT the statement raises 42501.
 * So `REVOKE SELECT ON public.records FROM authenticated` silently ends owner
 * deletion while leaving every DELETE policy and DELETE grant in place -- a
 * false green the r41 gate measured (F2, `revoke_select GREEN`).
 */
export function ownerRoleCanSelect(replay: SchemaReplay, table: string): boolean {
  return ownerRoleHolds(replay, table, "select");
}

function ownerRoleHolds(replay: SchemaReplay, table: string, privilege: string): boolean {
  const byGrantee = replay.tablePrivileges.get(table);
  // Absent means no migration ever granted or revoked on it, so the Supabase
  // default still stands. Absence is not "no privileges".
  if (!byGrantee) return true;
  return (
    (byGrantee.get("authenticated")?.has(privilege) ?? false) ||
    (byGrantee.get("public")?.has(privilege) ?? false)
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
  /** Statements this parser does not model. `check:erasure-registry` fails on
   *  any of them that could reach a `client_erasable` table. */
  beyondModel: BeyondModel[];
  /** Dynamic statements proven to rewrite only policy EXPRESSIONS. Exempt,
   *  because the guard no longer judges expressions -- but counted and printed,
   *  never silent. */
  expressionOnlyRewrites: ExpressionOnlyRewrite[];
};

type ReplayEvent = { at: number; apply: () => void };

// ---------------------------------------------------------------------------
// Dynamic DDL. `EXECUTE <string>` is how a migration runs SQL the file does not
// literally contain, and it is invisible to every regex in `replayMigrations`.
// ---------------------------------------------------------------------------

/** Keywords that make a dynamic payload capable of changing a delete path. */
const REGISTRY_DDL_KEYWORDS = /\bpolicy\b|\bgrant\b|\brevoke\b|\brow\s+level\s+security\b|\bdrop\s+table\b|\balter\s+table\b/i;

/** Statements whose reach cannot be bounded to named tables at all.
 *
 *  `GRANT ... ON SCHEMA x` is deliberately NOT here: granting schema usage is
 *  purely additive and never touches a table privilege. `REVOKE ... ON SCHEMA`
 *  is, because without USAGE on the schema every DELETE on every table in it
 *  raises 42501 while each per-table grant still looks intact -- the r41 gate's
 *  `revoke_schema GREEN`. `ON ALL TABLES IN SCHEMA` and
 *  `ALTER DEFAULT PRIVILEGES` move table privileges in bulk in either
 *  direction (gate F2 / M3). */
const UNBOUNDED_ACL =
  /\b(?:grant|revoke)\b[^;]{0,160}?\bon\s+all\s+\w+\s+in\s+schema\b|\balter\s+default\s+privileges\b|\brevoke\b[^;]{0,160}?\bon\s+schema\b/i;

/** Where a fragment could not be read as a literal, the assembled payload keeps
 *  its POSITION with this marker instead of dropping it. It holds no letters,
 *  so it can never satisfy a keyword test, and `dynamicTargets` already rejects
 *  it as a table name, so a payload that splices one into an `ON <target>`
 *  position comes out unbounded rather than green. */
const OPAQUE_FRAGMENT = "<?>";

/**
 * The bodies a migration EXECUTES at apply time.
 *
 * TWO KINDS, AND THE SECOND ONE IS WHY THIS COMMENT CHANGED (r42 artifact gate,
 * M1). `DO $tag$ ... $tag$` is the obvious kind. The other is a function the
 * file DEFINES AND THEN RUNS: `CREATE FUNCTION f() ... EXECUTE 'ALTER POLICY
 * records_owner_all ON public.records TO anon'` followed by `SELECT f();`
 * changes the policy's role exactly as a DO block would, and the gate walked
 * that shape through this guard with `g3=[] beyond=[] exempt=[]`. A
 * `CREATE TRIGGER ... EXECUTE FUNCTION f()` counts as running it too: from that
 * statement on, any DML reaches the body.
 *
 * DEFINING IS STILL NOT RUNNING. 0015 defines `admin_exec_sql(text)` whose body
 * is a bare `EXECUTE sql_text` -- unbounded by construction, service_role-only,
 * and dropped again by 0016. Nothing calls it, so it is not collected; a
 * scanner that could not tell "defined" from "executed" would fail this guard
 * forever on a function that no longer exists. Naming a function as the OBJECT
 * of a GRANT / REVOKE / DROP / COMMENT is not calling it either, which is what
 * keeps 0015's own `EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_exec_sql
 * (text) FROM anon'` from reading as a call.
 *
 * Measured across all 172 migrations on 2026-09-20: exactly two function bodies
 * contain dynamic EXECUTE at all -- 0015's and 0189's `erase_my_data` -- and
 * neither is invoked by the file that defines it. So this addition collects
 * nothing today. That is the point: it is here for the migration that has not
 * been written yet, and an empty result now is what proves it costs nothing.
 */
function executedBlocks(sql: string): { body: string; at: number }[] {
  const out: { body: string; at: number }[] = [];
  const re = /\bdo\s+(?:language\s+[a-z_]+\s+)?(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const tag = m[1];
    const from = m.index + m[0].length;
    const end = sql.indexOf(tag, from);
    out.push({ body: sql.slice(from, end === -1 ? sql.length : end), at: m.index });
  }
  for (const routine of definedRoutines(sql)) {
    if (!fileInvokes(sql, routine.name, routine.from, routine.to)) continue;
    out.push({ body: routine.body, at: routine.at });
  }
  return out;
}

/** Every `CREATE [OR REPLACE] FUNCTION|PROCEDURE` in the file, with the span of
 *  its dollar-quoted body. `re.lastIndex` jumps past each body so a definition
 *  quoted inside another one cannot be read twice. */
function definedRoutines(sql: string): { name: string; body: string; at: number; from: number; to: number }[] {
  const out: { name: string; body: string; at: number; from: number; to: number }[] = [];
  const re =
    /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\s+(?:"?[A-Za-z_][\w]*"?\s*\.\s*)?"?([A-Za-z_][\w]*)"?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const open = /(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/g;
    open.lastIndex = m.index;
    const tag = open.exec(sql);
    if (!tag) continue;
    const from = tag.index + tag[0].length;
    const end = sql.indexOf(tag[0], from);
    if (end === -1) continue;
    out.push({ name: m[1], body: sql.slice(from, end), at: m.index, from, to: end });
    re.lastIndex = end;
  }
  return out;
}

/** Does anything OUTSIDE the routine's own body actually run it?
 *
 *  `CREATE FUNCTION f(`, `DROP FUNCTION f(`, `REVOKE EXECUTE ON FUNCTION f(` and
 *  `COMMENT ON FUNCTION f(` all name it as an object. `EXECUTE FUNCTION f()`
 *  inside a CREATE TRIGGER is the one place that spelling means the opposite, so
 *  it is excluded from the exclusion. */
function fileInvokes(sql: string, name: string, bodyFrom: number, bodyTo: number): boolean {
  const re = new RegExp(String.raw`(?:"?[A-Za-z_][\w]*"?\s*\.\s*)?"?` + name + String.raw`"?\s*\(`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    if (m.index >= bodyFrom && m.index < bodyTo) continue; // recursion inside itself
    const before = sql.slice(Math.max(0, m.index - 64), m.index);
    const namesIt = /\b(?:function|procedure)\s+(?:"?[A-Za-z_][\w]*"?\s*\.\s*)?$/i.test(before);
    const attaches = /\bexecute\s+(?:function|procedure)\s+(?:"?[A-Za-z_][\w]*"?\s*\.\s*)?$/i.test(before);
    if (namesIt && !attaches) continue;
    return true;
  }
  return false;
}

/** Split a PL/pgSQL expression on its TOP-LEVEL `||`. Parentheses, string
 *  literals and dollar quotes are stepped over whole, so `format('a || b', x)`
 *  is ONE operand and `'a' || f(b || c)` is two. */
function splitConcat(expr: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "'") {
      i = findSingleQuoteEnd(expr, i);
      continue;
    }
    const tag = matchDollarTag(expr, i);
    if (tag) {
      const end = expr.indexOf(tag, i + tag.length);
      i = end === -1 ? expr.length : end + tag.length;
      continue;
    }
    if (expr[i] === "(") depth += 1;
    else if (expr[i] === ")") depth -= 1;
    else if (depth === 0 && expr[i] === "|" && expr[i + 1] === "|") {
      out.push(expr.slice(start, i));
      i += 2;
      start = i;
      continue;
    }
    i += 1;
  }
  out.push(expr.slice(start));
  return out.map((o) => o.trim()).filter((o) => o.length > 0);
}

/**
 * Every fragment assembled into `name` inside one block, IN SOURCE ORDER, with
 * `OPAQUE_FRAGMENT` standing where a value could not be read.
 *
 * WHY NOT JUST "the literals", which is what this used to collect. 0102 builds
 * its statement as `stmt := format('ALTER POLICY %I ON %I.%I', ...)` and then
 * appends `' USING (' || new_qual || ')'`, so the fragments -- not the final
 * value -- are what says which OPERATION it can perform. Keeping only the
 * literals made every NON-literal operand invisible, and the r42 artifact gate
 * used exactly that:
 *
 *   role_clause text := ' TO anon';
 *   stmt := 'ALTER POLICY records_owner_all ON public.records' || role_clause;
 *   EXECUTE stmt;
 *
 * read as a bare `ALTER POLICY <target>` and was EXEMPTED as an expression-only
 * rewrite, while the database moved the policy to `anon`.
 *
 * Two things close it. A local variable is FOLLOWED -- `role_clause`'s own
 * literal is spliced in where it belongs, and the ` TO ` becomes visible to
 * every test downstream. Anything else (a record field like 0102's `r.qual`, a
 * function result) becomes an OPAQUE_FRAGMENT that KEEPS ITS POSITION, which is
 * what lets `isExpressionOnlyPolicyRewrite` insist it sits inside a parenthesis
 * the literals themselves opened and closed.
 *
 * The DECLARE form counts as an assignment: `role_clause text := ' TO anon'`
 * and `role_clause := ' TO anon'` are the same statement with the type written
 * once, and reading only the second is how the gate's variable stayed hidden.
 */
function assembleFragments(body: string, name: string, seen: Set<string> = new Set<string>()): string[] {
  const out: string[] = [];
  const next = new Set(seen);
  next.add(name.toLowerCase());
  const re = new RegExp(
    String.raw`\b` + name + String.raw`\b(?:\s+[A-Za-z_][\w]*(?:\s*\([^)]*\))?(?:\s*\[\s*\])?)?\s*:=\s*([^;]*);`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    for (const operand of splitConcat(m[1])) {
      const lit = /^'((?:[^']|'')*)'$/.exec(operand);
      if (lit) {
        out.push(lit[1].replace(/''/g, "'"));
        continue;
      }
      const tag = matchDollarTag(operand, 0);
      if (tag && operand.length >= tag.length * 2 && operand.endsWith(tag)) {
        out.push(operand.slice(tag.length, operand.length - tag.length));
        continue;
      }
      const fmt = /^(?:[A-Za-z_]\w*\s*\.\s*)?format\s*\(\s*'((?:[^']|'')*)'/i.exec(operand);
      if (fmt) {
        out.push(fmt[1].replace(/''/g, "'"));
        continue;
      }
      const ident = /^"?([A-Za-z_][\w]*)"?$/.exec(operand);
      if (ident) {
        if (next.has(ident[1].toLowerCase())) continue; // self-reference: already collected
        const nested = assembleFragments(body, ident[1], next);
        out.push(...(nested.length > 0 ? nested : [OPAQUE_FRAGMENT]));
        continue;
      }
      out.push(OPAQUE_FRAGMENT);
    }
  }
  return out;
}

/**
 * Every `EXECUTE <payload>` a block runs, with the payload's literal fragments.
 *
 * ONE PASS, AND IT CONSUMES THE PAYLOAD. A regex sweep for `\bexecute\b` finds
 * the word again INSIDE the string it just read -- `EXECUTE 'REVOKE EXECUTE ON
 * FUNCTION ...'` has two -- and the second match reads `ON FUNCTION ...` as an
 * unresolvable identifier, which fails closed on a statement the first match
 * had already cleared. Measured on 0015 while writing this.
 *
 * `GRANT EXECUTE` / `REVOKE EXECUTE` are privilege verbs, not dynamic SQL, and
 * are skipped by looking at the word in front (0074, 0141, 0186).
 */
function collectExecutePayloads(body: string): { fragments: string[]; resolved: boolean }[] {
  const out: { fragments: string[]; resolved: boolean }[] = [];
  let i = 0;
  while (i < body.length) {
    // Skip over literals so the word inside one is never read as a keyword.
    // `has_function_privilege('anon', '...', 'EXECUTE')` in 0141 is the case
    // that makes this necessary.
    if (body[i] === "'") {
      i = findSingleQuoteEnd(body, i);
      continue;
    }
    // stripSqlComments only takes the TOP-LEVEL ones, so a `-- ... via EXECUTE
    // so` note inside a DO body still reaches here (0074).
    if (body.startsWith("--", i)) {
      const nl = body.indexOf("\n", i);
      i = nl === -1 ? body.length : nl + 1;
      continue;
    }
    if (body.startsWith("/*", i)) {
      const close = body.indexOf("*/", i + 2);
      i = close === -1 ? body.length : close + 2;
      continue;
    }
    const skipTag = matchDollarTag(body, i);
    if (skipTag) {
      const end = body.indexOf(skipTag, i + skipTag.length);
      i = end === -1 ? body.length : end + skipTag.length;
      continue;
    }
    const kw = /^execute\b\s*/i.exec(body.slice(i));
    if (!kw || (i > 0 && /[\w$]/.test(body[i - 1]))) {
      i += 1;
      continue;
    }
    // `GRANT EXECUTE` / `REVOKE EXECUTE` are privilege verbs, not dynamic SQL.
    if (/\b(grant|revoke|no)\s*$/i.test(body.slice(Math.max(0, i - 24), i))) {
      i += kw[0].length;
      continue;
    }

    const at = i + kw[0].length;
    const rest = body.slice(at);
    let consumed: number;
    let payload: { fragments: string[]; resolved: boolean };

    const tag = matchDollarTag(rest, 0);
    // `format(...)` may be schema-qualified: 0186 writes `pg_catalog.format(`.
    const fmt = /^(?:[a-z_]\w*\s*\.\s*)?format\s*\(\s*(?=')/i.exec(rest);
    const ident = /^([A-Za-z_][\w]*)/.exec(rest);
    if (rest.startsWith("'")) {
      const end = findSingleQuoteEnd(rest, 0);
      payload = { fragments: [rest.slice(1, Math.max(1, end - 1)).replace(/''/g, "'")], resolved: true };
      consumed = end;
    } else if (tag) {
      const end = rest.indexOf(tag, tag.length);
      payload = { fragments: [rest.slice(tag.length, end === -1 ? rest.length : end)], resolved: true };
      consumed = end === -1 ? rest.length : end + tag.length;
    } else if (fmt) {
      const q = fmt[0].length;
      const end = findSingleQuoteEnd(rest, q);
      payload = { fragments: [rest.slice(q + 1, Math.max(q + 1, end - 1)).replace(/''/g, "'")], resolved: true };
      consumed = end;
    } else if (ident) {
      // `resolved` means A LITERAL WAS ACTUALLY READ, not "something came
      // back". A payload assembled entirely out of values this parser cannot
      // follow is the `EXECUTE sql_text` case and must fail closed.
      const fragments = assembleFragments(body, ident[1]);
      payload = { fragments, resolved: fragments.some((f) => f !== OPAQUE_FRAGMENT) };
      consumed = ident[0].length;
    } else {
      payload = { fragments: [], resolved: false };
      consumed = 1;
    }

    out.push(payload);
    i = at + Math.max(consumed, 1);
  }
  return out;
}

/** Which registry-shaped tables a payload names, and whether its reach is
 *  bounded at all. `%I` placeholders and schema-wide grants are unbounded. */
function dynamicTargets(text: string): { named: string[]; unbounded: boolean } {
  if (UNBOUNDED_ACL.test(text)) return { named: [], unbounded: true };
  const named: string[] = [];
  let unbounded = false;
  const re = /\bon\s+(?:table\s+)?([^\s,;()]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].toLowerCase().replace(/[;"]/g, "");
    const head = raw.split(".")[0];
    if (NON_TABLE_GRANT_OBJECTS.has(head)) continue;
    if (raw.includes("%")) {
      unbounded = true;
      continue;
    }
    const parts = raw.split(".");
    // storage.* and auth.* are outside the registry by design.
    if (parts.length === 2 && parts[0] !== "public") continue;
    const name = parts[parts.length - 1];
    if (!/^[a-z_][\w]*$/.test(name)) {
      unbounded = true;
      continue;
    }
    named.push(name);
  }
  return { named, unbounded };
}

/**
 * Can this dynamic payload do anything except rewrite a policy's USING /
 * WITH CHECK expression?
 *
 * WHY THE EXEMPTION EXISTS, AND WHY IT IS NOT A WAIVER. 0102 rewrites every
 * policy in `public` that calls `auth.uid()` into the initplan-hoisted
 * `(select auth.uid())` spelling, by reading pg_policies at run time and
 * issuing `ALTER POLICY %I ON %I.%I USING (...)`. Its target set is genuinely
 * unbounded -- it names no table -- so nothing static can say which policies
 * it touched. That is precisely why this guard no longer judges policy
 * EXPRESSIONS: the sentence "the final USING binds the owner to the caller"
 * has not been readable from db/migrations since 0102 landed, and the three
 * spellings a previous version of this guard enshrined were read off CREATE
 * statements that 0102 had already rewritten in the database.
 *
 * A statement that can only change expressions therefore cannot invalidate
 * anything the static guard still asserts. It is counted and printed, never
 * silent, and the moment its fragments gain a `TO`, a `DROP`, a `CREATE` or a
 * `GRANT`/`REVOKE` it stops qualifying and fails closed.
 *
 * WHAT IT STILL CANNOT SEE, stated rather than left to be discovered: a value
 * spliced strictly inside the USING parenthesis is taken on trust, because
 * evaluating it is the one thing a static reader cannot do. 0102 is sound
 * there for a reason outside this file -- pg_policies renders `qual` through
 * pg_get_expr, which cannot emit an unbalanced parenthesis -- and a future
 * migration that splices an unchecked string into the same position would be
 * exempted on the same terms. Everywhere ELSE in the payload, including the
 * clause position the r42 gate used, an unreadable value now fails closed.
 */
function isExpressionOnlyPolicyRewrite(text: string): boolean {
  if (!/^alter\s+policy\b/i.test(text)) return false;
  if (/\b(create|drop|grant|revoke|truncate|rename|enable|disable|force)\b/i.test(text)) return false;
  const afterTarget = text.replace(/^alter\s+policy[\s\S]*?\bon\b\s*\S*/i, "");
  if (/\bto\b/i.test(afterTarget)) return false;
  // An OPAQUE_FRAGMENT is a value this parser could not read, and the r42
  // artifact gate's second reproduction is what this loop answers: a payload
  // assembled as `'ALTER POLICY x ON public.y' || role_clause` used to be
  // exempted because only the literal half was looked at. A value is tolerable
  // ONLY where it cannot BE structure -- strictly inside a parenthesis that the
  // LITERALS themselves opened and closed, which is 0102's `' USING (' ||
  // new_qual || ')'` and nothing else. At depth 0 it could be a whole clause,
  // so it fails closed.
  let depth = 0;
  let cleaned = "";
  for (let i = 0; i < afterTarget.length; i += 1) {
    if (afterTarget.startsWith(OPAQUE_FRAGMENT, i)) {
      if (depth < 1) return false;
      i += OPAQUE_FRAGMENT.length - 1;
      continue;
    }
    const ch = afterTarget[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    cleaned += ch;
  }
  return cleaned.replace(/\busing\b|\bwith\s+check\b/gi, "").replace(/[\s()]/g, "") === "";
}

export type DynamicDdlVerdict =
  | { kind: "out-of-scope" }
  | { kind: "expression-only"; detail: string }
  | { kind: "beyond"; detail: string; tables: string[] | null };

/** The parenthesised expression that follows a `USING` keyword ending at
 *  `after`, or null when it cannot be read.
 *
 *  Read with the paren matcher rather than a bounded regex: a real USING nests
 *  parens, NOT EXISTS and sub-selects (0097's clipper_templates_read does all
 *  three), and a truncated expression is worse than none -- it would normalise
 *  to something an allowlist might accept. Null here means UNREADABLE, which
 *  the caller must keep distinct from "the policy has no USING". */
function readUsingExpression(sql: string, after: number): string | null {
  const open = sql.indexOf("(", after);
  // Only whitespace may sit between `USING` and its `(`; anything else means
  // the `(` belongs to a later statement.
  if (open === -1 || sql.slice(after, open).trim() !== "") return null;
  const close = matchParen(sql, open);
  return close === -1 ? null : sql.slice(open + 1, close);
}

export function classifyDynamicDdl(fragments: string[], resolved: boolean): DynamicDdlVerdict {
  const text = fragments.join(" ").replace(/\s+/g, " ").trim();
  if (!resolved) {
    return { kind: "beyond", detail: "EXECUTE of a value this parser cannot read", tables: null };
  }
  if (!REGISTRY_DDL_KEYWORDS.test(text)) return { kind: "out-of-scope" };
  const targets = dynamicTargets(text);
  if (!targets.unbounded && targets.named.length === 0) return { kind: "out-of-scope" };
  if (isExpressionOnlyPolicyRewrite(text)) return { kind: "expression-only", detail: text.slice(0, 160) };
  return { kind: "beyond", detail: text.slice(0, 200), tables: targets.unbounded ? null : targets.named };
}

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
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS "BEYOND THE MODEL" (added 2026-09-20 after the r41 gates).
 *
 * Three gates in a row walked standard PostgreSQL past this replay while it
 * stayed green, and every one of them was the same mistake: the parser met a
 * construct it does not implement and CARRIED ON with its previous belief.
 * `ALTER POLICY ... USING (user_id <> auth.uid())` left the old CREATE's `=`
 * in place; a second `FOR ALL USING (true)` was ORed in by Postgres and
 * ignored here; `AS RESTRICTIVE ... USING (false)` was ANDed on and ignored
 * here; `EXECUTE 'DROP POLICY ...'` removed the policy in the database and
 * nothing at all in the model.
 *
 * Implementing SQL semantics is the wrong answer to that -- the gate that
 * found it said so in as many words: "a boundary that explicitly FAILS on the
 * syntax it does not model and hands the verdict to a real catalog / role test
 * is smaller and verifiable". So this replay now models what it can
 * (`ALTER POLICY` in its literal form) and RECORDS what it cannot in
 * `beyondModel`, and `check:erasure-registry` turns each record into a
 * failure. The delete verdict itself now lives in
 * db/tests/erasure_registry_regression.sql, which deletes real rows as the
 * real `authenticated` role.
 * ---------------------------------------------------------------------------
 */
export function replayMigrations(migrationsDir: string): SchemaReplay {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const tables = new Map<string, DiscoveredTable>();
  const policies = new Map<string, Map<string, PolicyState>>();
  const tablePrivileges = new Map<string, Map<string, Set<string>>>();
  const beyondModel: BeyondModel[] = [];
  const expressionOnlyRewrites: ExpressionOnlyRewrite[] = [];
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
    const raw = stripSqlComments(readFileSync(join(migrationsDir, file), "utf8"));
    const sql = maskInertSql(raw);
    const events: ReplayEvent[] = [];
    let m: RegExpExecArray | null;

    // Dynamic DDL, read from the UNMASKED text: the payload lives inside the
    // very literals `maskInertSql` blanks, which is exactly why the r41
    // artifact gate's `EXECUTE 'DROP POLICY ...'` vanished (M1).
    for (const block of executedBlocks(raw)) {
      for (const payload of collectExecutePayloads(block.body)) {
        const verdict = classifyDynamicDdl(payload.fragments, payload.resolved);
        if (verdict.kind === "out-of-scope") continue;
        if (verdict.kind === "expression-only") {
          expressionOnlyRewrites.push({ file, detail: verdict.detail });
          continue;
        }
        beyondModel.push({ kind: "dynamic-ddl", file, detail: verdict.detail, tables: verdict.tables });
      }
    }

    // Schema-wide GRANT / REVOKE and ALTER DEFAULT PRIVILEGES. These change
    // every table at once, so the per-table ACL replay below cannot see them
    // and `ownerRoleCanDelete` keeps answering from a baseline the statement
    // has already moved (r41 gate F2 / M3).
    const schemaWideRe = new RegExp(UNBOUNDED_ACL.source, "gi");
    while ((m = schemaWideRe.exec(sql)) !== null) {
      const at = m.index;
      beyondModel.push({
        kind: "schema-wide-acl",
        file,
        detail: sql.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, " ").trim(),
        tables: null,
      });
    }

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
      let usingUnreadable = false;
      if (/^using$/i.test(m[4])) {
        using = readUsingExpression(sql, m.index + m[0].length);
        usingUnreadable = using === null;
      }
      // `AS RESTRICTIVE` is ANDed on top of the permissive set instead of being
      // ORed into it, so it can veto rows an owner policy admits. Recorded, not
      // modelled -- the checker fails closed on it.
      const permissive = !/\bas\s+restrictive\b/i.test(tail);
      events.push({
        at: m.index,
        apply: () => {
          policySlot(table).set(name, { command, roles, using, file, permissive, usingUnreadable });
        },
      });
    }

    // ALTER POLICY, in its literal form. The r41 gates walked
    // `ALTER POLICY p ON t USING (user_id <> auth.uid())` and
    // `ALTER POLICY p ON t TO anon` straight through this replay, because it
    // modelled only CREATE and DROP and therefore kept believing the original
    // CREATE. Postgres rewrites the live policy in place; so does this now.
    // (The DYNAMIC form -- 0102 -- cannot be modelled and is handled above.)
    const alterPolicyRe =
      /\balter\s+policy\s+"?([A-Za-z_][\w]*)"?\s+on\s+(?:(?:public|storage)\s*\.\s*)?"?([A-Za-z_][\w]*)"?([\s\S]{0,240}?)(using|with\s+check|rename\s+to|;)/gi;
    while ((m = alterPolicyRe.exec(sql)) !== null) {
      const name = m[1].toLowerCase();
      const table = m[2].toLowerCase();
      const tail = m[3];
      const terminator = m[4].toLowerCase().replace(/\s+/g, " ");
      const roles = /\bto\s+([a-z_,\s"]+)/i.exec(tail)?.[1]?.trim() ?? null;
      const renamed = terminator === "rename to"
        ? /^\s*"?([A-Za-z_][\w]*)"?/.exec(sql.slice(m.index + m[0].length))?.[1]?.toLowerCase() ?? null
        : null;
      let using: string | null = null;
      let usingUnreadable = false;
      if (terminator === "using") {
        using = readUsingExpression(sql, m.index + m[0].length);
        usingUnreadable = using === null;
      }
      events.push({
        at: m.index,
        apply: () => {
          const slot = policySlot(table);
          const current = slot.get(name);
          if (!current) return; // ALTER of a policy this replay never saw created
          if (renamed) {
            slot.delete(name);
            slot.set(renamed, { ...current, file });
            return;
          }
          slot.set(name, {
            ...current,
            file,
            roles: roles ?? current.roles,
            using: terminator === "using" ? using : current.using,
            usingUnreadable: terminator === "using" ? usingUnreadable : current.usingUnreadable,
          });
        },
      });
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
    //
    // `GRANT OPTION FOR` is CAPTURED and skipped, not swallowed:
    // `REVOKE GRANT OPTION FOR DELETE ...` takes away the right to re-grant
    // DELETE and leaves DELETE itself in place. Folding it into the privilege
    // list made the model delete the privilege and turn a working table red
    // (r41 gate F2, `grant_option_only RED`).
    const aclRe =
      /\b(grant|revoke)\s+(grant\s+option\s+for\s+)?((?:[a-z]+(?:\s+privileges)?(?:\s*\([^)]*\))?\s*,\s*)*[a-z]+(?:\s+privileges)?(?:\s*\([^)]*\))?)\s+on\s+(?:table\s+)?((?:(?:public\s*\.\s*)?"?[A-Za-z_][\w]*"?\s*,\s*)*(?:public\s*\.\s*)?"?[A-Za-z_][\w]*"?)\s+(?:to|from)\s+((?:"?[A-Za-z_][\w]*"?\s*,\s*)*"?[A-Za-z_][\w]*"?)/gi;
    while ((m = aclRe.exec(sql)) !== null) {
      if (m[2]) continue;
      const verb = m[1].toLowerCase();
      const privileges = parsePrivilegeList(m[3]);
      const names = m[4].split(",").map(normalizeSqlName).filter(Boolean);
      const grantees = m[5].split(",").map(normalizeSqlName).filter(Boolean);
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

  return { tables, policies, foreignKeys, tablePrivileges, beyondModel, expressionOnlyRewrites };
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
