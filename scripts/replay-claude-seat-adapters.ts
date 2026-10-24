// T68: fixed synthetic replies through current builders, boundary and consumer parsers.
// No provider, database, auth, native or network implementation is imported.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { preparationOutputPath, prepareClaudeSeatMeasurement } from "./prepare-claude-seat-measurement";
import { BOUNDARY_FILES, createBoundaryReplay, type ProviderFixture } from "./lib/claude-offline-boundary";
import { astOf, changedSourceFiles, clone, createOfflineRuntime, inspectSchema, oneNode, readSources, sha, textSha, type Sources } from "./lib/claude-offline-runtime";
import type { PromptInput, LlmResult } from "../src/lib/llm/types";
import type { PersonaSynthesisInput } from "../src/lib/persona/persona-synthesis";
import type { BoardSeat } from "../src/lib/dashboard/contract";

export const SEAT_FILES = {
  secondb_chat: "src/lib/chat/conversation.ts", clipper_classify: "src/lib/wiki/classify-clipper.ts",
  source_ingest: "src/lib/wiki/phase1.ts", clipper_template_propose: "src/lib/wiki/propose-template.ts",
  self_model_propose: "src/lib/persona/propose-self-model.ts", persona_synthesis: "src/lib/persona/persona-synthesis.ts",
  northstar_propose: "src/lib/persona/northstar.ts", capture_ocr: "src/lib/wiki/capture-image.ts",
  daily_note: "supabase/functions/dashboard-generate/handler.ts",
  day_summary: "supabase/functions/dashboard-generate/handler.ts",
  inbox_triage: "supabase/functions/dashboard-generate/handler.ts",
} as const;
export type Seat = keyof typeof SEAT_FILES;
export interface SeatSample {
  id: string; seat: Seat; locale: "ko" | "en"; minor: boolean; raw: ProviderFixture; rawSha256: string;
  input: { text: string; before?: string; count?: number; persona?: PersonaSynthesisInput;
    source?: Record<string, unknown>; image?: string; mimeType?: string };
}
interface Corpus {
  version: string; syntheticOnly: true; live: false; preparationCorpusSha256: string;
  sourceSha256: Record<string, string>; images: Record<string, string>; cases: SeatSample[];
}
export const EXTRA_FILES = [...BOUNDARY_FILES, ...Object.values(SEAT_FILES),
  "supabase/functions/dashboard-generate/provider.ts", "src/lib/chat/limits.ts", "src/lib/wiki/template-triggers.ts",
  "src/lib/wiki/ai-exclusion.ts", "src/lib/wiki/profile-context-source.ts", "src/lib/import/proposals.ts",
  "supabase/functions/_shared/llm-proxy-common.ts"];
export const loadSeatSources = (root: string): Sources => readSources(root, EXTRA_FILES);
export const sourceHashes = (sources: Sources): Record<string, string> => Object.fromEntries(
  Object.entries(sources).map(([file, text]) => [file, sha(text.replace(/\r\n/g, "\n"))]));

