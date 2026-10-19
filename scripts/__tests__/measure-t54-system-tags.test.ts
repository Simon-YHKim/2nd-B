import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { compareT54Snapshot, type MeasurementSnapshot, type MeasuredRow, emptyMessageAdvisorBatches } from "../lib/t54-measurement";
import { collectT54Snapshot, type MeasurementConfig } from "../measure-t54-system-tags";
jest.mock("../../src/lib/supabase/client", () => ({ getSupabaseClient: jest.fn() }));
import { userOrganizedTags } from "../../src/lib/persona/load-domain-levels";

const NOW = "2026-10-19T08:00:00.000Z";
const OWNER = "00000000-0000-4000-8000-000000000001";
const record = (id: number, tags = ["domain:career", "memo"], system_tags: string[] = []): MeasuredRow => ({
  id: String(id), user_id: OWNER, created_at: NOW, tags, system_tags, audit_period: null,
});
function snapshot(records: MeasuredRow[] = []): MeasurementSnapshot {
  return {
    now: NOW, records, sources: [], relation_people: [], recreation_items: [], ops_ledger: [], ops_reading: [],
    hasDeviceHealth: false, brightnessLimits: { records: records.length, sources: 0, relation_people: 0, recreation_items: 0, ops_ledger: 0, ops_reading: 0 },
  };
}

