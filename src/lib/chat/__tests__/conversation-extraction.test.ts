import { transformSync } from "@babel/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const filename = resolve("src/lib/chat/conversation.ts");
const source = readFileSync(filename, "utf8").replace(/\r\n/g, "\n");
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const body = (name: string) => {
  const found = ast.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  expect(found).toHaveLength(1);
  return found[0].body!;
};
const declarations = (node: ts.Block) => node.statements.flatMap(statement =>
  ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(declaration => declaration.name.getText(ast)) : []);

test("context keeps four sequential reader awaits and the original stage fences", () => {
  const context = body("loadChatContext");
  expect(declarations(context)).toEqual(["stage", "structuredBlock", "profileLines", "ragBlock", "snapshot"]);
  const waits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isAwaitExpression(node)) {
      expect(ts.isCallExpression(node.expression)).toBe(true);
      const call = node.expression as ts.CallExpression;
      expect(call.expression.getText(ast)).toBe("stage");
      const readers = ["loadStructuredContext", "loadProfileContext", "retrieveChatContext", "exportUserWiki"];
      waits.push(...readers.filter(name => call.getText(ast).includes(`${name}(`)));
    }
    ts.forEachChild(node, visit);
  };
  visit(context);
  expect(waits).toEqual(["loadStructuredContext", "loadProfileContext", "retrieveChatContext", "exportUserWiki"]);
  expect(context.statements.at(-1)?.getText(ast)).toBe("return { structuredBlock, profileLines, ragBlock, snapshot };");
});

test("prompt assembly stays synchronous with the original construction order", () => {
  const prompt = body("assembleChatSystemPrompt");
  expect(declarations(prompt)).toEqual([
    "{ structuredBlock, profileLines, ragBlock, snapshot }", "personaLine", "modeLine",
    "fencedProfile", "fencedRag", "fencedSnapshot", "fencedStructured", "historyTurns",
    "fencedHistory", "safeName", "addressLine", "guardLine", "system",
  ]);
  const calls = new Set<string>();
  const visit = (node: ts.Node): void => {
    expect(ts.isAwaitExpression(node)).toBe(false);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(prompt);
  expect([...calls].sort()).toEqual([
    "chatTurnToneLine", "classifyInput", "crisisNumberRule", "promptSafeName", "sanitizeUntrusted",
  ]);
  expect(prompt.statements.every(node => ts.isVariableStatement(node) || ts.isReturnStatement(node))).toBe(true);
  expect(prompt.statements.at(-1)?.getText(ast)).toBe("return system;");
});

// Jest's TypeScript transform alone does not cover the Metro release transform.
test.each(["web", "android"])("extracted chat functions compile with the release %s Babel config", platform => {
  const caller = { name: "metro", platform, isDev: false };
  const result = transformSync(source, {
    filename, configFile: resolve("babel.config.js"), babelrc: false,
    caller,
  });
  expect(result?.code).toContain("loadChatContext");
  expect(result?.code).toContain("assembleChatSystemPrompt");
});
