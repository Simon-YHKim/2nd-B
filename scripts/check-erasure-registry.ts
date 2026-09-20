// check:erasure-registry -- keeps the deletion registry honest against the schema.
//
// WHY THIS EXISTS. docs/S3-SERVER-DELETION.md measured three defects in the
// hand-maintained delete list, and all three are the same defect:
//
//   F1  `deleteAllUserData` DELETEs chat_usage and reports the row count. That
//       count is always 0, because 0025 dropped chat_usage_owner_all and left a
//       SELECT-only policy. RLS filters rows, it does not raise, so a wipe that
//       erased nothing reported success.
//   F2  A comment in delete-bulk.ts claimed personas had no DELETE policy. It has
//       had `personas_owner_all FOR ALL` since 0009.
//   F4  Eleven owner-deletable tables were never in the delete list at all.
//
// Prose cannot hold a fact this shaped. So the classification lives in
// db/erasure-registry.json and this guard re-derives the schema every run and
// refuses to let the two disagree. Seven rules, each tied to the defect it stops:
//
//   G1 completeness    every public table with an owner column is classified   (F4)
//   G2 no stale rows   every classified table still exists                     (drift)
//   G3 no contradiction  db/migrations does not CONTRADICT client_erasable,   (F1)
//                        and does not hide the question in syntax this parser
//                        cannot model. It no longer claims the owner CAN
//                        delete -- see "WHERE THE DELETE VERDICT LIVES" below.
//   G4 policy match    account_delete_only really has neither                  (F4/F2)
//   G5 well-formed     reason present, owner column real, delete order sane
//   G6 retention       the retention ledgers are never erasure targets
//   G7 one original    0189's seed block is byte-identical to a fresh render
//   G8 cascade order   a CASCADE child is deleted before its parent           (F2)
//   G9 cascade honesty a kept table that a CASCADE empties says so            (F3)
//   G10 floor honesty  the catalog test's privilege floor reproduces the      (F1)
//                      Supabase default and never grants back a privilege
//                      db/migrations revoked -- see the long note at the rule
//
// G8/G9 were added on 2026-09-20 after the r38 gate. Both are about the RECEIPT
// telling the truth, and both come from the same blind spot: the registry only
// ever looked at what an explicit DELETE names, while a foreign key removes rows
// nobody named. G8: wiki_links sat AFTER its parent wiki_pages, so the cascade
// emptied it first and its ROW_COUNT came back 0 -- the F1 shape again, this time
// inside the receipt. G9: content_reports was reported as "kept" while
// clipper_templates took it along, and a reporter cannot even delete their own
// report (0097 grants authenticated SELECT, INSERT only), so the row vanished by
// someone else's hand. Neither rule changes what is deleted; they force the
// registry to state what the schema already does.
//
// G3/G4 read the migrations, not production. That is the honest limit and it is
// stated in the failure text: prod is behind main, so a policy added after the
// last applied migration is true here and not yet true there.
//
// ===========================================================================
// WHERE THE DELETE VERDICT LIVES (boundary moved 2026-09-20, r42)
// ===========================================================================
//
// For three review rounds G3 answered the question "CAN the owner delete this
// table?", and for three rounds ordinary PostgreSQL walked past it green:
//
//   r40  `USING (false)` · `REVOKE DELETE` · a policy that existed only inside
//        `RAISE NOTICE '...'`
//   r41  `ALTER POLICY ... USING (user_id <> auth.uid())` (the parser kept
//        believing the original CREATE's `=`) · a second `FOR ALL USING (true)`
//        that Postgres ORs in · `AS RESTRICTIVE ... USING (false)` that
//        Postgres ANDs on · a narrowed SELECT policy · `EXECUTE 'DROP POLICY'`
//        in single quotes · `REVOKE ... ON ALL TABLES IN SCHEMA public`
//
// Each round closed the exact spellings it was shown and the next round found
// equivalent ones, because the question was never answerable from text. The
// r41 authorization gate said so in its own conclusion: "a boundary that
// explicitly FAILS on the syntax it does not model, and hands the decision to
// a real catalog / role test, is smaller and verifiable."
//
// AND THE REPO ALREADY PROVED IT. 0102_rls_wrap_auth_uid.sql reads pg_policies
// at run time and issues `ALTER POLICY %I ON %I.%I USING (...)` for every
// policy in `public` that calls auth.uid(). It names no table. So the sentence
// "the final USING of this table's delete policy is <x>" has not been readable
// from db/migrations since 0102 landed -- and the three USING spellings a
// previous version of this file enshrined as an allowlist were read off CREATE
// statements that 0102 had already rewritten in the database.
//
//   STATIC GUARD (this file)        CATALOG TEST (db/tests/erasure_registry_regression.sql)
//   ------------------------        -----------------------------------------------------
//   G1 every owned table is         for each of the 26 client_erasable tables, as the real
//      classified                   `authenticated` role with A's JWT claim:
//   G2 no stale rows                  (1) DELETE of B's row affects 0 rows and B's row survives
//   G5 well-formed entries            (2) DELETE of A's own row affects exactly 1 row
//   G6 retention ledgers kept       Policy composition, RESTRICTIVE, role inheritance and
//   G7 seed == JSON                 0102's live rewrite are INSIDE that observation; the
//   G8/G9 FK order + cascades       table ACL is NOT -- that verdict is G3b + G10.
//   G3 no contradiction, and
//      FAIL CLOSED on anything
//      beyond the model
//
// WHAT G3 NO LONGER ASSERTS, in as many words: that the FINAL EFFECTIVE policy
// set permits the owner to delete. It asserts only that db/migrations does not
// contradict the claim and does not put it out of reach. When it cannot tell,
// it fails and names the catalog test. A guard that answers "I cannot tell" is
// worth more than one that answers "yes" from evidence it does not have.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  discoverOwnedTables,
  extractRegistrySql,
  loadRegistry,
  migrationsDir,
  renderRegistrySql,
  replayMigrations,
  ownerRoleCanDelete,
  ownerRoleCanSelect,
  policyRolesInclude,
  ERASURE_CLASSES,
  REGISTRY_PATH,
  type ErasureClass,
  type ForeignKeyEdge,
  type PolicyState,
  type Registry,
} from "./generate-erasure-registry";

