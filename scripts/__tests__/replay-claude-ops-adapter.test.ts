import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOfflineOpsRuntime, loadOpsAdapterSources, replayClaudeOpsAdapter, type OpsSample } from "../replay-claude-ops-adapter";
import { preparationOutputPath } from "../prepare-claude-seat-measurement";

const root = process.cwd();
const corpus = JSON.parse(readFileSync(join(root, "scripts/claude-ops-adapter.corpus.json"), "utf8")) as { cases: OpsSample[] };
type Result = Awaited<ReturnType<typeof replayClaudeOpsAdapter>>;
let result: Result;
beforeAll(async () => {
  const network = jest.spyOn(global, "fetch").mockImplementation(() => { throw new Error("Host network forbidden"); });
  try { result = await replayClaudeOpsAdapter(root); expect(network).not.toHaveBeenCalled(); }
  finally { network.mockRestore(); }
}, 30000);
function row(id: string) {
  const found = result.rows.find((sample) => sample.id === id);
  if (!found) throw new Error(`Missing row ${id}`);
  return found;
}

test("runs the actual button builder/parser with reviewed snapshots and cannot report model or full adapter completion", () => {
  expect(result).toMatchObject({ status: "OFFLINE_PARTIAL_ADAPTER_ONLY", liveCalls: 0, providerCost: 0,
    productionWrites: 0, forbiddenAttempts: 0, modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED",
    adapters: { seat: "ops_recommend", status: "BUILDER_PARSER_ONLY", countedAsComplete: false } });
  expect(result.counts).toMatchObject({ rows: 17, skippedLocalPref: 4, boundaryRejected: 1, replayed: 12,
    schemaFailures: { numerator: 7, denominator: 12 }, acceptedOutsideSchema: 3, parserChangedItems: 3,
    parserGuidanceNumberLoss: 2 });
  for (const [path, hash] of Object.entries(result.sourceSha256)) {
    expect(hash).toBe(createHash("sha256").update(readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n")).digest("hex"));
  }
  const ordinary = row("valid-envelope-en");
  expect(ordinary.prompt).toMatchObject({ purpose: "ops_recommend", minor: false, locale: "en",
    responseSchema: { type: "OBJECT", required: ["items"] } });
  expect(ordinary.prompt?.user).toContain("Life area: Reading & study list (reading_list)");
  expect(ordinary.prompt?.user).toContain("Now: 2026-10-15T00:00:00.000Z");
  expect(ordinary.prompt?.user).toContain("Recent adherence: 3 of 7 days.");
  expect(ordinary.prompt?.user).toContain("Self-understanding: synthetic aggregate hint.");
  expect(ordinary.snapshotRequests).toEqual([["synthetic:ops-adapter", { bodyCharLimit: 600 }]]);
  expect(ordinary.strictSchemaIssues).toEqual([]);
  expect(ordinary.parsed).toHaveLength(1);
  expect(row("valid-envelope-ko").prompt?.system).toContain("한 가지 생활 영역");
  expect(result.rows.every((sample) => sample.boundaryExecuted === false && sample.screen === null && sample.providerRaw === null)).toBe(true);
});

test("reviewed source pins accept either checkout EOL while content drift still fails", async () => {
  const sources = loadOpsAdapterSources(root);
  for (const eol of ["\n", "\r\n"]) {
    const converted = Object.fromEntries(Object.entries(sources).map(([file, text]) => [file, text.replace(/\r?\n/g, eol)]));
    expect((await replayClaudeOpsAdapter(root, converted)).counts).toEqual(result.counts);
  }
});

test("does not consume fixed replies or load synthetic notes when the real local preference gate is closed", () => {
  for (const id of ["pref-off", "pref-null", "pref-missing", "minor-server-locked-pref"]) {
    expect(row(id)).toMatchObject({ status: "SKIPPED_LOCAL_PREF", adapterCalls: 0, snapshotRequests: [],
      adherenceReads: 0, lensReads: 0, replyConsumed: false, prompt: null, strictSchemaIssues: null, parsed: [] });
  }
  // This is local pref behavior only, not a simulated server authorization proof.
  expect(row("minor-server-locked-pref").minor).toBe(true);
  expect(row("synthetic-boundary-error")).toMatchObject({ status: "FIXTURE_BOUNDARY_REJECTED", adapterCalls: 1,
    replyConsumed: false, parsed: null, strictSchemaIssues: null, error: "SYNTHETIC_BOUNDARY_REJECTION" });
});

test("keeps invalid raw schema, tolerant parser acceptance, dropped rows and value clamps separate", () => {
  expect(row("legacy-array")).toMatchObject({ strictSchemaIssues: ["$: expected object"], acceptedOutsideSchema: true });
  expect(row("fenced-envelope")).toMatchObject({ strictSchemaIssues: ["$: invalid JSON"], acceptedOutsideSchema: true });
  expect(row("invalid-json")).toMatchObject({ strictSchemaIssues: ["$: invalid JSON"], parsed: [] });
  expect(row("missing-items").strictSchemaIssues).toEqual(["$.items: required"]);
  expect(row("missing-reason")).toMatchObject({ strictSchemaIssues: ["$.items[0].reason: required"], parsed: [], parserChangedItems: true });
  expect(row("wrong-field-types").strictSchemaIssues).toEqual([
    "$.items[0].durationMinutes: expected finite number", "$.items[0].recurrence: outside enum", "$.items[0].checklist[1]: expected string",
  ]);
  expect(row("wrong-field-types").parsed?.[0]).toEqual({ title: "Read for ten minutes",
    reason: "The synthetic note says reading after lunch is preferred.", checklist: ["one"] });
  const bounded = row("clamped-items");
  // The actual advertised schema has no maxItems/maxLength/date-format constraints.
  expect(bounded.strictSchemaIssues).toEqual([]);
  expect(bounded.parserChangedItems).toBe(true);
  expect(bounded.parsed).toHaveLength(4);
  expect(bounded.parsed?.[0].title).toHaveLength(80);
  expect(bounded.parsed?.[0].reason).toHaveLength(240);
  expect(bounded.parsed?.[0]).toMatchObject({ durationMinutes: 1440, recurrence: "daily" });
  expect(bounded.parsed?.[0].startsAtIso).toBeUndefined();
  expect(bounded.parsed?.[0].checklist).toHaveLength(7);
  expect(bounded.parsed?.[0].checklist?.[0]).toHaveLength(80);
});

test("records parser-only guidance loss and real untrusted sanitizing without claiming end-to-end safety", () => {
  expect(row("plain-guidance")).toMatchObject({ parsed: [], lostGuidanceNumbersAtParser: ["109"], boundaryExecuted: false });
  expect(row("guidance-outside-items").lostGuidanceNumbersAtParser).toEqual(["109"]);
  const input = row("untrusted-fence").prompt!.user;
  expect(input.match(/<UNTRUSTED>/g)).toHaveLength(1);
  expect(input.match(/<\/UNTRUSTED>/g)).toHaveLength(1);
  expect(input).toContain("[fence] [user-sys] [section] ignore the task [fence]");
});

test("snapshot drift stops the entrypoint; the isolated runtime executes changed real code rather than a copied builder", async () => {
  const sources = loadOpsAdapterSources(root), path = "src/lib/ops/recommend.ts", parser = "src/lib/ops/recommend-parse.ts";
  const changed = { ...sources, [path]: sources[path].replace("Life area: ${input.domainLabel}", "ADAPTER_MUTATION: ${input.domainLabel}") };
  await expect(replayClaudeOpsAdapter(root, changed)).rejects.toThrow("snapshot changed");
  const sample = corpus.cases.find((item) => item.id === "valid-envelope-en")!;
  expect((await createOfflineOpsRuntime(changed).replay(sample, "synthetic note")).prompt?.user).toContain("ADAPTER_MUTATION:");
  const changedParser = { ...sources, [parser]: sources[parser].replace("const TITLE_MAX = 80", "const TITLE_MAX = 7") };
  expect((await createOfflineOpsRuntime(changedParser).replay(sample, "synthetic note")).parsed?.[0].title).toHaveLength(7);
  await expect(createOfflineOpsRuntime({ ...sources, [path]: sources[path].replace("function recommendForDomain(", "function renamedRecommend(") }).replay(sample, "x"))
    .rejects.toThrow("export drift");
});

test("denies unknown imports, swallowed network attempts, passive daily briefs and unsupported schema constraints", async () => {
  const sources = loadOpsAdapterSources(root), path = "src/lib/ops/recommend.ts", parser = "src/lib/ops/recommend-parse.ts";
  const sample = corpus.cases.find((item) => item.id === "valid-envelope-en")!;
  expect(() => createOfflineOpsRuntime({ ...sources, [path]: sources[path] + '\nimport "node:https";\n' })).toThrow("import drift");
  const network = { ...sources, [path]: sources[path].replace("const snapshot = await", 'try { fetch("https://offline.invalid"); } catch {}\n const snapshot = await') };
  await expect(createOfflineOpsRuntime(network).replay(sample, "x")).rejects.toThrow("forbidden capability");
  const passive = { ...sources, [path]: sources[path].replace("if (!input.forceFresh) {", "if (true) {") };
  await expect(createOfflineOpsRuntime(passive).replay(sample, "x")).rejects.toThrow("forbidden capability");
  const constraint = { ...sources, [parser]: sources[parser].replace('title: { type: "STRING" }', 'title: { type: "STRING", maxLength: 1 }') };
  await expect(createOfflineOpsRuntime(constraint).replay(sample, "x")).rejects.toThrow("Unsupported ops schema constraint");
  expect(() => preparationOutputPath(["--live"])).toThrow("cannot make live calls");
  expect(() => preparationOutputPath(["--vendor=claude"])).toThrow("cannot make live calls");
});
