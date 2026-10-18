// Structural check: the shared crisis routing reads no configuration.
//
// Simon 2026-10-15 02:43 (Q-261014-81 가): merge #2483 as it was, and keep "a structural check that the shared
// crisis function cannot read the environment configuration" as separate work. Five review rounds of #2483 each
// found a new configuration a mutation could hide in: a `live && viaEdge && ...` branch inside routeCrisis passed
// every test because the tests ran one setting at a time (edge off, then edge on, then the adult path, then a
// non-Vertex, non-Gemini vendor). Adding settings to a matrix never ends. This check closes the door instead:
// the functions that decide the crisis guidance cannot name a setting, a vendor, the mode or the edge at all.
//
// What is checked (TypeScript syntax tree, not text search):
//  1. Every name the crisis functions use from outside their own body is on an allow list (pure safety helpers,
//     the audit transport, two built-ins). A new call such as getEnv(), resolveVendorForPurpose() or
//     getSupabaseClient() inside routeCrisis fails here until someone looks at it.
//  2. The functions they call in boundary.ts are themselves in the checked set, so a helper cannot carry the
//     setting in one call away.
//  3. No string inside them names a setting (EXPO_PUBLIC_*, LLM_MODE, VIA_EDGE, USE_VERTEX).
//  4. The modules that define the outside helpers read no configuration either: no getEnv / process.env /
//     EXPO_PUBLIC_, and no import of the env module, the vendor routing module or expo-constants. The audit
//     transport (audit-write-outbox.ts) is held to the same rule at module level; what it imports to send the
//     write is transport, and is not what decides whether the guidance appears.
// The last block feeds mutated sources to the same checker, so the check is shown to fail where it should.
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const BOUNDARY = "src/lib/llm/boundary.ts";

// The crisis functions: the shared router, the three direct routers that call it before any model work, and the
// helpers they call in this file.
const CRISIS_FUNCTIONS = [
  "routeCrisis",
  "classifyRecordTextForCrisis",
  "classifyInterviewTextForCrisis",
  "classifyChatTextForCrisis",
  "writeAiAuditLog",
  "writeCrisisEvent",
  "crisisObserver",
  "djb2",
] as const;

// Names from outside their bodies that they may use, and why.
const ALLOWED_OUTSIDE: Readonly<Record<string, string>> = {
  crisisHotlines: "fixed hotline numbers by locale and age (safety/classifier.ts)",
  classifyInputAnyLocale: "the local word gate (safety/classifier.ts)",
  emergencyGuidance: "fixed 119 / 112 guidance text (safety/emergency-routing.ts)",
  recordableCrisisCategories: "the record's closed category list (safety/crisis-event-categories.ts)",
  enqueueAuditWrite: "the audit transport (llm/audit-write-outbox.ts)",
  throwIfAborted: "the caller's own abort signal (async/abort.ts)",
  Error: "built-in",
  undefined: "built-in",
};

const SETTING_IN_STRING = /EXPO_PUBLIC_|LLM_MODE|VIA_EDGE|USE_VERTEX/;
const CONFIG_IN_MODULE = /\bgetEnv\b|process\.env|EXPO_PUBLIC_/;

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function parse(rel: string, text: string): ts.SourceFile {
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function topLevelFunctions(sf: ts.SourceFile): Map<string, ts.FunctionDeclaration> {
  const out = new Map<string, ts.FunctionDeclaration>();
  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name) out.set(node.name.text, node);
  });
  return out;
}

function insideType(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isTypeNode(p)) return true;
  }
  return false;
}

// Names a function uses that it does not declare itself (parameters, locals, inner functions), and its strings.
function outsideNames(fn: ts.FunctionDeclaration): { names: string[]; strings: string[] } {
  const declared = new Set<string>();
  const used = new Set<string>();
  const strings: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) {
      declared.add(node.name.text);
    }
    if (ts.isFunctionDeclaration(node) && node !== fn && node.name) declared.add(node.name.text);
    if (ts.isStringLiteralLike(node)) strings.push(node.text);
    if (ts.isIdentifier(node) && !insideType(node)) {
      const p = node.parent;
      const propertyName =
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        (ts.isPropertyAssignment(p) && p.name === node) ||
        ts.isQualifiedName(p);
      const declarationName =
        (ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p)) &&
        p.name === node;
      if (!propertyName && !declarationName) used.add(node.text);
    }
    node.forEachChild(visit);
  };
  fn.forEachChild(visit);
  return { names: [...used].filter((name) => !declared.has(name)).sort(), strings };
}

