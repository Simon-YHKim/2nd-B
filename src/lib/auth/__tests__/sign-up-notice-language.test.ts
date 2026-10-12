import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clearSignUpFailure, type SignUpToast } from "../sign-up-notice";
import { renderedUiLanguage } from "../../i18n/ui-language";

const file = "src/lib/auth/useSignUpForm.ts";
const source = readFileSync(file, "utf8");
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const hook = ast.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === "useSignUpForm")!;
const call = hook.body!.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) &&
  n.expression.expression.getText(ast) === "useEffect" && n.getText(ast).includes("noticeLanguage"))!;
const language = hook.body!.statements.find(n => ts.isVariableStatement(n) && n.getText(ast).includes("const noticeLanguage ="))!;
const code = ts.transpileModule(language.getText(ast) + "\n" + call.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

// Execute the actual effect AND its dependency array. A locale collapsed to
// ko/en or an empty dependency array cannot pass a non-Korean language switch.
function harness(language = "ko", packReady = true) {
  let toast: SignUpToast | null = null;
  let previous: unknown[] | undefined;
  const i18n = { language, hasResourceBundle: (lng: string) => lng === "en" || packReady };
  const render = () => runInNewContext(code, {
    i18n, clearSignUpFailure, renderedUiLanguage,
    setToast: (update: (value: SignUpToast | null) => SignUpToast | null) => { toast = update(toast); },
    useEffect: (effect: () => void, deps: unknown[]) => {
      if (!previous || deps.some((value, index) => !Object.is(value, previous![index]))) effect();
      previous = deps;
    },
  });
  render();
  return { i18n, render, packArrived: () => { packReady = true; }, set: (value: SignUpToast) => { toast = value; }, get: () => toast };
}

test.each([["ko", "en"], ["en", "ko"], ["en", "es"], ["es", "pt"], ["pt", "id"]])(
  "sign-up persistent failure clears on %s -> %s", (from, to) => {
    const h = harness(from);
    h.set({ tone: "danger", message: `${from}:errors.signUpFailed` });
    h.i18n.language = to; h.render();
    expect(h.get()).toBeNull();
  },
);

test("ordinary rerenders do not clear a failure in the same language", () => {
  const h = harness(); const notice: SignUpToast = { tone: "danger", message: "ko:errors.signUpFailed" };
  h.set(notice); h.render(); h.render(); expect(h.get()).toBe(notice);
});

test.each(["success", "info"] as const)("language change preserves existing %s lifetime", tone => {
  const h = harness(); const notice: SignUpToast = { tone, message: "existing" };
  h.set(notice); h.i18n.language = "en"; h.render();
  expect(h.get()).toBe(notice);
});

test("a late locale pack clears the fallback-language failure when the UI language changes", () => {
  const h = harness("pt", false); const notice: SignUpToast = { tone: "danger", message: "en:errors.signUpFailed" };
  h.set(notice); h.render(); expect(h.get()).toBe(notice);
  h.packArrived(); h.render(); expect(h.get()).toBeNull();
});
