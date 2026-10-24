// Reviewed source replay only. node:vm is not a hostile-code security sandbox.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

export type Sources = Record<string, string>;
export type Schema = Record<string, unknown>;
export const sha = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export const textSha = (text: string): string => sha(text.replace(/\r\n/g, "\n"));
export const changedSourceFiles = (sources: Sources, baseline: Record<string, string>): string[] =>
  Object.keys(baseline).filter(file => textSha(sources[file] ?? "") !== baseline[file]).sort();
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const astOf = (file: string, text: string): ts.SourceFile => ts.createSourceFile(file, text,
  ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
export function oneNode<T extends ts.Node>(ast: ts.Node, predicate: (node: ts.Node) => boolean, label: string): T {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(ast);
  if (found.length !== 1) throw new Error(`Offline source drift: ${label} (${found.length})`);
  return found[0] as T;
}
export function functionText(sources: Sources, file: string, name: string): string {
  const ast = astOf(file, sources[file]);
  return oneNode<ts.FunctionDeclaration>(ast,
    node => ts.isFunctionDeclaration(node) && node.name?.text === name, name).getText(ast);
}

// Select actual declarations and their in-file dependencies. Imports must be supplied
// explicitly by the caller. Never evaluate corpus text as JavaScript.
export function declarationText(sources: Sources, file: string, names: string[], replaced: string[] = []): string {
  const ast = astOf(file, sources[file]), declarations = new Map<string, ts.Statement>();
  for (const node of ast.statements) {
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) if (ts.isIdentifier(d.name)) declarations.set(d.name.text, node);
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) declarations.set(node.name.text, node);
  }
  const selected = new Set<ts.Statement>();
  function include(name: string): void {
    if (replaced.includes(name)) return;
    const node = declarations.get(name);
    if (!node) throw new Error(`Offline declaration drift: ${file}:${name}`);
    if (selected.has(node)) return;
    selected.add(node);
    const visit = (child: ts.Node): void => {
      if (ts.isIdentifier(child) && declarations.has(child.text)) include(child.text);
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
  }
  names.forEach(include);
  return ast.statements.filter(node => selected.has(node)).map(node => node.getText(ast).replace(/^export\s+/, "")).join("\n");
}

export const PURE_FILES = [
  "src/lib/llm/untrusted.ts", "src/lib/llm/types.ts", "src/lib/async/abort.ts",
  "src/lib/safety/classifier.ts", "src/lib/safety/lexicon.ts", "src/lib/safety/crisis-context.ts",
  "src/lib/safety/crisis-language.ts", "src/lib/safety/emergency-routing.ts",
  "src/lib/safety/crisis-event-categories.ts", "src/lib/safety/model-reply-scan.ts",
  "src/lib/safety/ingest-policy.ts", "src/lib/persona/proposal.ts", "src/lib/persona/domain-stars.ts",
  "src/lib/persona/seven-stars.ts", "src/lib/persona/address.ts", "src/lib/wiki/clipper-templates.ts",
  "src/lib/wiki/clipper-kind.ts", "src/lib/wiki/types.ts", "src/lib/wiki/tags.ts", "src/lib/wiki/slug.ts",
  "src/lib/graph/relatedness.ts", "src/lib/dashboard/contract.ts", "src/lib/dashboard/generation-input.ts",
  "src/lib/dashboard/generation-output.ts", "src/lib/sufficiency/registry.ts", "src/lib/i18n/locales.ts",
  "src/lib/ops/recommend-parse.ts", "src/lib/ops/domains.ts", "src/lib/llm/routing.ts",
];
export function readSources(root: string, files: readonly string[]): Sources {
  return Object.fromEntries([...new Set([...PURE_FILES, ...files])].map(file => [file, readFileSync(join(root, file), "utf8")]));
}

