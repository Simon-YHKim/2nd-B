// T68 partial seat adapter: actual button-path builder/parser, fixed boundary-seam replies.
// This does not execute callLlm, a provider, or the screen. No live mode exists.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { preparationOutputPath, prepareClaudeSeatMeasurement } from "./prepare-claude-seat-measurement";
import type { OpsRecommendation, OpsRecommendInput } from "../src/lib/ops/recommend";

const ENGINE = "src/lib/ops/recommend.ts";
const PARSER = "src/lib/ops/recommend-parse.ts";
const UNTRUSTED = "src/lib/llm/untrusted.ts";
const FILES = [ENGINE, PARSER, UNTRUSTED];
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Schema = Record<string, unknown>;
interface Prompt { purpose: string; system: string; user: string; responseSchema: Schema; minor?: boolean; locale: string }
export interface OpsSample {
  id: string; locale: "ko" | "en"; minor: boolean; recommendationsPref?: boolean | null;
  fixtureReply: string | null; replySha256: string | null; rejectBoundary?: boolean;
  snapshotSuffix?: string; adherence: string; lens: string;
}
interface Corpus {
  version: string; syntheticOnly: boolean; live: false; preparationCorpusSha256: string;
  sourceSha256: Record<string, string>; inputCaseId: string; cases: OpsSample[];
}