export function createSeatReplay(sources: Sources) {
  const runtime = createOfflineRuntime(sources), boundary = createBoundaryReplay(runtime, sources);
  const common = {
    ...runtime.load("src/lib/llm/untrusted.ts"), ...runtime.load("src/lib/safety/classifier.ts"),
    ...runtime.load("src/lib/wiki/clipper-templates.ts"), ...runtime.load("src/lib/wiki/clipper-kind.ts"),
    ...runtime.load("src/lib/wiki/types.ts"), ...runtime.load("src/lib/wiki/tags.ts"),
    ...runtime.load("src/lib/wiki/slug.ts"), ...runtime.load("src/lib/persona/proposal.ts"),
    ...runtime.load("src/lib/persona/domain-stars.ts"), ...runtime.load("src/lib/persona/seven-stars.ts"),
    ...runtime.load("src/lib/persona/address.ts"), ...runtime.load("src/lib/safety/ingest-policy.ts"),
    ...runtime.load("src/lib/async/abort.ts"),
  };
  const boardInput = runtime.load<typeof import("../src/lib/dashboard/generation-input")>("src/lib/dashboard/generation-input.ts");
  const boardOutput = runtime.load<typeof import("../src/lib/dashboard/generation-output")>("src/lib/dashboard/generation-output.ts");
  // Decode with the actual provider's response.ok branch, including envelope,
  // stop reason, code-fence and output validation. Transport/account gates are not run.
  const providerFile = "supabase/functions/dashboard-generate/provider.ts", providerAst = astOf(providerFile, sources[providerFile]);
  const decodeBlock = oneNode<ts.IfStatement>(providerAst, n => ts.isIfStatement(n) && n.expression.getText(providerAst) === "response.ok", "board response decoder").getText(providerAst);
  runtime.extractions["board-provider-decode"] = sha(decodeBlock);
  const serverSafety = runtime.select("supabase/functions/_shared/llm-proxy-common.ts", ["hasCrisisTerm"], {
    ...runtime.load("src/lib/safety/crisis-context.ts"), ...runtime.load("src/lib/safety/emergency-routing.ts"),
    ...runtime.load("src/lib/safety/crisis-language.ts"),
  });
  // Each decode closure binds only its fixed envelope; no URL or Response body reads.
  const boardDecode = (raw: unknown, validateOutput: (value: unknown) => boolean) => runtime.evaluate<() => Promise<{ output: unknown; outcome: string }>>(
    `async function decode() { let outcome = 'http_error', output = null, tokens = null, responseText = '';
      const response = { ok: true }; try { ${decodeBlock} } catch { /* Match provider parse failure. */ }
      return { output, outcome }; }`, {
      readLlmUpstreamJsonObject: async () => clone(raw), input: { validateOutput },
      ...serverSafety,
    }, "decode")();

  async function replay(sample: SeatSample, imageBase64?: string) {
    const file = SEAT_FILES[sample.seat], memoryWrites: unknown[] = [], prompts: PromptInput[] = [];
    const boundaryRows: Awaited<ReturnType<typeof boundary.replay>>[] = [];
    let providerOutcome: string | null = null;
    const callLlm = async (input: PromptInput): Promise<LlmResult<string>> => {
      // Do not serialize callbacks or synthetic session authority into artifacts.
      const { session: _session, signal: _signal, onCrisisDetected: _observer, ...prompt } = input;
      prompts.push(clone(prompt));
      const result = await boundary.replay(input, sample.raw);
      boundaryRows.push(result);
      if (result.error || !result.reply) throw new Error(result.error ?? "Missing boundary result");
      return result.reply;
    };
    const scope = { ...common, callLlm };
    const userId = "synthetic:seat-adapter", { locale, minor, input } = sample;
    let consumerValue: unknown = null, parserValue: unknown = null, error: string | null = null;
    try {
      switch (sample.seat) {
        case "clipper_classify": {
          const engine = runtime.select<typeof import("../src/lib/wiki/classify-clipper")>(file, ["classifyClipper"], {
            ...scope, listAccessibleTemplates: async () => [],
            ...runtime.select(sourcesFile("template-triggers"), ["matchTemplateByUrl"]),
          });
          consumerValue = await engine.classifyClipper(userId, input.text, null, locale, minor); break;
        }
        case "clipper_template_propose": {
          const engine = runtime.select<typeof import("../src/lib/wiki/propose-template")>(file, ["proposeClipperTemplate"], scope);
          consumerValue = await engine.proposeClipperTemplate(userId, input.text, null, locale, minor); break;
        }
        case "self_model_propose": {
          const engine = runtime.select<typeof import("../src/lib/persona/propose-self-model")>(file, ["proposeSelfModelChange"], scope);
          consumerValue = await engine.proposeSelfModelChange(userId, { kind: "northStar" }, input.before ?? "", input.text, 2, locale, minor); break;
        }
        case "persona_synthesis": {
          const engine = runtime.select<typeof import("../src/lib/persona/persona-synthesis")>(file, ["synthesizePersonas", "parsePersonaSynthesis"], scope);
          if (!input.persona) throw new Error("Missing synthetic persona input");
          consumerValue = await engine.synthesizePersonas(userId, input.persona, locale, minor);
          break;
        }
        case "northstar_propose": {
          const engine = runtime.select<typeof import("../src/lib/persona/northstar")>(file, ["proposeNorthstarSentences"], {
            ...scope, recentDigest: async () => ({ count: input.count ?? 5, digest: input.text }),
          }, ["recentDigest"]);
          consumerValue = await engine.proposeNorthstarSentences({ userId, locale, minor }); break;
        }
        case "capture_ocr": {
          if (!imageBase64) throw new Error("Missing synthetic OCR image");
          const engine = runtime.select<typeof import("../src/lib/wiki/capture-image")>(file, ["ocrImageAsset"], scope);
          const session = { userId, assertCurrent: () => {}, accessToken: "synthetic-inert-session" };
          consumerValue = await engine.ocrImageAsset(session as Parameters<typeof engine.ocrImageAsset>[0], locale,
            { base64: imageBase64, mimeType: input.mimeType ?? "image/png" }, minor); break;
        }
        case "source_ingest": {
          const exclusion = runtime.select("src/lib/wiki/ai-exclusion.ts", ["isAiExcludedSource", "SourceAiExcludedError"],
            runtime.select("src/lib/import/proposals.ts", ["HEALTH_PROPOSAL_SUB"]));
          const engine = runtime.select<typeof import("../src/lib/wiki/phase1")>(file, ["runPhase1", "readPhase1"], {
            ...scope, ...exclusion, ...runtime.load("src/lib/graph/relatedness.ts"),
            ...runtime.select("src/lib/wiki/profile-context-source.ts", ["isProfileContextImportSource", "SourceImportManagedError"]),
            getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live" }),
            getSource: async () => ({ title: "Synthetic draft", storage_path: "inert", frontmatter: {} }),
            downloadRawClipping: async () => input.text,
            getSupabaseClient: () => ({ from: (table: string) => ({ update: (value: unknown) => ({
              eq: (key: string, id: string) => ({ eq: async (ownerKey: string, owner: string) => {
                memoryWrites.push({ table, key, id, ownerKey, owner, value: clone(value) }); return { error: null };
              } }),
            }) }) }),
          });
          const result = await engine.runPhase1({ userId, sourceId: "synthetic:s1", locale, minor });
          parserValue = runtime.select<{ parsePhase1Reply: (raw: string, locale: string) => unknown }>(file, ["parsePhase1Reply"],
            { ...scope, ...runtime.load("src/lib/graph/relatedness.ts") }).parsePhase1Reply(boundaryRows[0].reply!.text, locale);
          consumerValue = engine.readPhase1({ __phase1__: result }); break;
        }
        case "secondb_chat": {
          const limits = runtime.select("src/lib/chat/limits.ts", ["CHAT_DAILY_LIMIT", "checkChatLimit"]);
          const engine = runtime.select<typeof import("../src/lib/chat/conversation")>(file, ["sendChatMessage"], {
            ...scope, ...limits, kstDateToday: () => "2026-10-24", tLocale: runtime.deny,
            readChatUsageDetail: async () => ({ used: 0, adBonus: 0 }), bumpChatUsageIfUnderCap: async () => 1,
            ChatLimitExceededError: class extends Error {}, captureLiveOwnerCheck: () => () => {},
            withLiveOwnerSignal: async (fence: () => void, _signal: unknown, work: () => Promise<unknown>) => { fence(); return work(); },
            loadChatContext: async () => ({ structuredBlock: "", profileLines: [], ragBlock: null, snapshot: { prompt: input.text } }),
            ...runtime.select("src/lib/llm/boundary.ts", ["classifyChatTextForCrisis"], {
              ...common, routeCrisis: runtime.deny,
            }, ["routeCrisis"]),
          }, ["loadChatContext"]);
          consumerValue = await engine.sendChatMessage({ userId, locale, minor, tier: "free", message: "What do these records say?" }); break;
        }
        default: {
          const seat: BoardSeat = sample.seat;
          const prepared = boardInput.prepareBoardInput(seat, input.source, { llm: true, recordExcerpts: false });
          if (!prepared.ok) throw new Error(`Synthetic board input rejected: ${prepared.reason}`);
          const handlerScope = runtime.select(SEAT_FILES.daily_note, ["FORMATS", "SEATS"]);
          const run = runtime.fn<(userId: string, action: string, timeZone: string, locale: string) => Promise<unknown>>(SEAT_FILES.daily_note, "run", {
            ...handlerScope, ...boardInput, ...boardOutput,
            deps: { rpc: async (name: string, args: Record<string, unknown>) => {
              if (name === "dashboard_generation_request_v2") return { data: { kind: "claimed", id: "synthetic:run", purpose: seat,
                slot: "morning", locale, source: input.source, lease_token: "00000000-0000-4000-8000-000000000001", consent_token: "0".repeat(64) } };
              if (name !== "dashboard_generation_finish_v2") return runtime.deny();
              memoryWrites.push({ name, args: clone(args) }); return { data: true };
            }, generate: async (request: { prompt: string; system: string; purpose: string; validateOutput: (value: unknown) => boolean }) => {
              prompts.push({ userId, locale, purpose: seat, system: request.system, user: request.prompt } as unknown as PromptInput);
              const result = await boardDecode(sample.raw, request.validateOutput);
              providerOutcome = result.outcome;
              if (result.output === null) throw new Error("dashboard_generation_unavailable");
              return result.output;
            } },
          });
          parserValue = await run(userId, "automatic", "Asia/Seoul", locale);
          consumerValue = boardOutput.decodeBoardResponse(parserValue);
        }
      }
    } catch (caught) {
      const message = (caught as Error).message;
      if (!/^(northstar propose: unusable AI reply|polaris_no_grounded_result|image_ocr_(empty_result|crisis_result|invalid_data|unsupported_type)|upstream_(bad_payload|refusal|truncated))/.test(message ?? "")) throw caught;
      error = message;
    }
    runtime.assertClean();
    if (prompts.length > 1) throw new Error("Offline seat call count drift");
    const rawText = sample.raw.content.filter(part => part.type === "text").map(part => part.text).join("");
    const strict = inspectSchema(rawText, prompts[0]?.responseSchema);
    return { id: sample.id, seat: sample.seat, locale, minor,
      status: error ? "CONSUMER_ERROR" : prompts.length ? "REPLAYED" : "SKIPPED_LOCAL_GATE",
      providerRaw: clone(sample.raw), rawSha256: sample.rawSha256, prompt: prompts[0] ?? null,
      promptSha256: prompts[0] ? sha(JSON.stringify(prompts[0])) : null,
      strictSchemaIssues: prompts.length ? strict.issues : null, boundary: boundaryRows,
      parserValue, consumerValue: consumerValue === undefined ? null : clone(consumerValue), error, providerOutcome,
      memoryWrites, actualScreenRendered: false, modelQualityVerdict: "NOT_MEASURED" };
  }
  return { replay, runtime };
}
function sourcesFile(name: string) { return `src/lib/wiki/${name}.ts`; }