describe("T54 identical-snapshot before/after measurement", () => {
  test.each([0, 1, 4, 5, 14, 15])("capture-only records at n=%i keep coverage and change level only at n>=5", (n) => {
    const data = snapshot(Array.from({ length: n }, (_, i) => record(i)));
    const copy = JSON.stringify(data);
    const report = compareT54Snapshot(data);
    const domain = report.full.domains.career;
    expect(domain.before.observations).toBe(n);
    expect(domain.after.observations).toBe(n);
    expect(domain.after.organized).toBe(0);
    expect(domain.before.level).toBe(n === 0 ? 1 : n < 5 ? 2 : n < 15 ? 3 : 4);
    expect(domain.after.level).toBe(n === 0 ? 1 : n < 15 ? 2 : 3);
    expect(report.full.unfiled.all.before).toBe(0);
    expect(report.full.unfiled.all.after).toBe(0);
    expect(JSON.stringify(data)).toBe(copy);
    expect(report.blockers).toEqual([]);
  });

  test("0.5 boundary, same-name user tags, both ratification locations and CDA-06", () => {
    const rows = [record(1, ["domain:career", "MEMO"]), record(2), record(3),
      record(4, ["domain:career", "NULL", "쉼,표", 'a"b', "a\\b", "{}"]),
      record(5, ["domain:career"], ["reasoning:ratified"]),
      record(6, ["domain:career", "reasoning:ratified"])];
    const report = compareT54Snapshot(snapshot(rows));
    expect(report.full.domains.career.after).toMatchObject({ organized: 3, organizedRatio: 0.5, passesOrganizedFloor: true, level: 3 });
    expect(report.full.domains.career.causes).toEqual({ captureOnlySignalRemoved: 3, ratifiedRecords: 2, systemOnlyRatifiedRecords: 1 });
    expect(report.full.unfiled.all).toMatchObject({ before: 1, after: 0, explainedBySystemRatification: 1 });
    const withColumn = record(7, ["domain:career", "interview"]);
    const withoutColumn = record(8, ["domain:career", "interview"]);
    delete withoutColumn.system_tags;
    expect(compareT54Snapshot(snapshot([withColumn, withoutColumn])).full.domains.career.after.organized).toBe(1);
  });

  test("candidate measurement matches the actual app record-organizing function", () => {
    const variants = ["memo", "fourw", "link", "voice", "todo", "interview", "custom", "reasoning:ratified", "MEMO", "NULL", "쉼,표", 'a"b', "a\\b", "{}"];
    for (const tag of variants) {
      for (const marker of [[], ["reasoning:ratified"], ["memo"]]) {
        for (const columnPresent of [true, false]) {
          const row = record(1, ["domain:career", tag], marker);
          if (!columnPresent) delete row.system_tags;
          const measured = compareT54Snapshot(snapshot([row])).full.domains.career.after.organized;
          expect(measured).toBe(userOrganizedTags(row).length > 0 ? 1 : 0);
        }
      }
    }
  });

  test("direct-domain sources stay organized; ratification never forces L5", () => {
    const data = snapshot([record(1, ["domain:career"], ["reasoning:ratified"])]);
    data.sources = [{ id: "s", user_id: OWNER, captured_at: NOW, tags: ["domain:career"], system_tags: [] }];
    const result = compareT54Snapshot(data).full;
    expect(result.domains.career.after).toMatchObject({ observations: 2, organized: 2, level: 2 });
    expect(result.domains.career.inputs).toEqual({ records: 1, sources: 1, structured: 0 });
    expect(result.unfiled.sources).toMatchObject({ before: 1, after: 1 });
  });

  test("60-day boundary, structured activity date and health existence retain the loader rules", () => {
    const data = snapshot(Array.from({ length: 5 }, (_, i) => ({ ...record(i, ["domain:health", "custom"]), created_at: new Date(Date.parse(NOW) - 60 * 86400000).toISOString() })));
    data.hasDeviceHealth = true;
    data.relation_people = [{ id: "r", user_id: OWNER, created_at: "2025-01-01T00:00:00Z", last_interaction_on: NOW }];
    const current = compareT54Snapshot(data).full;
    expect(current.domains.health.after).toMatchObject({ level: 4, stale: false, crossSourceAgreement: true });
    expect(current.domains.relation.after).toMatchObject({ newestAt: NOW, organized: 1, stale: false });
    data.now = new Date(Date.parse(NOW) + 1).toISOString();
    expect(compareT54Snapshot(data).full.domains.health.after).toMatchObject({ level: 3, stale: true });
    data.records = [];
    expect(compareT54Snapshot(data).full.domains.health.after).toMatchObject({ observations: 0, level: 1, crossSourceAgreement: false });
  });

  test("live loader cap, wiki cap, domain and audit-period scopes are reported separately", () => {
    const data = snapshot(Array.from({ length: 5001 }, (_, i) => ({ ...record(i, ["domain:career"]), audit_period: i % 2 ? "school" : "infancy" })));
    data.brightnessLimits.records = 3;
    data.sources = Array.from({ length: 201 }, (_, i) => ({ id: `s${i}`, user_id: OWNER, captured_at: NOW, tags: ["domain:career"] }));
    const report = compareT54Snapshot(data);
    expect(report.full.domains.career.after.observations).toBe(5202);
    expect(report.brightnessRead.domains.career.after.observations).toBe(3);
    expect(report.wikiScope.all.after).toBe(5200);
    expect(report.wikiScope.byDomain.career.after).toBe(5200);
    expect(report.wikiScope.byPeriod.school.after + report.wikiScope.byPeriod.infancy.after).toBe(5000);
    expect(report.wikiScope.byPeriodAndDomain.school.career).toEqual(report.wikiScope.byPeriod.school);
    expect(report.scopeLimits).toEqual({ wikiRecords: 5000, wikiSources: 200, recordsExcluded: 1, sourcesExcluded: 1 });
    expect(report.blockers).toContain("wiki:source_boundary_tie_requires_list_check");
  });

  test("a server cap below the screen page size is never reported as a complete screen list", () => {
    const data = snapshot(Array.from({ length: 101 }, (_, i) => record(i, ["domain:career"])));
    data.brightnessRows = { records: data.records.slice(0, 50), sources: [], relation_people: [], recreation_items: [], ops_ledger: [], ops_reading: [] };
    data.brightnessLimits.records = 50;
    data.sources = Array.from({ length: 101 }, (_, i) => ({ id: `s${i}`, user_id: OWNER, captured_at: new Date(Date.parse(NOW) - i * 1000).toISOString(), tags: ["domain:career"] }));
    data.brightnessRows.sources = data.sources.slice(0, 50);
    data.brightnessLimits.sources = 50;
    const report = compareT54Snapshot(data);
    expect(report.full.unfiled.records.rows).toBe(101);
    expect(report.wikiScope.records.rows).toBe(50);
    expect(report.effectiveWikiLimits.records).toBe(50);
    expect(report.wikiScope.sources.rows).toBe(50);
    expect(report.effectiveWikiLimits.sources).toBe(50);
  });

  test("downstream reports share-card, dashboard, star and local empty-message advisor input", () => {
    const report = compareT54Snapshot(snapshot(Array.from({ length: 5 }, (_, i) => record(i))));
    expect(report.full.downstream.shareCard).toEqual({ before: 1, after: 1 });
    expect(report.full.downstream.changedDashboardDomains).toEqual(["career"]);
    expect(report.full.downstream.star.career).toEqual({ before: 0.6000000000000001, after: 0.4 });
    expect(report.full.downstream.advisor.before.domainLevels.career).toBe(3);
    expect(report.full.downstream.advisor.after.domainLevels.career).toBe(2);
    expect(JSON.stringify(report)).not.toContain("쉼,표");
    const collect = compareT54Snapshot(snapshot(Array.from({ length: 5 }, (_, i) => record(i, ["domain:collect", "memo"]))));
    expect(collect.full.downstream.changedDashboardDomains).toEqual([]);
    expect(collect.full.downstream.star.collect.after).toBe(0.4);
  });

  test("local advisor selection probe stays equal to the actual pure routing branch", () => {
    const path = resolve(__dirname, "../../src/lib/knowledge/retrieve.ts");
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const wanted = new Set(["DOMAIN_TO_BATCH", "DIM_LEVEL_MAX", "ALWAYS_LOAD", "MAX_BATCHES", "FALLBACK_BATCHES"]);
    const declarations = source.statements.filter((statement) =>
      ts.isFunctionDeclaration(statement) ? statement.name?.text === "routeBatches" : ts.isVariableStatement(statement) && statement.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && wanted.has(d.name.text)),
    ).map((s) => s.getText(source)).join("\n");
    const js = ts.transpile(`const ROUTING = []; ${declarations}; routeBatches('', levels);`);
    for (const career of [1, 2, 3, 4, 5]) {
      const levels = { career, finance: 3, relation: 4, health: 4, recreation: 4, growth: 1, collect: 1 };
      expect(emptyMessageAdvisorBatches(levels)).toEqual(runInNewContext(js, { levels }));
    }
  });
});

