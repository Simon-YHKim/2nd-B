// The shared crisis route reads no configuration (Simon 2026-10-18 12:00, Q-261018-48 가), in the scope
// Simon set at 21:18 (Q-261018-57 가): 「범위를 결정 원문(설정 닿는 import 없음 + 위기면 바로 반환)으로
// 좁히고 기록 저장도 「안내 먼저」로 · 장애 조치 순서는 원래대로」.
//
// Background: #2611 tried to fence one function inside boundary.ts (a file that reads settings by design);
// review rounds kept finding a way one layer further out. Here the route lives in its own file, and two
// things are claimed and checked:
//
//  A. No setting-reaching import. The runtime import closure of src/lib/safety/crisis-route.ts is walked by
//     resolving every specifier (relative and "@/"), following re-exports, skipping only declarations whose
//     every binding is type-only. It must equal the pinned set, contain no known settings module and no
//     package. Dynamic import(), require(), `import x = require()` and import.meta are refused in every
//     closure file. A file whose closure holds no settings module cannot read settings, at load or later.
//  D. A crisis result comes back at once. Every entry point (record save, interview, chat, callLlm's input
//     gate, its meaning-check RED and its proxy 422 answers) returns the guidance while both ledgers are
//     made to never settle. The writes still follow, the audit row first, the restricted row after it.
//
// Supporting rules, not further claims: the closure files keep no top-level let/var, touch no host global,
// pin their runtime exports and freeze the tables they export (B); crisis-route.ts pins its surface and may
// only hand the ledger writers on in one discarded chain per routing (C); boundary.ts opens the gate before
// anything but the owner, signal and schema checks, returns each crisis answer on the next statement and
// keeps main's failover order (statements are compared through the TypeScript printer, so comments and
// string text do not count). The input-RED entries also run with configuration reads refused: a smoke
// check on top of A, not a proof that no value can reach the route through a caller.
// The mutation blocks feed altered sources to these checks so each is shown to fail where it should.
import { existsSync, readFileSync } from "fs";
import { posix, resolve } from "path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const ENTRY = "src/lib/safety/crisis-route.ts";
const BOUNDARY = "src/lib/llm/boundary.ts";

// The whole runtime closure with each file's runtime exports, pinned. A new import or export changes this
// and fails here, so it is seen in review.
const PINNED_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  "src/lib/async/abort.ts": ["abortError", "isAbortError", "throwIfAborted"],
  "src/lib/safety/classifier.ts": ["KO_PARTIAL_SPACING_TERMS", "classifyInput", "classifyInputAnyLocale", "containsAnalysisForbidden", "containsForbiddenLexicon", "crisisHotlines", "koSpacingForms", "koTermSpellings", "matchesJoinedKoTerm"],
  "src/lib/safety/crisis-context.ts": ["hasCrisisRiskContext", "prepareCrisisScanText"],
  "src/lib/safety/crisis-language.ts": ["matchAdditionalCrisisLanguage"],
  "src/lib/safety/crisis-route.ts": ["createCrisisRouting", "crisisObserver", "inspectProxyCrisisRejection"],
  "src/lib/safety/emergency-routing.ts": ["emergencyGuidance", "emergencyHotline", "emergencyHotlineForText", "emergencyLaneForHotline", "emergencyLanePayload", "emergencyRoute", "matchEmergencyLane", "parseEmergencyLane"],
  "src/lib/safety/lexicon.ts": ["ADDITIONAL_CRISIS_PHRASES", "ANALYSIS_BANNED_CLAIM_PATTERNS", "ANALYSIS_JURISDICTION_FORBIDDEN", "ANALYSIS_UNIVERSAL_FORBIDDEN", "APPROVED_L2_ONLY_MARKERS", "COMPLETE_CRISIS_PHRASES", "CRISIS_TERMS", "EMERGENCY_PHRASES", "FORBIDDEN_TERMS", "HOTLINES", "LEXICON_LAST_LEGAL_REVIEW", "LEXICON_NON_CLINICAL_CONTEXTS", "LEXICON_SCAN_ALLOWLIST", "LEXICON_VERSION", "isLexiconScanAllowed"],
};
const PINNED_CLOSURE = Object.keys(PINNED_EXPORTS).sort();

// Explicitly forbidden even if someone also edits the pins: the settings reader, the vendor switches,
// everything under the LLM boundary directory (it reads settings), Supabase (its client reads settings),
// tier/entitlement, privacy prefs, chat mode, and anything rendered.
const FORBIDDEN_FILES = ["src/lib/env.ts", "src/lib/llm/routing.ts"];
const FORBIDDEN_DIRS = [
  "src/lib/llm/",
  "src/lib/supabase/",
  "src/lib/entitlements/",
  "src/lib/privacy/",
  "src/lib/chat/",
  "src/app/",
  "src/components/",
];

const HOST_GLOBALS = new Set([
  "process", "globalThis", "global", "window", "self", "document", "navigator", "localStorage",
  "sessionStorage", "require", "module", "exports", "__DEV__", "eval", "Function", "fetch", "XMLHttpRequest",
  "importScripts", "Deno",
]);

// crisis-route.ts module exports: name -> printed parameter list.
const PINNED_SURFACE: Readonly<Record<string, string>> = {
  // transcribeAudio (boundary.ts) builds its own observer with the same fenced, once-only wrapper.
  crisisObserver: "(observer: CrisisObserver | undefined, fence: () => void)",
  inspectProxyCrisisRejection: "(error: unknown)",
  createCrisisRouting: "(ledger: CrisisLedger)",
};

// The routers declared in createCrisisRouting (reachable through boundary): name -> parameters.
const PINNED_ROUTERS: Readonly<Record<string, string>> = {
  classifyRecordTextForCrisis: "(text: string, locale: \"en\" | \"ko\", userId: string, minor = false, session?: AuthenticatedAccountSessionLease)",
  classifyInterviewTextForCrisis: "(text: string, locale: \"en\" | \"ko\", userId: string, minor = false)",
  startInterviewCrisisRouting: "(guard: { current: boolean }, input: InterviewCrisisRoutingInput, onVisible: () => void, onSettled: () => void)",
  routeCrisis: "(result: SafetyResult, locale: \"en\" | \"ko\", userId: string, promptHash: string, minor = false, sourceTag = \"input_red\", opts: { recordCrisisEvent?: boolean; purpose?: string; session?: AuthenticatedAccountSessionLease; classifierConfidence?: number; } = {})",
  classifyChatTextForCrisis: "(text: string, locale: \"en\" | \"ko\", userId: string, minor?: boolean, options?: { session: AuthenticatedAccountSessionLease; signal?: AbortSignal; onCrisisDetected?: CrisisObserver; })",
  routeProxyRejection: "(error: unknown, call: { locale: \"en\" | \"ko\"; minor?: boolean; userId: string; promptHash: string; purpose?: string; session?: AuthenticatedAccountSessionLease; notifyCrisis?: CrisisObserver; fence: () => void; })",
  openPromptCrisisGate: "(input: PromptCrisisInput, signal: AbortSignal | undefined)",
};
// What createCrisisRouting hands out (frozen). routeCrisis and routeProxyRejection stay inside.
const RETURNED_ROUTERS = ["classifyChatTextForCrisis", "classifyInterviewTextForCrisis", "classifyRecordTextForCrisis", "openPromptCrisisGate", "startInterviewCrisisRouting"];
const FACTORY_HEAD = "const { writeAiAuditLog, writeCrisisEvent } = ledger;";
const LEDGER_WRITERS = new Set(["writeAiAuditLog", "writeCrisisEvent"]);
// What callLlm hands its gate (PromptCrisisInput), printed member by member.
const PROMPT_CRISIS_INPUT = [
  "user: string;",
  "system?: string;",
  "locale: \"en\" | \"ko\";",
  "minor?: boolean;",
  "userId: string;",
  "purpose?: string;",
  "session?: AuthenticatedAccountSessionLease;",
  "onCrisisDetected?: CrisisObserver;",
];

