// Offline T68 inventory and fixture preflight. There is deliberately no live mode.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { classifyInputAnyLocale } from "../src/lib/safety/classifier";
import { embedVendor, multimodalVendor, resolveVendorForPurpose } from "../src/lib/llm/routing";
import type { PromptPurpose } from "../src/lib/llm/types";

const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
type Decision = "sonnet" | "opus" | "vision" | "frozen" | "retire" | "retain_openai" | "separate_safety" | "existing_sonnet";
interface Seat { purpose: string; decision: Decision; source: string; reuse: string }
interface Corpus {
  version: string; baselineRevision: string; syntheticOnly: boolean;
  modelIds: { baseline: null; sonnet: null; opus: null };
  seats: Seat[]; deferredSeats: Array<{ purpose: string; decision: string; reason: string }>;
  safetyCases: Array<{ id: string; language: string; semanticExpectation: string; text: string }>;
  ageModes: Array<{ id: string; minor: boolean }>; uiLocales: Array<"ko" | "en">;
  qualityCases: Array<{ id: string; seats: string[]; checks: string[] }>;
  ocrFixtures: Array<{ id: string; seats: string[]; mimeType: string; width: number; height: number; data: string; sha256: string; expectedText: string; synthetic: boolean }>;
  adapterStatus: string;
}
type Literal = string | number | boolean | null | Literal[] | { [name: string]: Literal };

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

// Parse literals only; never evaluate a proxy, import its runtime, or read secrets.
function literal(node: ts.Expression): Literal {
  node = unwrap(node);
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((item) => literal(item));
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) throw new Error("Nonliteral inventory property");
    return [property.name.text, literal(property.initializer)];
  }));
  throw new Error("Nonliteral inventory initializer; update the reader explicitly");
}

function source(root: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(join(root, file), "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function initializer(root: string, file: string, name: string): Literal {
  const ast = source(root, file), found: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) found.push(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (found.length !== 1) throw new Error(`Inventory declaration drift: ${file}:${name}`);
  return literal(found[0]);
}

function promptPurposes(root: string): string[] {
  const ast = source(root, "src/lib/llm/types.ts");
  const declaration = ast.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === "PromptPurpose");
  if (!declaration || !ts.isUnionTypeNode(declaration.type)) throw new Error("PromptPurpose inventory drift");
  return declaration.type.types.map((node) => {
    if (!ts.isLiteralTypeNode(node) || !ts.isStringLiteral(node.literal)) throw new Error("Nonliteral PromptPurpose");
    return node.literal.text;
  });
}

function callSites(root: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\./.test(entry.name)) continue;
      const file = relative(root, full).replace(/\\/g, "/"), ast = source(root, file);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "callLlm") {
          const argument = node.arguments[0];
          if (!argument || !ts.isObjectLiteralExpression(argument)) throw new Error(`Uninventoried dynamic callLlm input: ${file}`);
          const purpose = argument.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText(ast) === "purpose");
          if (!purpose || !ts.isStringLiteral(purpose.initializer)) throw new Error(`Uninventoried dynamic purpose: ${file}`);
          const key = purpose.initializer.text;
          (result[key] ??= []).push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
  };
  walk(join(root, "src"));
  return result;
}

