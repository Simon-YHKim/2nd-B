// Structural check: the shared crisis routing reads no configuration.
//
// Simon 2026-10-15 01:51 (Q-261014-81 가): merge #2483 as it was, and keep "a structural check that the shared
// crisis function cannot read the environment configuration" as separate work. Five review rounds of #2483 each
// found a new configuration a mutation could hide in: a `live && viaEdge && ...` branch inside routeCrisis passed
// every test because the tests ran one setting at a time. Adding settings to a matrix never ends. This check
// closes the door instead: the code that decides the crisis guidance cannot name a setting, a vendor, the mode or
// the edge at all.
//
// Threat model: settings that reach the crisis routing during ordinary maintenance (a new import, a helper, an
// options field, a value passed by a caller). The ways around a name-based check (dynamic import, import.meta,
// global objects, shadowing a module name) are refused outright rather than analysed.
//
// What is checked (TypeScript syntax trees, comments ignored):
//  A. The crisis functions in boundary.ts use only allowed outside names: pure safety helpers imported from fixed
//     specifiers, the audit transport, three built-ins, module constants whose value is a literal, and each other.
//     No local name may shadow a module-level name; no import(), import.meta, or setting name inside a string.
//  B. routeCrisis takes exactly four option fields, reads no other, and builds its guidance only from the safety
//     result, the locale and the age (the hotline table). The values its callers pass for those three are pinned.
//  C. Only callLlm calls the crisis routing from outside the set, so a new wrapper cannot sit in front unchecked.
//  D. Every outside helper is followed to the module that defines it (plain re-exports only). The pure helpers'
//     whole import closure is pinned: seven modules, no package import, no global object, no dynamic import, no
//     env or vendor-routing module. The audit transport is held to the same rules at module level only: it sends the
//     ledger write, and the screens show the guidance before that write settles (secondb.tsx publishCrisisNotice
//     before the send; interview.tsx startInterviewCrisisRouting onVisible before `done`).
// The last block feeds mutated sources to the same checks, so each rule is shown to fail where it should.
import { existsSync, readFileSync } from "fs";
import { join, posix, resolve } from "path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const BOUNDARY = "src/lib/llm/boundary.ts";
const AUDIT_TRANSPORT = "src/lib/llm/audit-write-outbox.ts";

// The functions that decide the crisis guidance (routers) and the helpers they call in the file.
const ROUTERS = [
  "routeCrisis",
  "classifyRecordTextForCrisis",
  "classifyInterviewTextForCrisis",
  "classifyChatTextForCrisis",
  "startInterviewCrisisRouting",
  "proxyCrisisSafetyResult",
] as const;
const HELPERS = ["writeAiAuditLog", "writeCrisisEvent", "crisisObserver", "djb2"] as const;
const CRISIS_FUNCTIONS: readonly string[] = [...ROUTERS, ...HELPERS];

// Outside names the crisis functions may use, with the exact specifier boundary.ts imports each one from.
const ALLOWED_IMPORTS: Readonly<Record<string, string>> = {
  crisisHotlines: "../safety/classifier",
  classifyInputAnyLocale: "../safety/classifier",
  emergencyGuidance: "./safety",
  emergencyRoute: "./safety",
  recordableCrisisCategories: "./safety",
  enqueueAuditWrite: "./audit-write-outbox",
  throwIfAborted: "../async/abort",
};
const BUILTINS = new Set(["Error", "undefined", "Promise"]);

// Functions outside the set that call the routing. A new caller has to be looked at and added here.
const OUTSIDE_ROUTER_CALLERS = ["callLlm"];

// routeCrisis: the option fields it takes, and what its callers pass for the three values the guidance depends on.
const ROUTE_CRISIS_OPTIONS = ["classifierConfidence", "purpose", "recordCrisisEvent", "session"];
const ROUTE_CRISIS_GUIDANCE_ARGS = [
  // [safety result, locale, minor] at each call, whitespace collapsed
  "safety | locale | minor", // classifyRecordTextForCrisis
  "safety | locale | minor", // classifyInterviewTextForCrisis
  "safety | locale | minor", // classifyChatTextForCrisis
  "inputSafety | input.locale | input.minor",
  '{ zone: "red", matched: [], categories: ["crisis"] } | input.locale | input.minor',
  "proxyCrisisSafetyResult(input.locale, input.minor, vendorCrisis.lane) | input.locale | input.minor",
  "proxyCrisisSafetyResult(input.locale, input.minor, proxyCrisis.lane) | input.locale | input.minor",
].sort();

