// The shared crisis route reads no configuration (Simon 2026-10-18 12:00, Q-261018-48 가).
//
// 「위기 판정부터 안내까지를 설정을 안 읽는 별도 파일로 옮기고(동작은 그대로), 시험은 그 파일이 설정에
// 닿는 import 가 없는지 + 위기면 바로 그 결과를 돌려주는지만 본다.」
//
// Background: #2611 tried to fence one function inside boundary.ts (a file that reads settings by design);
// three review rounds each found a way one layer further out. Here the route lives in its own file, and
// the check is about every way a value can reach that file, not about every line around it:
//
//  A. Imports. The runtime import closure of src/lib/safety/crisis-route.ts is walked by resolving every
//     specifier (relative and "@/"), following re-exports, skipping only declarations whose every binding
//     is type-only. It must equal the pinned set, contain no known settings module and no package.
//     Dynamic import(), require(), `import x = require()` and import.meta are refused in every closure file.
//  B. Host globals and shared state. No closure file may reference process, globalThis, window, etc., use
//     `declare`, carry an EXPO_PUBLIC_ name in a string, keep a top-level let/var, or read a property of a
//     function (a place another module could hang a value). Each closure file's runtime exports are pinned,
//     and every exported table is frozen at load (checked at runtime), so no other module can change what
//     the route reads.
//  C. Surface and ledger. crisis-route.ts exports three functions with pinned parameters; the routers inside
//     createCrisisRouting have pinned parameters and the returned set is pinned and frozen. The ledger
//     writers handed in by boundary.ts may only be awaited as statements: never read, kept or passed on.
//     boundary.ts opens the gate on the caller's input before anything else, and returns each crisis
//     result on the next statement (pinned text, comments ignored).
//  D. Behaviour. Every entry point returns the guidance while every settings read is recorded and refused
//     (getEnv(), any property of the env object, any process.env key). Proxy paths are armed at the moment
//     the proxy rejects, since choosing the proxy legitimately reads settings. The guidance reaches the
//     screen's callback before the ledgers settle.
// The mutation blocks feed altered sources to A to C so each rule is shown to fail where it should.
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

function runtimeExports(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const stmt of sf.statements) {
    if (!isExported(stmt)) continue;
    if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name) names.push(stmt.name.text);
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