type Source = (rel: string) => string;
const readRepo: Source = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const parse = (rel: string, text: string): ts.SourceFile =>
  ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function resolveSpecifier(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = posix.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(fromRel), spec));
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.tsx?$/.test(candidate) && existsSync(resolve(ROOT, candidate))) return candidate;
  }
  return "<unresolved>";
}

/** `import type …`, or named imports that are every one `type`. Anything else loads at runtime. */
function isTypeOnlyImport(stmt: ts.ImportDeclaration): boolean {
  const clause = stmt.importClause;
  if (!clause) return false; // `import "x"` runs the module
  if (clause.isTypeOnly) return true;
  const named = clause.namedBindings;
  return !clause.name && !!named && ts.isNamedImports(named) && named.elements.length > 0
    && named.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyExport(stmt: ts.ExportDeclaration): boolean {
  if (stmt.isTypeOnly) return true;
  const clause = stmt.exportClause;
  return !!clause && ts.isNamedExports(clause) && clause.elements.length > 0
    && clause.elements.every((element) => element.isTypeOnly);
}

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);

// Every runtime export form: declarations, local export lists (`export { patterns }`), default exports.
function runtimeExports(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const stmt of sf.statements) {
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && !isTypeOnlyExport(stmt)) {
      const clause = stmt.exportClause;
      if (clause && ts.isNamedExports(clause)) for (const e of clause.elements) if (!e.isTypeOnly) names.push(e.name.text);
      continue;
    }
    if (ts.isExportAssignment(stmt)) { names.push("default"); continue; }
    if (!isExported(stmt)) continue;
    const isDefault = (ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) ?? false;
    if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && (stmt.name || isDefault)) names.push(isDefault ? "default" : stmt.name!.text);
    else if (ts.isVariableStatement(stmt)) for (const d of stmt.declarationList.declarations) names.push(d.name.getText(sf));
  }
  return names.sort();
}

/** Every function declared anywhere in the file, plus imported bindings that are functions where they live. */
function functionNames(rel: string, sf: ts.SourceFile, read: Source): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || isTypeOnlyImport(stmt)) continue;
    const named = stmt.importClause?.namedBindings;
    const target = resolveSpecifier(rel, (stmt.moduleSpecifier as ts.StringLiteral).text);
    if (!named || !ts.isNamedImports(named) || !target || target === "<unresolved>") continue;
    const source = parse(target, read(target));
    const declared = new Set(source.statements.filter(ts.isFunctionDeclaration).map((f) => f.name?.text));
    for (const element of named.elements) {
      if (!element.isTypeOnly && declared.has((element.propertyName ?? element.name).text)) names.add(element.name.text);
    }
  }
  return names;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
}