// The pure helpers' import closure, pinned. The audit transport is checked on its own (see D above).
const PURE_CLOSURE = [
  "src/lib/async/abort.ts",
  "src/lib/safety/classifier.ts",
  "src/lib/safety/crisis-context.ts",
  "src/lib/safety/crisis-event-categories.ts",
  "src/lib/safety/crisis-language.ts",
  "src/lib/safety/emergency-routing.ts",
  "src/lib/safety/lexicon.ts",
];

const SETTING_IN_STRING = /EXPO_PUBLIC_|LLM_MODE|VIA_EDGE|USE_VERTEX/;
const GLOBAL_OBJECTS = new Set(["process", "globalThis", "window", "global", "self", "require", "eval", "Function", "getEnv"]);
const CONFIG_MODULES = ["src/lib/env.ts", "src/lib/llm/routing.ts"];

interface Finding {
  where: string;
  problem: string;
}

function read(rel: string): string {
  // LF everywhere, so the text anchors in the mutations below do not depend on the checkout's line endings.
  return readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

function parse(rel: string, text: string): ts.SourceFile {
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function resolveSpecifier(fromRel: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? posix.join("src", spec.slice(2)) : posix.join(posix.dirname(fromRel), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(join(ROOT, candidate))) return candidate;
  }
  return null;
}

function insideType(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) if (ts.isTypeNode(p)) return true;
  return false;
}

function isReference(node: ts.Identifier): boolean {
  const p = node.parent;
  if (insideType(node)) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node) return false;
  if (ts.isQualifiedName(p)) return false;
  if ((ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) ||
       ts.isClassDeclaration(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) ||
       ts.isNamespaceImport(p)) && (p as { name?: ts.Node }).name === node) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  return true;
}

// Names a source file binds at module level: imports, functions, classes, variables.
function moduleNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s) && s.importClause) {
      if (s.importClause.name) out.add(s.importClause.name.text);
      const b = s.importClause.namedBindings;
      if (b && ts.isNamespaceImport(b)) out.add(b.name.text);
      if (b && ts.isNamedImports(b)) for (const e of b.elements) out.add(e.name.text);
    }
    if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name) out.add(s.name.text);
    if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text);
  }
  return out;
}

// Module constants whose value is a plain literal (strings, numbers, booleans, arrays and objects of those).
function literalConstants(sf: ts.SourceFile): Set<string> {
  const isLiteral = (e: ts.Expression): boolean =>
    ts.isStringLiteralLike(e) || ts.isNumericLiteral(e) || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isArrayLiteralExpression(e) && e.elements.every((x) => ts.isExpression(x) && isLiteral(x))) ||
    (ts.isObjectLiteralExpression(e) && e.properties.every((p) => ts.isPropertyAssignment(p) && isLiteral(p.initializer))) ||
    (ts.isAsExpression(e) && isLiteral(e.expression));
  const out = new Set<string>();
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s) || !(s.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const d of s.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && isLiteral(d.initializer)) out.add(d.name.text);
    }
  }
  return out;
}

function topLevelFunctions(sf: ts.SourceFile): Map<string, ts.FunctionDeclaration> {
  const out = new Map<string, ts.FunctionDeclaration>();
  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name) out.set(node.name.text, node);
  });
  return out;
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

// Refused anywhere in checked code: import(), import.meta / new.target, and a setting named in a string.
function escapeHatches(node: ts.Node, where: string): Finding[] {
  const found: Finding[] = [];
  walk(node, (n) => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) found.push({ where, problem: "uses a dynamic import()" });
    if (ts.isMetaProperty(n)) found.push({ where, problem: `uses ${n.getText()}` });
    if (ts.isStringLiteralLike(n) && SETTING_IN_STRING.test(n.text)) found.push({ where, problem: `names a setting in a string: ${n.text}` });
  });
  return found;
}

