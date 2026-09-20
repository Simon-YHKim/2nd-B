// The registry's CONTENT, pinned by name.
//
// The guard (scripts/check-erasure-registry.ts) proves the registry agrees with
// the schema. It cannot prove the registry says the RIGHT thing, because both
// sides would move together if someone reclassified a table. These assertions
// are the second opinion: they name the specific tables whose misclassification
// is the defect docs/S3-SERVER-DELETION.md measured, so flipping one of them
// costs a deliberate edit here with a reason in the PR.
//
// Every fact below was measured on 2026-09-20 against db/migrations, and the
// coordinator confirmed the same shape in production pg_policies.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRegistry } from "../../../../scripts/generate-erasure-registry";

const ROOT = resolve(__dirname, "../../../..");
const registry = loadRegistry(ROOT);

/** F4: owner-deletable tables that the hand-maintained list never mentioned. */
const F4_TABLES = [
  "star_tier_history",
  "srs_cards",
  "srs_reviews",
  "health_samples",
  "esm_responses",
  "relation_people",
  "recreation_items",
  "persona_entity",
  "persona_relation",
  "persona_reasoning_trace",
  "wiki_links",
];

/** F3: tables the owner genuinely cannot delete (no DELETE and no ALL policy). */
const F3_TABLES = [
  "memorized_patterns",
  "xp_events",
  "consent_records",
  "ai_audit_log",
  "usage_counters",
  "ingest_log",
  "resurface_ledger",
  "interview_coverage",
];

describe("erasure registry -- content", () => {
  test("every entry carries a reason, in every class", () => {
    const silent = Object.entries(registry.tables)
      .filter(([, e]) => !e.reason || e.reason.trim().length < 10)
      .map(([t]) => t);
    expect(silent).toEqual([]);
  });

  test("F1: chat_usage is not an erasure target", () => {
    // 0025 dropped chat_usage_owner_all and left SELECT only, so the DELETE
    // delete-bulk.ts still sends matches 0 rows and reports success. Promising
    // to erase it would reproduce exactly that lie.
    expect(registry.tables.chat_usage.class).not.toBe("client_erasable");
    expect(registry.tables.chat_usage.reason).toMatch(/0025|쿼터/);
  });

  test("F2: personas IS an erasure target (the old comment said otherwise)", () => {
    // personas_owner_all has been FOR ALL since 0009. The comment in
    // delete-bulk.ts that denied it was wrong, and was corrected 2026-09-20.
    expect(registry.tables.personas.class).toBe("client_erasable");
  });

  test("F3: none of the un-deletable tables is promised to the client", () => {
    for (const table of F3_TABLES) {
      expect(registry.tables[table]).toBeDefined();
      expect(registry.tables[table].class).not.toBe("client_erasable");
    }
  });

  test("F4: every table that drifted out of the list is classified", () => {
    for (const table of F4_TABLES) {
      expect(registry.tables[table]).toBeDefined();
      expect(registry.tables[table].class).toBe("client_erasable");
    }
  });

  test("the retention ledgers are retained", () => {
    for (const table of [
      "consent_records",
      "ai_audit_log",
      "revenue_events",
      "credit_ledger",
      "paddle_webhook_events",
    ]) {
      expect(registry.tables[table].class).toBe("retained");
    }
  });

  test("delete order respects the constraints that would otherwise abort the wipe", () => {
    const order = (t: string): number => {
      const value = registry.tables[t].order;
      if (typeof value !== "number") throw new Error(`${t} has no delete order`);
      return value;
    };
    // wiki_pages_source_kind_pair (0022): a kind='source' page pins its source,
    // so deleting sources first violates the CHECK.
    expect(order("wiki_pages")).toBeLessThan(order("sources"));
    // Children before parents, so a cascade never races an explicit delete.
    expect(order("srs_reviews")).toBeLessThan(order("srs_cards"));
    expect(order("persona_relation")).toBeLessThan(order("persona_entity"));
    expect(order("persona_reasoning_trace")).toBeLessThan(order("persona_entity"));
    expect(order("ops_routine_logs")).toBeLessThan(order("ops_routines"));
    expect(order("wiki_links")).toBeLessThan(order("sources"));

    // The pair this list used to miss. wiki_links references wiki_pages ON
    // DELETE CASCADE twice (wiki_links_from_fk / wiki_links_to_fk, 0022), so
    // ordering it after its parent let the cascade empty it first and the
    // receipt reported wiki_links: 0 for rows it had just destroyed (r38 F2).
    // `wiki_links < sources` above passed anyway -- 11 < 20 -- which is why a
    // hand-written list is not enough and G8 now derives every such pair from
    // the migrations. This line stays as the named regression.
    expect(order("wiki_links")).toBeLessThan(order("wiki_pages"));

    // NOT a parent/child pair: template_blocks is (id, blocker_id,
    // blocked_owner_id, created_at) and has no clipper_templates FK at all
    // (0097:41-48) -- the registry reason used to claim one. The order is
    // harmless, so it is pinned here only to stop it drifting on a false
    // premise; nothing in the schema requires it.
    expect(order("template_blocks")).toBeLessThan(order("clipper_templates"));
  });

  test("a table the receipt calls kept is not one a cascade destroys", () => {
    // The F3 shape: content_reports keeps its class (a reporter still has no
    // DELETE path) but declares the parent that takes it along, so the RPC
    // reports it under `cascaded` rather than `kept`. G9 derives this from the
    // FKs; this test pins the one instance the schema has today.
    expect(registry.tables.content_reports.class).toBe("account_delete_only");
    expect(registry.tables.content_reports.cascadesFrom).toBe("clipper_templates");

    // Only kept tables carry the field, and only where a cascade is real.
    for (const [table, entry] of Object.entries(registry.tables)) {
      if (entry.cascadesFrom === undefined) continue;
      expect(entry.class).not.toBe("client_erasable");
      expect(registry.tables[entry.cascadesFrom].class).toBe("client_erasable");
      expect(table).not.toBe(entry.cascadesFrom);
    }
  });

  test("everything delete-bulk.ts erases today is still accounted for", () => {
    // This PR does not change deleteAllUserData. If a table it deletes were
    // missing from the registry, the later switch to erase_my_data would
    // silently stop erasing it.
    for (const table of ["wiki_pages", "sources", "records", "self_contexts"]) {
      expect(registry.tables[table].class).toBe("client_erasable");
    }
    // clipper_templates is scoped by owner_id, not user_id.
    expect(registry.tables.clipper_templates.owner).toBe("owner_id");
    expect(registry.tables.clipper_templates.class).toBe("client_erasable");
  });

  test("the corrected delete-bulk comment no longer makes the two false claims", () => {
    const source = readFileSync(join(ROOT, "src", "lib", "records", "delete-bulk.ts"), "utf8");
    expect(source).not.toMatch(/personas \(0008\), memorized_patterns/);
    expect(source).toMatch(/db\/erasure-registry\.json/);
    // The second error found on 2026-09-20: ai_audit_log does not cascade.
    expect(source).toMatch(/ai_audit_log does not cascade/);
  });
});
