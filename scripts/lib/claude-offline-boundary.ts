import ts from "typescript";
import { astOf, clone, oneNode, sha, type OfflineRuntime, type Sources } from "./claude-offline-runtime";
import type { PromptInput, LlmResult } from "../../src/lib/llm/types";

export const BOUNDARY_FILES = ["src/lib/llm/boundary.ts", "src/lib/llm/safety.ts", "supabase/functions/claude-proxy/index.ts"];
export interface ProviderFixture { content: Array<Record<string, unknown>>; stop_reason: string; model?: string }

/** Actual Claude response decoding statements; no handler, auth, upstream fetch or DB.
 * The resulting proxy envelope is a memory fixture, not an enabled Claude seat. */
export function providerDecoder(runtime: OfflineRuntime, sources: Sources) {
  const file = "supabase/functions/claude-proxy/index.ts", ast = astOf(file, sources[file]);
  const blocks = oneNode<ts.VariableDeclaration>(ast,
    n => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "blocks", "Claude blocks");
  const block = blocks.parent.parent.parent;
  if (!ts.isBlock(block)) throw new Error("Offline provider block drift");
  const statements = [...block.statements];
  const named = (node: ts.Statement, name: string) => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === name);
  const start = statements.findIndex(n => named(n, "data")), end = statements.findIndex(n => named(n, "truncated"));
  const refusals = ["refused", "truncated"].map(name => oneNode<ts.IfStatement>(block,
    n => ts.isIfStatement(n) && n.expression.getText(ast) === name, `Claude ${name}`));
  if (start < 0 || end <= start) throw new Error("Offline provider decoding drift");
  const code = [...statements.slice(start, end + 1), ...refusals].map(n => n.getText(ast)).join("\n");
  runtime.extractions["claude-provider-decode"] = sha(code);
  return runtime.evaluate<(raw: unknown) => Promise<{ data: { text: string; modelUsed: string; audited: boolean } | null; error: unknown }>>(
    `async function decode(upstream) { const claudeModel = 'offline-fixture'; const req = null;
      const userId = 'synthetic', purpose = 'offline', latencyMs = 0, keyCombo = 'offline', systemText = '', userText = '';
      ${code}
      return { data: { text, modelUsed, audited: false }, error: null };
    }`, {
      readLlmUpstreamJsonObject: async (raw: unknown) => clone(raw),
      isLlmJsonObject: (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v),
      LlmBodyError: Error, auditUpstreamFailureSupplemental: async () => {}, djb2: () => "offline",
      jsonResponse: (_request: unknown, body: { error: string }, status: number) => ({ data: null,
        error: { message: body.error, context: { status, clone: () => ({ json: async () => body }) } } }),
    }, "decode");
}

export function createBoundaryReplay(runtime: OfflineRuntime, sources: Sources) {
  const classifier = runtime.load<typeof import("../../src/lib/safety/classifier")>("src/lib/safety/classifier.ts");
  const abort = runtime.load("src/lib/async/abort.ts");
  const emergency = runtime.load("src/lib/safety/emergency-routing.ts");
  const decode = providerDecoder(runtime, sources);
  const events: Array<{ kind: string; value?: unknown }> = [];
  let raw: unknown = null, dispatches = 0;
  const getEnv = () => ({ EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_USE_VERTEX: false, EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true });
  const safety = runtime.select<Record<string, unknown>>("src/lib/llm/safety.ts", ["classifySafety", "fixedCrisisResponse"], {
    ...emergency, ...abort, lexiconClassify: classifier.classifyInput, crisisHotlines: classifier.crisisHotlines, getEnv,
    GoogleGenAI: runtime.deny, requestProxyClassification: runtime.deny,
    noteSemanticUnavailable: () => { events.push({ kind: "semantic-unavailable" }); },
    observeLiveOwner: (fence: () => void) => { fence(); return { release: () => {} }; },
  }, ["noteSemanticUnavailable", "requestProxyClassification"]);
  const invoke = async (_name: string, args: { body: unknown }) => {
    dispatches += 1;
    events.push({ kind: "proxy-request", value: clone(args.body) });
    const decoded = await decode(raw);
    events.push({ kind: "proxy-result", value: clone(decoded) });
    return decoded;
  };
  const boundary = runtime.select<{ callLlm: (input: PromptInput) => Promise<LlmResult<string>> }>(
    "src/lib/llm/boundary.ts", ["callLlm"], {
      ...classifier, ...safety, ...emergency, ...abort,
      ...runtime.load("src/lib/safety/model-reply-scan.ts"), ...runtime.load("src/lib/llm/types.ts"),
      getEnv, ...runtime.load("src/lib/llm/routing.ts"),
      // The replay uses the existing routing resolver with an empty synthetic env.
      // A decoded Claude fixture supplies the proxy seam regardless of that seat.
      getSupabaseClient: () => ({ functions: { invoke } }),
      invokeFunctionWithCapturedSession: (name: string, _token: string, args: { body: unknown }) => invoke(name, args),
      getClient: runtime.deny, takeLiveChatDeviceScope: () => undefined,
      writeAiAuditLog: async (_id: string, value: unknown) => { events.push({ kind: "audit", value: clone(value) }); },
      writeCrisisEvent: async (_id: string, value: unknown) => { events.push({ kind: "crisis-event", value: clone(value) }); },
      captureLiveOwnerCheck: () => () => {},
      observeLiveOwner: (fence: () => void) => { fence(); return { release: () => {} }; },
      classifyObfuscatedInput: runtime.deny, hasCrisisObfuscation: runtime.deny,
    }, ["getClient", "writeAiAuditLog", "writeCrisisEvent", "takeLiveChatDeviceScope"]);
  async function replay(input: PromptInput, providerRaw: unknown) {
    raw = providerRaw; dispatches = 0; events.length = 0;
    let reply: LlmResult<string> | null = null, error: string | null = null;
    try { reply = await boundary.callLlm(input); }
    catch (caught) {
      const message = (caught as { message?: string }).message;
      if (!["upstream_bad_payload", "upstream_refusal", "upstream_truncated"].includes(message ?? "")) throw caught;
      error = message!;
    }
    runtime.assertClean();
    return { reply: reply ? clone(reply) : null, error, fixtureDispatches: dispatches, events: clone(events),
      safetyMode: "actual lexical input/output and classifySafety with semantic provider OFF" };
  }
  return { replay };
}