function checkBoundary(text: string): { findings: Finding[]; seen: Record<string, string[]> } {
  const sf = parse(BOUNDARY, text);
  const fns = topLevelFunctions(sf);
  const modNames = moduleNames(sf);
  const literals = literalConstants(sf);
  const findings: Finding[] = [];
  const seen: Record<string, string[]> = {};
  const set = new Set(CRISIS_FUNCTIONS);

  // The allowed imports really come from the fixed specifiers (an alias or another module would not be checked).
  const importedFrom = new Map<string, string>();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !s.importClause) continue;
    const b = s.importClause.namedBindings;
    if (b && ts.isNamedImports(b)) {
      for (const e of b.elements) importedFrom.set(e.name.text, e.propertyName ? `${s.moduleSpecifier.text} as alias of ${e.propertyName.text}` : s.moduleSpecifier.text);
    }
  }
  for (const [name, spec] of Object.entries(ALLOWED_IMPORTS)) {
    if (importedFrom.get(name) !== spec) findings.push({ where: BOUNDARY, problem: `${name} is not imported plainly from ${spec} (found ${importedFrom.get(name) ?? "nothing"})` });
  }

  for (const name of CRISIS_FUNCTIONS) {
    const fn = fns.get(name);
    if (!fn) {
      findings.push({ where: name, problem: "missing from boundary.ts" });
      continue;
    }
    const declared = new Set<string>();
    const used = new Set<string>();
    walk(fn, (n) => {
      if (n === fn) return;
      const named = n as { name?: ts.Node };
      if ((ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n) || ts.isFunctionDeclaration(n) ||
           ts.isClassDeclaration(n) || ts.isFunctionExpression(n)) && named.name && ts.isIdentifier(named.name)) {
        declared.add(named.name.text);
      }
      if (ts.isIdentifier(n) && isReference(n)) used.add(n.text);
    });
    for (const local of declared) {
      if (modNames.has(local) || GLOBAL_OBJECTS.has(local)) findings.push({ where: name, problem: `declares ${local}, which shadows a module or global name` });
    }
    const outside = [...used].filter((u) => !declared.has(u)).sort();
    seen[name] = outside;
    for (const u of outside) {
      if (set.has(u)) continue;
      if (Object.prototype.hasOwnProperty.call(ALLOWED_IMPORTS, u) || BUILTINS.has(u) || literals.has(u)) continue;
      if (fns.has(u)) findings.push({ where: name, problem: `calls ${u}, a function in boundary.ts outside the checked set` });
      else findings.push({ where: name, problem: `uses ${u}, which is not on the allow list` });
    }
    findings.push(...escapeHatches(fn, name));
  }

  // B. routeCrisis options and guidance.
  const route = fns.get("routeCrisis");
  if (route) {
    const optsParam = route.parameters.find((p) => ts.isIdentifier(p.name) && p.name.text === "opts");
    const members = optsParam?.type && ts.isTypeLiteralNode(optsParam.type)
      ? optsParam.type.members.map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : "?")).sort()
      : null;
    if (JSON.stringify(members) !== JSON.stringify(ROUTE_CRISIS_OPTIONS)) {
      findings.push({ where: "routeCrisis", problem: `option fields are ${JSON.stringify(members)}, not ${JSON.stringify(ROUTE_CRISIS_OPTIONS)}` });
    }
    walk(route, (n) => {
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "opts" && !ROUTE_CRISIS_OPTIONS.includes(n.name.text)) {
        findings.push({ where: "routeCrisis", problem: `reads opts.${n.name.text}` });
      }
      if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "opts") {
        findings.push({ where: "routeCrisis", problem: "reads opts by a computed key" });
      }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "text" && n.initializer) {
        const refs = new Set<string>();
        walk(n.initializer, (x) => { if (ts.isIdentifier(x) && isReference(x)) refs.add(x.text); });
        const extra = [...refs].filter((r) => !["emergencyGuidance", "result", "locale", "joined"].includes(r));
        if (extra.length > 0) findings.push({ where: "routeCrisis", problem: `builds the guidance text from ${extra.join(", ")}` });
      }
    });
  }
  const callArgs: string[] = [];
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "routeCrisis") {
      const a = n.arguments;
      callArgs.push([a[0], a[1], a[4]].map((x) => (x ? x.getText(sf).replace(/\s+/g, " ") : "(none)")).join(" | "));
    }
  });
  callArgs.sort();
  if (JSON.stringify(callArgs) !== JSON.stringify(ROUTE_CRISIS_GUIDANCE_ARGS)) {
    findings.push({ where: "routeCrisis callers", problem: `guidance arguments changed: ${JSON.stringify(callArgs)}` });
  }

  // C. Outside callers of the routing.
  const routerSet = new Set<string>(ROUTERS);
  const outsideCallers: string[] = [];
  sf.forEachChild((n) => {
    const name = ts.isFunctionDeclaration(n) && n.name ? n.name.text
      : ts.isVariableStatement(n) ? n.declarationList.declarations.map((d) => d.name.getText(sf)).join(",") : null;
    if (!name || set.has(name)) return;
    let calls = false;
    walk(n, (x) => { if (ts.isIdentifier(x) && routerSet.has(x.text) && isReference(x)) calls = true; });
    if (calls) outsideCallers.push(name);
  });
  if (JSON.stringify(outsideCallers.sort()) !== JSON.stringify(OUTSIDE_ROUTER_CALLERS)) {
    findings.push({ where: "boundary.ts", problem: `the crisis routing is called from ${JSON.stringify(outsideCallers)}, not only ${JSON.stringify(OUTSIDE_ROUTER_CALLERS)}` });
  }
  return { findings, seen };
}

