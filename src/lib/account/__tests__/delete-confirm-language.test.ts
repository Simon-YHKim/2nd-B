import fs from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const file = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const source = fs.readFileSync(file, "utf8");
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = ast.statements.find((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpacePrivacyDesignScreen")!;
const statements = screen.body!.statements;
const declaration = (name: string) => statements.flatMap(node => ts.isVariableStatement(node)
  ? [...node.declarationList.declarations] : []).find(node => node.name.getText(ast) === name)!;
function evaluate(text: string, scope: Record<string, unknown>): unknown {
  return runInNewContext(ts.transpileModule(`(${text})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
}
function callback(name: string, scope: Record<string, unknown>) {
  const node = statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  return evaluate(node.getText(ast), scope) as () => Promise<void> | void;
}
const words = { en: "DELETE", ko: "삭제", es: "ELIMINAR", pt: "EXCLUIR", id: "HAPUS" } as const;
function harness(language: keyof typeof words, input = words[language] as string) {
  const common = JSON.parse(fs.readFileSync(`locales/${language}/common.json`, "utf8"));
  const pack = JSON.parse(fs.readFileSync(`locales/${language}/deepspace.json`, "utf8"));
  const word = evaluate(declaration("deleteConfirmWord").initializer!.getText(ast), {
    commonT: (key: string) => key.split(".").reduce((value, part) => value[part], common),
    deleteConfirmLanguage: language,
  });
  const state = { input, open: false };
  const owner = { current: null as string | null };
  const wordRef = { current: word };
  const capture = jest.fn(async () => { throw new Error("stop before destructive I/O"); });
  const scope = {
    userId: "fixture-owner", delConfirm: input, deleteConfirmWord: word,
    deleteConfirmWordRef: wordRef, deleteConfirmUserRef: owner,
    deleteInFlightRef: { current: false }, privacyMountedRef: { current: true },
    activeUserRef: { current: "fixture-owner" },
    setDelConfirm: (value: string) => { state.input = value; },
    setDeleteConfirmOpen: (value: boolean) => { state.open = value; },
    setDeleting: jest.fn(), setDelError: jest.fn(), captureSignOutExpectation: capture,
  };
  // Read the real rendered prompt expression, including its interpolation arg.
  let prompt = "";
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "t"
      && node.arguments[0]?.getText(ast) === '"privacy.deleteAccount.typePrompt"') prompt = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(screen);
  const displayed = evaluate(prompt, {
    deleteConfirmWord: word,
    t: (_key: string, vars: { phrase: string }) => pack.privacy.deleteAccount.typePrompt.replace("{{phrase}}", vars.phrase),
  });
  return { word, displayed, state, owner, wordRef, capture,
    request: callback("requestDeleteAccountConfirm", scope),
    run: callback("runDeleteAccount", scope),
    resetLanguage() {
      const statement = statements.find(node => ts.isExpressionStatement(node)
        && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useEffect"
        && node.getText(ast).includes("[deleteConfirmLanguage, deleteConfirmWord]")) as ts.ExpressionStatement;
      const call = statement.expression as ts.CallExpression;
      (evaluate(call.arguments[0].getText(ast), scope) as () => void)();
    },
  };
}

test.each(Object.keys(words) as (keyof typeof words)[])("%s displays and accepts the same deletion word", async language => {
  const h = harness(language);
  expect(h.word).toBe(words[language]);
  expect(h.displayed).toContain(`"${words[language]}"`);
  h.request();
  expect(h.state.open).toBe(true);
  await h.run();
  expect(h.capture).toHaveBeenCalledTimes(1);
});

test.each(Object.keys(words) as (keyof typeof words)[])("%s rejects every other language's word and incomplete input", async language => {
  for (const input of ["", " ", `${words[language]} `, words[language].slice(0, -1),
    ...Object.values(words).filter(word => word !== words[language])]) {
    const h = harness(language, input);
    h.request();
    expect(h.state.open).toBe(false);
    // Even bypassing the first modal gate cannot pass the final gate.
    h.owner.current = "fixture-owner";
    await h.run();
    expect(h.capture).not.toHaveBeenCalled();
  }
});

test("queued callbacks cannot accept the previous language before its reset effect runs", async () => {
  const h = harness("en");
  h.request();
  h.wordRef.current = words.ko;
  await h.run();
  expect(h.capture).not.toHaveBeenCalled();
  h.state.open = false;
  h.request();
  expect(h.state.open).toBe(false);
});

test("changing the rendered language clears the typed word and the open confirmation", () => {
  const h = harness("ko");
  h.request();
  h.resetLanguage();
  expect(h.state).toEqual({ input: "", open: false });
  expect(h.owner.current).toBeNull();
});
