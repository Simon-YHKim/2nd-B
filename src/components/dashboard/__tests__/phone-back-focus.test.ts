import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function focusedBackCallback(BackHandler: { addEventListener: (event: string, handler: () => boolean) => { remove: () => void } }, backInside: () => void, museumOpen = false, claimedBack: { current: Array<() => boolean> } = { current: [] }): () => (() => void) | undefined {
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
  return new Function("BackHandler", "backInside", "museumOpen", "claimedBack", js)(BackHandler, backInside, museumOpen, claimedBack) as () => (() => void) | undefined;
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

  blur?.();
  expect(handlers.size).toBe(0);
  const blurAgain = focus();
  expect(handlers.size).toBe(1);
  blurAgain?.();
  expect(handlers.size).toBe(0);

  // Museum owns its detail-sheet Back action while embedded in the phone.
  const museumFocus = focusedBackCallback(BackHandler, backInside, true);
  expect(museumFocus()).toBeUndefined();
  expect(handlers.size).toBe(0);
});

test("a hosted screen's claimed Back runs before the phone steps back", () => {
  // React runs child effects before parent effects, so a hosted screen's own
  // BackHandler listener would be older than the phone's and lose. Hosted
  // screens claim Back through the phone instead (useHardwareBack).
  const handlers: Array<() => boolean> = [];
  const BackHandler = {
    addEventListener: (_event: string, handler: () => boolean) => {
      handlers.push(handler);
      return { remove: () => { handlers.splice(handlers.indexOf(handler), 1); } };
    },
  };
  const backInside = jest.fn();
  const claimed = jest.fn(() => true);
  const declined = jest.fn(() => false);
  const claimedBack = { current: [declined, claimed] };
  const blur = focusedBackCallback(BackHandler, backInside, false, claimedBack)();
  expect(handlers[0]()).toBe(true);
  expect(claimed).toHaveBeenCalledTimes(1);
  expect(declined).not.toHaveBeenCalled();
  expect(backInside).not.toHaveBeenCalled();

  claimedBack.current = [declined];
  expect(handlers[0]()).toBe(true);
  expect(declined).toHaveBeenCalledTimes(1);
  expect(backInside).toHaveBeenCalledTimes(1);
  blur?.();
});