// D. Follow an imported name to the module that defines it. Only `export { name } from "x"` is followed; an alias,
// a re-export of something imported, or a missing declaration is a finding.
function definingModule(name: string, rel: string, sources: (r: string) => string, depth = 0): { rel?: string; problem?: string } {
  if (depth > 4) return { problem: `re-export chain too long for ${name}` };
  const sf = parse(rel, sources(rel));
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
  const declares = sf.statements.some((s) =>
    (ts.isFunctionDeclaration(s) && s.name?.text === name && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
    (ts.isVariableStatement(s) && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)));
  return declares ? { rel } : { problem: `${rel} does not declare ${name}` };
}

// Runtime imports of a module (type-only imports and exports are erased and cannot read anything).
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
    if (ts.isExportDeclaration(s) && !s.isTypeOnly && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) spec = s.moduleSpecifier.text;
    if (!spec) continue;
    if (spec.startsWith(".") || spec.startsWith("@/")) relative.push(resolveSpecifier(rel, spec) ?? `UNRESOLVED ${spec}`);
    else packages.push(spec);
  }
  return { relative, packages };
}

function checkModuleRules(rel: string, text: string): Finding[] {
  const sf = parse(rel, text);
  const findings: Finding[] = escapeHatches(sf, rel);
  walk(sf, (n) => {
    if (ts.isIdentifier(n) && isReference(n) && GLOBAL_OBJECTS.has(n.text)) findings.push({ where: rel, problem: `uses ${n.text}` });
  });
  const { relative, packages } = runtimeImports(rel, sf);
  for (const r of relative) if (CONFIG_MODULES.includes(r) || r.startsWith("UNRESOLVED")) findings.push({ where: rel, problem: `imports ${r}` });
  for (const p of packages) findings.push({ where: rel, problem: `imports the package ${p}` });
  return findings;
}

function checkTransportRules(rel: string, text: string): Finding[] {
  const sf = parse(rel, text);
  const findings: Finding[] = escapeHatches(sf, rel);
  walk(sf, (n) => {
    if (!ts.isIdentifier(n) || !isReference(n) || !GLOBAL_OBJECTS.has(n.text)) return;
    const p = n.parent;
    if (n.text === "globalThis" && ts.isPropertyAccessExpression(p) && p.expression === n && p.name.text === "navigator") return;
    if (n.text === "require" && ts.isCallExpression(p) && p.expression === n && p.arguments.length === 1 &&
        ts.isStringLiteral(p.arguments[0]) && !p.arguments[0].text.startsWith(".") && p.arguments[0].text !== "expo-constants") return;
    findings.push({ where: rel, problem: `uses ${n.text}` });
  });
  const { relative, packages } = runtimeImports(rel, sf);
  for (const r of relative) if (CONFIG_MODULES.includes(r)) findings.push({ where: rel, problem: `imports ${r}` });
  for (const p of packages) if (p === "expo-constants") findings.push({ where: rel, problem: `imports the package ${p}` });
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
  // The pure helpers: follow every runtime import to the end.
  const closure = new Set<string>();
  const queue = Object.entries(defining).filter(([, rel]) => rel !== AUDIT_TRANSPORT).map(([, rel]) => rel);
  while (queue.length > 0) {
    const rel = queue.shift() as string;
    if (closure.has(rel)) continue;
    closure.add(rel);
    if (rel.startsWith("UNRESOLVED")) continue;
    const text = sources(rel);
    findings.push(...checkModuleRules(rel, text));
    queue.push(...runtimeImports(rel, parse(rel, text)).relative.filter((r) => !closure.has(r)));
  }
  // The audit transport: no configuration on the module itself. It may import packages and its own transport
  // modules, read globalThis.navigator (platform) and require() a package named by a plain string (lazy storage).
  if (defining.enqueueAuditWrite === AUDIT_TRANSPORT) {
    findings.push(...checkTransportRules(AUDIT_TRANSPORT, sources(AUDIT_TRANSPORT)));
  } else {
    findings.push({ where: "enqueueAuditWrite", problem: `is not defined in ${AUDIT_TRANSPORT}` });
  }
  return { findings, closure: [...closure].sort(), defining };
}

