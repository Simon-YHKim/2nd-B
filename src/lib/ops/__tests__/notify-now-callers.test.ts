// notifyNow() needs the account as its first argument. Without it the function
// answers "error" and shows nothing (reminders.ts keeps that two-argument form
// only so an unknown caller fails closed). The focus timer called it without the
// account, so the end-of-session notification never appeared (Z107, 2026-10-13).
// This reads every source file that calls notifyNow and fails on a call that
// could not have named the account.

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

interface Call {
  file: string;
  line: number;
  args: number;
  first: string;
}

function notifyNowCalls(file: string, text: string): Call[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const calls: Call[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "notifyNow") {
      calls.push({
        file: path.relative(SRC, file).replace(/\\/g, "/"),
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        args: node.arguments.length,
        first: node.arguments[0]?.getText(source) ?? "",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

describe("every notifyNow caller names the account", () => {
  const calls = sourceFiles(SRC)
    .map((file) => [file, readFileSync(file, "utf8")] as const)
    .filter(([, text]) => text.includes("notifyNow("))
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
