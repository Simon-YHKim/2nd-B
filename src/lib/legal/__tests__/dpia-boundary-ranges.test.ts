import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const file = "src/lib/llm/boundary.ts";
const source = ts.createSourceFile(file, fs.readFileSync(path.join(process.cwd(), file), "utf8"), ts.ScriptTarget.Latest, true);
const doc = fs.readFileSync(path.join(process.cwd(), "docs/legal/DPIA-2ndB-minors-draft.md"), "utf8");

function declaration(name: string): ts.FunctionDeclaration {
  const node = source.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!node) throw new Error(`missing_declaration:${name}`);
  return node;
}

function statement(fn: string, prefix: string): ts.Statement {
  const node = declaration(fn).body?.statements.find(n => n.getText(source).startsWith(prefix));
  if (!node) throw new Error(`missing_statement:${fn}:${prefix}`);
  return node;
}

const sections: [string, ts.Node, ts.Node?][] = [
  ["direct egress", declaration("assertDirectEgressAllowed")],
  ["C3 write", declaration("writeAiAuditLog")],
  ["proxy decision", declaration("inspectProxyCrisisRejection")],
  ["proxy decision and lane", declaration("inspectProxyCrisisRejection"), declaration("proxyCrisisSafetyResult")],
  ["record input", declaration("classifyRecordTextForCrisis")],
  ["crisis ledgers", declaration("routeCrisis")],
  ["C9 input", declaration("callLlm"), statement("callLlm", 'if (inputSafety.zone === "red")')],
  ["output swap", statement("callLlm", "const lexical ="), statement("callLlm", 'if (outputZone === "red")')],
  ["advisor", declaration("callAdvisor")],
  ["advisor input", statement("callAdvisor", "const safety ="), statement("callAdvisor", 'if (safety.zone === "red")')],
  ["advisor output", statement("callAdvisor", "const outputSafety ="), statement("callAdvisor", 'if (outputSafety.zone === "red")')],
];
// invokeProxy is nested inside the live edge branch rather than the function body.
let proxy: ts.VariableStatement | undefined;
function visit(node: ts.Node): void {
  if (ts.isVariableStatement(node) && node.getText(source).startsWith("const invokeProxy =")) proxy = node;
  ts.forEachChild(node, visit);
}
visit(declaration("callLlm"));
if (!proxy) throw new Error("missing_invokeProxy");
sections.push(["proxy dispatch", proxy]);

function citation(start: ts.Node, end = start): string {
  const first = source.getLineAndCharacterOfPosition(start.getStart(source)).line + 1;
  const last = source.getLineAndCharacterOfPosition(end.getEnd() - 1).line + 1;
  return `${file}:${first}-${last}`;
}

test.each(sections)("DPIA %s cites the exact code range, including its closing boundary", (_label, start, end = start) => {
  expect(doc).toContain(citation(start, end));
});

test("every repeated boundary citation uses a current range", () => {
  // One corrected occurrence must not hide an older copy elsewhere in the doc.
  const cited = [...new Set(doc.match(/src\/lib\/llm\/boundary\.ts:\d+-\d+/g))].sort();
  expect(cited).toEqual(sections.map(([, start, end = start]) => citation(start, end)).sort());
});
