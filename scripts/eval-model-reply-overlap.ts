// Q39-D1 synthetic evaluation. Default is offline. --live calls the deployed
// OpenAI safety_classify seat with the CURRENT app request body, unchanged.
// This is an explicit vendor measurement, never evidence of APK/env parity.
// Only eligible reworded model replies leave the process. No server flag,
// consent, quota or provider configuration is changed. No retries/failover.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

import { prepareModelReplyReview, isClearModelReplyVerdict, isValidModelReplyVerdict } from "../src/lib/safety/model-reply-review";
import { classifyInputAnyLocale } from "../src/lib/safety/classifier";

const args = process.argv.slice(2);
const live = args.includes("--live");
const out = args.find((arg) => arg.startsWith("--out="))?.slice(6);
const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? 100);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const corpusPath = "src/lib/safety/eval/model-reply-overlap-corpus.json";
const corpusBytes = readFileSync(corpusPath, "utf8");
const corpus = JSON.parse(corpusBytes) as { version: string; red: string[]; normal: string[] };
if (corpus.red.length !== 50 || corpus.normal.length !== 50 ||
  new Set([...corpus.red, ...corpus.normal]).size !== 100 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("Invalid corpus or sample limit");
}

// Extract the actual request expression, rather than maintaining a second
// prompt/schema. The AST rejects drift to a nonliteral prompt/missing builder.
// Only pure body construction is evaluated; real HTTP below is the boundary.
const source = readFileSync("src/lib/llm/safety.ts", "utf8");
const ast = ts.createSourceFile("safety.ts", source, ts.ScriptTarget.Latest, true);
let prompt: string | undefined;
let requestExpression: string | undefined;
function inspect(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "SYSTEM_PROMPT" &&
    node.initializer && ts.isNoSubstitutionTemplateLiteral(node.initializer)) prompt = node.initializer.text;
  if (ts.isFunctionDeclaration(node) && node.name?.text === "requestProxyClassification") {
    const findRequest = (part: ts.Node): void => {
      if (ts.isVariableDeclaration(part) && part.name.getText(ast) === "request" && part.initializer) {
        requestExpression = part.initializer.getText(ast);
      }
      ts.forEachChild(part, findRequest);
    };
    findRequest(node);
  }
  ts.forEachChild(node, inspect);
}
inspect(ast);
if (!prompt || !requestExpression) throw new Error("Actual classifier request not found");
const expression = ts.transpileModule(`const request = ${requestExpression}; return request.body;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const buildRequest = new Function("SYSTEM_PROMPT", "vendor", "MODELS", "userMessage", "locale", "signal", "capturedSession", expression);
const samples = [
  ...corpus.red.map((text, i) => ({ id: `R${String(i + 1).padStart(2, "0")}`, truth: "red", text })),
  ...corpus.normal.map((text, i) => ({ id: `N${String(i + 1).padStart(2, "0")}`, truth: "normal", text })),
].slice(0, limit);

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  let url = "", anon = "", token = "";
  if (live) {
    // Public project coordinates from the committed preview profile; private
    // session JWT/password never enter output, an artifact or git.
    const env = JSON.parse(readFileSync("eas.json", "utf8")).build.preview.env;
    url = env.EXPO_PUBLIC_SUPABASE_URL;
    anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (url !== "https://zoacryukmdeivmolvyhj.supabase.co") throw new Error("Unexpected evaluation project");
    const qa = Object.fromEntries(readFileSync(".env.test", "utf8").split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
        const equals = line.indexOf("=");
        return [line.slice(0, equals), line.slice(equals + 1).replace(/^['"]|['"]$/g, "")];
      }));
    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: qa.QA_TEST_EMAIL, password: qa.QA_TEST_PASSWORD }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!login.ok) throw new Error(`QA authentication HTTP ${login.status}`);
    const session = await login.json() as { access_token?: string; user?: { id?: string } };
    if (!session.access_token || session.user?.id !== qa.QA_TEST_USER_ID) throw new Error("QA account mismatch");
    token = session.access_token;
  }
  const results: Array<{ id: string; truth: string; candidate: boolean; released: boolean; status: string; latencyMs: number; model: string | null }> = [];
  let previousStart = 0;
  for (const sample of samples) {
    const copy = prepareModelReplyReview(sample.text, "ko", { minor: false, benignOverlaps: true });
    const row = { id: sample.id, truth: sample.truth, candidate: copy !== null,
      released: classifyInputAnyLocale(sample.text, "ko").zone !== "red",
      status: copy === null ? "strict" : "not-called", latencyMs: 0, model: null as string | null };
    if (live && copy !== null) {
      const gap = 8_000 - (Date.now() - previousStart);
      if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
      previousStart = Date.now();
      try {
        const body = buildRequest(prompt, "openai", {}, copy, "ko", undefined, undefined);
        if (body.purpose !== "safety_classify") throw new Error("Unexpected evaluation purpose");
        const response = await fetch(`${url}/functions/v1/openai-proxy`, {
          method: "POST", headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: AbortSignal.timeout(5_000),
        });
        row.status = `http-${response.status}`;
        if (response.ok) {
          const data = await response.json() as { text?: unknown; modelUsed?: unknown };
          row.model = typeof data.modelUsed === "string" ? data.modelUsed.slice(0, 120) : null;
          try {
            const verdict: unknown = typeof data.text === "string" ? JSON.parse(data.text) : null;
            if (!isValidModelReplyVerdict(verdict)) row.status = "invalid-payload";
            else row.released = isClearModelReplyVerdict(verdict);
          } catch { row.status = "invalid-payload"; }
        }
        // Do not spend a whole corpus against a missing seat/permission/quota.
        if ([401, 403, 404, 429, 503].includes(response.status)) {
          row.latencyMs = Date.now() - previousStart;
          results.push(row);
          break;
        }
      } catch (error) {
        row.status = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "transport-error";
      }
      row.latencyMs = Date.now() - previousStart;
    }
    results.push(row);
    if (live) console.log(`${row.id} ${row.status} ${row.released ? "released" : "retained"} ${row.latencyMs}ms`);
  }
  // Retain case IDs, release decisions and operational metrics, never the copy
  // or classifier JSON/triggers. Labels and synthetic inputs live in the fixture.
  const report = {
    startedAt, finishedAt: new Date().toISOString(), live, vendor: "openai", corpusVersion: corpus.version,
    corpusSha256: sha(corpusBytes), sourceSha256: sha(source), promptSha256: sha(prompt!),
    appParityVerified: false, total: results.length, requested: samples.length,
    candidates: results.filter((r) => r.candidate).length,
    calls: results.filter((r) => !["strict", "not-called"].includes(r.status)).length,
    validVerdicts: results.filter((r) => r.status === "http-200").length,
    inconclusive: results.filter((r) => r.candidate && !["http-200", "not-called"].includes(r.status)).map((r) => r.id),
    unsafeReleased: results.filter((r) => r.truth === "red" && r.released).map((r) => r.id),
    ordinaryReleased: results.filter((r) => r.truth === "normal" && r.released).length,
    results,
  };
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, results: undefined }));
}

void main().catch((error: unknown) => {
  // No response bodies, authorization headers or session data in error logs.
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exitCode = 1;
});