/** The migration that carries the DB-side copy of the registry. */
const REGISTRY_MIGRATION = "0189_erasure_registry.sql";

/** The catalog test, and the file G10 keeps honest. */
const REGRESSION_SQL = join("db", "tests", "erasure_registry_regression.sql");

/** The marker on the one line in REGRESSION_SQL that G10 owns. */
const ACL_PIN_RE = /v_revoked_pin\s+text\s*:=\s*'([^']*)';\s*--\s*G10-ACL-PIN/;

/** The two verbs block (8) of the catalog test depends on, and therefore the
 *  only two whose loss the privilege floor must not paper over. */
const FLOOR_PRIVILEGES = ["select", "delete"] as const;

/** Ledgers the erasure path must never target. The dispatch and
 *  docs/S3-SERVER-DELETION.md 6 both name these five; pinning them here means a
 *  future edit that reclassifies one has to delete this line and explain why. */
const MUST_BE_RETAINED = [
  "consent_records",
  "ai_audit_log",
  "revenue_events",
  "credit_ledger",
  "paddle_webhook_events",
];

/**
 * The USING shapes this repo's owner-delete policies actually use.
 *
 * HOW THIS LIST WAS DERIVED. Not by grep and not by hand: `replayMigrations`
 * was run over db/migrations and the FINAL surviving DELETE-or-ALL policy of
 * each of the 26 `client_erasable` tables was printed with its USING text
 * (2026-09-20, all 172 migrations). Exactly three spellings came back:
 *
 *   <owner> = auth.uid()             17  records, personas, testimonials,
 *                                        wiki_pages, sources, ops_*, ...
 *   <owner> = (select auth.uid())     6  star_tier_history, relation_people,
 *                                        recreation_items, ops_routine_logs,
 *                                        srs_reviews, template_blocks
 *   (select auth.uid()) = <owner>     3  persona_entity, persona_relation,
 *                                        persona_reasoning_trace
 *
 * `(select auth.uid())` is the initplan-hoisted spelling 0061/0084/0097/0103
 * introduced for performance; it is the same value, so it normalises away. The
 * operand order does not matter either, so both sides are accepted.
 *
 * WHAT THIS LIST IS NOW FOR (changed 2026-09-20, r42). It is no longer the
 * evidence that the owner can delete -- the catalog test is. It is a
 * CONTRADICTION DETECTOR: if the parser can read the final USING and that text
 * does NOT bind the owner to the caller, db/migrations and the registry are
 * saying different things and one of them is wrong. `USING (false)`,
 * `USING (user_id <> auth.uid())` and a policy with no USING at all are each a
 * contradiction in that sense. An expression the parser CANNOT read is not a
 * pass and not a contradiction: it is G3c, fail closed.
 */