export function createOfflineRuntime(sources: Sources) {
  let forbiddenAttempts = 0;
  const deny = (): never => { forbiddenAttempts += 1; throw new Error("Forbidden offline capability"); };
  const context = vm.createContext({ fetch: deny, XMLHttpRequest: deny, WebSocket: deny,
    process: Object.freeze({ env: Object.freeze({ EXPO_PUBLIC_SERVER_SAFETY: "false", EXPO_PUBLIC_OBFUSCATION_SAFETY: "false" }) }),
    console: Object.freeze({ log: () => {}, warn: () => {}, error: () => {} }),
  }, { codeGeneration: { strings: false, wasm: false } });
  new vm.Script(`{ const RealDate = Date; Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-10-24T00:00:00.000Z'])); }
    static now() { return 1792800000000; }
  }; }`).runInContext(context);
  const extractions: Record<string, string> = {};
  function evaluate<T>(code: string, scope: Record<string, unknown>, expression: string): T {
    const compiled = ts.transpileModule(code, { fileName: "offline.tsx", compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    } }).outputText;
    const run = new vm.Script(`(function(${Object.keys(scope).join(",")}) { ${compiled}\nreturn ${expression}; })`)
      .runInContext(context, { timeout: 1000 }) as (...args: unknown[]) => T;
    return run(...Object.values(scope));
  }
  function select<T = Record<string, unknown>>(file: string, names: string[], scope: Record<string, unknown> = {}, replaced: string[] = []): T {
    const code = declarationText(sources, file, names, replaced);
    extractions[`${file}:${names.join(",")}`] = sha(code);
    return evaluate<T>(code, { exports: {}, require: deny, ...scope }, `({${names.join(",")}})`);
  }
  function fn<T>(file: string, name: string, scope: Record<string, unknown>): T {
    const code = functionText(sources, file, name);
    extractions[`${file}:${name}`] = sha(code);
    return evaluate<T>(code, { exports: {}, require: deny, ...scope }, name);
  }
  const loaded = new Map<string, unknown>();
  function load<T = Record<string, unknown>>(file: string): T {
    if (!PURE_FILES.includes(file) || !sources[file]) return deny();
    if (!loaded.has(file)) {
      const module = { exports: {} };
      loaded.set(file, module.exports);
      evaluate(sources[file], { module, exports: module.exports, require: (specifier: string) => {
        if (specifier === "zod" && ["src/lib/dashboard/generation-input.ts", "src/lib/dashboard/generation-output.ts"].includes(file)) return { z };
        if (!specifier.startsWith(".")) return deny();
        const target = posix.normalize(posix.join(dirname(file), /\.(json|ts)$/.test(specifier) ? specifier : `${specifier}.ts`));
        return load(target);
      } }, "module.exports");
    }
    return loaded.get(file) as T;
  }
  return { deny, evaluate, select, fn, load, extractions,
    assertClean: () => { if (forbiddenAttempts) throw new Error("Offline attempted a forbidden capability (including swallowed errors)"); },
    capabilities: () => ({ forbiddenAttempts }) };
}
export type OfflineRuntime = ReturnType<typeof createOfflineRuntime>;

// Observations of the advertised schema, distinct from tolerant application parsers.
export function inspectSchema(raw: string, schema?: Schema): { json: unknown; issues: string[] | null } {
  function assert(s: Schema): void {
    const allowed = s.type === "OBJECT" ? ["type", "properties", "required"] :
      s.type === "ARRAY" ? ["type", "items"] : s.type === "STRING" ? ["type", "format", "enum"] : ["type"];
    if (! ["OBJECT", "ARRAY", "STRING", "NUMBER", "INTEGER", "BOOLEAN"].includes(String(s.type)) ||
        Object.keys(s).some(key => !allowed.includes(key)) || (s.format !== undefined && s.format !== "enum")) {
      throw new Error("Unsupported offline schema constraint");
    }
    if (s.type === "OBJECT") Object.values(s.properties as Record<string, Schema>).forEach(assert);
    if (s.type === "ARRAY") assert(s.items as Schema);
  }
  function check(value: unknown, s: Schema, path = "$"): string[] {
    if (s.type === "OBJECT") {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path}: expected object`];
      const row = value as Record<string, unknown>;
      return ((s.required ?? []) as string[]).filter(key => !(key in row)).map(key => `${path}.${key}: required`)
        .concat(Object.entries(s.properties as Record<string, Schema>).filter(([key]) => key in row)
          .flatMap(([key, child]) => check(row[key], child, `${path}.${key}`)));
    }
    if (s.type === "ARRAY") return Array.isArray(value) ? value.flatMap((v, i) => check(v, s.items as Schema, `${path}[${i}]`)) : [`${path}: expected array`];
    const kind = String(s.type).toLowerCase();
    if (kind === "integer" ? !Number.isInteger(value) : typeof value !== kind) return [`${path}: expected ${kind}`];
    if (kind === "number" && !Number.isFinite(value)) return [`${path}: expected finite number`];
    return Array.isArray(s.enum) && !s.enum.includes(value) ? [`${path}: outside enum`] : [];
  }
  if (schema) assert(schema);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return { json: null, issues: schema ? ["$: invalid JSON"] : null }; }
  return { json, issues: schema ? check(json, schema) : null };
}
