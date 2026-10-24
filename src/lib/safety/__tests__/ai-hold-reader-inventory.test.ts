import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(__dirname, "../../../..");
const modelCalls = new Set(["callLlm", "embedTexts", "callAdvisor"]);
const optionReaders = new Map([
  ["exportUserWiki", "forAi"], ["listWikiPages", "aiOnly"], ["listSources", "aiOnly"],
]);
const flagReaders = new Set([
  "getSource", "getWikiPage", "getWikiPageById", "loadLatestBfi", "loadLatestIpip",
  "loadLatestMbti", "loadLatestAttachment", "loadPersonaSnapshot",
]);
const rawReaders = new Set([
  "listRecentRecords", "getRecord", "loadLatestValues", "loadLatestStrengths", "loadLatestMotivation",
  "loadSelfPortraitSignals", "loadPersonaRatifiableSignals",
]);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "__tests__" || entry.name === "node_modules") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /(?<!\.test|\.spec|\.d)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** A review tripwire, not whole-program dataflow proof. Inspect every read in
 * direct model/embedding modules, including UI reads that need named exceptions.
 * Imported aliases are resolved; adding an unfiltered call requires review. */
function unfilteredReads(path: string, text: string): string[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const aliases = new Map<string, string>();
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportSpecifier(node)) aliases.set(node.name.text, (node.propertyName ?? node.name).text);
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const name = (node: ts.CallExpression): string => {
    const expr = node.expression;
    const value = ts.isIdentifier(expr) ? expr.text : ts.isPropertyAccessExpression(expr) ? expr.name.text : "";
    return aliases.get(value) ?? value;
  };
  if (!calls.some(call => modelCalls.has(name(call)))) return [];
  const hasOption = (opts: ts.Expression | undefined, option: string): boolean => {
    if (!opts) return false;
    if (ts.isConditionalExpression(opts)) return hasOption(opts.whenTrue, option) && hasOption(opts.whenFalse, option);
    return ts.isObjectLiteralExpression(opts) && opts.properties.some(prop =>
      ts.isPropertyAssignment(prop) && prop.name.getText(source) === option && prop.initializer.kind === ts.SyntaxKind.TrueKeyword);
  };
  const out: string[] = [];
  for (const call of calls) {
    const reader = name(call);
    let unsafe = false;
    if (optionReaders.has(reader)) {
      unsafe = !hasOption(call.arguments[1], optionReaders.get(reader)!);
    } else if (flagReaders.has(reader)) {
      unsafe = call.arguments[2]?.kind !== ts.SyntaxKind.TrueKeyword;
    } else if (rawReaders.has(reader)) unsafe = true;
    else if (reader === "from" && call.arguments[0] && ts.isStringLiteral(call.arguments[0]) &&
      ["records", "sources", "wiki_pages"].includes(call.arguments[0].text)) {
      let chain: ts.Node = call;
      while (ts.isPropertyAccessExpression(chain.parent) || ts.isCallExpression(chain.parent)) chain = chain.parent;
      const query = chain.getText(source);
      unsafe = /\.select\(/.test(query) && !/\.(?:insert|upsert|update|delete)\(/.test(query) &&
        !/\.eq\(["']ai_hold["'],\s*false\)/.test(query);
    }
    if (!unsafe) continue;
    let owner = "module";
    for (let parent: ts.Node | undefined = call.parent; parent; parent = parent.parent) {
      if (ts.isFunctionDeclaration(parent) && parent.name) { owner = parent.name.text; break; }
      if (ts.isVariableDeclaration(parent) && parent.initializer &&
        (ts.isArrowFunction(parent.initializer) || ts.isCallExpression(parent.initializer))) {
        // Skip query/response local variables; retain only function/callback owners.
        if (ts.isArrowFunction(parent.initializer) || parent.initializer.expression.getText(source) === "useCallback") {
          owner = parent.name.getText(source); break;
        }
      }
    }
    out.push(`${path}::${owner}::${call.getText(source).replace(/\s+/g, " ")}`);
  }
  return out.sort();
}

test("new unfiltered corpus reads in model modules require a reviewed exception", () => {
  const actual = [...files(join(root, "src")), ...files(join(root, "supabase/functions"))]
    .flatMap(path => unfilteredReads(relative(root, path).replace(/\\/g, "/"), readFileSync(path, "utf8"))).sort();
  const reviewed = [
    // Screen selection and tag application, not prompt material. Promotion rechecks.
    "src/app/reasoning.tsx::ReasoningScreen::listRecentRecords(userId, 60)",
    "src/app/reasoning.tsx::applyReasoningProposal::getSource(userId, proposal.refId)",
    // Display-only BFI; synthesizeGap separately rereads with true (behavior test).
    "src/components/deep-space/DeepSpaceViews.tsx::SeenLensView::loadLatestBfi(getSupabaseClient(), userId)",
    // User result / ratification displays, never buildPersona's AI inputs.
    ...["loadLatestMotivation", "loadLatestStrengths", "loadLatestValues", "loadPersonaRatifiableSignals", "loadSelfPortraitSignals"]
      .map(owner => `src/lib/persona/build.ts::${owner}::supabase .from("records")`),
    ...["loadLatestAttachment", "loadLatestBfi", "loadLatestIpip"]
      .map(reader => `src/lib/persona/build.ts::loadPersonaRatifiableSignals::${reader}(supabase, userId)`),
    ...["loadLatestAttachment", "loadLatestMbti"]
      .map(reader => `src/lib/persona/build.ts::loadSelfPortraitSignals::${reader}(supabase, userId)`),
    // Shared loader forwards aiOnly; role-card caller and forwarding have contracts.
    ...["loadLatestAttachment", "loadLatestMbti"]
      .map(reader => `src/lib/persona/build.ts::loadPersonaSnapshot::${reader}(supabase, userId, aiOnly)`),
    "src/lib/persona/northstar.ts::fetchCurrentNorthstar::supabase .from(\"records\")", // saved user sentence
    // UI count/list, schema probe and idempotent save receipt; no prompt input.
    "src/lib/records/create.ts::countRecordsByKind::supabase .from(\"records\")",
    "src/lib/records/create.ts::listRecentRecords::supabase .from(\"records\")",
    "src/lib/records/create.ts::listRecentRecords::supabase .from(\"records\")", // column compatibility retry
    "src/lib/records/create.ts::probeSystemTagsColumn::supabase.from(\"records\")",
    "src/lib/records/create.ts::replayKeyedRecord::getSupabaseClient() .from(\"records\")",
  ].sort();
  expect(actual).toEqual(reviewed); // exact multiset: a duplicate new call also fails
});

test.each([
  'const row = await loadLatestBfi(db, uid); await callLlm({});',
  'const row = await listWikiPages(uid); await embedTexts({});',
  'const row = await db.from("records").select("body"); await callAdvisor({});',
  'import {callLlm as generate, getSource as read} from "fixture"; const row = await read(uid, id); await generate({});',
])("the inventory catches a newly added reader: %s", text => {
  expect(unfilteredReads("new.ts", text)).toHaveLength(1);
});

test("eligible readers and non-model user lists do not need an exception", () => {
  expect(unfilteredReads("new.ts", 'loadLatestBfi(db, uid, true); listWikiPages(uid, {aiOnly: true}); exportUserWiki(uid, {forAi: true}); callLlm({});')).toEqual([]);
  expect(unfilteredReads("screen.ts", 'listWikiPages(uid);')).toEqual([]);
});
