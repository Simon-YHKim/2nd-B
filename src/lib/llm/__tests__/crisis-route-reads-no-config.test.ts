// Structural check: the shared crisis routing reads no configuration.
//
// Simon 2026-10-15 01:51 (Q-261014-81 가): merge #2483 as it was, and keep "a structural check that the shared
// crisis function cannot read the environment configuration" as separate work. Five review rounds of #2483 each
// found a new configuration a mutation could hide in: a `live && viaEdge && ...` branch inside routeCrisis passed
// every test because the tests ran one setting at a time. Adding settings to a matrix never ends. This check
// closes the door instead.
//
// Threat model: settings that reach the crisis routing during ordinary maintenance (a new import, a helper, an
// options field, a value passed by a caller, a module constant). Every identifier is resolved by the TypeScript
// checker to its real declaration, so names cannot be hidden by shadowing; host globals and dynamic loading are
// refused outright rather than analysed.
//
// What is checked:
//  A. Every name the crisis functions use resolves to: a local declaration, another crisis function, an allowed
//     helper imported plainly from a fixed specifier, a module const whose value is a plain literal, or one of
//     three built-ins. No import(), import.meta, or setting name inside a string.
//  B. routeCrisis takes exactly four option fields, reads only those, builds its guidance only from the safety
//     result, the locale and the hotline table, and returns one fixed object. Every call to it is pinned, argument
//     by argument, per calling function (so a setting cannot ride in on an existing option either).
//  C. Only callLlm calls the crisis routing from outside the set, wherever the reference sits (class, namespace).
//  D. Every allowed helper is followed to the module that defines it (plain re-exports only). The pure helpers'
//     whole runtime import closure is pinned (seven modules, no package) and may use only language built-ins. The
//     audit transport is held to its current pinned globals, with globalThis only as `.navigator` and require()
//     only of the storage package; it may not import the env or vendor-routing module or expo-constants. The
//     screens show the guidance before that write settles (secondb.tsx publishCrisisNotice before the send;
//     interview.tsx startInterviewCrisisRouting onVisible before `done`), so the transport cannot hold it back.
// The last block feeds mutated sources to the same checks, so each rule is shown to fail where it should.
import { existsSync, readFileSync } from "fs";
import { join, posix, resolve } from "path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const BOUNDARY = "src/lib/llm/boundary.ts";
const AUDIT_TRANSPORT = "src/lib/llm/audit-write-outbox.ts";

const ROUTERS = [
  "routeCrisis",
  "classifyRecordTextForCrisis",
  "classifyInterviewTextForCrisis",
  "classifyChatTextForCrisis",
  "startInterviewCrisisRouting",
  "proxyCrisisSafetyResult",
] as const;
const HELPERS = ["writeAiAuditLog", "writeCrisisEvent", "crisisObserver", "djb2"] as const;
const CRISIS_FUNCTIONS = new Set<string>([...ROUTERS, ...HELPERS]);

// Helpers the crisis functions may use, each imported plainly from this exact specifier.
const ALLOWED_IMPORTS: Readonly<Record<string, string>> = {
  crisisHotlines: "../safety/classifier",
  classifyInputAnyLocale: "../safety/classifier",
  emergencyGuidance: "./safety",
  emergencyRoute: "./safety",
  recordableCrisisCategories: "./safety",
  enqueueAuditWrite: "./audit-write-outbox",
  throwIfAborted: "../async/abort",
};
const FUNCTION_GLOBALS = new Set(["Error", "undefined", "Promise"]);
const OUTSIDE_ROUTER_CALLERS = new Set(["callLlm"]);

const ROUTE_CRISIS_OPTIONS = ["classifierConfidence", "purpose", "recordCrisisEvent", "session"];
const ROUTE_CRISIS_RETURN = "return { text, safety: result, audit };";
// Every call to routeCrisis, per calling function, arguments with whitespace collapsed.
const ROUTE_CRISIS_CALLS: Readonly<Record<string, string[]>> = {
  callLlm: [
    "inputSafety, input.locale, input.userId, promptHash, input.minor, \"input_red\", { purpose: input.purpose, session: input.session }",
    "proxyCrisisSafetyResult(input.locale, input.minor, proxyCrisis.lane), input.locale, input.userId, promptHash, input.minor, proxyCrisis.confirmedMarker ? \"proxy_input_red\" : \"proxy_input_red_unconfirmed\", { recordCrisisEvent: proxyCrisis.confirmedMarker, purpose: input.purpose, session: input.session, }",
    "proxyCrisisSafetyResult(input.locale, input.minor, vendorCrisis.lane), input.locale, input.userId, promptHash, input.minor, vendorCrisis.confirmedMarker ? \"proxy_input_red\" : \"proxy_input_red_unconfirmed\", { recordCrisisEvent: vendorCrisis.confirmedMarker, purpose: input.purpose, session: input.session, }",
    "{ zone: \"red\", matched: [], categories: [\"crisis\"] }, input.locale, input.userId, promptHash, input.minor, \"input_semantic_red\", { purpose: input.purpose, session: input.session, classifierConfidence: semanticInput.confidence }",
  ],
  classifyChatTextForCrisis: ["safety, locale, userId, djb2(text), minor, \"input_red\", { purpose: \"secondb_chat\", session: options?.session, }"],
  classifyInterviewTextForCrisis: ["safety, locale, userId, djb2(text), minor, \"interview_input_red\", { purpose: \"interview_probe\", }"],
  classifyRecordTextForCrisis: ["safety, locale, userId, djb2(text), minor, \"record_save_red\", { session }"],
};

