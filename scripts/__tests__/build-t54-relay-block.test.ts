import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildT54RelayBlock, t54PrestateQuery, T54_BODY_MD5, T54_EXPECTED,
  T54_PREREQUISITES, T54_SOURCES_SCHEMA, T54_SOURCE_TRIGGERS, T54_RECORDS_MARKER,
} from "../build-t54-relay-block";

const migration = readFileSync(resolve("db/migrations/0264_sources_system_tags.sql"), "utf8");
const block = buildT54RelayBlock(migration);
const wrapper = block.split("$mig0264$;")[1];

describe("T54 reviewed migration and Relay handoff", () => {
  test("embeds the reviewed LF bytes, including its terminal newline", () => {
    const body = block.split("$mig0264$")[1];
    expect(body).toBe(migration.replace(/\r\n/g, "\n"));
    expect(createHash("md5").update(body).digest("hex")).toBe("455fdf6e2ef02ba68ee1e055e077cff3");
    expect(buildT54RelayBlock(body.replace(/\n/g, "\r\n"))).toBe(block);
    expect(block).not.toContain("\r");
  });

  test("refuses changed input instead of blessing a new checksum", () => {
    expect(() => buildT54RelayBlock(`${migration}\n-- changed`)).toThrow("T54_REVIEWED_BODY_CHANGED");
    expect(wrapper).toContain(`IF md5(q) <> '${T54_BODY_MD5}' THEN RAISE EXCEPTION 'text_mismatch_0264'`);
  });

  test("the standalone prestate expressions are exactly the three apply guards", () => {
    const query = t54PrestateQuery();
    for (const sql of [T54_SOURCES_SCHEMA, T54_SOURCE_TRIGGERS, T54_RECORDS_MARKER]) {
      expect(query).toContain(`(${sql})`);
      expect(wrapper).toContain(`IF (${sql}) IS DISTINCT FROM`);
    }
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
  });

  test("PG17/18 use attnotnull and exclude only NOT NULL catalog constraints", () => {
    for (const sql of [T54_SOURCES_SCHEMA, T54_RECORDS_MARKER]) {
      expect(sql).toContain("a.attnotnull");
      expect(sql).toContain("AND contype <> 'n'");
      expect(sql).toContain("convalidated");
    }
    expect(T54_EXPECTED.sourcesBefore).not.toBe(T54_EXPECTED.sourcesAfter);
  });

  test("serializes before duplicate and prerequisite checks, then locks before reading rows", () => {
    const positions = ["pg_advisory_xact_lock", "already_applied_0264", "needs_prerequisites_0264",
      "LOCK TABLE public.sources IN ACCESS EXCLUSIVE MODE", "INTO v_rows", "EXECUTE q;",
      "source_data_mismatch_0264", "INSERT INTO supabase_migrations"].map((s) => wrapper.indexOf(s));
    expect(positions.every((n) => n >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(wrapper).not.toMatch(/EXCEPTION\s+WHEN|^\s*(COMMIT|BEGIN);/m);
  });

  test("accepts both ledger conventions and has no unrelated 0263 gate", () => {
    for (const name of [...T54_PREREQUISITES, "0264_sources_system_tags"]) {
      expect(wrapper).toContain(`name='${name}' OR (version='${name.slice(0, 4)}' AND name='${name.slice(5)}')`);
    }
    expect(T54_PREREQUISITES).toHaveLength(6);
    expect(wrapper).not.toContain("0263");
  });

  test("checks every old source field, empty new markers and all three postconditions", () => {
    expect(wrapper).toContain("to_jsonb(s)-'system_tags'");
    for (const label of ["source_data_mismatch_0264", "source_markers_not_empty_0264",
      "sources_schema_differs_from_replica_0264", "source_triggers_changed_0264", "records_marker_changed_0264"]) {
      expect(wrapper).toContain(`RAISE EXCEPTION '${label}'`);
    }
    expect(wrapper).toContain(`IS DISTINCT FROM '${T54_EXPECTED.sourcesAfter}'`);
  });

  test("one atomic ledger write retains the original SQL and prior Relay attribution", () => {
    expect(wrapper.match(/INSERT INTO supabase_migrations\.schema_migrations/g)).toHaveLength(1);
    expect(wrapper).toContain("VALUES(v_version,ARRAY[q],'0264_sources_system_tags','hwanydanh@gmail.com')");
    expect(wrapper).toContain("AT TIME ZONE 'UTC','YYYYMMDDHH24MISS'");
    expect(wrapper).toContain("ledger_version_taken_0264");
    expect(wrapper).toContain("AS ledger_0264");
  });
});
