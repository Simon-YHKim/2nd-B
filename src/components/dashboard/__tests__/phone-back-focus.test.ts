import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function focusedBackCallback(BackHandler: { addEventListener: (event: string, handler: () => boolean) => { remove: () => void } }, backInside: () => void): () => () => void {
  const file = join(__dirname, "..", "DashboardPhone.tsx");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hasBackRegistration = (node: ts.Node): boolean => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "BackHandler.addEventListener") return true;
    return ts.forEachChild(node, hasBackRegistration) ?? false;
  };
  let callback: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useFocusEffect" && hasBackRegistration(node)) {
      const wrapper = node.arguments[0];
      if (ts.isCallExpression(wrapper) && wrapper.expression.getText(source) === "useCallback") callback = wrapper.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!callback) throw new Error("Android back registration must be owned by useFocusEffect");
  const js = ts.transpileModule(`const focus = ${callback.getText(source)}; return focus;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("BackHandler", "backInside", js)(BackHandler, backInside) as () => () => void;
}

test("Android back is handled only while the phone screen has focus", () => {
  const handlers = new Set<() => boolean>();
  const backInside = jest.fn();
  const BackHandler = {
    addEventListener: jest.fn((_event: string, handler: () => boolean) => {
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    }),
  };
  const focus = focusedBackCallback(BackHandler, backInside);

  const blur = focus();
  expect(BackHandler.addEventListener).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
  expect(handlers.size).toBe(1);
  expect([...handlers][0]()).toBe(true);
  expect(backInside).toHaveBeenCalledTimes(1);

  blur();
  expect(handlers.size).toBe(0);
  const blurAgain = focus();
  expect(handlers.size).toBe(1);
  blurAgain();
  expect(handlers.size).toBe(0);
});