const PURE_CLOSURE = [
  "src/lib/async/abort.ts",
  "src/lib/safety/classifier.ts",
  "src/lib/safety/crisis-context.ts",
  "src/lib/safety/crisis-event-categories.ts",
  "src/lib/safety/crisis-language.ts",
  "src/lib/safety/emergency-routing.ts",
  "src/lib/safety/lexicon.ts",
];
// Language built-ins only: nothing that reads the host (storage, process, navigator, network, globals object).
const PURE_GLOBALS = new Set(["Array", "Boolean", "Error", "Infinity", "JSON", "Map", "Math", "NaN", "Number", "Object",
  "RegExp", "Set", "String", "Symbol", "isFinite", "isNaN", "parseFloat", "parseInt", "undefined"]);
// What the audit transport uses today, pinned. A new host global there has to be looked at.
const TRANSPORT_GLOBALS = new Set(["Array", "Date", "Error", "JSON", "Promise", "Set", "console", "globalThis", "localStorage", "require", "undefined"]);
const TRANSPORT_REQUIRE = "@react-native-async-storage/async-storage";

const SETTING_IN_STRING = /EXPO_PUBLIC_|LLM_MODE|VIA_EDGE|USE_VERTEX/;
const CONFIG_MODULES = ["src/lib/env.ts", "src/lib/llm/routing.ts"];

interface Finding {
  where: string;
  problem: string;
}

function read(rel: string): string {
  // LF everywhere, so the text anchors in the mutations below do not depend on the checkout's line endings.
  return readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

function resolveSpecifier(fromRel: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? posix.join("src", spec.slice(2)) : posix.join(posix.dirname(fromRel), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(join(ROOT, candidate))) return candidate;
  }
  return null;
}

// A program over in-memory sources, so mutated text goes through the same checker. No lib and no module
// resolution: an identifier with no declaration in these files is a global.
function analyze(files: Record<string, string>): { checker: ts.TypeChecker; source: (rel: string) => ts.SourceFile } {
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, target: ts.ScriptTarget.ES2022, types: [] };
  const host = ts.createCompilerHost(options);
  const parsed = new Map<string, ts.SourceFile>();
  const keyOf = (name: string) => Object.keys(files).find((k) => name === k || name.replace(/\\/g, "/").endsWith(`/${k}`));
  host.getSourceFile = (name) => {
    const key = keyOf(name);
    if (!key) return undefined;
    if (!parsed.has(key)) parsed.set(key, ts.createSourceFile(key, files[key], ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS));
    return parsed.get(key);
  };
  host.fileExists = (name) => keyOf(name) !== undefined;
  host.readFile = (name) => { const key = keyOf(name); return key ? files[key] : undefined; };
  const program = ts.createProgram(Object.keys(files), options, host);
  return {
    checker: program.getTypeChecker(),
    source: (rel) => {
      const sf = program.getSourceFiles().find((s) => s.fileName === rel || s.fileName.endsWith(`/${rel}`));
      if (!sf) throw new Error(`not in program: ${rel}`);
      return sf;
    },
  };
}

function insideType(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) if (ts.isTypeNode(p)) return true;
  return false;
}

// An identifier that refers to a value (not a property name, a declared name or a type).
function isReference(node: ts.Identifier): boolean {
  const p = node.parent;
  if (insideType(node)) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) ||
       ts.isMethodSignature(p) || ts.isEnumMember(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && p.name === node) return false;
  if (ts.isQualifiedName(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false;
  if ((ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) ||
       ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isInterfaceDeclaration(p) ||
       ts.isTypeAliasDeclaration(p) || ts.isEnumDeclaration(p) || ts.isModuleDeclaration(p) || ts.isLabeledStatement(p)) &&
      (p as { name?: ts.Node }).name === node) return false;
  if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === node) return false;
  if (ts.isBindingElement(p) && p.propertyName === node) return false;
  return true;
}

