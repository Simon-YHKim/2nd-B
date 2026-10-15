// Q-261014-03/10: preimplementation model probe. Offline unless --live.
// Six synthetic examples, fixed before calls; no app configuration/flags changed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { classifyInputAnyLocale } from "../src/lib/safety/classifier";
import { answerDisposition } from "../src/lib/interview/continuity";
import { INJECTION_GUARD, wrapUntrusted } from "../src/lib/llm/untrusted";

const live = process.argv.includes("--live");
const output = process.argv.find((x) => x.startsWith("--out="))?.slice(6);
const replies = process.argv.find((x) => x.startsWith("--synthetic-responses="))?.slice(22);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
type Locale = "en" | "ko";
const corpusBytes = readFileSync("scripts/eval-interview-stop-confirmation.corpus.json", "utf8");
const corpus = JSON.parse(corpusBytes) as {
  version: string; sourceSha256: string; candidate: Record<Locale, string>; gate: string;
  cases: Array<{ id: string; locale: Locale; text: string; prior: string }>;
};
// Preserve the measured baseline after this branch changes deterministic probe logic.
const source = execFileSync("git", ["show", "928f4444932a3751dfa034d09825ddd3a4c58edc:src/lib/interview/probe.ts"], { encoding: "utf8" });
if (sha(source) !== corpus.sourceSha256 || corpus.cases.length !== 6 ||
    new Set(corpus.cases.map((x) => x.id)).size !== 6) throw new Error("Frozen fixture/source changed");
for (const sample of corpus.cases) {
  if (classifyInputAnyLocale(sample.text, sample.locale).zone === "red" ||
      classifyInputAnyLocale(sample.prior, sample.locale).zone === "red" ||
      answerDisposition(sample.text, sample.locale) !== "stop") throw new Error("Fixture must be safe and match main stop rule");
}
// Extract the real builders without importing the React Native boundary.
const ast = ts.createSourceFile("probe.ts", source, ts.ScriptTarget.Latest, true);
function declaration(name: string, fn = false): string {
  const found: ts.Node[] = [];
  const visit = (n: ts.Node): void => {
    if ((fn && ts.isFunctionDeclaration(n) && n.name?.text === name) ||
        (!fn && ts.isVariableDeclaration(n) && n.name.getText(ast) === name)) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(ast);
  if (found.length !== 1) throw new Error(`Builder declaration drift: ${name}`);
  if (fn) return found[0].getText(ast).replace(/^export\s+/, "");
  const value = found[0] as ts.VariableDeclaration;
  if (!value.initializer) throw new Error("Missing initializer");
  return `const ${name} = ${value.initializer.getText(ast)};`;
}
const moduleText = ["DRILL_LAYERS", "PERIOD_LABEL", "LAYER_LABEL", "PROBE_SCHEMA"]
  .map((name) => declaration(name)).concat([declaration("buildSystemPrompt", true), declaration("buildUserPrompt", true)]).join("\n");
const compiled = ts.transpileModule(moduleText, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const builders = new Function("INJECTION_GUARD", "wrapUntrusted", compiled + "\nreturn {buildSystemPrompt, buildUserPrompt, PROBE_SCHEMA};")
  (INJECTION_GUARD, wrapUntrusted) as {
    buildSystemPrompt(period: string, locale: Locale, layer: string, scaffold: boolean, asked: string): string;
    buildUserPrompt(history: Array<{ role: string; text: string; layer: string }>): string;
    PROBE_SCHEMA: unknown;
  };
type Row = { id: string; arm: "baseline" | "candidate"; status: string; latencyMs: number;
  model: string | null; promptSha256: string; validJson: boolean; fixedGuidance: boolean };
async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  let url = "", anon = "", token = "";
  if (live) {
    const env = JSON.parse(readFileSync("eas.json", "utf8")).build.preview.env;
    url = env.EXPO_PUBLIC_SUPABASE_URL; anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (url !== "https://zoacryukmdeivmolvyhj.supabase.co") throw new Error("Unexpected project");
    const qa = Object.fromEntries(readFileSync(".env.test", "utf8").split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
        const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, "")];
      }));
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: qa.QA_TEST_EMAIL, password: qa.QA_TEST_PASSWORD }), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`QA auth HTTP ${response.status}`);
    const session = await response.json() as { access_token?: string; user?: { id?: string } };
    if (!session.access_token || session.user?.id !== qa.QA_TEST_USER_ID) throw new Error("QA account mismatch");
    token = session.access_token;
  }
  const rows: Row[] = [], texts: Array<{ id: string; arm: string; text: string }> = [];
  let previousStart = 0, stopped = false;
  for (const [i, sample] of corpus.cases.entries()) {
    const user = builders.buildUserPrompt([
      { role: "interviewer", text: sample.prior, layer: "fact" },
      { role: "user", text: sample.text, layer: "fact" },
    ]);
    for (const arm of (i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) as Array<Row["arm"]>) {
      const system = builders.buildSystemPrompt("work", sample.locale, "feeling", false, "fact") +
        (arm === "candidate" ? "\n" + corpus.candidate[sample.locale] : "");
      const row: Row = { id: sample.id, arm, status: "not-called", latencyMs: 0, model: null,
        promptSha256: sha(JSON.stringify({ system, user, schema: builders.PROBE_SCHEMA })), validJson: false, fixedGuidance: false };
      if (live) {
        const gap = 8000 - (Date.now() - previousStart);
        if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
        previousStart = Date.now();
        try {
          const response = await fetch(`${url}/functions/v1/openai-proxy`, {
            method: "POST", headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ purpose: "interview_probe", system, user, responseSchema: builders.PROBE_SCHEMA, effort: "low" }),
            signal: AbortSignal.timeout(30_000),
          });
          row.status = `http-${response.status}`;
          if (response.ok) {
            const data = await response.json() as { text?: unknown; modelUsed?: unknown };
            row.model = typeof data.modelUsed === "string" ? data.modelUsed.slice(0, 120) : null;
            if (typeof data.text === "string") {
              texts.push({ id: sample.id, arm, text: data.text });
              row.fixedGuidance = classifyInputAnyLocale(data.text, sample.locale).zone === "red";
              try {
                const parsed = JSON.parse(data.text);
                row.validJson = typeof parsed.question === "string" && !!parsed.question.trim() &&
                  ["fact", "feeling", "meaning", "belief", "echo", "none"].includes(parsed.answeredLayer);
              } catch { /* malformed reply is preserved, never retried */ }
            }
          }
          if ([401, 403, 404, 429, 503].includes(response.status)) stopped = true;
        } catch (error) {
          row.status = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "transport-error";
        }
        row.latencyMs = Date.now() - previousStart;
        console.log(`${sample.id} ${arm} ${row.status} ${row.latencyMs}ms`);
      }
      rows.push(row);
      if (stopped) break;
    }
    if (stopped) break;
  }
  const result = { startedAt, finishedAt: new Date().toISOString(), live, appParityVerified: false,
    purpose: "interview_probe", vendor: "openai", effort: "low", sourceSha256: sha(source),
    corpusSha256: sha(corpusBytes), gate: corpus.gate, calls: live ? rows.length : 0, rows,
    complete: rows.length === 12 && rows.every((r) => r.status === "http-200" && r.validJson),
    independentReplyReview: "pending; validity does not establish semantic PASS" };
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  if (replies) writeFileSync(replies, JSON.stringify(texts, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ ...result, rows: undefined }));
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1;
});