const config: MeasurementConfig = { url: "https://qa.invalid", anonKey: "public-key", accessToken: "existing-user-token", ownerId: OWNER, now: NOW, pageSize: 2, maxRows: 8 };
function responder(options: { foreign?: boolean; fail?: boolean; missingSource?: boolean; sourceRow?: boolean; mutate?: boolean; interPass?: boolean; oversized?: boolean } = {}) {
  let reads = 0;
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetcher = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: OWNER }), { status: 200 });
    if (options.fail) return new Response(JSON.stringify({ message: "private body and credential must not escape", code: "42501" }), { status: 403 });
    const table = url.pathname.split("/").pop();
    if (table === "sources" && options.missingSource && url.searchParams.get("select")?.includes("system_tags")) return new Response(JSON.stringify({ code: "42703", message: "column sources.system_tags does not exist" }), { status: 400 });
    if (table === "health_samples") return new Response("[]", { status: 200 });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (table === "records" && offset === 0) reads++;
    const rows = table === "records" ? Array.from({ length: options.oversized ? 9 : 3 }, (_, i) => ({
      ...record(i), user_id: options.foreign ? "other-owner" : OWNER,
      ...((options.mutate && reads > 1 || options.interPass && reads > 2) && i === 0 ? { tags: ["changed"] } : {}),
    })) : table === "sources" && options.sourceRow ? [{
      id: "s", user_id: OWNER, captured_at: NOW, tags: ["domain:career"], ...(options.missingSource ? {} : { system_tags: ["reasoning:ratified"] }),
    }] : [];
    const page = rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? 2));
    return new Response(JSON.stringify(page), { status: 200, headers: { "Content-Range": page.length ? `${offset}-${offset + page.length - 1}/${rows.length}` : `*/${rows.length}` } });
  });
  return { fetcher, calls };
}

