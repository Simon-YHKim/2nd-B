// Read-only evidence for docs/qa/S3-WRITER-INVENTORY-261001.md.
// This inventories call shapes, not effective SQL permissions or deletion safety.
// No imports from application code, database connection, mutation or output file.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as ts from "typescript";
import type { Registry } from "./generate-erasure-registry";

type Location = { file: string; line: number };
type Origin = { table: string | null; argument: string; receiver: string };
type Writer = Location & Origin & { method: string };
type UnresolvedCall = Location & { method: string; expression: string };
type Rpc = Location & { name: string | null; argument: string };
type RegistryWithForwards = Registry & {
  forwardAdditions: Record<string, string[]>;
  forwardRevisions: Record<string, Record<string, unknown>>;
};

function selected(file: string): boolean {
  const code = /^(src|supabase\/functions)\//.test(file)
    && /\.[cm]?[jt]sx?$/.test(file)
    && !/\/(__tests__|fixtures)\/|\.(test|spec)\./.test(file);
  return code || /^db\/migrations\/.*\.sql$/.test(file) || file === "db/erasure-registry.json";
}

function snapshot(ref: string) {
  const options = { maxBuffer: 64 * 1024 * 1024 };
  const head = execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], options).toString().trim();
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error("Expected one Git commit");
  const paths = execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", head], options)
    .toString().split("\0").filter(selected).sort();
  if (paths.some(file => /[\r\n]/.test(file))) throw new Error("Unsupported newline in a source path");
  const data = execFileSync("git", ["cat-file", "--batch"], {
    ...options, input: paths.map(file => `${head}:${file}\n`).join(""),
  });
  const files = new Map<string, string>();
  let offset = 0;
  for (const file of paths) {
    const end = data.indexOf(10, offset);
    const header = data.subarray(offset, end).toString().match(/^[a-f0-9]+ blob (\d+)$/);
    if (!header) throw new Error(`Cannot read ${file} from ${head}`);
    const size = Number(header[1]);
    offset = end + 1;
    files.set(file, data.subarray(offset, offset + size).toString());
    offset += size + 1;
  }
  return { head, files };
}