export async function replayClaudeSeatAdapters(root: string, sourcesOverride?: Sources) {
  const preparation = prepareClaudeSeatMeasurement(root);
  const bytes = readFileSync(join(root, "scripts/claude-seat-adapters.corpus.json"), "utf8");
  const corpus: Corpus = JSON.parse(bytes), sources = sourcesOverride ?? loadSeatSources(root);
  if (corpus.syntheticOnly !== true || corpus.live !== false || corpus.preparationCorpusSha256 !== textSha(readFileSync(join(root, "scripts/claude-seat-measurement.corpus.json"), "utf8")) ||
      Object.keys(sources).sort().join() !== Object.keys(corpus.sourceSha256).sort().join()) throw new Error("Offline seat source inventory/input snapshot changed; review before repinning");
  if (!corpus.cases.length || new Set(corpus.cases.map(row => row.id)).size !== corpus.cases.length ||
      corpus.cases.some(row => !Object.hasOwn(SEAT_FILES, row.seat) || !["en", "ko"].includes(row.locale) || typeof row.minor !== "boolean" ||
        typeof row.input?.text !== "string" || sha(JSON.stringify(row.raw)) !== row.rawSha256)) throw new Error("Offline seat corpus integrity failure");
  const images = new Map<string, string>();
  for (const [file, hash] of Object.entries(corpus.images)) {
    if (!/^scripts\/fixtures\/t68\/[a-z0-9-]+\.png$/.test(file)) throw new Error("Offline image path rejected");
    const image = readFileSync(join(root, file));
    if (sha(image) !== hash) throw new Error("Offline image snapshot changed");
    images.set(file, image.toString("base64"));
  }
  const { replay, runtime } = createSeatReplay(sources), rows = [];
  for (const sample of corpus.cases) rows.push(await replay(sample, sample.input.image ? images.get(sample.input.image) : undefined));
  return { status: "OFFLINE_REPLAY_ONLY", live: false, liveCalls: 0, networkCalls: 0, productionWrites: 0, providerCost: 0,
    measuredSourceRevision: preparation.measuredSourceRevision, sourceSha256: sourceHashes(sources),
    baselineSourceSha256: corpus.sourceSha256, sourceChanges: changedSourceFiles(sources, corpus.sourceSha256),
    sourceReviewRequired: changedSourceFiles(sources, corpus.sourceSha256).length > 0,
    sourceHashEncoding: "UTF-8 with CRLF normalized to LF", corpusSha256: sha(bytes), images: corpus.images,
    extractionSha256: runtime.extractions, ...runtime.capabilities(),
    modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED", appParityVerified: false,
    counts: { seats: new Set(rows.map(row => row.seat)).size, rows: rows.length,
      replayed: rows.filter(row => row.status === "REPLAYED").length, errors: rows.filter(row => row.error).length,
      skipped: rows.filter(row => row.status === "SKIPPED_LOCAL_GATE").length }, rows };
}

if (require.main === module) void (async () => {
  const output = preparationOutputPath(process.argv.slice(2)), result = await replayClaudeSeatAdapters(process.cwd());
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ status: result.status, counts: result.counts, sourceReviewRequired: result.sourceReviewRequired,
    sourceChanges: result.sourceChanges, modelQualityVerdict: result.modelQualityVerdict }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Offline seat replay failed"); process.exitCode = 1; });