function declarationOf(checker: ts.TypeChecker, id: ts.Identifier): ts.Declaration | null {
  const symbol = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
    ? checker.getShorthandAssignmentValueSymbol(id.parent)
    : checker.getSymbolAtLocation(id);
  return symbol?.declarations?.[0] ?? null;
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function topLevelStatement(node: ts.Node): ts.Node {
  let n = node;
  while (n.parent && !ts.isSourceFile(n.parent)) n = n.parent;
  return n;
}

function statementName(s: ts.Node, sf: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isModuleDeclaration(s) || ts.isEnumDeclaration(s)) && s.name) return s.name.getText(sf);
  if (ts.isVariableStatement(s)) return s.declarationList.declarations.map((d) => d.name.getText(sf)).join(",");
  return "<module statement>";
}

function isPlainLiteral(e: ts.Expression): boolean {
  if (ts.isStringLiteralLike(e) || ts.isNumericLiteral(e) || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return true;
  if (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) return isPlainLiteral(e.expression);
  if (ts.isArrayLiteralExpression(e)) return e.elements.every((x) => !ts.isSpreadElement(x) && !ts.isOmittedExpression(x) && isPlainLiteral(x));
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.every((p) => ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) && isPlainLiteral(p.initializer));
  }
  return false;
}

// import(), import.meta / new.target, and a setting named in a string.
function escapeHatches(node: ts.Node, where: string): Finding[] {
  const found: Finding[] = [];
  walk(node, (n) => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) found.push({ where, problem: "uses a dynamic import()" });
    if (ts.isMetaProperty(n)) found.push({ where, problem: `uses ${n.getText()}` });
    if (ts.isStringLiteralLike(n) && SETTING_IN_STRING.test(n.text)) found.push({ where, problem: `names a setting in a string: ${n.text}` });
  });
  return found;
}

function within(node: ts.Node, container: ts.Node): boolean {
  return node.getSourceFile() === container.getSourceFile() && node.pos >= container.pos && node.end <= container.end;
}