export function inventory(ref: string) {
  const { head, files } = snapshot(ref);
  const registry = JSON.parse(files.get("db/erasure-registry.json")!) as RegistryWithForwards;
  const codeFiles = [...files.keys()].filter(file => /\.[cm]?[jt]sx?$/.test(file));
  // A virtual, no-resolve program binds same-file identifiers to their actual
  // declarations. A coincidentally named variable in another scope is not a match.
  // Imported constants and interprocedural aliases remain unresolved.
  const prefix = "/inventory/";
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, types: [], allowJs: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => prefix;
  host.fileExists = file => files.has(file.slice(prefix.length));
  host.readFile = file => files.get(file.slice(prefix.length));
  host.getSourceFile = (file, version) => {
    const text = host.readFile(file);
    return text === undefined ? undefined : ts.createSourceFile(file, text, version, true);
  };
  const program = ts.createProgram(codeFiles.map(file => prefix + file), options, host);
  const checker = program.getTypeChecker();
  const direct: Writer[] = [], storage: Writer[] = [], rpc: Rpc[] = [];
  const unresolvedMutations: UnresolvedCall[] = [], unresolvedTransfers: UnresolvedCall[] = [];
  const signedUploadMatches: (Location & { text: string })[] = [];

  function unwrap(node: ts.Node): ts.Node {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
    return node;
  }
  function initializer(node: ts.Identifier, seen: Set<ts.Symbol>): ts.Expression | undefined {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || seen.has(symbol)) return undefined;
    seen.add(symbol);
    const declarations = symbol.declarations;
    if (declarations?.length !== 1) return undefined;
    const declaration = declarations[0];
    if (declaration.getSourceFile() !== node.getSourceFile()) return undefined;
    return ts.isVariableDeclaration(declaration)
      && ts.isVariableDeclarationList(declaration.parent)
      && (declaration.parent.flags & ts.NodeFlags.Const) !== 0
      ? declaration.initializer : undefined;
  }
  function literal(input?: ts.Node, seen = new Set<ts.Symbol>()): string | null {
    if (!input) return null;
    const node = unwrap(input);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    return ts.isIdentifier(node) ? literal(initializer(node, seen), seen) : null;
  }
  function origin(input: ts.Node | undefined, source: ts.SourceFile, seen = new Set<ts.Symbol>()): Origin | null {
    if (!input) return null;
    const node = unwrap(input);
    if (ts.isIdentifier(node)) return origin(initializer(node, seen), source, seen);
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
    if (node.expression.name.text === "from") return {
      table: literal(node.arguments[0]), argument: node.arguments[0]?.getText(source) ?? "",
      receiver: node.expression.expression.getText(source),
    };
    return origin(node.expression.expression, source, seen);
  }

  for (const file of codeFiles) {
    const source = program.getSourceFile(prefix + file)!;
    if (program.getSyntacticDiagnostics(source).length) throw new Error(`Unparsed source: ${file}`);
    const location = (node: ts.Node): Location => ({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const mutation = ["insert", "upsert", "update"].includes(method);
        const transfer = ["upload", "uploadToSignedUrl", "createSignedUploadUrl", "createSignedUploadUrls", "move", "copy"].includes(method);
        if (mutation || transfer) {
          const from = origin(node.expression.expression, source);
          const unresolved = { ...location(node), method, expression: node.expression.getText(source) };
          if (from?.receiver.endsWith(".storage")) storage.push({ ...location(node), method, ...from });
          else if (mutation && from) direct.push({ ...location(node), method, ...from });
          else (mutation ? unresolvedMutations : unresolvedTransfers).push(unresolved);
        }
        if (method === "rpc") rpc.push({ ...location(node), name: literal(node.arguments[0]), argument: node.arguments[0]?.getText(source) ?? "" });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    files.get(file)!.split("\n").forEach((line, index) => {
      if (/createSignedUploadUrl|uploadToSignedUrl|\/object\/upload\/sign/.test(line)) signedUploadMatches.push({ file, line: index + 1, text: line.trim() });
    });
  }

  const tableRows = Object.entries(registry.tables).sort(([a], [b]) => a.localeCompare(b)).map(([table, entry]) => ({
    table, ...entry, directWriters: direct.filter(call => call.table === table),
  }));
  const additions = Object.values(registry.forwardAdditions).flat();
  const byClass = tableRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.class] = (counts[row.class] ?? 0) + 1; return counts;
  }, {});
  return {
    head,
    sourceDigest: createHash("sha256").update(JSON.stringify([...files])).digest("hex"),
    scope: { codeFiles: codeFiles.length, migrationFiles: [...files.keys()].filter(file => file.endsWith(".sql")).length },
    limits: [
      "Call shapes and same-file const bindings only; no effective SQL/ACL/RLS or server function traversal.",
      "SQL files are counted and hashed, not parsed. RPCs include reads and writes; dynamic names remain unresolved.",
      "Computed member access, imported/parameter/mutable aliases, native/scripts/external/old clients are outside the model.",
      "No Storage request or database connection. Zero matches and success do not prove deletion safety.",
    ],
    registry: {
      tables: tableRows.length, classes: byClass,
      forwardFiles: Object.keys(registry.forwardAdditions).length,
      forwardDeclaredRows: additions.length, uniqueForwardDeclaredRows: new Set(additions).size,
      revisionFiles: Object.keys(registry.forwardRevisions).length,
      revisionEntries: Object.values(registry.forwardRevisions).reduce((sum, rows) => sum + Object.keys(rows).length, 0),
      forwardAdditions: registry.forwardAdditions,
    },
    counts: {
      directCalls: direct.length, directNamedTables: new Set(direct.map(call => call.table).filter(Boolean)).size,
      registryDirectTables: tableRows.filter(row => row.directWriters.length > 0).length,
      unresolvedDirectTableNames: direct.filter(call => call.table === null).length,
      unresolvedMutationMethods: unresolvedMutations.length, unresolvedTransferMethods: unresolvedTransfers.length,
      storageCalls: storage.length, rpcCalls: rpc.length,
      namedRpcs: new Set(rpc.map(call => call.name).filter(Boolean)).size,
      unresolvedRpcNames: rpc.filter(call => call.name === null).length,
      signedUploadMatches: signedUploadMatches.length,
    },
    tableRows, otherDirectCalls: direct.filter(call => call.table === null || !registry.tables[call.table]),
    unresolvedMutations, unresolvedTransfers, storage, rpc, signedUploadMatches,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--ref") {
    console.error("usage: npx tsx scripts/inventory-s3-writers.ts --ref <commit>");
    process.exitCode = 64;
  } else {
    console.log(JSON.stringify(inventory(args[1]), null, 2));
  }
}