function withRoutingEnvironment<T>(environment: Record<string, string>, run: () => T): T {
  const keys = ["EXPO_PUBLIC_LLM_PHASE", "EXPO_PUBLIC_LLM_VENDOR", "EXPO_PUBLIC_CHAT_VENDOR", "EXPO_PUBLIC_BACKBONE_VENDOR", "EXPO_PUBLIC_MULTIMODAL_VENDOR", "EXPO_PUBLIC_EMBED_VENDOR", "EXPO_PUBLIC_REASONING_PROVIDER"];
  const prior = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (environment[key] === undefined) delete process.env[key]; else process.env[key] = environment[key];
    }
    return run();
  } finally {
    for (const [key, value] of prior) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

export function prepareClaudeSeatMeasurement(root: string, corpusOverride?: Corpus) {
  const corpusBytes = readFileSync(join(root, "scripts/claude-seat-measurement.corpus.json"), "utf8");
  const corpus: Corpus = corpusOverride ?? JSON.parse(corpusBytes);
  if (corpus.syntheticOnly !== true || Object.values(corpus.modelIds).some((value) => value !== null)) throw new Error("This preparation cannot assert live model identities");
  const policyFile = "supabase/functions/_shared/llm-proxy-common.ts";
  const policy = initializer(root, policyFile, "LLM_PURPOSE_POLICY") as Record<string, { vendors: string[]; modality: string; modelTier: string; maxEffort: string; minimumTier: string }>;
  const purposes = promptPurposes(root), calls = callSites(root);
  const board = initializer(root, "src/lib/dashboard/contract.ts", "BOARD_SEATS") as string[];
  const allSeats = [...Object.keys(policy), ...board].sort();
  const fixtureSeats = corpus.seats.map((seat) => seat.purpose).sort();
  if (JSON.stringify(allSeats) !== JSON.stringify(fixtureSeats)) throw new Error("Seat coverage drift: no omitted or duplicated policy/board seats allowed");
  if (purposes.some((purpose) => !policy[purpose])) throw new Error("PromptPurpose missing from proxy policy");
  if (Object.keys(calls).some((purpose) => !purposes.includes(purpose))) throw new Error("Caller absent from PromptPurpose");
  const models = initializer(root, "supabase/functions/claude-proxy/index.ts", "PURPOSE_MODEL") as Record<string, string>;
  const eas = JSON.parse(readFileSync(join(root, "eas.json"), "utf8")) as { build: { preview: { env: Record<string, string> } } };
  const routes = withRoutingEnvironment(eas.build.preview.env, () => Object.fromEntries(purposes.map((purpose) => [purpose, resolveVendorForPurpose(purpose as PromptPurpose, purpose === "capture_ocr", { reasoningTier: policy[purpose].modelTier === "pro" })])));
  const multimodalProbe = withRoutingEnvironment({ ...eas.build.preview.env, EXPO_PUBLIC_MULTIMODAL_VENDOR: "claude" }, () => ({ ocr: resolveVendorForPurpose("capture_ocr", true), voice: multimodalVendor(), embedding: embedVendor() }));
  const seats = corpus.seats.map((seat) => {
    const sourceBytes = readFileSync(join(root, seat.source), "utf8");
    const covered = [...corpus.qualityCases, ...corpus.ocrFixtures].some((sample) => sample.seats.includes(seat.purpose));
    if (["sonnet", "opus", "vision", "existing_sonnet"].includes(seat.decision) && !covered) throw new Error(`Missing synthetic fixture: ${seat.purpose}`);
    return { ...seat, sourceSha256: sha(sourceBytes), literalCallSites: calls[seat.purpose] ?? [],
      routingEvidence: board.includes(seat.purpose) ? "server-only dashboard adapter" : purposes.includes(seat.purpose) ? routes[seat.purpose] : "separate boundary method",
      routingScope: "checked-in eas.preview fixture only; not current APK or repository Variables",
      policy: policy[seat.purpose] ?? null,
      claudeProxySeated: policy[seat.purpose]?.vendors.includes("claude") === true,
      sourceModelLiteral: models[seat.purpose] ?? null,
      modelIdentityVerified: false, liveCalls: 0,
    };
  });
  const safetyRows = corpus.safetyCases.flatMap((sample) => corpus.uiLocales.flatMap((uiLocale) => corpus.ageModes.map((age) => {
    const result = classifyInputAnyLocale(sample.text, uiLocale, { minor: age.minor });
    return { id: sample.id, language: sample.language, uiLocale, age: age.id,
      semanticExpectation: sample.semanticExpectation, observedLexicalZone: result.zone,
      observedHotline: result.crisisRouting?.hotline ?? null,
      disposition: result.zone === "red" ? "gate-only: never dispatch to generation" : "semantic review required; lexical non-red is not a safety PASS" };
  })));
  const ocr = corpus.ocrFixtures.map((fixture) => {
    const bytes = Buffer.from(fixture.data, "base64");
    if (fixture.synthetic !== true || fixture.mimeType !== "image/png" || sha(bytes) !== fixture.sha256 ||
        bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        bytes.readUInt32BE(16) !== fixture.width || bytes.readUInt32BE(20) !== fixture.height || !fixture.expectedText.trim()) throw new Error(`OCR fixture integrity failed: ${fixture.id}`);
    return { id: fixture.id, sha256: fixture.sha256, bytes: bytes.length, width: fixture.width, height: fixture.height, providerCalls: 0 };
  });
  return { status: "OFFLINE_PREPARATION_ONLY", version: corpus.version,
    measuredSourceRevision: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    corpusBaselineRevision: corpus.baselineRevision,
    corpusSha256: sha(corpusOverride ? JSON.stringify(corpusOverride) : corpusBytes),
    policySha256: sha(readFileSync(join(root, policyFile))),
    counts: { promptPurposes: purposes.length, proxyPolicySeats: Object.keys(policy).length, dashboardSeats: board.length, inventoriedSeats: seats.length, syntheticSafetyRows: safetyRows.length, ocrFixtures: ocr.length },
    liveCalls: 0, providerCost: 0, productionWrites: 0, appParityVerified: false,
    modelQualityVerdict: "NOT_MEASURED", adapters: corpus.adapterStatus,
    seats, deferredSeats: corpus.deferredSeats, safetyRows, ocr,
    routingProbe: { input: "checked-in preview env with MULTIMODAL_VENDOR=claude", observed: multimodalProbe },
  };
}

export function preparationOutputPath(args: string[]): string | undefined {
  if (args.length > 1 || args.some((arg) => !arg.startsWith("--out=") || arg.length === 6)) throw new Error("Only --out=<file> is supported. This tool cannot make live calls.");
  return args[0]?.slice(6);
}

if (require.main === module) {
  try {
    const output = preparationOutputPath(process.argv.slice(2));
    const result = prepareClaudeSeatMeasurement(process.cwd());
    if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ status: result.status, counts: result.counts, liveCalls: 0, modelQualityVerdict: result.modelQualityVerdict, corpusSha256: result.corpusSha256 }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Offline preparation failed");
    process.exitCode = 1;
  }
}