const boundaryText = read(BOUNDARY);

describe("the shared crisis routing reads no configuration (Q-261014-81)", () => {
  it("sees the crisis functions and what they use (positive control)", () => {
    const { findings, seen } = checkBoundary(boundaryText);
    expect(findings.filter((f) => f.problem.startsWith("missing"))).toEqual([]);
    expect(seen.routeCrisis).toEqual(expect.arrayContaining(["writeAiAuditLog", "writeCrisisEvent", "emergencyGuidance", "crisisHotlines"]));
    expect(seen.startInterviewCrisisRouting).toEqual(expect.arrayContaining(["classifyInterviewTextForCrisis"]));
    expect(seen.proxyCrisisSafetyResult).toEqual(expect.arrayContaining(["crisisHotlines", "emergencyRoute"]));
  });

  it("A-C: allowed names only, no shadowing or escape hatch, fixed options, pinned guidance inputs, one outside caller", () => {
    expect(checkBoundary(boundaryText).findings).toEqual([]);
  });

  it("D: outside helpers come from modules that read no configuration, and their closure is pinned", () => {
    const { findings, closure, defining } = checkHelperModules(read);
    expect(findings).toEqual([]);
    expect(closure).toEqual(PURE_CLOSURE);
    // emergencyGuidance, emergencyRoute and recordableCrisisCategories pass through llm/safety.ts (which reads
    // configuration) as plain re-exports; the module that defines them is the one that counts.
    expect(defining.emergencyGuidance).toBe("src/lib/safety/emergency-routing.ts");
    expect(defining.recordableCrisisCategories).toBe("src/lib/safety/crisis-event-categories.ts");
  });
});

