// T68 next link: provider envelope -> full callLlm -> parser -> actual screen callback.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { preparationOutputPath, prepareClaudeSeatMeasurement } from "./prepare-claude-seat-measurement";
import { BOUNDARY_FILES, createBoundaryReplay, type ProviderFixture } from "./lib/claude-offline-boundary";
import { astOf, changedSourceFiles, clone, createOfflineRuntime, inspectSchema, oneNode, readSources, sha, textSha, type Sources } from "./lib/claude-offline-runtime";
import { sourceHashes } from "./replay-claude-seat-adapters";
import type { OpsSample } from "./replay-claude-ops-adapter";
import type { PromptInput } from "../src/lib/llm/types";
import type { OpsRecommendation } from "../src/lib/ops/recommend";

const ENGINE = "src/lib/ops/recommend.ts", SCREEN = "src/screens/deepspace/dds-ops-screen.tsx";
export const loadOpsSafetySources = (root: string) => readSources(root, [...BOUNDARY_FILES, ENGINE, SCREEN]);
export interface OpsSafetySample {
  id: string; origin: string; locale: "ko" | "en"; minor: boolean; raw: ProviderFixture; snapshot: string;
  pref?: boolean | null; prefsKind?: "ready" | "loading" | "error"; usageKind?: "ready" | "error";
  used?: number; progressionLoading?: boolean; duringReply?: "owner-change" | "privacy-change" | "new-request";
}
const provider = (text: string, stop_reason = "end_turn"): ProviderFixture => ({
  content: [{ type: "thinking", thinking: "synthetic ignored block" }, { type: "text", text }], stop_reason, model: "offline-fixture",
});
const numbers = (text: string) => [...new Set(text.match(/\b(?:109|112|119|1388|988|911)\b/g) ?? [])].sort();