function checkBoundary(text: string): { findings: Finding[]; seen: Record<string, string[]>; outsideCallers: string[] } {
  const { checker, source } = analyze({ [BOUNDARY]: text });
  const sf = source(BOUNDARY);
  const findings: Finding[] = [];
  const seen: Record<string, string[]> = {};
  const fns = new Map<string, ts.FunctionDeclaration>();
  for (const s of sf.statements) if (ts.isFunctionDeclaration(s) && s.name) fns.set(s.name.text, s);

  // A. What each crisis function uses, by real declaration.
  for (const name of CRISIS_FUNCTIONS) {
    const fn = fns.get(name);
    if (!fn) {
      findings.push({ where: name, problem: "missing from boundary.ts" });
      continue;
    }
    const outside = new Set<string>();
    walk(fn, (n) => {
      if (!ts.isIdentifier(n) || !isReference(n)) return;
      const decl = declarationOf(checker, n);
      if (!decl) {
        outside.add(n.text);
        if (!FUNCTION_GLOBALS.has(n.text)) findings.push({ where: name, problem: `uses the global ${n.text}` });
        return;
      }
      if (within(decl, fn)) return; // a local of this function (lexically resolved)
      outside.add(n.text);
      if (ts.isFunctionDeclaration(decl)) {
        if (!CRISIS_FUNCTIONS.has(n.text)) findings.push({ where: name, problem: `calls ${n.text}, a function in boundary.ts outside the checked set` });
        return;
      }
      if (ts.isImportSpecifier(decl)) {
        const importDecl = decl.parent.parent.parent;
        const spec = ts.isStringLiteral(importDecl.moduleSpecifier) ? importDecl.moduleSpecifier.text : "?";
        if (ALLOWED_IMPORTS[decl.name.text] !== spec || decl.propertyName || decl.name.text !== n.text) {
          findings.push({ where: name, problem: `uses ${n.text}, imported from ${spec}, which is not an allowed helper` });
        }
        return;
      }
      if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && ts.isVariableDeclarationList(decl.parent) &&
          (decl.parent.flags & ts.NodeFlags.Const) && ts.isSourceFile(decl.parent.parent.parent) && decl.initializer && isPlainLiteral(decl.initializer)) {
        return; // a module const whose value is a plain literal
      }
      findings.push({ where: name, problem: `uses ${n.text}, a module value that is not a plain literal const` });
    });
    seen[name] = [...outside].sort();
    findings.push(...escapeHatches(fn, name));
  }

  // B. routeCrisis options, guidance and return.
  const route = fns.get("routeCrisis");
  if (route) {
    const optsParam = route.parameters.find((p) => ts.isIdentifier(p.name) && p.name.text === "opts");
    const members = optsParam?.type && ts.isTypeLiteralNode(optsParam.type)
      ? optsParam.type.members.map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : "?")).sort()
      : null;
    if (JSON.stringify(members) !== JSON.stringify(ROUTE_CRISIS_OPTIONS)) {
      findings.push({ where: "routeCrisis", problem: `option fields are ${JSON.stringify(members)}, not ${JSON.stringify(ROUTE_CRISIS_OPTIONS)}` });
    }
    const params = new Map(route.parameters.filter((p) => ts.isIdentifier(p.name)).map((p) => [(p.name as ts.Identifier).text, p]));
    let textDecl: ts.VariableDeclaration | null = null;
    const returns: string[] = [];
    walk(route, (n) => {
      if (ts.isIdentifier(n) && isReference(n) && optsParam && declarationOf(checker, n) === optsParam) {
        const p = n.parent;
        if (!(ts.isPropertyAccessExpression(p) && p.expression === n && ROUTE_CRISIS_OPTIONS.includes(p.name.text))) {
          findings.push({ where: "routeCrisis", problem: `uses opts other than through its four fields (${p.getText(sf).slice(0, 60)})` });
        }
      }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "text") textDecl = n;
      if (ts.isReturnStatement(n)) returns.push(n.getText(sf).replace(/\s+/g, " "));
    });
    const td = textDecl as ts.VariableDeclaration | null;
    if (!td || !td.initializer || !(td.parent.flags & ts.NodeFlags.Const)) {
      findings.push({ where: "routeCrisis", problem: "the guidance text is not a const with an initializer" });
    } else {
      const allowed = new Set<ts.Node | undefined>([params.get("result"), params.get("locale")]);
      walk(td.initializer, (x) => {
        if (!ts.isIdentifier(x) || !isReference(x)) return;
        const decl = declarationOf(checker, x);
        const ok = decl !== null && (allowed.has(decl) ||
          (ts.isImportSpecifier(decl) && decl.name.text === "emergencyGuidance") ||
          (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) && decl.name.text === "joined" && within(decl, route)));
        if (!ok) findings.push({ where: "routeCrisis", problem: `builds the guidance text from ${x.text}` });
      });
    }
    if (JSON.stringify(returns) !== JSON.stringify([ROUTE_CRISIS_RETURN])) {
      findings.push({ where: "routeCrisis", problem: `returns ${JSON.stringify(returns)}, not exactly ${ROUTE_CRISIS_RETURN}` });
    }
  }

  // B (callers) and C. Every reference to a router, by real declaration, wherever it sits.
  const routerDecls = new Set<ts.Node>([...ROUTERS].map((r) => fns.get(r)).filter((d): d is ts.FunctionDeclaration => !!d));
  const calls: Record<string, string[]> = {};
  const outsideCallers = new Set<string>();
  walk(sf, (n) => {
    if (!ts.isIdentifier(n) || !isReference(n)) return;
    const decl = declarationOf(checker, n);
    if (!decl || !routerDecls.has(decl)) return;
    const container = statementName(topLevelStatement(n), sf);
    if (!CRISIS_FUNCTIONS.has(container)) {
      outsideCallers.add(container);
      if (!OUTSIDE_ROUTER_CALLERS.has(container)) findings.push({ where: container, problem: `refers to ${n.text} from outside the checked set` });
    }
    if (n.text === "routeCrisis" && ts.isCallExpression(n.parent) && n.parent.expression === n) {
      (calls[container] = calls[container] ?? []).push(n.parent.arguments.map((a) => a.getText(sf)).join(", ").replace(/\s+/g, " "));
    } else if (n.text === "routeCrisis") {
      findings.push({ where: container, problem: "refers to routeCrisis other than by calling it" });
    }
  });
  for (const k of Object.keys(calls)) calls[k].sort();
  const pinned = Object.fromEntries(Object.entries(ROUTE_CRISIS_CALLS).map(([k, v]) => [k, [...v].sort()]));
  if (JSON.stringify(Object.keys(calls).sort().map((k) => [k, calls[k]])) !== JSON.stringify(Object.keys(pinned).sort().map((k) => [k, pinned[k]]))) {
    findings.push({ where: "routeCrisis callers", problem: `routeCrisis calls changed: ${JSON.stringify(calls)}` });
  }
  return { findings, seen, outsideCallers: [...outsideCallers].sort() };
}