describe("T54 collector is owner-only and read-only", () => {
  test("paginates every row, compares repeated snapshots, and never selects body or writes", async () => {
    const { fetcher, calls } = responder({ missingSource: true });
    const result = await collectT54Snapshot(config, fetcher);
    expect(result.snapshot.records).toHaveLength(3);
    expect(result.snapshot.brightnessLimits.records).toBe(2);
    expect(result.metadata).toMatchObject({ stableAcrossReads: true, atomicDatabaseSnapshot: false, writes: 0, modelCalls: 0, sourceSystemTags: false });
    expect(result.metadata.tables.records).toMatchObject({ rows: 3, total: 3, complete: true, order: "created_at.desc,id.desc" });
    for (const { url, init } of calls) {
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe("error");
      if (url.pathname.startsWith("/rest/")) expect(url.searchParams.get("user_id")).toBe(`eq.${OWNER}`);
      expect(url.searchParams.get("select") ?? "").not.toMatch(/body|title|summary|topic/);
    }
    expect(JSON.stringify(result.metadata)).not.toMatch(/existing-user-token|public-key/);
  });

  test.each([{ foreign: true }, { fail: true }, { mutate: true }, { interPass: true }, { oversized: true }])("fails closed for unsafe or incomplete reads %p", async (options) => {
    const { fetcher } = responder(options);
    await expect(collectT54Snapshot(config, fetcher)).rejects.toThrow(/^T54_/);
    try { await collectT54Snapshot(config, fetcher); } catch (error) { expect(String(error)).not.toMatch(/private body|credential|existing-user-token/); }
  });

  test.each([true, false])("source rows retain their schema and ratification signal (missing column=%s)", async (missingSource) => {
    const { fetcher } = responder({ sourceRow: true, missingSource });
    const { snapshot: collected } = await collectT54Snapshot(config, fetcher);
    expect(collected.sources).toHaveLength(1);
    expect(Object.hasOwn(collected.sources[0]!, "system_tags")).toBe(!missingSource);
    expect(compareT54Snapshot(collected).full.unfiled.sources).toMatchObject({ before: 1, after: missingSource ? 1 : 0 });
  });

  test("rejects wrong owner and unsafe endpoint before reading table rows", async () => {
    const { fetcher } = responder();
    await expect(collectT54Snapshot({ ...config, ownerId: "00000000-0000-4000-8000-000000000002" }, fetcher)).rejects.toThrow("T54_OWNER_MISMATCH");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(collectT54Snapshot({ ...config, url: "http://qa.invalid" }, fetcher)).rejects.toThrow("T54_CONFIG");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test.each(["PGRST204", "42501", "42703-unrelated"])("does not treat %s as an absent sources column", async (code) => {
    const { fetcher } = responder();
    const wrapped: typeof fetch = async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/sources")) return new Response(JSON.stringify({
        code: code.split("-")[0], message: code.includes("unrelated") ? "column other does not exist" : "column sources.system_tags does not exist",
      }), { status: 400 });
      return fetcher(input, init);
    };
    await expect(collectT54Snapshot(config, wrapped)).rejects.toThrow("T54_SOURCES_READ");
  });

  test("unknown total and truncated pages cannot masquerade as complete", async () => {
    const { fetcher } = responder();
    const wrapped: typeof fetch = async (input, init) => {
      const response = await fetcher(input, init);
      if (new URL(String(input)).pathname.endsWith("/records")) response.headers.delete("content-range");
      return response;
    };
    await expect(collectT54Snapshot(config, wrapped)).rejects.toThrow("T54_COUNT_UNKNOWN");
  });
});
