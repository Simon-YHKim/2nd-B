import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Run the actual deferred-close hook using inert state/effect hosts. This
// guards navigation timing without importing native, storage or cue modules.
function host() {
  const source = readFileSync(resolve(__dirname, "../../ui/useModalExit.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  let focused = true;
  let closing = false;
  const pending = { current: null as null | (() => void) };
  const active = { current: true };
  let refIndex = 0;
  let effect: (() => void) | undefined;
  const hooks = {
    useState: () => [closing, (value: boolean) => { closing = value; }],
    useRef: () => refIndex++ === 0 ? pending : active,
    useCallback: (fn: unknown) => fn,
    useLayoutEffect: (fn: () => void) => { effect = fn; },
  };
  type Exit = { closing: boolean; requestClose: (callback: () => void) => void; completeClose: () => void };
  const exported: { useModalExit?: () => Exit } = {};
  new Function("require", "exports", js)((name: string) => {
    if (name === "react") return hooks;
    if (name === "expo-router") return { useIsFocused: () => focused };
    throw new Error(name);
  }, exported);
  const render = () => { refIndex = 0; const result = exported.useModalExit!(); effect?.(); return result; };
  return { render, blur: () => { focused = false; render(); }, focus: () => { focused = true; return render(); } };
}

test("quant completion navigates only after exit, once even after repeated close", () => {
  const h = host(); const next = jest.fn(); const duplicate = jest.fn();
  h.render().requestClose(next); h.render().requestClose(duplicate);
  expect(h.render().closing).toBe(true); expect(next).not.toHaveBeenCalled();
  h.render().completeClose(); h.render().completeClose();
  expect(next).toHaveBeenCalledTimes(1); expect(duplicate).not.toHaveBeenCalled();
});

test("blur cancels pending navigation and returning to the screen can close again", () => {
  const h = host(); const stale = jest.fn(); const next = jest.fn();
  h.render().requestClose(stale); h.blur(); h.render().completeClose();
  expect(stale).not.toHaveBeenCalled(); expect(h.focus().closing).toBe(false);
  h.render().requestClose(next); h.render().completeClose(); expect(next).toHaveBeenCalledTimes(1);
});

test.each(["QuantIntroModal.tsx", "QuantSaveCelebration.tsx"])("%s hands delayed navigation to native modal exit", file => {
  const source = readFileSync(resolve(__dirname, "..", file), "utf8");
  expect(source).toContain("useModalExit()");
  expect(source).toContain("onExitComplete={completeClose}");
  expect(source).toContain("!closing");
  expect(source).not.toContain("onPress={onCancel}");
});