interface Finding {
  fn: string;
  problem: string;
}

function checkBoundary(text: string): { findings: Finding[]; seen: Record<string, string[]> } {
  const sf = parse(BOUNDARY, text);
  const fns = topLevelFunctions(sf);
  const findings: Finding[] = [];
  const seen: Record<string, string[]> = {};
  const checked = new Set<string>(CRISIS_FUNCTIONS);
  for (const name of CRISIS_FUNCTIONS) {
    const fn = fns.get(name);
    if (!fn) {
      findings.push({ fn: name, problem: "missing from boundary.ts" });
      continue;
    }
    const { names, strings } = outsideNames(fn);
    seen[name] = names;
    for (const used of names) {
      if (fns.has(used)) {
        if (!checked.has(used)) findings.push({ fn: name, problem: `calls ${used}, a function in boundary.ts outside the checked set` });
      } else if (!Object.prototype.hasOwnProperty.call(ALLOWED_OUTSIDE, used)) {
        findings.push({ fn: name, problem: `uses ${used}, which is not on the allow list` });
      }
    }
    for (const s of strings) {
      if (SETTING_IN_STRING.test(s)) findings.push({ fn: name, problem: `names a setting in a string: ${s}` });
    }
  }
  return { findings, seen };
}

// Where an imported name is defined: follow boundary.ts's import, then any `export { name } from` re-export.
function definingModule(name: string, fromRel: string, depth = 0): string {
  if (depth > 4) throw new Error(`re-export chain too long for ${name}`);
  const sf = parse(fromRel, read(fromRel));
  for (const stmt of sf.statements) {
    const spec = (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
      ? stmt.moduleSpecifier.text
      : null;
    if (!spec || !spec.startsWith(".")) continue;
    const target = join(dirname(fromRel), `${spec}.ts`).replace(/\\/g, "/");
    if (depth === 0 && ts.isImportDeclaration(stmt)) {
      const bindings = stmt.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.some((e) => e.name.text === name && !stmt.importClause?.isTypeOnly)) {
        return definingModule(name, target, depth + 1);
      }
    }
    if (depth > 0 && ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      if (stmt.exportClause.elements.some((e) => e.name.text === name)) return definingModule(name, target, depth + 1);
    }
  }
  if (depth === 0) throw new Error(`${name} is not imported by ${fromRel}`);
  return fromRel;
}

function checkModule(rel: string, text: string): string[] {
  const problems: string[] = [];
  if (CONFIG_IN_MODULE.test(text)) problems.push(`${rel} reads configuration (${text.match(CONFIG_IN_MODULE)?.[0]})`);
  const sf = parse(rel, text);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.importClause?.isTypeOnly) continue;
    const spec = stmt.moduleSpecifier.text;
    if (spec === "expo-constants" || /(^|\/)env$/.test(spec) || /(^|\/)llm\/routing$|^\.\/routing$/.test(spec)) {
      problems.push(`${rel} imports ${spec}`);
    }
  }
  return problems;
}

const boundaryText = read(BOUNDARY);