describe("each rule fails where it should (mutations fed to the same checks)", () => {
  function mutate(fnName: string, insert: string, text = boundaryText): string {
    const fn = topLevelFunctions(parse(BOUNDARY, text)).get(fnName);
    if (!fn?.body) throw new Error(`function not found: ${fnName}`);
    const at = fn.body.getStart() + 1;
    const out = `${text.slice(0, at)}\n${insert}\n${text.slice(at)}`;
    expect(out).not.toBe(text); // a no-op mutation proves nothing
    return out;
  }
  function replaceOnce(text: string, from: string, to: string): string {
    expect(text.split(from)).toHaveLength(2); // the anchor is there exactly once
    return text.replace(from, to);
  }
  const problems = (text: string) => checkBoundary(text).findings.map((f) => `${f.where}: ${f.problem}`).join("\n");

  it.each([
    ["a mode read in routeCrisis", "routeCrisis", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"live\") throw new Error(\"x\");", "getEnv"],
    ["a vendor read", "routeCrisis", "  void resolveVendorForPurpose(\"secondb_chat\");", "resolveVendorForPurpose"],
    ["process.env", "routeCrisis", "  void process.env.X;", "uses process"],
    ["an edge client in a ledger helper", "writeAiAuditLog", "  void getSupabaseClient();", "getSupabaseClient"],
    ["a setting carried by an unchecked helper", "routeCrisis", "  void assertDirectEgressAllowed(getEnv());", "assertDirectEgressAllowed"],
    ["a mode read in a direct router", "classifyChatTextForCrisis", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"mock\") return null;", "getEnv"],
    ["a setting in the interview wrapper", "startInterviewCrisisRouting", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"mock\") return { started: false, done: Promise.resolve(null) };", "getEnv"],
    ["a setting in the proxy lane mapper", "proxyCrisisSafetyResult", "  void getEnv();", "getEnv"],
    ["a shadowed module name", "routeCrisis", "  { const getEnv = 0; void getEnv; }", "shadows"],
    ["a dynamic import", "routeCrisis", "  const runtime = await import(\"../env\"); void runtime;", "dynamic import"],
    ["import.meta", "routeCrisis", "  void import.meta;", "import.meta"],
    ["globalThis", "routeCrisis", "  void globalThis[\"process\"];", "uses globalThis"],
    ["a setting named in a string", "routeCrisis", "  const key = \"EXPO_PUBLIC_LLM_MODE\"; void key;", "names a setting"],
  ])("catches %s", (_label, fnName, insert, expected) => {
    expect(problems(mutate(fnName, insert))).toContain(expected);
  });

  it("allows a module constant that is only a literal (ordinary maintenance)", () => {
    const withConst = `const CRISIS_COPY_VERSION = "routecrisis-inline-v2";\n${boundaryText}`;
    expect(problems(mutate("routeCrisis", "  void CRISIS_COPY_VERSION;", withConst))).toBe("");
  });

  it("catches a new option field and a read of it", () => {
    const text = replaceOnce(boundaryText, "    classifierConfidence?: number;\n", "    classifierConfidence?: number;\n    viaEdge?: boolean;\n");
    const out = problems(mutate("routeCrisis", "  if (opts.viaEdge) return { text: \"\", safety: result, audit: undefined as never };", text));
    expect(out).toContain("option fields are");
    expect(out).toContain("reads opts.viaEdge");
  });

  it("catches guidance built from something other than the result, locale and age", () => {
    const text = replaceOnce(boundaryText.replace(/\r\n/g, "\n"), "  const text = emergencyGuidance(result.crisisRouting?.hotline, locale)?.text ?? (",
      "  const text = emergencyGuidance(result.crisisRouting?.hotline, opts.purpose === \"x\" ? \"en\" : locale)?.text ?? (");
    expect(problems(text)).toContain("builds the guidance text from opts");
  });

  it("catches a caller that passes a different locale or result", () => {
    const text = replaceOnce(boundaryText.replace(/\r\n/g, "\n"), "      inputSafety,\n      input.locale,", "      inputSafety,\n      input.locale === \"ko\" ? \"en\" : input.locale,");
    expect(problems(text)).toContain("guidance arguments changed");
  });

  it("catches a new wrapper that calls the routing from outside the set", () => {
    const text = `${boundaryText}\nexport async function newCrisisWrapper(t: string) {\n  return classifyRecordTextForCrisis(t, "ko", "u");\n}\n`;
    expect(problems(text)).toContain("newCrisisWrapper");
  });

  it("catches a helper imported under an alias", () => {
    const text = replaceOnce(boundaryText.replace(/\r\n/g, "\n"), "import { classifyInput, classifyInputAnyLocale, crisisHotlines,",
      "import { classifyInput, classifyInputAnyLocale, crisisHotlines as configuredHotlines,");
    expect(problems(text)).toContain("crisisHotlines is not imported plainly");
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
      ["a global object", "src/lib/safety/crisis-context.ts", "export const LEAK = globalThis[\"process\"];\n", "uses globalThis"],
      ["a dynamic import", "src/lib/safety/emergency-routing.ts", "export const later = () => import(\"../env\");\n", "dynamic import"],
      ["import.meta", "src/lib/async/abort.ts", "export const META = import.meta;\n", "import.meta"],
      ["the transport reading the environment", AUDIT_TRANSPORT, "import { getEnv } from \"../env\";\n", "imports src/lib/env.ts"],
      ["the transport reading a global other than navigator", AUDIT_TRANSPORT, "export const P = globalThis.process;\n", "uses globalThis"],
      ["the transport requiring a relative module", AUDIT_TRANSPORT, "export const E = () => require(\"../env\");\n", "uses require"],
    ])("catch %s", (_label, rel, prefix, expected) => {
      expect(helperProblems({ [rel]: `${prefix}${read(rel)}` })).toContain(expected);
    });

    it("catch an aliased re-export in llm/safety.ts", () => {
      const rel = "src/lib/llm/safety.ts";
      const text = replaceOnce(read(rel), "export { emergencyGuidance, emergencyRoute, parseEmergencyLane } from \"../safety/emergency-routing\";",
        "import { configuredGuidance } from \"../safety/emergency-routing\";\nexport { configuredGuidance as emergencyGuidance };\nexport { emergencyRoute, parseEmergencyLane } from \"../safety/emergency-routing\";");
      expect(helperProblems({ [rel]: text })).toContain("emergencyGuidance");
    });

    it("ignore a comment that mentions getEnv (only executable code counts)", () => {
      const rel = "src/lib/safety/emergency-routing.ts";
      expect(helperProblems({ [rel]: `// never call getEnv or read process.env here\n${read(rel)}` })).toBe("");
    });
  });
});