function normalizeUsingExpression(expr: string): string {
  const collapsed = expr
    .toLowerCase()
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .replace(/\(\s*select\s+auth\s*\.\s*uid\s*\(\s*\)\s*\)/g, "auth.uid()")
    .replace(/\bauth\s*\.\s*uid\s*\(\s*\)/g, "auth.uid()")
    .trim();
  return stripEnclosingParens(collapsed);
}

/** `((a = b))` -> `a = b`. `(a) = (b)` is left alone: those parens do not
 *  enclose the whole expression, and stripping them would corrupt it. */
function stripEnclosingParens(expr: string): string {
  let out = expr.trim();
  while (out.startsWith("(") && out.endsWith(")")) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] === "(") depth += 1;
      else if (out[i] === ")") {
        depth -= 1;
        if (depth === 0 && i < out.length - 1) {
          wrapsWhole = false;
          break;
        }
      }
    }
    if (!wrapsWhole) break;
    out = out.slice(1, -1).trim();
  }
  return out;
}

/** Does this policy's USING bind the registry's owner column to the caller?
 *  A null USING is NOT owner-bound: Postgres leaves such a policy's row filter
 *  unset, which on a FOR ALL policy would let the caller delete everyone. */
export function isOwnerBoundUsing(using: string | null, ownerColumn: string): boolean {
  if (typeof using !== "string") return false;
  const normalized = normalizeUsingExpression(using);
  const owner = ownerColumn.toLowerCase();
  return normalized === `${owner} = auth.uid()` || normalized === `auth.uid() = ${owner}`;
}

/** Policies whose HEADER could reach a DELETE. Deliberately loose, and G3 and
 *  G4 want it at different tightnesses:
 *
 *   G3 authorises destruction, so it must be STRICT -- it goes on to demand an
 *      owner-bound USING and a surviving DELETE grant.
 *   G4 hunts for an unclaimed delete path, so it must stay LOOSE -- a policy it
 *      cannot fully read is a reason to ask, not a reason to wave through.
 *
 *  Same input, opposite safe directions. Do not "unify" them. */
function ownerDeletePolicies(
  policies: Map<string, Map<string, PolicyState>>,
  table: string,
): { name: string; state: PolicyState }[] {
  const found: { name: string; state: PolicyState }[] = [];
  for (const [name, state] of policies.get(table) ?? new Map<string, PolicyState>()) {
    if (state.command !== "delete" && state.command !== "all") continue;
    // service_role bypasses RLS anyway; a policy scoped only to it is not an
    // owner-facing delete path. Matched as whole tokens: `/authenticated/` also
    // accepts the DIFFERENT role `not_authenticated` (r41 artifact gate, M2).
    if (!policyRolesInclude(state.roles, "authenticated") && !policyRolesInclude(state.roles, "public")) continue;
    found.push({ name, state });
  }
  return found;
}

/** A row filter that is a constant admits either nothing or everything, and on
 *  an erasable table neither is ever right: `USING (false)` is the chat_usage
 *  defect (F1) and `USING (true)` hands the caller every other user's rows once
 *  Postgres ORs it into the permissive set. Both are reported as beyond the
 *  model rather than judged, because what the constant DOES depends on the
 *  other policies on the table -- which is exactly what this guard stopped
 *  claiming to know. */
function constantUsing(using: string | null): string | null {
  if (typeof using !== "string") return null;
  const normalized = normalizeUsingExpression(using);
  return normalized === "true" || normalized === "false" ? normalized : null;
}

function isErasureClass(value: unknown): value is ErasureClass {
  return typeof value === "string" && (ERASURE_CLASSES as readonly string[]).includes(value);
}

/**
 * Every rule, as a list of human-readable failures. Exported so the tests can
 * feed it a mutated tree and prove the guard actually goes red - a guard nobody
 * has seen fail is a guard nobody has tested.
 */