describe("the shared crisis routing reads no configuration (Q-261014-81)", () => {
  it("finds every crisis function and reads what each one uses (positive control)", () => {
    const { findings, seen } = checkBoundary(boundaryText);
    expect(findings.filter((f) => f.problem.startsWith("missing"))).toEqual([]);
    // The checker really sees the calls that matter, so an empty result below is not a blind checker.
    expect(seen.routeCrisis).toEqual(expect.arrayContaining(["writeAiAuditLog", "writeCrisisEvent", "emergencyGuidance", "crisisHotlines"]));
    expect(seen.classifyChatTextForCrisis).toEqual(expect.arrayContaining(["classifyInputAnyLocale", "routeCrisis"]));
    expect(seen.writeCrisisEvent).toEqual(expect.arrayContaining(["enqueueAuditWrite", "recordableCrisisCategories"]));
  });

  it("uses only allowed names, only checked helpers and no setting names", () => {
    expect(checkBoundary(boundaryText).findings).toEqual([]);
  });

  it("takes its outside helpers from modules that read no configuration", () => {
    const helpers = Object.keys(ALLOWED_OUTSIDE).filter((name) => name !== "Error" && name !== "undefined");
    const modules = new Map<string, string[]>();
    for (const name of helpers) {
      const rel = definingModule(name, BOUNDARY);
      modules.set(rel, [...(modules.get(rel) ?? []), name]);
    }
    // emergencyGuidance and recordableCrisisCategories come through llm/safety.ts, which does read configuration;
    // they are re-exports, so the module that defines them is the one that counts.
    expect([...modules.keys()].sort()).toEqual([
      "src/lib/async/abort.ts",
      "src/lib/llm/audit-write-outbox.ts",
      "src/lib/safety/classifier.ts",
      "src/lib/safety/crisis-event-categories.ts",
      "src/lib/safety/emergency-routing.ts",
    ]);
    const problems = [...modules.keys()].flatMap((rel) => checkModule(rel, read(rel)));
    expect(problems).toEqual([]);
  });
});

describe("the check fails where it should (mutations fed to the same checker)", () => {
  // Insert a statement right after the opening brace of a function body. The position comes from the syntax
  // tree, so line endings (CRLF on a Windows checkout) do not matter.
  function mutate(fnName: string, insert: string): string {
    const fn = topLevelFunctions(parse(BOUNDARY, boundaryText)).get(fnName);
    if (!fn?.body) throw new Error(`function not found: ${fnName}`);
    const at = fn.body.getStart() + 1;
    const out = `${boundaryText.slice(0, at)}\n${insert}\n${boundaryText.slice(at)}`;
    // The mutation must really change the source (a no-op mutation proves nothing).
    expect(out).not.toBe(boundaryText);
    return out;
  }

  const cases: Array<[string, string, string, string]> = [
    ["a mode read in routeCrisis", "routeCrisis", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"live\") throw new Error(\"x\");", "getEnv"],
    ["a vendor read in routeCrisis", "routeCrisis", "  void resolveVendorForPurpose(\"secondb_chat\");", "resolveVendorForPurpose"],
    ["process.env in routeCrisis", "routeCrisis", "  void process.env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION;", "process"],
    ["an edge client in a ledger helper", "writeAiAuditLog", "  void getSupabaseClient();", "getSupabaseClient"],
    ["a setting carried by an unchecked helper", "routeCrisis", "  void assertDirectEgressAllowed(getEnv());", "assertDirectEgressAllowed"],
    ["a mode read in a direct router", "classifyChatTextForCrisis", "  if (getEnv().EXPO_PUBLIC_LLM_MODE === \"mock\") return null;", "getEnv"],
  ];

  it.each(cases)("catches %s", (_label, fnName, insert, expected) => {
    const { findings } = checkBoundary(mutate(fnName, insert));
    expect(findings.map((f) => f.problem).join("\n")).toContain(expected);
  });

  it("catches a setting named only in a string", () => {
    const { findings } = checkBoundary(mutate("routeCrisis", "  const key = \"EXPO_PUBLIC_LLM_MODE\";\n  void key;"));
    expect(findings.map((f) => f.problem).join("\n")).toContain("names a setting in a string");
  });

  it("catches a helper module that starts reading configuration", () => {
    const rel = "src/lib/safety/emergency-routing.ts";
    const mutated = `import { getEnv } from "../env";\n${read(rel)}`;
    expect(checkModule(rel, mutated).join("\n")).toContain("reads configuration");
    expect(checkModule(rel, read(rel))).toEqual([]);
  });
});