function fileRules(rel: string, sf: ts.SourceFile, read: Source): string[] {
  const out: string[] = [];
  const fns = functionNames(rel, sf, read);
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt) && !(stmt.declarationList.flags & ts.NodeFlags.Const)) out.push(`${rel}: top-level let/var`);
  }
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) out.push(`${rel}: dynamic import()`);
    if (ts.isMetaProperty(node)) out.push(`${rel}: import.meta`);
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) {
      out.push(`${rel}: declare`);
    }
    if (ts.isModuleDeclaration(node)) out.push(`${rel}: namespace/module declaration`);
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && /EXPO_PUBLIC_/.test(node.text)) {
      out.push(`${rel}: setting name in a string`);
    }
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
      const object = unwrap(node.expression);
      if (ts.isIdentifier(object) && fns.has(object.text)) out.push(`${rel}: property of function ${object.text}`);
    }
    if (ts.isIdentifier(node) && HOST_GLOBALS.has(node.text)) {
      const p = node.parent;
      const isPropertyName = (ts.isPropertyAccessExpression(p) && p.name === node)
        || (ts.isPropertyAssignment(p) && p.name === node)
        || (ts.isMethodDeclaration(p) && p.name === node)
        || (ts.isPropertySignature(p) && p.name === node)
        || (ts.isPropertyDeclaration(p) && p.name === node);
      if (!isPropertyName) out.push(`${rel}: host global ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const exportsHere = runtimeExports(sf);
  const pinned = PINNED_EXPORTS[rel];
  if (pinned && JSON.stringify(exportsHere) !== JSON.stringify([...pinned].sort())) {
    out.push(`${rel}: runtime exports ${JSON.stringify(exportsHere)}`);
  }
  return out;
}

interface ClosureReport {
  files: string[];
  problems: string[];
}

function walkClosure(read: Source, entry = ENTRY): ClosureReport {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const rel = queue.shift() as string;
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (FORBIDDEN_FILES.includes(rel) || FORBIDDEN_DIRS.some((dir) => rel.startsWith(dir))) {
      problems.push(`forbidden module in closure: ${rel}`);
      continue;
    }
    const sf = parse(rel, read(rel));
    const follow = (spec: string, what: string): void => {
      const target = resolveSpecifier(rel, spec);
      if (target === null) problems.push(`${rel}: package ${what} "${spec}"`);
      else if (target === "<unresolved>") problems.push(`${rel}: unresolved ${what} "${spec}"`);
      else queue.push(target);
    };
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt)) {
        if (isTypeOnlyImport(stmt)) continue;
        follow((stmt.moduleSpecifier as ts.StringLiteral).text, "import");
      } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
        if (isTypeOnlyExport(stmt)) continue;
        follow((stmt.moduleSpecifier as ts.StringLiteral).text, "re-export");
      } else if (ts.isImportEqualsDeclaration(stmt)) {
        problems.push(`${rel}: import = require`);
      }
    }
    problems.push(...fileRules(rel, sf, read));
  }
  return { files: [...seen].sort(), problems };
}

function paramsOf(fn: ts.FunctionDeclaration, sf: ts.SourceFile): string {
  return `(${fn.parameters.map((p) => p.getText(sf)).join(", ")})`.replace(/\s+/g, " ");
}

// The factory body may only destructure the ledger, declare the routers and return the pinned ones frozen.
function factoryProblems(fn: ts.FunctionDeclaration, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const routers = new Map<string, string>();
  for (const stmt of fn.body?.statements ?? []) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      routers.set(stmt.name.text, paramsOf(stmt, sf));
    } else if (ts.isVariableStatement(stmt) && stmt.getText(sf) === FACTORY_HEAD) {
      continue;
    } else if (ts.isReturnStatement(stmt)) {
      const call = stmt.expression;
      const frozen = call && ts.isCallExpression(call) && call.expression.getText(sf) === "Object.freeze"
        && call.arguments.length === 1 && ts.isObjectLiteralExpression(call.arguments[0])
        ? (call.arguments[0] as ts.ObjectLiteralExpression).properties.map((p) =>
          ts.isShorthandPropertyAssignment(p) ? p.name.text : `!${p.getText(sf)}`)
        : null;
      if (!frozen) out.push("factory return is not Object.freeze({ ...routers })");
      else if (JSON.stringify([...frozen].sort()) !== JSON.stringify(RETURNED_ROUTERS)) {
        out.push(`factory returns ${JSON.stringify(frozen)}`);
      }
    } else {
      out.push(`factory statement: ${stmt.getText(sf).slice(0, 60)}`);
    }
  }
  if (JSON.stringify([...routers.keys()].sort()) !== JSON.stringify(Object.keys(PINNED_ROUTERS).sort())) {
    out.push(`factory routers ${JSON.stringify([...routers.keys()])}`);
  }
  for (const [name, params] of routers) {
    if (PINNED_ROUTERS[name] !== undefined && PINNED_ROUTERS[name] !== params) out.push(`signature of ${name}: ${params}`);
  }
  return out;
}

// The ledger may only be destructured once. Each writer may only be called inside a `void …;` statement
// (the hand-off) whose callbacks take no parameters and never read `arguments`: one write's outcome may
// order the next write, but it cannot reach the route, its result or anything kept.
function handOffStatement(call: ts.Node): boolean {
  let node: ts.Node = call;
  while (node.parent && !ts.isExpressionStatement(node.parent) && !ts.isBlock(node.parent) && !ts.isSourceFile(node.parent)) {
    node = node.parent;
  }
  const stmt = node.parent;
  if (!stmt || !ts.isExpressionStatement(stmt) || !ts.isVoidExpression(stmt.expression)) return false;
  let closed = true;
  const scan = (n: ts.Node): void => {
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parameters.length > 0) closed = false;
    if (ts.isIdentifier(n) && n.text === "arguments") closed = false;
    ts.forEachChild(n, scan);
  };
  scan(stmt);
  return closed;
}

function ledgerProblems(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && (node.text === "ledger" || LEDGER_WRITERS.has(node.text))) {
      const p = node.parent;
      const declaredHere = (ts.isParameter(p) && p.name === node) || ts.isBindingElement(p)
        || ((ts.isMethodSignature(p) || ts.isPropertySignature(p)) && p.name === node);
      const factoryInit = node.text === "ledger" && ts.isVariableDeclaration(p) && p.initializer === node
        && p.parent.parent.getText(sf) === FACTORY_HEAD;
      const handedOn = LEDGER_WRITERS.has(node.text) && ts.isCallExpression(p) && p.expression === node && handOffStatement(p);
      if (!declaredHere && !factoryInit && !handedOn) {
        out.push(`ledger use: ${p.getText(sf).replace(/\s+/g, " ").slice(0, 70)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function surfaceProblems(read: Source): string[] {
  const sf = parse(ENTRY, read(ENTRY));
  const out: string[] = [];
  const exported = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      if (!(stmt.declarationList.flags & ts.NodeFlags.Const)) out.push("top-level let/var");
      if (isExported(stmt)) out.push(`exported value: ${stmt.declarationList.declarations.map((d) => d.name.getText(sf)).join(",")}`);
    } else if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && stmt.name) {
      exported.set(stmt.name.text, paramsOf(stmt, sf));
      if (stmt.name.text === "createCrisisRouting") out.push(...factoryProblems(stmt, sf));
    } else if (ts.isClassDeclaration(stmt) && isExported(stmt)) {
      out.push(`exported class: ${stmt.name?.text}`);
    } else if (ts.isExportDeclaration(stmt) && !isTypeOnlyExport(stmt)) {
      out.push("export { ... } list");
    } else if (ts.isExportAssignment(stmt)) {
      out.push("export default / export =");
    } else if (ts.isEnumDeclaration(stmt)) {
      out.push(`enum: ${stmt.name.text}`);
    }
  }
  const want = Object.keys(PINNED_SURFACE).sort();
  const got = [...exported.keys()].sort();
  if (JSON.stringify(want) !== JSON.stringify(got)) out.push(`exported functions ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  for (const [name, params] of exported) {
    if (PINNED_SURFACE[name] !== undefined && PINNED_SURFACE[name] !== params) out.push(`signature of ${name}: ${params}`);
  }
  const promptInput = sf.statements.find((st): st is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(st) && st.name.text === "PromptCrisisInput");
  const members = promptInput?.members.map((m) => m.getText(sf).replace(/\s+/g, " ")) ?? [];
  if (JSON.stringify(members) !== JSON.stringify(PROMPT_CRISIS_INPUT)) out.push(`PromptCrisisInput members ${JSON.stringify(members)}`);
  out.push(...ledgerProblems(sf));
  return out;
}

// boundary.ts is compared statement by statement through the printer: comments are dropped and a pinned
// statement only matches a statement, never text inside a string or a comment.
const printer = ts.createPrinter({ removeComments: true });
const printed = (node: ts.Node, sf: ts.SourceFile): string =>
  printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s+/g, " ").trim();

/** A pinned run of statements, written as source and printed the same way as the code it is compared with. */
function pinned(source: string): string[] {
  const sf = parse("pin.ts", `async function pin<T>(input: never) {\n${source}\n}`);
  const fn = sf.statements[0] as ts.FunctionDeclaration;
  return (fn.body?.statements ?? []).map((st) => printed(st, sf));
}

const PRE_GATE = pinned(`
  if (input.session && input.session.userId !== input.userId) { throw new Error("llm_session_owner_mismatch"); }
  if (input.session && input.signal && input.signal !== input.session.signal) { throw new Error("llm_session_signal_mismatch"); }
  const signal = input.session?.signal ?? input.signal;
  const fence = (): void => { throwIfAborted(signal); input.session?.assertCurrent(); };
  fence();
  assertRootObjectSchema(input.responseSchema);
  const crisisGate = crisisRouting.openPromptCrisisGate(input, signal);
  if (crisisGate.routed) return (await crisisGate.routed) as unknown as LlmResult<T>;
  const { safety: inputSafety, promptHash, notifyCrisis } = crisisGate;
`);
const SEMANTIC_RED = pinned(`
  if (semanticInput?.zone === "red") { return (await crisisGate.routeSemanticRed(semanticInput.confidence)) as unknown as LlmResult<T>; }
`);
// main's failover order: the switch is read after the first reply; each crisis answer returns at once.
const PROXY_REPLIES = pinned(`
  const t0 = Date.now();
  let { data, error } = await invokeProxy(primaryFn);
  const failoverTarget = failoverVendor();
  const failoverFn = failoverTarget === "none" ? null : proxyFnForVendor(failoverTarget);
  if (error && input.purpose !== "persona_synthesis" && input.purpose !== "reasoning_connect" && failoverFn && failoverFn !== primaryFn) {
    const vendorCrisis = await crisisGate.routeProxyRejection(error);
    if (vendorCrisis) return vendorCrisis as unknown as LlmResult<T>;
    if (typeof console !== "undefined") { console.warn(\`[llm] \${primaryFn} failed for \${input.purpose} - falling back to \${failoverFn}\`); }
    servedByProvider = failoverTarget as LlmVendor;
    ({ data, error } = await invokeProxy(failoverFn));
  }
  latencyMs = Date.now() - t0;
  if (error) {
    const proxyCrisis = await crisisGate.routeProxyRejection(error);
    if (proxyCrisis) return proxyCrisis as unknown as LlmResult<T>;
    throw error;
  }
`);
const ENTRY_EXPORTS = ["classifyRecordTextForCrisis", "classifyInterviewTextForCrisis", "startInterviewCrisisRouting", "classifyChatTextForCrisis"];

const containsRun = (list: readonly string[], run: readonly string[]): boolean =>
  list.some((_, i) => run.every((st, j) => list[i + j] === st));

function boundaryProblems(text: string): string[] {
  const sf = parse(BOUNDARY, text);
  const out: string[] = [];
  const top = sf.statements.map((st) => printed(st, sf));
  if (!top.includes(printed(parse("p.ts", "const crisisRouting = createCrisisRouting({ writeAiAuditLog, writeCrisisEvent });").statements[0], sf))) {
    out.push("pin: crisisRouting is not bound to the two ledger writers");
  }
  for (const name of ENTRY_EXPORTS) {
    if (!top.includes(`export const ${name} = crisisRouting.${name};`)) out.push(`pin: export ${name}`);
  }
  const declared: string[] = [];
  const accesses: string[] = [];
  const blocks: string[][] = [];
  let callLlm: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      declared.push(node.name.text);
      if (node.name.text === "callLlm") callLlm = node;
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && (node.expression.text === "crisisRouting" || node.expression.text === "crisisGate")) {
      accesses.push(`${node.expression.text}.${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const name of [...ENTRY_EXPORTS, "routeCrisis", "crisisObserver", "inspectProxyCrisisRejection", "proxyCrisisSafetyResult", "openPromptCrisisGate"]) {
    if (declared.includes(name)) out.push(`boundary declares ${name}`);
  }
  if (!callLlm?.body) return [...out, "pin: callLlm not found"];
  const body = callLlm.body.statements.map((st) => printed(st, sf));
  if (JSON.stringify(body.slice(0, PRE_GATE.length)) !== JSON.stringify(PRE_GATE)) out.push("pin: callLlm opens the gate first");
  const collect = (node: ts.Node): void => {
    if (ts.isBlock(node)) blocks.push(node.statements.map((st) => printed(st, sf)));
    ts.forEachChild(node, collect);
  };
  collect(callLlm.body);
  if (!blocks.some((b) => containsRun(b, SEMANTIC_RED))) out.push("pin: meaning-check RED returns at once");
  if (!blocks.some((b) => containsRun(b, PROXY_REPLIES))) out.push("pin: proxy replies in main's failover order");
  const want = [
    "crisisGate.routeProxyRejection", "crisisGate.routeProxyRejection", "crisisGate.routeSemanticRed", "crisisGate.routed", "crisisGate.routed",
    "crisisRouting.classifyChatTextForCrisis", "crisisRouting.classifyInterviewTextForCrisis", "crisisRouting.classifyRecordTextForCrisis",
    "crisisRouting.openPromptCrisisGate", "crisisRouting.startInterviewCrisisRouting",
  ];
  if (JSON.stringify(accesses.sort()) !== JSON.stringify(want)) out.push(`pin: gate uses ${JSON.stringify(accesses)}`);
  return out;
}

describe("A-C: the crisis route file reads no configuration", () => {
  test("the runtime import closure is exactly the pinned pure modules, and each obeys the file rules", () => {
    const report = walkClosure(readRepo);
    expect(report.problems).toEqual([]);
    expect(report.files).toEqual(PINNED_CLOSURE);
    for (const rel of report.files) {
      expect(FORBIDDEN_FILES.includes(rel) || FORBIDDEN_DIRS.some((dir) => rel.startsWith(dir))).toBe(false);
    }
  });

  test("the surface is three functions and the pinned routers; the ledger is only handed on", () => {
    expect(surfaceProblems(readRepo)).toEqual([]);
  });

  test("every table a closure module exports is frozen at load (RegExp objects keep their own state)", () => {
    const unfrozen: string[] = [];
    const check = (value: unknown, at: string): void => {
      if (value === null || typeof value !== "object" || value instanceof RegExp) return;
      if (!Object.isFrozen(value)) unfrozen.push(at);
      for (const key of Object.keys(value)) check((value as Record<string, unknown>)[key], `${at}.${key}`);
    };
    for (const rel of PINNED_CLOSURE) {
      const mod = jest.requireActual(resolve(ROOT, rel)) as Record<string, unknown>;
      // The loaded module object itself, whatever export form produced it.
      expect([rel, Object.keys(mod).filter((k) => k !== "__esModule").sort()]).toEqual([rel, [...PINNED_EXPORTS[rel]].sort()]);
      for (const name of PINNED_EXPORTS[rel]) {
        expect([rel, name, name in mod]).toEqual([rel, name, true]);
        check(mod[name], `${rel}:${name}`);
      }
    }
    expect(unfrozen).toEqual([]);
  });

  test("boundary.ts opens the gate first, returns each crisis answer at once and keeps main's failover order", () => {
    expect(boundaryProblems(readRepo(BOUNDARY))).toEqual([]);
  });

  describe("mutations are caught", () => {
    const base = readRepo(ENTRY);
    const withFiles = (files: Record<string, string>): Source => (rel) => (rel in files ? files[rel] : readRepo(rel));
    const withEntry = (text: string): Source => withFiles({ [ENTRY]: text });
    const firstImport = base.search(/^import /m);
    const prepend = (line: string): string => `${base.slice(0, firstImport)}${line}\n${base.slice(firstImport)}`;
    const append = (text: string): string => `${base}\n${text}\n`;
    const once = (text: string, from: string, to: string): string => {
      expect([from, text.split(from).length - 1]).toEqual([from, 1]);
      return text.replace(from, to);
    };

    test.each([
      ["a settings import", prepend('import { getEnv } from "../env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["the vendor switches", prepend('import { failoverVendor } from "../llm/routing";'), /forbidden module in closure: src\/lib\/llm\/routing\.ts/],
      ["a re-export of settings", append('export { getEnv } from "../env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["an alias import", prepend('import { getEnv } from "@/lib/env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["a package", prepend('import Constants from "expo-constants";'), /package import "expo-constants"/],
      ["a mixed type/value import", prepend('import { type Env, getEnv } from "../env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["a mixed type/value re-export", append('export { type Env, getEnv } from "../env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["a side-effect import", prepend('import "../env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["process.env", append("export function probe(): boolean { return process.env.X === \"1\"; }"), /host global process/],
      ["globalThis", append("export function probe(): unknown { return (globalThis as { a?: unknown }).a; }"), /host global globalThis/],
      ["an ambient declaration", append("declare const config: { on: boolean };"), /declare/],
      ["a setting name in a string", append("const KEY = \"EXPO_PUBLIC_LLM_MODE\";"), /setting name in a string/],
      ["a dynamic import", append("export async function probe(): Promise<unknown> { return import(\"../env\"); }"), /dynamic import\(\)/],
      ["require()", append("export function probe(): unknown { return require(\"../env\"); }"), /host global require/],
      ["import = require", prepend('import env = require("../env");'), /import = require/],
      ["a property read on an imported function", append("const hidden = (classifyInputAnyLocale as unknown as { flag?: boolean }).flag;"), /property of function classifyInputAnyLocale/],
      ["a property read on a local function", append("const hidden = djb2[\"flag\" as never];"), /property of function djb2/],
    ])("%s", (_label, mutated, problem) => {
      const report = walkClosure(withEntry(mutated));
      expect(report.problems.join("\n")).toMatch(problem);
    });

    test.each([
      ["type-only named import", prepend('import { type Env } from "../env";')],
      ["type-only named re-export", append('export { type Env } from "../env";')],
    ])("%s is not a runtime edge", (_label, mutated) => {
      const report = walkClosure(withEntry(mutated));
      expect(report.problems).toEqual([]);
      expect(report.files).toEqual(PINNED_CLOSURE);
    });

    test("an unlisted local module changes the pinned closure", () => {
      const report = walkClosure(withEntry(prepend('import { recordableCrisisCategories } from "./crisis-event-categories";')));
      expect(report.files).not.toEqual(PINNED_CLOSURE);
    });

    test.each([
      ["a top-level let in a closure module", "src/lib/safety/crisis-context.ts", (t: string) => `${t}\nlet mode = 0;\n`, /crisis-context\.ts: top-level let\/var/],
      ["a new export in a closure module", "src/lib/safety/emergency-routing.ts", (t: string) => `${t}\nexport function extra(): void {}\n`, /emergency-routing\.ts: runtime exports/],
      ["a local export list in a closure module", "src/lib/safety/emergency-routing.ts", (t: string) => `${t}\nexport { patterns };\n`, /emergency-routing\.ts: runtime exports/],
      ["a default export in a closure module", "src/lib/safety/crisis-language.ts", (t: string) => `${t}\nexport default normalize;\n`, /crisis-language\.ts: runtime exports/],
      ["a function property read in a closure module", "src/lib/safety/classifier.ts", (t: string) => `${t}\nconst hidden = (classifyInput as { flag?: boolean }).flag;\n`, /classifier\.ts: property of function classifyInput/],
      ["a host global in a closure module", "src/lib/safety/lexicon.ts", (t: string) => `${t}\nconst hidden = globalThis;\n`, /lexicon\.ts: host global globalThis/],
    ])("%s", (_label, rel, mutate, problem) => {
      const report = walkClosure(withFiles({ [rel]: mutate(readRepo(rel)) }));
      expect(report.problems.join("\n")).toMatch(problem);
    });

    test.each([
      ["an exported mutable object", () => append("export const CRISIS_GATE = { enabled: true };"), /exported value: CRISIS_GATE/],
      ["a top-level let", () => append("let gate = true;"), /top-level let\/var/],
      ["a new parameter", () => once(base, "(error: unknown): Promise<ProxyCrisisDecision>", "(error: unknown, viaEdge?: boolean): Promise<ProxyCrisisDecision>"), /signature of inspectProxyCrisisRejection/],
      ["a new exported function", () => append("export function routeAnyway(): void {}"), /exported functions/],
      ["an export list", () => append("const hidden = 1;\nexport { hidden };"), /export \{ \.\.\. \} list/],
      ["a router parameter", () => once(base, "minor?: boolean;\n      userId: string;\n      promptHash: string;", "minor?: boolean;\n      viaEdge?: boolean;\n      userId: string;\n      promptHash: string;"), /signature of routeProxyRejection/],
      ["a gate parameter", () => once(base, "(input: PromptCrisisInput, signal: AbortSignal | undefined)", "(input: PromptCrisisInput, signal: AbortSignal | undefined, viaEdge = false)"), /signature of openPromptCrisisGate/],
      ["a new router", () => once(base, "  return Object.freeze({\n    openPromptCrisisGate,", "  function routeAnyway(): void {}\n  return Object.freeze({\n    openPromptCrisisGate,"), /factory routers/],
      ["routeCrisis handed out", () => once(base, "    openPromptCrisisGate,\n    classifyRecordTextForCrisis,", "    openPromptCrisisGate,\n    routeCrisis,\n    classifyRecordTextForCrisis,"), /factory returns/],
      ["a mutable factory state", () => once(base, "  const { writeAiAuditLog, writeCrisisEvent } = ledger;", "  const { writeAiAuditLog, writeCrisisEvent } = ledger;\n  const gate = { open: true };"), /factory statement: const gate/],
      ["an unfrozen return", () => once(base, "  return Object.freeze({\n    openPromptCrisisGate,", "  return ({\n    openPromptCrisisGate,"), /factory return is not Object\.freeze/],
      ["a ledger write kept", () => once(base, "    void writeAiAuditLog(", "    const kept = writeAiAuditLog("), /ledger use/],
      ["a ledger write awaited before the result", () => once(base, "    void writeAiAuditLog(", "    await writeAiAuditLog("), /ledger use/],
      ["a ledger outcome read", () => once(base, ".then(() => (event ?", ".then((written) => (written === undefined && event ?"), /ledger use/],
      ["a new field on the gate's input", () => once(base, "  user: string;\n  system?: string;", "  user: string;\n  viaEdge?: boolean;\n  system?: string;"), /PromptCrisisInput members/],
      ["a ledger writer property read", () => once(base, "    // Same hotline set as the Advisor path", "    void (writeCrisisEvent as { flag?: boolean }).flag;\n    // Same hotline set as the Advisor path"), /ledger use/],
      ["the ledger passed on", () => once(base, "    // Same hotline set as the Advisor path", "    void ledger;\n    // Same hotline set as the Advisor path"), /ledger use/],
    ])("%s", (_label, mutated, problem) => {
      expect(surfaceProblems(withEntry(mutated())).join("\n")).toMatch(problem);
    });

    test.each([
      ["a settings read before the gate", (t: string) => t.replace("  fence();\n  assertRootObjectSchema(input.responseSchema);", "  fence();\n  void getEnv();\n  assertRootObjectSchema(input.responseSchema);"), /opens the gate first/],
      ["a condition on the gate's result", (t: string) => t.replace("  if (crisisGate.routed) return", "  if (crisisGate.routed && process.env.EXPO_PUBLIC_X !== \"1\") return"), /opens the gate first/],
      ["the caller's input reshaped", (t: string) => t.replace("crisisRouting.openPromptCrisisGate(input, signal)", "crisisRouting.openPromptCrisisGate({ ...input, minor: false }, signal)"), /opens the gate first/],
      ["the pinned gate kept only in a comment", (t: string) => t.replace("  const crisisGate = crisisRouting.openPromptCrisisGate(input, signal);", "  /* const crisisGate = crisisRouting.openPromptCrisisGate(input, signal); */\n  const crisisGate = crisisRouting.openPromptCrisisGate({ ...input }, signal);"), /opens the gate first/],
      ["the gate's return behind a dead branch", (t: string) => t.replace("  if (crisisGate.routed) return", "  if (false as boolean) if (crisisGate.routed) return"), /opens the gate first/],
      ["a settings read before the last crisis answer", (t: string) => t.replace("      const proxyCrisis = await crisisGate.routeProxyRejection(error);", "      void getEnv();\n      const proxyCrisis = await crisisGate.routeProxyRejection(error);"), /failover order/],
      ["the failover switch read before the call (round 2's order)", (t: string) => {
        const call = "    const t0 = Date.now();\n    let { data, error } = await invokeProxy(primaryFn);\n";
        const read = "    const failoverTarget = failoverVendor();\n    const failoverFn = failoverTarget === \"none\" ? null : proxyFnForVendor(failoverTarget);\n";
        // Both first occurrences are callLlm's own (another caller below repeats the pair).
        const from = t.indexOf("export async function callLlm<");
        const to = t.indexOf("\nexport ", from + 1);
        for (const piece of [call, read]) expect(t.indexOf(piece) > from && t.indexOf(piece) < to).toBe(true);
        return t.replace(read, "").replace(call, `${read}${call}`);
      }, /failover order/],
      ["a meaning-check RED that waits", (t: string) => t.replace("      return (await crisisGate.routeSemanticRed(semanticInput.confidence)) as unknown as LlmResult<T>;", "      await Promise.resolve();\n      return (await crisisGate.routeSemanticRed(semanticInput.confidence)) as unknown as LlmResult<T>;"), /meaning-check RED/],
      ["an entry point rebuilt in boundary", (t: string) => t.replace("export const classifyChatTextForCrisis = crisisRouting.classifyChatTextForCrisis;", "export async function classifyChatTextForCrisis(): Promise<null> { return null; }"), /export classifyChatTextForCrisis/],
    ])("boundary: %s", (_label, mutate, problem) => {
      const text = readRepo(BOUNDARY).replace(/\r\n/g, "\n");
      const changed = mutate(text);
      expect(changed).not.toBe(text);
      expect(boundaryProblems(changed).join("\n")).toMatch(problem);
    });
  });
});

// ---------------------------------------------------------------------------------------------------
// D. Behaviour: crisis in, guidance out at once. The input-RED entries also run with every configuration
// read recorded and refused (a smoke check on top of A).

const mockConfig = { armed: false, reads: [] as string[] };
const mockInvoke = jest.fn();

jest.mock("../../env", () => {
  const values: Record<string, unknown> = {
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: "test-key",
    SENTRY_DSN: undefined,
  };
  const refuse = (what: string): void => {
    if (!mockConfig.armed) return;
    mockConfig.reads.push(what);
    throw new Error(`configuration read on the crisis path: ${what}`);
  };
  const guarded = new Proxy(values, {
    get(target, key) { refuse(`env.${String(key)}`); return Reflect.get(target, key); },
    has(target, key) { refuse(`env has ${String(key)}`); return Reflect.has(target, key); },
    ownKeys(target) { refuse("env keys"); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { refuse(`env descriptor ${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  return {
    getEnv: () => {
      if (mockConfig.armed) {
        mockConfig.reads.push("getEnv()");
        throw new Error("configuration read on the crisis path: getEnv()");
      }
      return guarded;
    },
  };
});
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } }),
}));
jest.mock("../../supabase/audit", () => ({ insertAiAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../supabase/crisis-events", () => ({ insertCrisisEvent: jest.fn().mockResolvedValue(undefined) }));

import {
  callLlm,
  classifyChatTextForCrisis,
  classifyInterviewTextForCrisis,
  classifyRecordTextForCrisis,
  startInterviewCrisisRouting,
} from "../../llm/boundary";
import * as outbox from "../../llm/audit-write-outbox";
import * as routing from "../../llm/routing";
import { createCrisisRouting } from "../crisis-route";
import { getEnv } from "../../env";
import { PURPOSE_TIER, type PromptPurpose } from "../../llm/types";
import type { AuthenticatedAccountSessionLease } from "../../auth/account-session-lease";
import { emergencyGuidance, emergencyRoute } from "../emergency-routing";

const RED_KO = "죽고 싶어";
const BENIGN = "Today I planned my week and it felt productive.";
const realProcessEnv = process.env;

function proxy422(body: unknown): { context: { status: number; json: () => Promise<unknown> } } {
  return { context: { status: 422, json: async () => body } };
}

function lease(): AuthenticatedAccountSessionLease {
  return { userId: "u1", accessToken: "t", signal: new AbortController().signal, assertCurrent: () => {} } as unknown as AuthenticatedAccountSessionLease;
}

describe("D: every crisis entry returns the guidance at once", () => {
  beforeAll(() => {
    // Every key, not only EXPO_PUBLIC_*: GOOGLE_API_KEY, SENTRY_DSN and the like are settings too.
    const refuse = (what: string): void => {
      if (!mockConfig.armed) return;
      mockConfig.reads.push(what);
      throw new Error(`configuration read on the crisis path: ${what}`);
    };
    const guarded = new Proxy(realProcessEnv, {
      get(target, key) { if (typeof key === "string") refuse(`process.env.${key}`); return Reflect.get(target, key); },
      has(target, key) { refuse(`process.env has ${String(key)}`); return Reflect.has(target, key); },
      ownKeys(target) { refuse("process.env keys"); return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { refuse(`process.env descriptor ${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
    });
    Object.defineProperty(process, "env", { value: guarded, configurable: true, writable: true });
  });
  afterAll(() => {
    Object.defineProperty(process, "env", { value: realProcessEnv, configurable: true, writable: true });
  });
  beforeEach(() => {
    mockConfig.armed = false;
    mockConfig.reads = [];
    mockInvoke.mockReset();
    outbox.resetAuditWriteOutboxForTests?.();
  });
  afterEach(() => {
    mockConfig.armed = false;
    jest.restoreAllMocks();
  });

  describe("the guards themselves (positive controls)", () => {
    test("getEnv() while armed is recorded and refused", () => {
      mockConfig.armed = true;
      expect(() => getEnv()).toThrow(/configuration read/);
      mockConfig.armed = false;
      expect(mockConfig.reads).toEqual(["getEnv()"]);
    });
    test("a property of an env object read before arming is recorded and refused", () => {
      const env = getEnv() as unknown as Record<string, unknown>;
      mockConfig.armed = true;
      expect(() => env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION).toThrow(/configuration read/);
      mockConfig.armed = false;
      expect(mockConfig.reads).toEqual(["env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION"]);
    });
    test("any process.env key while armed is recorded and refused", () => {
      mockConfig.armed = true;
      expect(() => process.env.EXPO_PUBLIC_LLM_MODE).toThrow(/configuration read/);
      expect(() => process.env.GOOGLE_API_KEY).toThrow(/configuration read/);
      mockConfig.armed = false;
      expect(mockConfig.reads).toEqual(["process.env.EXPO_PUBLIC_LLM_MODE", "process.env.GOOGLE_API_KEY"]);
    });
    test("presence checks and key listings while armed are recorded and refused", () => {
      const env = getEnv() as unknown as Record<string, unknown>;
      mockConfig.armed = true;
      expect(() => "EXPO_PUBLIC_LLM_MODE" in env).toThrow(/configuration read/);
      expect(() => Object.keys(env)).toThrow(/configuration read/);
      expect(() => Object.getOwnPropertyDescriptor(env, "EXPO_PUBLIC_LLM_MODE")).toThrow(/configuration read/);
      expect(() => "EXPO_PUBLIC_LLM_MODE" in process.env).toThrow(/configuration read/);
      expect(() => Object.keys(process.env)).toThrow(/configuration read/);
      expect(() => Object.getOwnPropertyDescriptor(process.env, "GOOGLE_API_KEY")).toThrow(/configuration read/);
      mockConfig.armed = false;
      expect(mockConfig.reads).toEqual([
        "env has EXPO_PUBLIC_LLM_MODE", "env keys", "env descriptor EXPO_PUBLIC_LLM_MODE",
        "process.env has EXPO_PUBLIC_LLM_MODE", "process.env keys", "process.env descriptor GOOGLE_API_KEY",
      ]);
    });
  });

  const expectGuidance = (result: { text: string; safety: { zone: string } } | null): void => {
    expect(mockConfig.reads).toEqual([]);
    expect(result?.safety.zone).toBe("red");
    expect(result?.text).toMatch(/109/);
  };

  test("record save (real ledger queue)", async () => {
    mockConfig.armed = true;
    expectGuidance(await classifyRecordTextForCrisis(RED_KO, "ko", "u1"));
  });

  test("interview answer (real ledger queue)", async () => {
    mockConfig.armed = true;
    expectGuidance(await classifyInterviewTextForCrisis(RED_KO, "ko", "u1"));
  });

  test("interview routing shows the guidance synchronously, then settles", async () => {
    mockConfig.armed = true;
    const order: string[] = [];
    const run = startInterviewCrisisRouting({ current: false }, { text: RED_KO, locale: "ko", userId: "u1" },
      () => order.push("visible"), () => order.push("settled"));
    expect(order).toEqual(["visible"]);
    expectGuidance(await run.done);
    expect(order).toEqual(["visible", "settled"]);
  });

  test("chat turn (real ledger queue)", async () => {
    mockConfig.armed = true;
    expectGuidance(await classifyChatTextForCrisis(RED_KO, "ko", "u1"));
  });

  test("callLlm input gate (real ledger queue)", async () => {
    mockConfig.armed = true;
    expectGuidance(await callLlm({ userId: "u1", locale: "ko", purpose: "interview_probe", user: RED_KO }));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("callLlm input gate: the same guidance for every purpose, audited under that purpose", async () => {
    const purposes = [...new Set([...Object.keys(PURPOSE_TIER), "secondb_chat", "interview_probe", "persona_synthesis", "reasoning_connect"])] as PromptPurpose[];
    const written: Array<{ kind: string; payload: { purpose?: string } }> = [];
    const order: string[] = [];
    jest.spyOn(outbox, "enqueueAuditWrite").mockImplementation(async (submission) => {
      order.push(submission.kind);
      written.push(submission as never);
    });
    const texts = new Set<string>();
    for (const purpose of purposes) {
      written.length = 0;
      order.length = 0;
      mockConfig.armed = true;
      const result = await callLlm({ userId: "u1", locale: "ko", purpose, user: RED_KO, onCrisisDetected: (h) => order.push(`observer:${h}`) });
      mockConfig.armed = false;
      expect([purpose, mockConfig.reads]).toEqual([purpose, []]);
      expect(result.safety.zone).toBe("red");
      texts.add(result.text);
      // The restricted row is handed on once the audit row settles, after the result.
      await new Promise((r) => setTimeout(r, 0));
      expect(order).toEqual(["observer:KR_109", "ai_audit_log", "crisis_event"]);
      expect(written[0].payload.purpose).toBe(purpose);
    }
    expect(texts.size).toBe(1);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  describe("the result comes back while the ledgers never settle (Q-261018-57 가)", () => {
    // Every write is held forever; each entry point must still resolve with the guidance.
    let submitted: string[];
    beforeEach(() => {
      submitted = [];
      jest.spyOn(outbox, "enqueueAuditWrite").mockImplementation((submission) => {
        submitted.push(submission.kind);
        return new Promise<void>(() => {});
      });
    });
    const settlesWithGuidance = async <R extends { text: string; safety: { zone: string } } | null>(promise: Promise<R>): Promise<R> => {
      let settled = false;
      void promise.then(() => { settled = true; }, () => { settled = true; });
      await new Promise((r) => setTimeout(r, 0));
      expect(settled).toBe(true);
      const result = await promise;
      expect(result?.safety.zone).toBe("red");
      expect(result?.text).toMatch(/109/);
      return result;
    };

    test("record save", async () => {
      await settlesWithGuidance(classifyRecordTextForCrisis(RED_KO, "ko", "u1", false, lease()));
      // The audit row was handed on; the restricted row waits behind it.
      expect(submitted).toEqual(["ai_audit_log"]);
    });

    test("record save without a session", async () => {
      await settlesWithGuidance(classifyRecordTextForCrisis(RED_KO, "ko", "u1"));
      expect(submitted).toEqual(["ai_audit_log"]);
    });

    test("interview answer", async () => {
      await settlesWithGuidance(classifyInterviewTextForCrisis(RED_KO, "ko", "u1"));
    });

    test("interview routing: visible at once, settled with the result", async () => {
      const order: string[] = [];
      const run = startInterviewCrisisRouting({ current: false }, { text: RED_KO, locale: "ko", userId: "u1" },
        () => order.push("visible"), () => order.push("settled"));
      expect(order).toEqual(["visible"]);
      await settlesWithGuidance(run.done);
      expect(order).toEqual(["visible", "settled"]);
    });

    test("chat turn: the observer hears the hotline, then the result", async () => {
      const seen: Array<string | undefined> = [];
      await settlesWithGuidance(classifyChatTextForCrisis(RED_KO, "ko", "u1", false, { session: lease(), onCrisisDetected: (h) => seen.push(h) }));
      expect(seen).toEqual(["KR_109"]);
    });

    test("callLlm input gate", async () => {
      const seen: Array<string | undefined> = [];
      await settlesWithGuidance(callLlm({ userId: "u1", locale: "ko", purpose: "secondb_chat", user: RED_KO, onCrisisDetected: (h) => seen.push(h) }));
      expect(seen).toEqual(["KR_109"]);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    test("callLlm proxy 422", async () => {
      mockInvoke.mockResolvedValue({ data: null, error: proxy422({ error: "safety_red_zone" }) });
      await settlesWithGuidance(callLlm({ userId: "u1", locale: "ko", purpose: "interview_probe", user: BENIGN }));
      expect(submitted).toEqual(["ai_audit_log"]);
    });
  });

  describe("the two writes after the result", () => {
    const deferred = (): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } => {
      let resolve!: () => void;
      let reject!: (e: Error) => void;
      const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      return { promise, resolve, reject };
    };
    const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

    test("the restricted row is handed on only after the audit row settles, in that order", async () => {
      const audit = deferred();
      const kinds: string[] = [];
      jest.spyOn(outbox, "enqueueAuditWrite").mockImplementation((submission) => {
        kinds.push(submission.kind);
        return submission.kind === "ai_audit_log" ? audit.promise : Promise.resolve();
      });
      const result = await classifyRecordTextForCrisis(RED_KO, "ko", "u1");
      expect(result?.safety.zone).toBe("red");
      await flush();
      expect(kinds).toEqual(["ai_audit_log"]);
      audit.resolve();
      await flush();
      expect(kinds).toEqual(["ai_audit_log", "crisis_event"]);
    });

    test("a rejected audit write leaves the result alone, is logged with its label, and the restricted row still follows", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const kinds: string[] = [];
      jest.spyOn(outbox, "enqueueAuditWrite").mockImplementation(async (submission) => {
        kinds.push(submission.kind);
        if (submission.kind === "ai_audit_log") throw new Error("fixture audit unavailable");
      });
      const result = await classifyRecordTextForCrisis(RED_KO, "ko", "u1");
      expect(result?.safety.zone).toBe("red");
      expect(result?.text).toMatch(/109/);
      await flush();
      expect(kinds).toEqual(["ai_audit_log", "crisis_event"]);
      expect(warn.mock.calls.map((c) => c[0])).toEqual(["[ai_audit_log] crisis insert failed"]);
    });

    test("an account change right after the guidance: the result stands and the writers' refusals are logged", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const session = lease();
      let current = true;
      (session as unknown as { assertCurrent: () => void }).assertCurrent = () => { if (!current) throw new Error("llm_session_changed"); };
      const kinds: string[] = [];
      jest.spyOn(outbox, "enqueueAuditWrite").mockImplementation(async (submission) => { kinds.push(submission.kind); });
      const pending = classifyRecordTextForCrisis(RED_KO, "ko", "u1", false, session);
      current = false;
      const result = await pending;
      expect(result?.safety.zone).toBe("red");
      expect(result?.text).toMatch(/109/);
      await flush();
      // The audit row reached the outbox before the change; each writer's own check after that refuses.
      expect(kinds).toEqual(["ai_audit_log"]);
      expect(warn.mock.calls.map((c) => c[0])).toEqual(["[ai_audit_log] crisis insert failed", "[crisis_events] crisis insert failed"]);
    });
  });

  describe("callLlm meaning-check RED (the gate's own answer)", () => {
    // Settings that turn the meaning check on are boundary's business; once it said RED, the gate answers.
    test.each([["ko", false, "109"], ["ko", true, "1388"], ["en", false, "988"]] as const)(
      "%s minor=%s: the same guidance as a lexicon RED, audited under the call's purpose, at once",
      async (locale, minor, number) => {
        const writes: Array<{ kind: string; payload: Record<string, unknown> }> = [];
        const never = new Promise<void>(() => {});
        const routing = createCrisisRouting({
          writeAiAuditLog: async (_u, audit) => { writes.push({ kind: "ai_audit_log", payload: { ...audit } }); await never; },
          writeCrisisEvent: async (_u, payload) => { writes.push({ kind: "crisis_event", payload: { ...payload } }); },
        });
        for (const purpose of ["secondb_chat", "interview_probe"] as const) {
          writes.length = 0;
          const seen: Array<string | undefined> = [];
          const gate = routing.openPromptCrisisGate({ user: BENIGN, locale, minor, userId: "u1", purpose, onCrisisDetected: (h) => seen.push(h) }, undefined);
          expect(gate.routed).toBeNull();
          const result = await gate.routeSemanticRed(0.81);
          expect(result.safety.zone).toBe("red");
          expect(result.text).toContain(number);
          expect(seen).toEqual([undefined]);
          expect(writes).toEqual([{ kind: "ai_audit_log", payload: expect.objectContaining({ purpose, modelUsed: "none-crisis-routed", safetyZone: "red" }) }]);
        }
      },
    );

    test("the restricted row carries the measured confidence and the meaning-check tag", async () => {
      const events: Array<Record<string, unknown>> = [];
      const routing = createCrisisRouting({
        writeAiAuditLog: async () => {},
        writeCrisisEvent: async (_u, payload) => { events.push({ ...payload }); },
      });
      const gate = routing.openPromptCrisisGate({ user: BENIGN, locale: "ko", userId: "u1", purpose: "secondb_chat" }, undefined);
      await gate.routeSemanticRed(0.81);
      await new Promise((r) => setTimeout(r, 0));
      expect(events).toEqual([expect.objectContaining({ classifierConfidence: 0.81, triggerCategories: ["crisis", "input_semantic_red"], locale: "ko" })]);
    });

    test("the gate keeps what it was opened with", async () => {
      const audits: Array<Record<string, unknown>> = [];
      const routing = createCrisisRouting({
        writeAiAuditLog: async (_u, audit) => { audits.push({ ...audit }); },
        writeCrisisEvent: async () => {},
      });
      const input = { user: BENIGN, locale: "ko" as "ko" | "en", minor: true, userId: "u1", purpose: "secondb_chat" };
      const gate = routing.openPromptCrisisGate(input, undefined);
      input.locale = "en";
      input.minor = false;
      input.purpose = "ops_recommend";
      const result = await gate.routeSemanticRed(0.9);
      expect(result.text).toContain("1388");
      expect(audits[0]).toMatchObject({ purpose: "secondb_chat" });
    });
  });

  describe("callLlm proxy 422", () => {
    let order: string[];
    let written: Array<{ kind: string; payload: Record<string, unknown> }>;
    beforeEach(() => {
      order = [];
      written = [];
      jest.spyOn(outbox, "enqueueAuditWrite").mockImplementation(async (submission) => {
        order.push(submission.kind);
        written.push(submission as never);
      });
    });
    // callLlm reads the failover switch after the first reply, as on main (Q-261018-57 가), so these
    // calls are not armed: the gate's own part reads nothing by A, and the answers are checked here.
    const callWith = (rejection: () => unknown, purpose: PromptPurpose = "interview_probe", locale: "ko" | "en" = "ko", minor = false) => {
      mockInvoke.mockImplementation(async () => ({ data: null, error: rejection() }));
      return callLlm({ userId: "u1", locale, minor, purpose, user: BENIGN, onCrisisDetected: (h) => order.push(`observer:${h}`) });
    };

    test.each([["a model reply"], ["a crisis 422"]] as const)("%s: the failover switch is read after the first reply, as on main", async (kind) => {
      const events: string[] = [];
      jest.spyOn(routing, "failoverVendor").mockImplementation(() => { events.push("switch"); return "none"; });
      mockInvoke.mockImplementation(async () => {
        events.push("invoke");
        return kind === "a model reply"
          ? { data: { text: "Noted.", modelUsed: "fixture" }, error: null }
          : { data: null, error: proxy422({ error: "safety_red_zone" }) };
      });
      await callLlm({ userId: "u1", locale: "ko", purpose: "interview_probe", user: BENIGN });
      expect(events).toEqual(["invoke", "switch"]);
    });

    test.each([["medical_emergency"], ["immediate_threat"], [undefined]] as const)(
      "lane %s: the guidance the server lane names, in both locales and ages, before the ledgers",
      async (lane) => {
        for (const locale of ["ko", "en"] as const) {
          for (const minor of [false, true]) {
            order.length = 0;
            written.length = 0;
            mockConfig.reads = [];
            mockInvoke.mockReset();
            const result = await callWith(() => proxy422({ error: "safety_red_zone", ...(lane ? { crisis_lane: lane } : {}) }), "interview_probe", locale, minor);
            expect(result.safety.zone).toBe("red");
            const route = emergencyRoute(lane);
            if (route) {
              expect(result.safety.crisisRouting?.hotline).toBe(route.hotline);
              expect(result.text).toBe(emergencyGuidance(route.hotline, locale)?.text);
            } else {
              expect(result.text).toMatch(locale === "ko" ? /109/ : /988/);
            }
            expect(order).toEqual([`observer:${result.safety.crisisRouting?.hotline}`, "ai_audit_log", "crisis_event"]);
            expect(written[0].payload).toMatchObject({ modelUsed: "none-crisis-routed", purpose: "interview_probe", safetyZone: "red" });
            expect((written[1].payload as { triggerCategories: string[] }).triggerCategories).toEqual(["crisis", "proxy_input_red"]);
            expect(mockInvoke).toHaveBeenCalledTimes(1);
          }
        }
      },
    );

    test("an unreadable 422 still shows the guidance and writes the audit row only", async () => {
      const result = await callWith(() => ({ context: { status: 422, json: async () => { throw new Error("unreadable"); } } }));
      expect(result.safety.zone).toBe("red");
      expect(result.text).toMatch(/109/);
      expect(order).toEqual(["observer:KR_109", "ai_audit_log"]);
    });

    test("a body that can be read once is read once", async () => {
      const json = jest.fn(async () => ({ error: "safety_red_zone" }));
      const result = await callWith(() => ({ context: { status: 422, json } }));
      expect(result.safety.zone).toBe("red");
      expect(json).toHaveBeenCalledTimes(1);
      expect(order).toEqual(["observer:KR_109", "ai_audit_log", "crisis_event"]);
    });

    test("a non-crisis 422 is not guidance", async () => {
      await expect(callWith(() => proxy422({ error: "something_else" }))).rejects.toBeDefined();
      expect(order).toEqual([]);
    });

    test.each([["persona_synthesis"], ["reasoning_connect"], ["interview_probe"]] as const)(
      "%s with a failover switch set: answered on the first reply, never retried",
      async (purpose) => {
        const failover = realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR;
        realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
        try {
          const result = await callWith(() => proxy422({ error: "safety_red_zone" }), purpose);
          expect(result.safety.zone).toBe("red");
          expect(mockInvoke).toHaveBeenCalledTimes(1);
          expect(order).toEqual(["observer:KR_109", "ai_audit_log", "crisis_event"]);
        } finally {
          if (failover === undefined) delete realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR;
          else realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR = failover;
        }
      },
    );

    test("after a failover attempt", async () => {
      const failover = realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR;
      realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
      try {
        mockInvoke
          .mockImplementationOnce(async () => ({ data: null, error: { context: { status: 500, json: async () => ({ error: "down" }) } } }))
          .mockImplementationOnce(async () => ({ data: null, error: proxy422({ error: "safety_red_zone" }) }));
        const result = await callLlm({ userId: "u1", locale: "en", purpose: "interview_probe", user: BENIGN, onCrisisDetected: (h) => order.push(`observer:${h}`) });
        expect(mockInvoke).toHaveBeenCalledTimes(2);
        expect(result.safety.zone).toBe("red");
        expect(result.text).toMatch(/988/);
        expect(order).toEqual(["observer:GLOBAL_988", "ai_audit_log", "crisis_event"]);
      } finally {
        if (failover === undefined) delete realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR;
        else realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR = failover;
      }
    });
  });
});