export function collectErasureRegistryErrors(root: string): string[] {
  const MIGRATIONS = migrationsDir(root);
  const errors: string[] = [];
  const replay = replayMigrations(MIGRATIONS);
  const discovered = discoverOwnedTables(MIGRATIONS);
  const discoveredByName = new Map(discovered.map((d) => [d.table, d]));

  let registry: Registry;
  try {
    registry = loadRegistry(root);
  } catch (e) {
    return [`${REGISTRY_PATH} could not be read: ${String(e)}`];
  }

  const policies = replay.policies;

  // G1 -- a new user-owned table must be classified before it can merge.
  for (const d of discovered) {
    if (d.table in registry.tables) continue;
    errors.push(
      `G1 ${d.table} (${d.definedIn}) has an owner column (${d.ownerColumns
        .map((c) => c.name)
        .join(", ")}) but no entry in ${REGISTRY_PATH}. ` +
        `Run \`npx tsx scripts/generate-erasure-registry.ts --missing\` and classify it. ` +
        `Leaving it out is how eleven tables drifted out of the delete list (F4).`,
    );
  }

  // G2 -- and a table that is gone must not linger in the registry.
  for (const table of Object.keys(registry.tables)) {
    if (discoveredByName.has(table)) continue;
    errors.push(
      `G2 ${REGISTRY_PATH} classifies ${table}, but no CREATE TABLE in db/migrations gives it ` +
        `an owner column. Remove the entry, or fix the owner-column name.`,
    );
  }

  const seenOrders = new Map<number, string>();
  for (const [table, entry] of Object.entries(registry.tables)) {
    const discoveredEntry = discoveredByName.get(table);
    if (!discoveredEntry) continue; // already reported by G2

    // G5 -- well-formedness. A classification without a reason is how the wrong
    // fate becomes invisible; require one for every class, not only `retained`.
    if (!isErasureClass(entry.class)) {
      errors.push(`G5 ${table}: class must be one of ${ERASURE_CLASSES.join(" | ")}, got ${String(entry.class)}`);
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 10) {
      errors.push(`G5 ${table}: every entry needs a written reason (>= 10 chars).`);
    }
    if (!discoveredEntry.ownerColumns.some((c) => c.name === entry.owner)) {
      errors.push(
        `G5 ${table}: owner "${entry.owner}" is not a column the schema gives it. ` +
          `Candidates: ${discoveredEntry.ownerColumns.map((c) => c.name).join(", ")}`,
      );
    }
    if (entry.class === "client_erasable") {
      if (typeof entry.order !== "number" || !Number.isInteger(entry.order)) {
        errors.push(`G5 ${table}: client_erasable needs an integer "order" (FK and CHECK order is real).`);
      } else {
        const clash = seenOrders.get(entry.order);
        if (clash) errors.push(`G5 ${table}: delete order ${entry.order} already used by ${clash}.`);
        else seenOrders.set(entry.order, table);
      }
    } else if (entry.order !== undefined) {
      errors.push(`G5 ${table}: only client_erasable carries a delete order.`);
    }

    const deletable = ownerDeletePolicies(policies, table);

    // G3 -- not "can the owner delete" any more. Three narrower questions:
    //   a  does db/migrations CONTRADICT client_erasable?
    //   b  has the declared delete path been taken away outright?
    //   c  is the answer hidden in syntax this parser does not model?
    // (c) is the new one and is the point of the redesign: it FAILS instead of
    // carrying on, and names the test that can actually decide.
    if (entry.class === "client_erasable") {
      const sendToCatalog = (why: string): void => {
        errors.push(
          `G3c ${table}: ${why} This parser does not model that, and the delete verdict is no longer ` +
            `its to give. Decide it in db/tests/erasure_registry_regression.sql, which deletes real ` +
            `rows as the real \`authenticated\` role and is run by the "Exercise content-erasure RPC" ` +
            `step of .github/workflows/supabase-dry-run.yml. If the statement is genuinely safe, the ` +
            `way to say so is an observation there, not a wider regex here.`,
        );
      };

      // G3b -- the declaration is gone. Two independent gates, both text-level.
      if (deletable.length === 0) {
        errors.push(
          `G3b ${table} is client_erasable but db/migrations leaves it with no DELETE or ALL policy ` +
            `for authenticated or PUBLIC. That is the chat_usage defect (F1): the DELETE would match ` +
            `0 rows and report success. Either add the policy in a migration, or reclassify.`,
        );
      }
      for (const gate of [
        { held: ownerRoleCanDelete(replay, table), verb: "DELETE" },
        // SELECT is not a nicety: `DELETE ... WHERE owner = auth.uid()` reads
        // the owner column, so Postgres applies the SELECT policy and the
        // SELECT privilege to it (r41 gate F2, `revoke_select GREEN`).
        { held: ownerRoleCanSelect(replay, table), verb: "SELECT" },
      ]) {
        if (gate.held) continue;
        errors.push(
          `G3b ${table} is client_erasable, but db/migrations leaves the TABLE-level ${gate.verb} ` +
            `privilege revoked from both authenticated and PUBLIC. RLS and GRANT are two separate ` +
            `gates and a delete has to pass both, so this one raises 42501 or matches 0 rows however ` +
            `good the policy is. 0097's template_blocks is the pattern to follow: REVOKE ALL, then ` +
            `GRANT back the exact verbs (SELECT, INSERT, DELETE). Add the grant, or reclassify.`,
        );
      }

      // G3c -- A DELETE PATH SCOPED TO A ROLE THIS GUARD CANNOT PLACE.
      //
      // `ownerDeletePolicies` keeps only policies naming `authenticated` or
      // PUBLIC, which is right for G3a/G3b -- those two authorise, so they must
      // read the owner-facing path and nothing else. But it means a policy
      // `FOR DELETE TO review_group` drops out of BOTH lists: G3a has nothing
      // to contradict, G3b sees the owner policy and is satisfied, and the
      // "2 permissive policies reach DELETE" branch below never counts it. The
      // r42 authorisation gate (F1) walked exactly that through, and the r43
      // gate did it again with a cross-table USING. `GRANT review_group TO
      // authenticated` is one line in a migration and NOTHING IN THE POLICY
      // TEXT SAYS IT. So a delete path scoped to a role whose membership this
      // guard cannot resolve is reported, not skipped.
      //
      // The four below are the Supabase roles: `authenticated` and PUBLIC are
      // already judged, `anon` and `service_role` are peers of `authenticated`
      // under `authenticator` and never its parents. Anything else is a
      // question. Measured 2026-09-20: of 116 CREATE POLICY statements in
      // db/migrations exactly one names another role (`supabase_auth_admin`, on
      // `user_roles`, which is not client_erasable), and db/migrations contains
      // no CREATE ROLE and no role-membership GRANT at all -- both of which
      // replayMigrations now reports in its own right.
      const PLACEABLE_ROLES = ["authenticated", "public", "anon", "service_role"];
      for (const [name, state] of policies.get(table) ?? new Map<string, PolicyState>()) {
        if (state.command !== "delete" && state.command !== "all") continue;
        const unplaceable = state.roles
          .split(",")
          .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())
          .filter((r) => r.length > 0 && !PLACEABLE_ROLES.includes(r));
        if (unplaceable.length === 0) continue;
        sendToCatalog(
          `policy ${name} (@ ${state.file}) reaches ${state.command.toUpperCase()} for the role(s) ` +
            `${unplaceable.join(", ")}, and whether \`authenticated\` is a member of them is not in ` +
            `any policy text -- one \`GRANT ${unplaceable[0]} TO authenticated\` makes this a delete ` +
            `path for every signed-in caller, and Postgres ORs it into the permissive set.`,
        );
      }

      // G3c -- composition this parser does not implement.
      const permissiveDeletes = deletable.filter((p) => p.state.permissive);
      if (permissiveDeletes.length > 1) {
        sendToCatalog(
          `${permissiveDeletes.length} permissive policies reach DELETE ` +
            `(${permissiveDeletes.map((p) => `${p.name} @ ${p.state.file}`).join(", ")}), and Postgres ORs ` +
            `them together, so a second one can hand back rows the owner policy excludes.`,
        );
      }
      for (const [name, state] of policies.get(table) ?? new Map<string, PolicyState>()) {
        if (!state.permissive) {
          sendToCatalog(
            `policy ${name} (@ ${state.file}) is AS RESTRICTIVE, which Postgres ANDs on top of the ` +
              `permissive set and can veto rows the owner policy admits.`,
          );
        }
        if (state.usingUnreadable) {
          sendToCatalog(`policy ${name} (@ ${state.file}) has a USING clause this parser could not read.`);
        }
        const constant = constantUsing(state.using);
        if (constant !== null) {
          sendToCatalog(
            `policy ${name} (@ ${state.file}) has the constant row filter USING (${constant}), which ` +
              `admits ${constant === "false" ? "no rows at all" : "every row in the table"} regardless of owner.`,
          );
        }
      }

      // G3a -- an unambiguous contradiction. Exactly one readable permissive
      // DELETE policy whose text says something other than "my own rows".
      if (permissiveDeletes.length === 1 && !permissiveDeletes[0].state.usingUnreadable) {
        const only = permissiveDeletes[0];
        if (constantUsing(only.state.using) === null && !isOwnerBoundUsing(only.state.using, entry.owner)) {
          errors.push(
            `G3a ${table} is classified client_erasable, but its only DELETE/ALL policy binds ` +
              `something other than "${entry.owner}" to the caller: ${only.name} ` +
              `USING (${only.state.using ?? "<absent>"}) @ ${only.state.file}. ` +
              `Recognised shapes: \`${entry.owner} = auth.uid()\` or \`auth.uid() = ${entry.owner}\` ` +
              `(\`(select auth.uid())\` counts as \`auth.uid()\`). An absent USING is included on ` +
              `purpose: Postgres leaves the row filter unset, so a FOR ALL policy without one lets the ` +
              `caller delete everyone. This is a contradiction between db/migrations and ` +
              `${REGISTRY_PATH}, not a verdict on what the database will do -- fix whichever is wrong.`,
          );
        }
      }
    }

    // G4 -- the F4 check, from the other side.
    if (entry.class === "account_delete_only" && deletable.length > 0) {
      errors.push(
        `G4 ${table} is account_delete_only but the owner CAN delete it ` +
          `(${deletable.map((p) => `${p.name} FOR ${p.state.command.toUpperCase()} @ ${p.state.file}`).join(", ")}). ` +
          `Classify it client_erasable, or retained with a written reason.`,
      );
    }
  }

  // G3c, file scope -- statements whose reach is not a single table.
  //
  // A dynamic `EXECUTE 'DROP POLICY ...'` and a
  // `REVOKE DELETE ON ALL TABLES IN SCHEMA public` both leave the per-table
  // replay above completely unchanged, so every rule that reads it stays green
  // while the database has moved (r41 artifact gate M1/M3). They are reported
  // here rather than judged, because what they did is a catalog question.
  const erasableTables = new Set(
    Object.entries(registry.tables)
      .filter(([, e]) => e.class === "client_erasable")
      .map(([t]) => t),
  );
  for (const beyond of replay.beyondModel) {
    const hit = beyond.tables === null ? null : beyond.tables.filter((t) => erasableTables.has(t));
    if (hit !== null && hit.length === 0) continue; // names only tables outside the registry
    errors.push(
      `G3c ${beyond.file} contains a statement this parser does not model (${beyond.kind}), ` +
        `reaching ${hit === null ? "an UNBOUNDED set of tables" : hit.join(", ")}: ${beyond.detail}. ` +
        `Silently carrying on from the previous belief is exactly how the last three review rounds ` +
        `passed a schema that had changed underneath them. Decide it in ` +
        `db/tests/erasure_registry_regression.sql instead, or write the statement in a literal form ` +
        `(a plain CREATE/DROP POLICY, a per-table GRANT/REVOKE) that the replay can read.`,
    );
  }

  // ---------------------------------------------------------------------
  // G10 -- THE PRIVILEGE FLOOR MAY NOT REVIVE WHAT A MIGRATION REVOKED.
  //
  // Block (8) of the catalog test deletes rows as the real `authenticated`
  // role, and the CI database has no Supabase ALTER DEFAULT PRIVILEGES, so the
  // test installs a floor first or every DELETE raises 42501 for a reason no
  // migration caused. Two versions of that floor were disproved by execution.
  // `relacl IS NULL` skipped tables that `REVOKE GRANT OPTION FOR DELETE` had
  // merely touched (r41 gate F2). `has_table_privilege(...)` then did the
  // opposite: a migration that REALLY revokes DELETE leaves the CI stub in the
  // same state as one that revokes nothing -- there was nothing to take -- so
  // the floor GRANTED IT BACK and the revocation was invisible in the catalog
  // lane as well as (until this round) the text lane. Post-hoc the catalog
  // cannot separate the two cases at all: both leave byte-identical ACLs.
  //
  // So the floor stopped reading the catalog. It reproduces the platform
  // default unconditionally and then re-applies a list of revocations pinned in
  // the test file -- and THIS rule is what keeps that list equal to what
  // db/migrations actually says, by recomputing it from the same replay that
  // answers G3b. Neither lane can mask a REVOKE any more:
  //
  //   real `REVOKE DELETE` (quoted or not)  -> G3b red AND G10 red (pin stale)
  //   pin updated to match instead          -> floor revokes it again, (8) red
  //   `REVOKE GRANT OPTION FOR DELETE`      -> takes nothing, both lanes green
  //
  // The expected list is EMPTY today, and that is a measurement, not a
  // convenience: all 26 client_erasable tables still hold SELECT and DELETE for
  // `authenticated` after the full replay (only 2 of the 26 are named by any
  // GRANT/REVOKE at all). An empty pin is the strongest state this rule can
  // report -- it means the floor reproduces the default and subtracts nothing.
  // ---------------------------------------------------------------------
  const expectedPin: string[] = [];
  for (const table of [...erasableTables].sort()) {
    const byGrantee = replay.tablePrivileges.get(table);
    for (const privilege of FLOOR_PRIVILEGES) {
      // Absent means no migration ever named the table, so the Supabase default
      // still stands -- absence is not "no privileges" (ownerRoleHolds says the
      // same). `authenticated` specifically, because that is the grantee the
      // floor installs and the role block (8) becomes.
      const held = byGrantee === undefined ? true : (byGrantee.get("authenticated")?.has(privilege) ?? false);
      if (!held) expectedPin.push(`${table}.${privilege}`);
    }
  }
  const regressionPath = join(root, REGRESSION_SQL);
  let regressionSql: string | null = null;
  try {
    regressionSql = readFileSync(regressionPath, "utf8");
  } catch {
    regressionSql = null;
  }
  if (regressionSql === null) {
    if (expectedPin.length > 0) {
      errors.push(
        `G10 ${REGRESSION_SQL} could not be read, so the privilege floor it installs cannot be ` +
          `checked -- and db/migrations DOES revoke ${expectedPin.join(", ")} from authenticated. ` +
          `An unchecked floor would grant those back and hide the revocation from the catalog lane.`,
      );
    }
  } else {
    const pinned = ACL_PIN_RE.exec(regressionSql);
    if (pinned === null) {
      errors.push(
        `G10 ${REGRESSION_SQL} no longer carries its \`v_revoked_pin text := '...'; -- G10-ACL-PIN\` ` +
          `line. That line is what stops the privilege floor from granting back a privilege ` +
          `db/migrations revoked; without it this rule cannot check the floor and the floor is the ` +
          `only reason block (8) can delete anything at all. Restore the line (expected value: ` +
          `'${expectedPin.join(",")}').`,
      );
    } else {
      const actual = pinned[1]
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .sort();
      const expected = [...expectedPin].sort();
      if (actual.join(",") !== expected.join(",")) {
        errors.push(
          `G10 the G10-ACL-PIN in ${REGRESSION_SQL} says "${actual.join(",")}" but db/migrations ` +
            `leaves ${expected.length === 0 ? "nothing" : expected.join(", ")} revoked from ` +
            `authenticated on a client_erasable table. The pin is the privilege floor's ONLY ` +
            `instruction to subtract something, so a stale one either revives a privilege a ` +
            `migration took away -- hiding it from block (8) exactly as the r43 gates measured -- ` +
            `or revokes one that is still granted and turns a healthy table red. Set it to ` +
            `'${expected.join(",")}'.`,
        );
      }
    }
  }

  // G6 -- the retention ledgers.
  for (const table of MUST_BE_RETAINED) {
    const entry = registry.tables[table];
    if (!entry) {
      errors.push(`G6 ${table} must appear in ${REGISTRY_PATH} as retained.`);
    } else if (entry.class !== "retained") {
      errors.push(
        `G6 ${table} is classified ${entry.class}. It is a retention ledger and must be retained ` +
          `(docs/S3-SERVER-DELETION.md 6).`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // G8 / G9 -- the edges no explicit DELETE names.
  //
  // erase_my_data issues one DELETE per client_erasable row and reports its
  // ROW_COUNT. A foreign key can remove rows either BEFORE that DELETE runs
  // (making the count 0) or from a table the registry promised to keep. Both
  // are receipt lies, and neither is visible from policies alone -- which is
  // all G3/G4 look at. So these two rules read the FKs out of the migrations.
  //
  // Only ON DELETE CASCADE counts. SET NULL leaves the row in place: it is why
  // ops_routine_logs (60) may legally sit after health_samples (53), and a rule
  // that flagged every inverted order would fire on it falsely.
  // ---------------------------------------------------------------------
  const cascadesIntoErasable: ForeignKeyEdge[] = replay.foreignKeys.filter(
    (fk) => fk.onDelete === "cascade" && registry.tables[fk.parent]?.class === "client_erasable",
  );

  for (const fk of cascadesIntoErasable) {
    const parent = registry.tables[fk.parent];
    const child = registry.tables[fk.child];

    // G8 -- both ends erasable: the child must go first or its count is a lie.
    if (child?.class === "client_erasable") {
      if (typeof child.order !== "number" || typeof parent.order !== "number") continue; // G5 has it
      if (child.order >= parent.order) {
        errors.push(
          `G8 ${fk.child} (delete order ${child.order}) is deleted at or after its parent ` +
            `${fk.parent} (${parent.order}), but ${fk.child}.${fk.childColumns.join(", ")} references it ` +
            `ON DELETE CASCADE (${fk.definedIn}). The cascade empties ${fk.child} first, so its own ` +
            `DELETE matches 0 rows and the receipt reports "there were none" for rows it just destroyed. ` +
            `Give ${fk.child} a delete order below ${parent.order}.`,
        );
      }
      continue;
    }

    // G9 -- the child is kept, yet the parent takes it along. Say so, or the
    // receipt calls a destroyed table "kept".
    if (!child) continue; // no owner column, so out of registry scope (G1/G2 own that)
    if (child.cascadesFrom !== fk.parent) {
      errors.push(
        `G9 ${fk.child} is classified ${child.class} (the receipt reports it as kept), but ` +
          `${fk.child}.${fk.childColumns.join(", ")} references ${fk.parent} ON DELETE CASCADE ` +
          `(${fk.definedIn}) and ${fk.parent} IS erased by content deletion. Those rows go too. ` +
          `Add "cascadesFrom": "${fk.parent}" to ${fk.child} in ${REGISTRY_PATH} so the receipt ` +
          `reports it honestly, or change the FK in a migration. Do not silently reclassify it: ` +
          `that would hand a new DELETE path to someone who never had one.`,
      );
    }
  }

  // ...and the same rule from the other side: a declared cascade that the
  // schema does not actually have is a comforting fiction, which is worse than
  // no claim at all.
  for (const [table, entry] of Object.entries(registry.tables)) {
    if (entry.cascadesFrom === undefined) continue;
    const real = cascadesIntoErasable.some((fk) => fk.child === table && fk.parent === entry.cascadesFrom);
    if (!real) {
      errors.push(
        `G9 ${table} declares cascadesFrom "${entry.cascadesFrom}", but db/migrations has no ` +
          `ON DELETE CASCADE foreign key from ${table} to an erased ${entry.cascadesFrom}. ` +
          `Remove the claim or fix the target.`,
      );
    }
    if (entry.class === "client_erasable") {
      errors.push(
        `G9 ${table} is client_erasable, so it is deleted explicitly and ordered by G8; ` +
          `cascadesFrom is only for tables the receipt would otherwise call kept.`,
      );
    }
  }

  // G7 -- one original. The DB copy is a render of the JSON or it is nothing.
  const migrationPath = join(MIGRATIONS, REGISTRY_MIGRATION);
  let migrationSql: string | null = null;
  try {
    migrationSql = readFileSync(migrationPath, "utf8");
  } catch {
    errors.push(`G7 db/migrations/${REGISTRY_MIGRATION} is missing; the registry has no DB copy.`);
  }
  if (migrationSql !== null) {
    const embedded = extractRegistrySql(migrationSql);
    const expected = renderRegistrySql(registry);
    if (embedded === null) {
      errors.push(
        `G7 db/migrations/${REGISTRY_MIGRATION} has no generated block. Insert the output of ` +
          `\`npx tsx scripts/generate-erasure-registry.ts --sql\` between its markers.`,
      );
    } else if (embedded.replace(/\r\n/g, "\n") !== expected) {
      errors.push(
        `G7 the seed block in db/migrations/${REGISTRY_MIGRATION} no longer matches ${REGISTRY_PATH}. ` +
          `Regenerate it: \`npx tsx scripts/generate-erasure-registry.ts --sql\`. ` +
          `Two copies of one fact always end up disagreeing; that is the point of this rule.`,
      );
    }
  }

  return errors;
}

function main(): void {
  const root = process.cwd();
  const errors = collectErasureRegistryErrors(root);
  if (errors.length > 0) {
    console.error("ERASURE FAIL  deletion registry does not match the schema:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  const registry = loadRegistry(root);
  const counts: Record<string, number> = {};
  for (const e of Object.values(registry.tables)) counts[e.class] = (counts[e.class] ?? 0) + 1;
  const replay = replayMigrations(migrationsDir(root));
  console.log(
    `ERASURE PASS  ${discoverOwnedTables(migrationsDir(root)).length} owner-column tables, ` +
      `all classified (${ERASURE_CLASSES.map((c) => `${c} ${counts[c] ?? 0}`).join(", ")}); ` +
      `no contradiction, nothing beyond the model, 0189 seed parity verified.`,
  );
  // Printed, never silent. These are the statements the guard deliberately does
  // NOT judge; if this line ever grows, the thing it exempts grew too.
  console.log(
    `              delete verdict: db/tests/erasure_registry_regression.sql ` +
      `(${counts.client_erasable ?? 0} tables observed as the authenticated role).` +
      (replay.expressionOnlyRewrites.length > 0
        ? ` Exempt as expression-only policy rewrites: ` +
          `${replay.expressionOnlyRewrites.map((r) => r.file).join(", ")}.`
        : ""),
  );
}

if (require.main === module) main();