export function loadOpsAdapterSources(root: string): Record<string, string> {
  return Object.fromEntries(FILES.map((file) => [file, readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n")]));
}

// Strict schema observation is separate from the app's deliberately tolerant parser.
// Reject unknown constraints even when the corresponding property is absent in a reply.
function schemaChildren(schema: Schema): Array<[string, Schema]> {
  const keys = schema.type === "OBJECT" ? ["type", "properties", "required"] :
    schema.type === "ARRAY" ? ["type", "items"] : schema.type === "STRING" ? ["type", "format", "enum"] :
      schema.type === "NUMBER" ? ["type"] : [];
  if (!keys.length || Object.keys(schema).some((key) => !keys.includes(key)) ||
      (schema.format !== undefined && schema.format !== "enum")) throw new Error("Unsupported ops schema constraint");
  if (schema.type === "OBJECT") return Object.entries(schema.properties as Record<string, Schema>);
  return schema.type === "ARRAY" ? [["[]", schema.items as Schema]] : [];
}
function assertSchema(schema: Schema): void { for (const [, child] of schemaChildren(schema)) assertSchema(child); }
function schemaIssues(value: unknown, schema: Schema, at = "$"): string[] {
  if (schema.type === "OBJECT") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${at}: expected object`];
    const row = value as Record<string, unknown>;
    return ((schema.required ?? []) as string[]).filter((key) => !(key in row)).map((key) => `${at}.${key}: required`)
      .concat(schemaChildren(schema).filter(([key]) => key in row).flatMap(([key, child]) => schemaIssues(row[key], child, `${at}.${key}`)));
  }
  if (schema.type === "ARRAY") return Array.isArray(value) ? value.flatMap((item, index) =>
    schemaIssues(item, schema.items as Schema, `${at}[${index}]`)) : [`${at}: expected array`];
  if (schema.type === "NUMBER") return typeof value === "number" && Number.isFinite(value) ? [] : [`${at}: expected finite number`];
  return typeof value !== "string" ? [`${at}: expected string`] :
    Array.isArray(schema.enum) && !schema.enum.includes(value) ? [`${at}: outside enum`] : [];
}
function numbers(text: string): string[] { return [...new Set(text.match(/\b(?:109|112|119|1388|988|911)\b/g) ?? [])].sort(); }

// Only reviewed repository code runs here; node:vm is not an untrusted-code security boundary.
// Closed imports and denied I/O prevent accidental provider/DB/native execution during replay.
export function createOfflineOpsRuntime(sources: Record<string, string>) {
  let forbiddenAttempts = 0;
  function deny(): never { forbiddenAttempts += 1; throw new Error("Forbidden offline ops capability"); }
  const imports = new Set(["../llm/boundary", "../llm/routing", "../llm/untrusted", "../i18n/locales",
    "../wiki/export", "./daily-brief", "./domains", "./signals", "../growth/lens-signal", "./recommend-parse"]);
  for (const file of FILES) {
    if (!sources[file]) throw new Error(`Missing ops source: ${file}`);
    const ast = ts.createSourceFile(file, sources[file], ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier &&
          (file !== ENGINE || !ts.isStringLiteral(node.moduleSpecifier) || !imports.has(node.moduleSpecifier.text))) {
        throw new Error(`Offline ops import drift: ${file}`);
      }
    }
  }
  const compiled = Object.fromEntries(FILES.map((file) => [file, ts.transpileModule(sources[file], {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText]));
  async function replay(sample: OpsSample, snapshot: string) {
    const context = vm.createContext({ fetch: deny, XMLHttpRequest: deny, WebSocket: deny,
      process: Object.freeze({ env: Object.freeze({}) }),
      console: Object.freeze({ log: () => {}, warn: () => {}, error: () => {} }),
    }, { codeGeneration: { strings: false, wasm: false } });
    const prompts: Prompt[] = [], snapshotRequests: unknown[] = [];
    let adherenceReads = 0, lensReads = 0;
    const stubs: Record<string, unknown> = {
      "src/lib/llm/boundary.ts": { callLlm: async (prompt: Prompt) => {
        assertSchema(prompt.responseSchema);
        prompts.push(clone(prompt));
        if (sample.rejectBoundary) throw new Error("SYNTHETIC_BOUNDARY_REJECTION");
        return { text: sample.fixtureReply };
      } },
      "src/lib/llm/routing.ts": { resolveVendorForPurpose: deny },
      "src/lib/wiki/export.ts": { exportUserWiki: async (...args: unknown[]) => {
        snapshotRequests.push(clone(args)); return { prompt: snapshot + (sample.snapshotSuffix ?? "") };
      } },
      "src/lib/ops/daily-brief.ts": { getOpsDailyBrief: deny, buildOpsDailyBrief: deny },
      "src/lib/ops/signals.ts": { gatherAdherenceSignal: async () => { adherenceReads += 1; return sample.adherence; } },
      "src/lib/growth/lens-signal.ts": { gatherLensSignal: async () => { lensReads += 1; return sample.lens; } },
    };
    const loaded = new Map<string, unknown>();
    function load(file: string): unknown {
      if (Object.hasOwn(stubs, file)) return stubs[file];
      if (!FILES.includes(file)) return deny();
      if (!loaded.has(file)) {
        const module = { exports: {} };
        const run = new vm.Script(`(function(exports,module,require) { ${compiled[file]}\n })`)
          .runInContext(context, { timeout: 1000 }) as (...args: unknown[]) => void;
        run(module.exports, module, (specifier: string) => {
          if (!specifier.startsWith(".")) return deny();
          return load(posix.normalize(posix.join(dirname(file), `${specifier}.ts`)));
        });
        loaded.set(file, module.exports);
      }
      return loaded.get(file);
    }
    const engine = load(ENGINE) as {
      recommendForDomain(input: OpsRecommendInput): Promise<OpsRecommendation[]>; OPS_RECOMMEND_SCHEMA: Schema;
    };
    if (typeof engine.recommendForDomain !== "function" || !engine.OPS_RECOMMEND_SCHEMA) throw new Error("Offline ops export drift");
    assertSchema(engine.OPS_RECOMMEND_SCHEMA);
    let parsed: OpsRecommendation[] | null = null, error: string | null = null;
    try {
      parsed = clone(await engine.recommendForDomain({ userId: "synthetic:ops-adapter", locale: sample.locale,
        domainId: "reading_list", domainLabel: "Reading & study list", minor: sample.minor,
        recommendationsPref: sample.recommendationsPref, now: new Date("2026-10-15T00:00:00Z"), forceFresh: true }));
    } catch (caught) {
      if (!(sample.rejectBoundary && (caught as Error).message === "SYNTHETIC_BOUNDARY_REJECTION")) throw caught;
      error = "SYNTHETIC_BOUNDARY_REJECTION";
    }
    if (forbiddenAttempts) throw new Error("Offline ops attempted a forbidden capability (including swallowed errors)");
    if (prompts.length > 1 || (prompts[0] && prompts[0].purpose !== "ops_recommend")) throw new Error("Offline ops call contract drift");
    const consumed = prompts.length === 1 && !error;
    let rawJson: unknown = null, strictSchemaIssues: string[] | null = null;
    if (consumed) {
      try { rawJson = JSON.parse(sample.fixtureReply!); strictSchemaIssues = schemaIssues(rawJson, prompts[0].responseSchema); }
      catch { strictSchemaIssues = ["$: invalid JSON"]; }
    }
    const rawItems = Array.isArray(rawJson) ? rawJson : rawJson && typeof rawJson === "object" ? (rawJson as { items?: unknown }).items : null;
    const rawNumbers = consumed ? numbers(sample.fixtureReply!) : [], parsedNumbers = parsed ? numbers(JSON.stringify(parsed)) : [];
    return { id: sample.id, locale: sample.locale, minor: sample.minor, recommendationsPref: sample.recommendationsPref ?? null,
      status: !prompts.length ? "SKIPPED_LOCAL_PREF" : error ? "FIXTURE_BOUNDARY_REJECTED" : "REPLAYED_BUILDER_PARSER",
      prompt: prompts[0] ?? null, promptSha256: prompts[0] ? sha(JSON.stringify(prompts[0])) : null,
      rawFixtureReply: sample.fixtureReply, rawReplySha256: sample.replySha256, replyConsumed: consumed,
      rawJson, strictSchemaIssues, parsed, parserChangedItems: consumed && Array.isArray(rawItems) ? JSON.stringify(rawItems) !== JSON.stringify(parsed) : null,
      acceptedOutsideSchema: consumed && !!strictSchemaIssues?.length && !!parsed?.length,
      lostGuidanceNumbersAtParser: rawNumbers.filter((number) => !parsedNumbers.includes(number)),
      error, adapterCalls: prompts.length, snapshotRequests, adherenceReads, lensReads,
      boundaryExecuted: false, screen: null, providerRaw: null, modelQualityVerdict: "NOT_MEASURED" };
  }
  return { replay, capabilities: () => ({ forbiddenAttempts }) };
}

export async function replayClaudeOpsAdapter(root: string, sourcesOverride?: Record<string, string>) {
  const preparation = prepareClaudeSeatMeasurement(root);
  const corpusBytes = readFileSync(join(root, "scripts/claude-ops-adapter.corpus.json"), "utf8");
  const corpus: Corpus = JSON.parse(corpusBytes), sources = sourcesOverride ?? loadOpsAdapterSources(root);
  if (!corpus.syntheticOnly || corpus.live !== false || !corpus.cases.length ||
      corpus.preparationCorpusSha256 !== preparation.corpusSha256 ||
      Object.keys(corpus.sourceSha256).sort().join() !== [...FILES].sort().join() ||
      FILES.some((file) => sha(sources[file] ?? "") !== corpus.sourceSha256[file])) throw new Error("Offline ops source/input snapshot changed; review before repinning");
  if (new Set(corpus.cases.map((sample) => sample.id)).size !== corpus.cases.length || corpus.cases.some((sample) =>
    !sample.id || !["ko", "en"].includes(sample.locale) || typeof sample.minor !== "boolean" ||
    ![undefined, null, false, true].includes(sample.recommendationsPref) ||
    typeof sample.adherence !== "string" || typeof sample.lens !== "string" ||
    (sample.rejectBoundary !== undefined && typeof sample.rejectBoundary !== "boolean") ||
    (sample.snapshotSuffix !== undefined && typeof sample.snapshotSuffix !== "string") ||
    (sample.rejectBoundary ? sample.fixtureReply !== null || sample.replySha256 !== null :
      typeof sample.fixtureReply !== "string" || sha(sample.fixtureReply) !== sample.replySha256))) throw new Error("Offline ops corpus integrity failure");
  const preparationCorpus = JSON.parse(readFileSync(join(root, "scripts/claude-seat-measurement.corpus.json"), "utf8")) as {
    qualityCases: Array<{ id: string; seats: string[]; text?: string }>;
  };
  const inputs = preparationCorpus.qualityCases.filter((row) => row.id === corpus.inputCaseId && row.seats.includes("ops_recommend"));
  if (inputs.length !== 1 || typeof inputs[0].text !== "string") throw new Error("Offline ops synthetic input drift");
  const runtime = createOfflineOpsRuntime(sources), rows: Awaited<ReturnType<typeof runtime.replay>>[] = [];
  for (const sample of corpus.cases) rows.push(await runtime.replay(sample, inputs[0].text));
  const replayed = rows.filter((row) => row.replyConsumed);
  return { status: "OFFLINE_PARTIAL_ADAPTER_ONLY", live: false, liveCalls: 0, providerCost: 0, productionWrites: 0,
    measuredSourceRevision: preparation.measuredSourceRevision, sourceSha256: corpus.sourceSha256,
    corpusSha256: sha(corpusBytes), preparationCorpusSha256: preparation.corpusSha256, inputCaseId: corpus.inputCaseId,
    scope: "actual forceFresh recommendForDomain + untrusted sanitizer + parser; fixed text replaces callLlm entirely",
    replyStage: "synthetic text at callLlm return seam; NOT raw provider output or real boundary postprocessing",
    adapters: { seat: "ops_recommend", status: "BUILDER_PARSER_ONLY", countedAsComplete: false },
    counts: { rows: rows.length, skippedLocalPref: rows.filter((row) => row.status === "SKIPPED_LOCAL_PREF").length,
      boundaryRejected: rows.filter((row) => row.error).length, replayed: replayed.length,
      schemaFailures: { numerator: replayed.filter((row) => row.strictSchemaIssues?.length).length, denominator: replayed.length },
      acceptedOutsideSchema: replayed.filter((row) => row.acceptedOutsideSchema).length,
      parserChangedItems: replayed.filter((row) => row.parserChangedItems).length,
      parserGuidanceNumberLoss: replayed.filter((row) => row.lostGuidanceNumbersAtParser.length).length },
    modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED", appParityVerified: false,
    readiness: "BLOCKED_FOR_ACTIVATION; provider, common safety boundary, server consent/limits and screen not executed",
    ...runtime.capabilities(), rows };
}

if (require.main === module) {
  void (async () => {
    const output = preparationOutputPath(process.argv.slice(2));
    const result = await replayClaudeOpsAdapter(process.cwd());
    if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ status: result.status, counts: result.counts, modelQualityVerdict: result.modelQualityVerdict }));
  })().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Offline ops adapter failed"); process.exitCode = 1; });
}
