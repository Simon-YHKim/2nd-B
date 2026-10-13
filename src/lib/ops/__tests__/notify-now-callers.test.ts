// notifyNow() needs the account as its first argument. On a runtime that can
// show notifications it answers "error" without it and shows nothing; the focus
// timer called it with only a title and a body, so the end-of-session
// notification never appeared (Z107, 2026-10-13).
//
// Two things keep that from coming back:
//  1. reminders.ts declares no form of notifyNow without the account, so a call
//     that cannot name it does not compile, whatever name it is imported or
//     re-exported under. The first test pins that declaration.
//  2. This file also reads every source file that mentions notifyNow and fails
//     on a call with fewer than three arguments: direct calls, calls through an
//     import alias, and calls as a property (reminders.notifyNow(...)).

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const SRC = path.resolve(__dirname, "../../..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

interface Call {
  file: string;
  line: number;
  args: number;
  first: string;
  via: string;
}

/** Every call that can reach notifyNow from this file: by its own name, by an import alias, or as a property. */
export function notifyNowCalls(file: string, text: string): Call[] {
  const source = parse(file, text);
  const names = new Set<string>(["notifyNow"]);
  const collectAliases = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node) && (node.propertyName?.text ?? node.name.text) === "notifyNow") names.add(node.name.text);
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(source);

  const calls: Call[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const direct = ts.isIdentifier(callee) && names.has(callee.text);
      const property = ts.isPropertyAccessExpression(callee) && callee.name.text === "notifyNow";
      if (direct || property) {
        calls.push({
          file: path.relative(SRC, file).replace(/\\/g, "/"),
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          args: node.arguments.length,
          first: node.arguments[0]?.getText(source) ?? "",
          via: callee.getText(source),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

describe("notifyNow has no form without the account", () => {
  const source = parse("reminders.ts", readFileSync(path.join(SRC, "lib/ops/reminders.ts"), "utf8"));
  const declarations: ts.FunctionDeclaration[] = [];
  ts.forEachChild(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "notifyNow") declarations.push(node);
  });
  const overloads = declarations.filter((declaration) => declaration.body === undefined);

  test("one declared form, and it takes the account, a title and a body", () => {
    expect(overloads).toHaveLength(1);
    const parameters = overloads[0]!.parameters;
    expect(parameters.map((parameter) => parameter.name.getText(source))).toEqual(["ownerId", "title", "body"]);
    // None of the three may be left out (not optional, no default, not a rest
    // parameter), so a two-argument call does not compile.
    expect(
      parameters.every(
        (parameter) =>
          parameter.questionToken === undefined && parameter.initializer === undefined && parameter.dotDotDotToken === undefined,
      ),
    ).toBe(true);
  });

  test("the running code still refuses a call without the account", () => {
    const body = declarations.find((declaration) => declaration.body !== undefined)!.body!.getText(source);
    expect(body).toContain('if (arguments.length < 3) return "error";');
  });
});

describe("the scan finds a call however it is written", () => {
  const found = (text: string) => notifyNowCalls(path.join(SRC, "sample.ts"), text).map((call) => [call.via, call.args]);

  test("direct, spaced, aliased and property calls", () => {
    expect(found('import { notifyNow } from "./reminders";\nnotifyNow("a", "b");')).toEqual([["notifyNow", 2]]);
    expect(found('import { notifyNow } from "./reminders";\nnotifyNow ("a", "b", "c");')).toEqual([["notifyNow", 3]]);
    expect(found('import { notifyNow as fireNow } from "./reminders";\nvoid fireNow("a", "b");')).toEqual([["fireNow", 2]]);
    expect(found('import * as reminders from "./reminders";\nvoid reminders.notifyNow("a");')).toEqual([["reminders.notifyNow", 1]]);
  });

  test("a different function with a similar name is not counted", () => {
    expect(found('function notifyNowLater() {}\nnotifyNowLater();\nconst x = { notifyNowish() {} };\nx.notifyNowish();')).toEqual([]);
  });
});

describe("every notifyNow caller names the account", () => {
  const calls = sourceFiles(SRC)
    .map((file) => [file, readFileSync(file, "utf8")] as const)
    .filter(([, text]) => text.includes("notifyNow"))
    .flatMap(([file, text]) => notifyNowCalls(file, text));

  test("the scan sees the focus timer's call (so an empty result is not a pass)", () => {
    expect(calls.map((call) => call.file)).toContain("screens/deepspace/DeepSpaceDesignScreens.tsx");
  });

  test("no call passes fewer than three arguments", () => {
    expect(calls.filter((call) => call.args < 3)).toEqual([]);
  });

  test("the focus timer passes the signed-in account first, not a title", () => {
    const focus = calls.filter((call) => call.file === "screens/deepspace/DeepSpaceDesignScreens.tsx");
    expect(focus).toHaveLength(1);
    expect(focus[0]!.first).toBe("userId");
  });
});