// The ledger may only be destructured once; the two writers may only be awaited as whole statements.
function ledgerProblems(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && (node.text === "ledger" || LEDGER_WRITERS.has(node.text))) {
      const p = node.parent;
      const declaredHere = (ts.isParameter(p) && p.name === node) || ts.isBindingElement(p)
        || ((ts.isMethodSignature(p) || ts.isPropertySignature(p)) && p.name === node);
      const factoryInit = node.text === "ledger" && ts.isVariableDeclaration(p) && p.initializer === node
        && p.parent.parent.getText(sf) === FACTORY_HEAD;
      const awaitedStatement = LEDGER_WRITERS.has(node.text) && ts.isCallExpression(p) && p.expression === node
        && ts.isAwaitExpression(p.parent) && ts.isExpressionStatement(p.parent.parent);
      if (!declaredHere && !factoryInit && !awaitedStatement) {
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
  out.push(...ledgerProblems(sf));
  return out;
}

/** boundary.ts without comment lines, whitespace folded. */
function boundaryFlat(read: Source = readRepo): string {
  return read(BOUNDARY).replace(/\r\n/g, "\n").split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n")
    .replace(/\s+/g, " ");
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

  test("the surface is three functions and the pinned routers; the ledger is only awaited", () => {
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
      for (const name of PINNED_EXPORTS[rel]) {
        expect([rel, name, name in mod]).toEqual([rel, name, true]);
        check(mod[name], `${rel}:${name}`);
      }
    }
    expect(unfrozen).toEqual([]);
  });

  test("boundary.ts opens the gate on the caller's input first and returns each crisis result at once", () => {
    const boundary = readRepo(BOUNDARY).replace(/\r\n/g, "\n");
    expect(boundary).toMatch(/\nconst crisisRouting = createCrisisRouting\(\{ writeAiAuditLog, writeCrisisEvent \}\);\n/);
    for (const name of ["classifyRecordTextForCrisis", "classifyInterviewTextForCrisis", "startInterviewCrisisRouting", "classifyChatTextForCrisis"]) {
      expect(boundary).toContain(`\nexport const ${name} = crisisRouting.${name};\n`);
      expect(boundary).not.toMatch(new RegExp(`function ${name}\\b`));
    }
    for (const name of ["routeCrisis", "crisisObserver", "inspectProxyCrisisRejection", "proxyCrisisSafetyResult", "openPromptCrisisGate"]) {
      expect(boundary).not.toMatch(new RegExp(`function ${name}\\b`));
    }
    const flat = boundaryFlat();
    // Nothing but the owner checks, the signal, the fence and the schema check precede the gate.
    expect(flat).toContain('export async function callLlm<T = string>(input: PromptInput): Promise<LlmResult<T>> { if (input.session && input.session.userId !== input.userId) { throw new Error("llm_session_owner_mismatch"); } if (input.session && input.signal && input.signal !== input.session.signal) { throw new Error("llm_session_signal_mismatch"); } const signal = input.session?.signal ?? input.signal; const fence = (): void => { throwIfAborted(signal); input.session?.assertCurrent(); }; fence(); assertRootObjectSchema(input.responseSchema); const crisisGate = crisisRouting.openPromptCrisisGate(input, signal); if (crisisGate.routed) return (await crisisGate.routed) as unknown as LlmResult<T>; const { safety: inputSafety, promptHash, notifyCrisis } = crisisGate;');
    expect(flat).toContain('if (semanticInput?.zone === "red") { return (await crisisGate.routeSemanticRed(semanticInput.confidence)) as unknown as LlmResult<T>; }');
    expect(flat).toContain('const failoverTarget = failoverVendor(); const failoverFn = failoverTarget === "none" ? null : proxyFnForVendor(failoverTarget); const t0 = Date.now(); let { data, error } = await invokeProxy(primaryFn); const primaryCrisis = error ? await crisisGate.routeProxyRejection(error) : null; if (primaryCrisis) return primaryCrisis as unknown as LlmResult<T>;');
    expect(flat).toContain("({ data, error } = await invokeProxy(failoverFn)); const failoverCrisis = error ? await crisisGate.routeProxyRejection(error) : null; if (failoverCrisis) return failoverCrisis as unknown as LlmResult<T>; } latencyMs = Date.now() - t0; if (error) throw error;");
    expect(boundary.match(/crisisRouting\.\w+/g)?.sort()).toEqual([
      "crisisRouting.classifyChatTextForCrisis",
      "crisisRouting.classifyInterviewTextForCrisis",
      "crisisRouting.classifyRecordTextForCrisis",
      "crisisRouting.openPromptCrisisGate",
      "crisisRouting.startInterviewCrisisRouting",
    ]);
    expect(boundary.match(/crisisGate\b\.?\w*/g)?.sort()).toEqual([
      "crisisGate",
      "crisisGate",
      "crisisGate.routeProxyRejection",
      "crisisGate.routeProxyRejection",
      "crisisGate.routeSemanticRed",
      "crisisGate.routed",
      "crisisGate.routed",
    ]);
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
      ["a ledger result kept", () => once(base, "    await writeAiAuditLog(\n", "    const answer = await writeAiAuditLog(\n"), /ledger use/],
      ["a ledger writer property read", () => once(base, "    // Same hotline set as the Advisor path", "    void (writeCrisisEvent as { flag?: boolean }).flag;\n    // Same hotline set as the Advisor path"), /ledger use/],
      ["the ledger passed on", () => once(base, "    // Same hotline set as the Advisor path", "    void ledger;\n    // Same hotline set as the Advisor path"), /ledger use/],
      ["a ledger writer called without await", () => once(base, "    await writeAiAuditLog(\n", "    void writeAiAuditLog(\n"), /ledger use/],
    ])("%s", (_label, mutated, problem) => {
      expect(surfaceProblems(withEntry(mutated())).join("\n")).toMatch(problem);
    });

    test.each([
      ["a settings read before the gate", (t: string) => t.replace("  fence();\n  assertRootObjectSchema(input.responseSchema);", "  fence();\n  void getEnv();\n  assertRootObjectSchema(input.responseSchema);")],
      ["a condition on the gate's result", (t: string) => t.replace("  if (crisisGate.routed) return", "  if (crisisGate.routed && process.env.EXPO_PUBLIC_X !== \"1\") return")],
      ["the caller's input reshaped", (t: string) => t.replace("crisisRouting.openPromptCrisisGate(input, signal)", "crisisRouting.openPromptCrisisGate({ ...input, minor: false }, signal)")],
      ["a settings read before the proxy crisis check", (t: string) => t.replace("    const primaryCrisis = error ?", "    void failoverVendor();\n    const primaryCrisis = error ?")],
    ])("boundary: %s", (_label, mutate) => {
      const text = readRepo(BOUNDARY).replace(/\r\n/g, "\n");
      const changed = mutate(text);
      expect(changed).not.toBe(text);
      expect(() => {
        const flat = boundaryFlat(() => changed);
        for (const pin of [
          "fence(); assertRootObjectSchema(input.responseSchema); const crisisGate = crisisRouting.openPromptCrisisGate(input, signal); if (crisisGate.routed) return (await crisisGate.routed) as unknown as LlmResult<T>;",
          "let { data, error } = await invokeProxy(primaryFn); const primaryCrisis = error ? await crisisGate.routeProxyRejection(error) : null;",
        ]) if (!flat.includes(pin)) throw new Error(`pin: ${pin.slice(0, 40)}`);
      }).toThrow(/pin/);
    });
  });
});