export function createOpsSafetyReplay(sources: Sources) {
  const runtime = createOfflineRuntime(sources), boundary = createBoundaryReplay(runtime, sources);
  const screenAst = astOf(SCREEN, sources[SCREEN]);
  const privacy = oneNode<ts.CallExpression>(screenAst, node => ts.isCallExpression(node) && node.expression.getText(screenAst) === "subscribePrivacyChanges", "ops privacy subscription");
  if (!ts.isArrowFunction(privacy.arguments[0])) throw new Error("Offline ops privacy callback drift");
  const privacyText = privacy.arguments[0].getText(screenAst);
  const owner = oneNode<ts.VariableDeclaration>(screenAst, node => ts.isVariableDeclaration(node) && node.name.getText(screenAst) === "isCurrentOwner", "ops owner callback");
  if (!owner.initializer || !ts.isCallExpression(owner.initializer) || !ts.isArrowFunction(owner.initializer.arguments[0])) throw new Error("Offline ops owner callback drift");
  const ownerText = owner.initializer.arguments[0].getText(screenAst);
  runtime.extractions["ops-privacy-change"] = sha(privacyText);
  runtime.extractions["ops-owner-check"] = sha(ownerText);
  async function replay(sample: OpsSafetySample) {
    const userId = "synthetic:ops-safety", requests: PromptInput[] = [], memoryWrites: unknown[] = [];
    const screen = { state: "idle", recommendations: [] as OpsRecommendation[], notice: null as unknown,
      navigation: [] as string[], observerSupplied: false, guidancePublications: [] as string[], actualRendered: false };
    let result: Awaited<ReturnType<typeof boundary.replay>> | null = null;
    let engineError: string | null = null, unexpected: unknown = null;
    let snapshotReads = 0, usageBumps = 0;
    const ownerRef = { current: userId }, mountedRef = { current: true }, runRequestRef = { current: 0 };
    const screenScope = {
      userId, locale: sample.locale, isMinor: sample.minor, group: "growth", domain: "reading_list", runState: "idle",
      ownerPrefs: { kind: sample.prefsKind ?? "ready", data: { recommendations: sample.pref } },
      ownerUsage: { kind: sample.usageKind ?? "ready", data: sample.used ?? 0 },
      progression: { loading: sample.progressionLoading ?? false }, dailyLimit: 5, runRequestRef, ownerRef, mountedRef,
      tEn: () => "Reading & study list", i18n: { language: sample.locale },
      setRunState: (state: string) => { screen.state = state; },
      setRecommendations: (rows: OpsRecommendation[]) => { screen.recommendations = clone(rows); },
      setAdherence: () => {}, setNotice: (notice: unknown) => { screen.notice = notice; },
      setUsageState: (value: unknown) => { memoryWrites.push({ kind: "screen-usage", value }); },
      setSavedKeys: () => {}, setConsentOpen: () => {}, setReloadNonce: () => {}, pendingPushRef: { current: null },
      bumpOpsUsage: async (ownerId: string) => { usageBumps += 1; memoryWrites.push({ kind: "usage-bump", ownerId }); return (sample.used ?? 0) + 1; },
      gatherAdherenceStats: async () => null, adherenceChip: runtime.deny,
      writeOpsPresentationFor: (ownerId: string, value: unknown) => { memoryWrites.push({ kind: "presentation", ownerId, value: clone(value) }); },
      router: { push: (path: string) => { screen.navigation.push(path); } },
    };
    const privacyChanged = runtime.evaluate<(change: { ownerId: string }) => void>(`const callback = ${privacyText};`, screenScope, "callback");
    const isCurrentOwner = runtime.evaluate<(id: string) => boolean>(`const callback = ${ownerText};`, screenScope, "callback");
    const engine = runtime.select<typeof import("../src/lib/ops/recommend")>(ENGINE, ["recommendForDomain", "recommendationsAllowed"], {
      ...runtime.load("src/lib/llm/untrusted.ts"), ...runtime.load("src/lib/ops/recommend-parse.ts"),
      getOpsDailyBrief: runtime.deny, buildOpsDailyBrief: runtime.deny,
      exportUserWiki: async () => { snapshotReads += 1; return { prompt: sample.snapshot }; },
      gatherAdherenceSignal: async () => "Recent adherence: 3 of 7 days.", gatherLensSignal: async () => "",
      callLlm: async (input: PromptInput) => {
        requests.push(clone(input)); screen.observerSupplied = typeof input.onCrisisDetected === "function";
        result = await boundary.replay(input, sample.raw);
        if (sample.duringReply === "owner-change") ownerRef.current = "synthetic:next-owner";
        if (sample.duringReply === "new-request") runRequestRef.current += 1;
        if (sample.duringReply === "privacy-change") privacyChanged({ ownerId: userId });
        if (result.error || !result.reply) { engineError = result.error; throw new Error(result.error ?? "Missing reply"); }
        return result.reply;
      },
    });
    const run = runtime.fn<() => Promise<void>>(SCREEN, "runRecommendation", { ...screenScope, isCurrentOwner,
      recommendationsAllowed: engine.recommendationsAllowed,
      recommendForDomain: async (...args: Parameters<typeof engine.recommendForDomain>) => {
        try { return await engine.recommendForDomain(...args); }
        catch (caught) { if (!engineError) unexpected = caught; throw caught; }
      },
    });
    await run();
    if (unexpected) throw unexpected;
    runtime.assertClean();
    if (requests.length > 1 || requests.some(prompt => prompt.purpose !== "ops_recommend")) throw new Error("Offline ops call drift");
    // TS cannot see writes from callbacks. These are the completed invocation's slots.
    const observed = result as Awaited<ReturnType<typeof boundary.replay>> | null;
    const rawText = sample.raw.content.filter(part => part.type === "text").map(part => part.text).join("");
    const strict = requests[0] ? inspectSchema(rawText, requests[0].responseSchema) : null;
    const parsed = observed?.reply ? runtime.load<typeof import("../src/lib/ops/recommend-parse")>("src/lib/ops/recommend-parse.ts").parseOpsRecommendations(observed.reply.text) : null;
    const screenNumbers = numbers(JSON.stringify(screen.recommendations));
    const boundaryNumbers = numbers(observed?.reply?.text ?? "");
    return { id: sample.id, origin: sample.origin, locale: sample.locale, minor: sample.minor,
      providerRaw: sample.raw, rawSha256: sha(JSON.stringify(sample.raw)), prompt: requests[0] ?? null,
      promptSha256: requests[0] ? sha(JSON.stringify(requests[0])) : null, rawJson: strict?.json ?? null,
      strictSchemaIssues: strict?.issues ?? null, boundary: observed, parsed, screen,
      error: engineError, snapshotReads, usageBumps, memoryWrites, adapterCalls: requests.length,
      fixtureConsumed: (observed?.fixtureDispatches ?? 0) > 0,
      boundaryGuidanceLostAtScreen: boundaryNumbers.length > 0 && screenNumbers.length === 0 && !screen.guidancePublications.length,
      rawGuidanceLostAtScreen: numbers(rawText).length > 0 && screenNumbers.length === 0 && !screen.guidancePublications.length,
      boundaryNumbers, screenNumbers, liveCalls: 0 };
  }
  return { replay, runtime };
}

