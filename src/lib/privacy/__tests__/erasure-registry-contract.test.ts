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
    expect(order("template_blocks")).toBeLessThan(order("clipper_templates"));
    expect(order("wiki_links")).toBeLessThan(order("sources"));
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