// Runtime imports (type-only imports and exports are erased).
function runtimeImports(rel: string, sf: ts.SourceFile): { relative: string[]; packages: string[] } {
  const relative: string[] = [];
  const packages: string[] = [];
  for (const s of sf.statements) {
    let spec: string | null = null;
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const c = s.importClause;
      const typeOnly = !!c?.isTypeOnly || (!!c && !c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) &&
        c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) spec = s.moduleSpecifier.text;
    }
    if (ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) {
      const typeOnly = s.isTypeOnly || (!!s.exportClause && ts.isNamedExports(s.exportClause) &&
        s.exportClause.elements.length > 0 && s.exportClause.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) spec = s.moduleSpecifier.text;
    }
    if (!spec) continue;
    if (spec.startsWith(".") || spec.startsWith("@/")) relative.push(resolveSpecifier(rel, spec) ?? `UNRESOLVED ${spec}`);
    else packages.push(spec);
  }
  return { relative, packages };
}

// Follow an imported name to the module that defines it. Only `export { name } from "x"` is followed.
function definingModule(name: string, rel: string, sources: (r: string) => string, depth = 0): { rel?: string; problem?: string } {
  if (depth > 4) return { problem: `re-export chain too long for ${name}` };
  const sf = ts.createSourceFile(rel, sources(rel), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  for (const s of sf.statements) {
    if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
      const e = s.exportClause.elements.find((x) => x.name.text === name);
      if (!e) continue;
      if (e.propertyName) return { problem: `${rel} exports ${name} as an alias of ${e.propertyName.text}` };
      if (!s.moduleSpecifier || !ts.isStringLiteral(s.moduleSpecifier)) return { problem: `${rel} re-exports ${name} that it imported` };
      const next = resolveSpecifier(rel, s.moduleSpecifier.text);
      if (!next) return { problem: `${rel} re-exports ${name} from an unresolved module` };
      return definingModule(name, next, sources, depth + 1);
    }
  }
  const exported = (m?: ts.NodeArray<ts.ModifierLike>) => !!m?.some((x) => x.kind === ts.SyntaxKind.ExportKeyword);
  const declares = sf.statements.some((s) =>
    (ts.isFunctionDeclaration(s) && s.name?.text === name && exported(s.modifiers)) ||
    (ts.isVariableStatement(s) && exported(s.modifiers) && s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)));
  return declares ? { rel } : { problem: `${rel} does not declare ${name}` };
}

function isConfigImport(rel: string, spec: string): boolean {
  if (spec === "expo-constants" || spec.startsWith("expo-constants/")) return true;
  const target = spec.startsWith(".") || spec.startsWith("@/") ? resolveSpecifier(rel, spec) : null;
  return !!target && CONFIG_MODULES.includes(target);
}

function checkModule(checker: ts.TypeChecker, sf: ts.SourceFile, rel: string, transport: boolean): Finding[] {
  const findings: Finding[] = escapeHatches(sf, rel);
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "require" && !declarationOf(checker, n.expression)) {
      const arg = n.arguments[0];
      const spec = n.arguments.length === 1 && arg && ts.isStringLiteral(arg) ? arg.text : null;
      if (!transport || spec !== TRANSPORT_REQUIRE) findings.push({ where: rel, problem: `uses require(${spec ?? "a computed name"})` });
      return;
    }
    if (!ts.isIdentifier(n) || !isReference(n) || declarationOf(checker, n)) return;
    if (n.text === "require" && ts.isCallExpression(n.parent) && n.parent.expression === n) return; // judged above
    if (transport) {
      if (n.text === "globalThis") {
        const p = n.parent;
        if (!(ts.isPropertyAccessExpression(p) && p.expression === n && p.name.text === "navigator")) findings.push({ where: rel, problem: "uses globalThis other than globalThis.navigator" });
        return;
      }
      if (!TRANSPORT_GLOBALS.has(n.text) || n.text === "require") findings.push({ where: rel, problem: `uses the global ${n.text}` });
    } else if (!PURE_GLOBALS.has(n.text)) {
      findings.push({ where: rel, problem: `uses the global ${n.text}` });
    }
  });
  const { relative, packages } = runtimeImports(rel, sf);
  for (const r of relative) if (r.startsWith("UNRESOLVED") || CONFIG_MODULES.includes(r)) findings.push({ where: rel, problem: `imports ${r}` });
  for (const p of packages) {
    if (!transport) findings.push({ where: rel, problem: `imports the package ${p}` });
    else if (isConfigImport(rel, p)) findings.push({ where: rel, problem: `imports the package ${p}` });
  }
  return findings;
}