export async function replayClaudeOpsSafety(root: string, sourcesOverride?: Sources) {
  const preparation = prepareClaudeSeatMeasurement(root), sources = sourcesOverride ?? loadOpsSafetySources(root);
  const pins = JSON.parse(readFileSync(join(root, "scripts/claude-seat-adapters.corpus.json"), "utf8")) as {
    opsSourceSha256: Record<string, string>; opsCorpusSha256: string; preparationCorpusSha256: string;
  };
  if (Object.keys(sources).sort().join() !== Object.keys(pins.opsSourceSha256).sort().join()) throw new Error("Offline ops source inventory changed");
  const corpusBytes = readFileSync(join(root, "scripts/claude-ops-adapter.corpus.json"), "utf8");
  if (textSha(corpusBytes) !== pins.opsCorpusSha256 || textSha(readFileSync(join(root, "scripts/claude-seat-measurement.corpus.json"), "utf8")) !== pins.preparationCorpusSha256) {
    throw new Error("Offline ops corpus snapshot changed");
  }
  const corpus = JSON.parse(corpusBytes) as { cases: OpsSample[] };
  const inputs = JSON.parse(readFileSync(join(root, "scripts/claude-seat-measurement.corpus.json"), "utf8")) as {
    qualityCases: Array<{ id: string; text: string }>; safetyCases: Array<{ id: string; text: string }>;
    ageModes: Array<{ id: string; minor: boolean }>; uiLocales: Array<"ko" | "en">;
  };
  const snapshot = inputs.qualityCases.find(row => row.id === "routine-candidate")!.text;
  const samples: OpsSafetySample[] = corpus.cases.map(row => ({ id: row.id, origin: "existing-ops-corpus",
    locale: row.locale, minor: row.minor, pref: row.recommendationsPref, snapshot: snapshot + (row.snapshotSuffix ?? ""),
    raw: provider(row.fixtureReply ?? "", row.rejectBoundary ? "refusal" : "end_turn") }));
  const valid = samples.find(row => row.id === "valid-envelope-en")!;
  for (const lane of ["input", "output"] as const) for (const row of inputs.safetyCases) for (const age of inputs.ageModes) for (const locale of inputs.uiLocales) {
    samples.push({ ...valid, id: `${lane}:${row.id}:${age.id}:${locale}`, origin: `preparation-safety-${lane}`, locale, minor: age.minor,
      snapshot: lane === "input" ? row.text : snapshot, raw: lane === "output" ? provider(row.text) : valid.raw });
  }
  for (const extra of [
    { id: "prefs-loading", prefsKind: "loading" as const }, { id: "prefs-error", prefsKind: "error" as const },
    { id: "usage-error", usageKind: "error" as const }, { id: "daily-limit", used: 5 },
    { id: "progression-loading", progressionLoading: true },
    { id: "owner-changed", duringReply: "owner-change" as const },
    { id: "privacy-changed", duringReply: "privacy-change" as const },
    { id: "newer-request", duringReply: "new-request" as const },
  ]) samples.push({ ...valid, ...extra, origin: "synthetic-screen-gate" });
  const { replay, runtime } = createOpsSafetyReplay(sources), rows = [];
  for (const sample of samples) rows.push(await replay(sample));
  const consumed = rows.filter(row => row.fixtureConsumed);
  const decoded = consumed.filter(row => row.boundary?.reply);
  return { status: "OFFLINE_SAFETY_SCREEN_REPLAY_ONLY", live: false, liveCalls: 0, networkCalls: 0, providerCost: 0, productionWrites: 0,
    measuredSourceRevision: preparation.measuredSourceRevision, sourceSha256: sourceHashes(sources),
    baselineSourceSha256: pins.opsSourceSha256, sourceChanges: changedSourceFiles(sources, pins.opsSourceSha256),
    sourceReviewRequired: changedSourceFiles(sources, pins.opsSourceSha256).length > 0,
    sourceHashEncoding: "UTF-8 with CRLF normalized to LF",
    corpusSha256: sha(corpusBytes), preparationCorpusSha256: preparation.corpusSha256,
    extractionSha256: runtime.extractions, ...runtime.capabilities(),
    counts: { rows: rows.length, fixtureConsumed: consumed.length, skippedScreenGate: rows.filter(row => !row.adapterCalls).length,
      inputRed: rows.filter(row => row.boundary && !row.fixtureConsumed && row.boundary.reply?.safety.zone === "red").length,
      outputRed: consumed.filter(row => row.boundary?.reply?.safety.zone === "red").length,
      screenErrors: rows.filter(row => row.screen.state === "error").length,
      schemaFailures: { numerator: decoded.filter(row => row.strictSchemaIssues?.length).length, denominator: decoded.length },
      boundaryGuidanceLostAtScreen: rows.filter(row => row.boundaryGuidanceLostAtScreen).length },
    modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED", appParityVerified: false,
    scope: "actual callLlm with synthetic proxy transport; semantic model OFF; actual runRecommendation/owner/privacy callbacks with memory effects; no React/device/server gates",
    rows };
}
if (require.main === module) void (async () => {
  const output = preparationOutputPath(process.argv.slice(2)), result = await replayClaudeOpsSafety(process.cwd());
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ status: result.status, counts: result.counts,
    sourceReviewRequired: result.sourceReviewRequired, sourceChanges: result.sourceChanges }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Offline ops safety failed"); process.exitCode = 1; });