// ---------------------------------------------------------------------------------------------------
// D. Behaviour: crisis in, guidance out, with every configuration read recorded and refused.

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
  const guarded = new Proxy(values, {
    get(target, key) {
      if (mockConfig.armed) {
        mockConfig.reads.push(`env.${String(key)}`);
        throw new Error(`configuration read on the crisis path: env.${String(key)}`);
      }
      return Reflect.get(target, key);
    },
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

describe("D: every crisis entry returns the guidance without reading configuration", () => {
  beforeAll(() => {
    // Every key, not only EXPO_PUBLIC_*: GOOGLE_API_KEY, SENTRY_DSN and the like are settings too.
    const guarded = new Proxy(realProcessEnv, {
      get(target, key) {
        if (mockConfig.armed && typeof key === "string") {
          mockConfig.reads.push(`process.env.${key}`);
          throw new Error(`configuration read on the crisis path: process.env.${key}`);
        }
        return Reflect.get(target, key);
      },
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
      expect(order).toEqual(["observer:KR_109", "ai_audit_log", "crisis_event"]);
      expect(written[0].payload.purpose).toBe(purpose);
    }
    expect(texts.size).toBe(1);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  describe("the guidance reaches the screen before the ledgers settle", () => {
    const stallLedger = (): void => {
      jest.spyOn(outbox, "enqueueAuditWrite").mockImplementation(() => new Promise<void>(() => {}));
    };
    const stillPending = async (promise: Promise<unknown>): Promise<boolean> => {
      let settled = false;
      void promise.then(() => { settled = true; }, () => { settled = true; });
      await new Promise((r) => setTimeout(r, 0));
      return !settled;
    };

    test("callLlm: the observer hears the hotline while the ledger has not settled", async () => {
      stallLedger();
      const seen: Array<string | undefined> = [];
      const call = callLlm({ userId: "u1", locale: "ko", purpose: "secondb_chat", user: RED_KO, onCrisisDetected: (h) => seen.push(h) });
      expect(seen).toEqual(["KR_109"]);
      expect(await stillPending(call)).toBe(true);
    });

    test("chat: the observer hears the hotline while the ledger has not settled", async () => {
      stallLedger();
      const seen: Array<string | undefined> = [];
      const call = classifyChatTextForCrisis(RED_KO, "ko", "u1", false, { session: lease(), onCrisisDetected: (h) => seen.push(h) });
      await Promise.resolve();
      expect(seen).toEqual(["KR_109"]);
      expect(await stillPending(call)).toBe(true);
    });

    test("interview: visible before the ledger settles", async () => {
      stallLedger();
      const order: string[] = [];
      const run = startInterviewCrisisRouting({ current: false }, { text: RED_KO, locale: "ko", userId: "u1" },
        () => order.push("visible"), () => order.push("settled"));
      expect(order).toEqual(["visible"]);
      expect(await stillPending(run.done)).toBe(true);
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
    const callWith = (rejection: () => unknown, purpose: PromptPurpose = "interview_probe", locale: "ko" | "en" = "ko", minor = false) => {
      mockInvoke.mockImplementation(async () => {
        mockConfig.armed = true;
        return { data: null, error: rejection() };
      });
      return callLlm({ userId: "u1", locale, minor, purpose, user: BENIGN, onCrisisDetected: (h) => order.push(`observer:${h}`) })
        .finally(() => { mockConfig.armed = false; });
    };

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
            expect(mockConfig.reads).toEqual([]);
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
      expect(mockConfig.reads).toEqual([]);
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
          expect(mockConfig.reads).toEqual([]);
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
          .mockImplementationOnce(async () => {
            mockConfig.armed = true;
            return { data: null, error: proxy422({ error: "safety_red_zone" }) };
          });
        const result = await callLlm({ userId: "u1", locale: "en", purpose: "interview_probe", user: BENIGN, onCrisisDetected: (h) => order.push(`observer:${h}`) });
        mockConfig.armed = false;
        expect(mockConfig.reads).toEqual([]);
        expect(mockInvoke).toHaveBeenCalledTimes(2);
        expect(result.safety.zone).toBe("red");
        expect(result.text).toMatch(/988/);
        expect(order).toEqual(["observer:GLOBAL_988", "ai_audit_log", "crisis_event"]);
      } finally {
        mockConfig.armed = false;
        if (failover === undefined) delete realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR;
        else realProcessEnv.EXPO_PUBLIC_FAILOVER_VENDOR = failover;
      }
    });
  });
});