function checkHelperModules(sources: (r: string) => string): { findings: Finding[]; closure: string[]; defining: Record<string, string> } {
  const findings: Finding[] = [];
  const defining: Record<string, string> = {};
  for (const [name, spec] of Object.entries(ALLOWED_IMPORTS)) {
    const first = resolveSpecifier(BOUNDARY, spec);
    if (!first) { findings.push({ where: name, problem: `cannot resolve ${spec}` }); continue; }
    const r = definingModule(name, first, sources);
    if (r.problem) findings.push({ where: name, problem: r.problem });
    else if (r.rel) defining[name] = r.rel;
  }
  const closure = new Set<string>();
  const queue = Object.values(defining).filter((rel) => rel !== AUDIT_TRANSPORT);
  while (queue.length > 0) {
    const rel = queue.shift() as string;
    if (closure.has(rel)) continue;
    closure.add(rel);
    if (rel.startsWith("UNRESOLVED")) continue;
    const sf = ts.createSourceFile(rel, sources(rel), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    queue.push(...runtimeImports(rel, sf).relative.filter((r) => !closure.has(r)));
  }
  const files: Record<string, string> = {};
  for (const rel of closure) if (!rel.startsWith("UNRESOLVED")) files[rel] = sources(rel);
  files[AUDIT_TRANSPORT] = sources(AUDIT_TRANSPORT);
  const { checker, source } = analyze(files);
  for (const rel of closure) if (!rel.startsWith("UNRESOLVED")) findings.push(...checkModule(checker, source(rel), rel, false));
  if (defining.enqueueAuditWrite === AUDIT_TRANSPORT) {
    findings.push(...checkModule(checker, source(AUDIT_TRANSPORT), AUDIT_TRANSPORT, true));
  } else {
    findings.push({ where: "enqueueAuditWrite", problem: `is not defined in ${AUDIT_TRANSPORT}` });
  }
  return { findings, closure: [...closure].sort(), defining };
}

const boundaryText = read(BOUNDARY);

describe("the shared crisis routing reads no configuration (Q-261014-81)", () => {
  it("sees the crisis functions, their helpers and their one outside caller (positive control)", () => {
    const { findings, seen, outsideCallers } = checkBoundary(boundaryText);
    expect(findings.filter((f) => f.problem.startsWith("missing"))).toEqual([]);
    expect(seen.routeCrisis).toEqual(expect.arrayContaining(["writeAiAuditLog", "writeCrisisEvent", "emergencyGuidance", "crisisHotlines"]));
    expect(seen.startInterviewCrisisRouting).toEqual(expect.arrayContaining(["classifyInterviewTextForCrisis"]));
    expect(seen.proxyCrisisSafetyResult).toEqual(expect.arrayContaining(["crisisHotlines", "emergencyRoute"]));
    expect(outsideCallers).toEqual(["callLlm"]);
  });

  it("A-C: resolved names only, fixed options and return, pinned calls, one outside caller", () => {
    expect(checkBoundary(boundaryText).findings).toEqual([]);
  });

  it("D: helpers come from modules that read no configuration, and the closure is pinned", () => {
    const { findings, closure, defining } = checkHelperModules(read);
    expect(findings).toEqual([]);
    expect(closure).toEqual(PURE_CLOSURE);
    // These pass through llm/safety.ts (which reads configuration) as plain re-exports; the defining module counts.
    expect(defining.emergencyGuidance).toBe("src/lib/safety/emergency-routing.ts");
    expect(defining.recordableCrisisCategories).toBe("src/lib/safety/crisis-event-categories.ts");
  });
});

describe("each rule fails where it should (mutations fed to the same checks)", () => {
  function fnBodyStart(text: string, fnName: string): number {
    const sf = ts.createSourceFile(BOUNDARY, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const fn = sf.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === fnName);
    if (!fn?.body) throw new Error(`function not found: ${fnName}`);
    return fn.body.getStart() + 1;
  }
  function mutate(fnName: string, insert: string, text = boundaryText): string {
    const at = fnBodyStart(text, fnName);
    const out = `${text.slice(0, at)}\n${insert}\n${text.slice(at)}`;
    expect(out).not.toBe(text); // a no-op mutation proves nothing
    return out;
  }
  function replaceOnce(text: string, from: string, to: string): string {
    expect(text.split(from)).toHaveLength(2); // the anchor is there exactly once
    return text.replace(from, to);
  }
  const problems = (text: string) => checkBoundary(text).findings.map((f) => `${f.where}: ${f.problem}`).join("\n");
  const prepend = (line: string) => `${line}\n${boundaryText}`;

  it.each([
    ["a mode read in routeCrisis", "routeCrisis", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"live\") throw new Error(\"x\");", "getEnv"],
    ["a vendor read", "routeCrisis", "  void resolveVendorForPurpose(\"secondb_chat\");", "resolveVendorForPurpose"],
    ["process.env", "routeCrisis", "  void process.env.X;", "global process"],
    ["an edge client in a ledger helper", "writeAiAuditLog", "  void getSupabaseClient();", "getSupabaseClient"],
    ["a setting carried by an unchecked helper", "routeCrisis", "  void assertDirectEgressAllowed(getEnv());", "assertDirectEgressAllowed"],
    ["a mode read in a direct router", "classifyChatTextForCrisis", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"mock\") return null;", "getEnv"],
    ["a setting in the interview wrapper", "startInterviewCrisisRouting", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"mock\") return { started: false, done: Promise.resolve(null) };", "getEnv"],
    ["a setting in the proxy lane mapper", "proxyCrisisSafetyResult", "  void getEnv();", "getEnv"],
    ["a dynamic import", "routeCrisis", "  const runtime = await import(\"../env\"); void runtime;", "dynamic import"],
    ["import.meta", "routeCrisis", "  void import.meta;", "import.meta"],
    ["globalThis", "routeCrisis", "  void globalThis[\"process\"];", "global globalThis"],
    ["localStorage", "routeCrisis", "  void localStorage.getItem(\"mode\");", "global localStorage"],
    ["a setting named in a string", "routeCrisis", "  const key = \"EXPO_PUBLIC_LLM_MODE\"; void key;", "names a setting"],
  ])("catches %s", (_label, fnName, insert, expected) => {
    expect(problems(mutate(fnName, insert))).toContain(expected);
  });

  it("resolves names lexically: a module value hidden behind a same-named local in a block is still caught", () => {
    const text = mutate("routeCrisis", "  if (crisisMode === \"live\") void 0;\n  { const crisisMode = 0; void crisisMode; }",
      prepend("const { EXPO_PUBLIC_LLM_MODE: crisisMode } = getEnv();"));
    expect(problems(text)).toContain("uses crisisMode, a module value");
  });

  it("does not mistake a local that shadows a module name for that module value (no false alarm)", () => {
    expect(problems(mutate("routeCrisis", "  { const getEnv = 0; void getEnv; }"))).toBe("");
  });

  it("allows a module const that is a plain literal, but not one with a computed key", () => {
    expect(problems(mutate("routeCrisis", "  void CRISIS_COPY_VERSION;", prepend("const CRISIS_COPY_VERSION = \"routecrisis-inline-v2\";")))).toBe("");
    const computed = mutate("routeCrisis", "  void BY_MODE.live;", prepend("const BY_MODE = { [getEnv().EXPO_PUBLIC_LLM_MODE]: true } as const;"));
    expect(problems(computed)).toContain("uses BY_MODE, a module value that is not a plain literal const");
  });

  it("catches a new option field and a read of it", () => {
    const text = replaceOnce(boundaryText, "    classifierConfidence?: number;\n", "    classifierConfidence?: number;\n    viaEdge?: boolean;\n");
    const out = problems(mutate("routeCrisis", "  if (opts.viaEdge) throw new Error(\"x\");", text));
    expect(out).toContain("option fields are");
    expect(out).toContain("uses opts other than through its four fields");
  });

  it("catches a setting riding in on an existing option at a call", () => {
    const text = replaceOnce(boundaryText, "            recordCrisisEvent: proxyCrisis.confirmedMarker,",
      "            recordCrisisEvent: getEnv().EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION === \"true\" && proxyCrisis.confirmedMarker,");
    expect(problems(text)).toContain("routeCrisis calls changed");
  });

  it("catches guidance built from something other than the result, locale and table", () => {
    const text = replaceOnce(boundaryText, "  const text = emergencyGuidance(result.crisisRouting?.hotline, locale)?.text ?? (",
      "  const text = emergencyGuidance(result.crisisRouting?.hotline, opts.purpose === \"x\" ? \"en\" : locale)?.text ?? (");
    expect(problems(text)).toContain("builds the guidance text from opts");
  });

  it("catches a changed return that swaps the guidance", () => {
    const text = replaceOnce(boundaryText, "  return { text, safety: result, audit };", "  return { text: opts.purpose ? text : \"\", safety: result, audit };");
    expect(problems(text)).toContain("returns");
  });

  it("catches a new wrapper, a class method and a namespace calling the routing from outside the set", () => {
    expect(problems(`${boundaryText}\nexport async function newCrisisWrapper(t: string) {\n  return classifyRecordTextForCrisis(t, "ko", "u");\n}\n`)).toContain("newCrisisWrapper");
    expect(problems(`${boundaryText}\nexport class Wrap {\n  run(t: string) { return classifyRecordTextForCrisis(t, "ko", "u"); }\n}\n`)).toContain("Wrap");
    expect(problems(`${boundaryText}\nexport namespace Hidden {\n  export const run = (t: string) => startInterviewCrisisRouting({ current: false }, { text: t, locale: "ko", userId: "u" }, () => {}, () => {});\n}\n`)).toContain("Hidden");
  });

  it("catches a helper imported under an alias", () => {
    const text = replaceOnce(boundaryText, "import { classifyInput, classifyInputAnyLocale, crisisHotlines,",
      "import { classifyInput, classifyInputAnyLocale, crisisHotlines as configuredHotlines,");
    expect(problems(mutate("routeCrisis", "  void configuredHotlines;", text))).toContain("configuredHotlines");
  });

  describe("helper modules", () => {
    const helperProblems = (overrides: Record<string, string>) => {
      const sources = (r: string) => (Object.prototype.hasOwnProperty.call(overrides, r) ? overrides[r] : read(r));
      return checkHelperModules(sources).findings.map((f) => `${f.where}: ${f.problem}`).join("\n");
    };

    it("pass unchanged (control)", () => {
      expect(helperProblems({})).toBe("");
    });

    it.each([
      ["an env import", "src/lib/safety/emergency-routing.ts", "import { getEnv } from \"../env\";\n", "imports src/lib/env.ts"],
      ["a vendor routing import", "src/lib/safety/classifier.ts", "import { resolveVendorForPurpose } from \"../llm/routing\";\n", "imports src/lib/llm/routing.ts"],
      ["a package import", "src/lib/safety/lexicon.ts", "import Constants from \"expo-constants\";\n", "imports the package expo-constants"],
      ["globalThis", "src/lib/safety/crisis-context.ts", "export const LEAK = globalThis[\"process\"];\n", "global globalThis"],
      ["localStorage", "src/lib/safety/emergency-routing.ts", "export const MODE = localStorage.getItem(\"mode\");\n", "global localStorage"],
      ["navigator", "src/lib/safety/classifier.ts", "export const UA = navigator.userAgent;\n", "global navigator"],
      ["a dynamic import", "src/lib/safety/emergency-routing.ts", "export const later = () => import(\"../env\");\n", "dynamic import"],
      ["import.meta", "src/lib/async/abort.ts", "export const META = import.meta;\n", "import.meta"],
      ["the transport importing the env module", AUDIT_TRANSPORT, "import { getEnv } from \"../env\";\n", "imports src/lib/env.ts"],
      ["the transport importing expo-constants by subpath", AUDIT_TRANSPORT, "import C from \"expo-constants/build/Constants\";\n", "expo-constants/build/Constants"],
      ["the transport reading a global other than navigator", AUDIT_TRANSPORT, "export const P = globalThis.process;\n", "globalThis other than globalThis.navigator"],
      ["the transport requiring the env module by alias", AUDIT_TRANSPORT, "export const E = () => require(\"@/lib/env\");\n", "require(@/lib/env)"],
      ["the transport using a new host global", AUDIT_TRANSPORT, "export const S = sessionStorage.getItem(\"x\");\n", "global sessionStorage"],
    ])("catch %s", (_label, rel, prefix, expected) => {
      expect(helperProblems({ [rel]: `${prefix}${read(rel)}` })).toContain(expected);
    });

    it("catch an aliased re-export in llm/safety.ts", () => {
      const rel = "src/lib/llm/safety.ts";
      const text = replaceOnce(read(rel), "export { emergencyGuidance, emergencyRoute, parseEmergencyLane } from \"../safety/emergency-routing\";",
        "import { configuredGuidance } from \"../safety/emergency-routing\";\nexport { configuredGuidance as emergencyGuidance };\nexport { emergencyRoute, parseEmergencyLane } from \"../safety/emergency-routing\";");
      expect(helperProblems({ [rel]: text })).toContain("emergencyGuidance");
    });

    it("ignore comments and type-only re-exports (no false alarm)", () => {
      const rel = "src/lib/safety/emergency-routing.ts";
      expect(helperProblems({ [rel]: `// never call getEnv or read process.env here\n${read(rel)}` })).toBe("");
      const lex = "src/lib/safety/lexicon.ts";
      expect(helperProblems({ [lex]: `export { type Foo } from "some-types-package";\n${read(lex)}` })).toBe("");
    });
  });
});
