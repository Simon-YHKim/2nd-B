// AG-01 (gate review on PR #2040): /attachment and /ipip-neo got a sign-in gate in
// W-02, but the account's state still lived in the gated component itself. Their
// effect cancelled A's late load on an owner change and nothing more, so on A -> B
// (another tab signing in, or a session refresh that finds B):
//   - A's result stayed on screen until B's load came back, and
//   - with `taking` on, the survey stayed mounted with A's answers and saved them
//     under B (the survey writes with whatever owner useAuth reports at submit).
// The fix follows the W-13 routes: the gate decides auth only, and everything that
// belongs to one account lives in a session child keyed by its owner, so React
// remounts it per account.
//
// Rendering React Native is blocked in this repo. Like deletion-receipt-published,
// this lifts the REAL gate declaration out of the route file with the TypeScript
// AST, compiles it, and runs it with an inert context. The element it returns IS
// the behaviour: a loading shell, a redirect, or the session keyed by its owner.
import { readFileSync } from "fs";
import { join } from "path";
import * as ts from "typescript";
import React from "react";

const APP = join(__dirname, "..");

type Auth = { userId: string | null; loading: boolean };
type Gate = () => React.ReactElement | null;

const SCREENS = [
  { file: "attachment.tsx", gate: "AttachmentDeepSpace", session: "AttachmentDeepSpaceSession" },
  { file: "ipip-neo.tsx", gate: "IpipNeoDeepSpace", session: "IpipNeoDeepSpaceSession" },
] as const;

// Hooks that hold or derive per-account state. The gate may read auth, the
// router and translations; it may not own any of these.
const STATE_HOOKS = new Set([
  "useState",
  "useReducer",
  "useRef",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
]);

function parse(file: string): { ast: ts.SourceFile; fns: Map<string, ts.FunctionDeclaration> } {
  const source = readFileSync(join(APP, file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fns = new Map<string, ts.FunctionDeclaration>();
  for (const s of ast.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) fns.set(s.name.text, s);
  }
  return { ast, fns };
}

function declaration(file: string, name: string): { ast: ts.SourceFile; fn: ts.FunctionDeclaration } {
  const { ast, fns } = parse(file);
  const fn = fns.get(name);
  if (!fn) throw new Error(`${file}: no top-level function ${name}`);
  return { ast, fn };
}

/** Names of every function called anywhere in the declaration's body. */
function calledNames(fn: ts.FunctionDeclaration): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) names.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  if (fn.body) visit(fn.body);
  return names;
}

/** `const [name, …] = useState(…)` directly in the body. */
function declaresState(fn: ts.FunctionDeclaration, name: string): boolean {
  return (fn.body?.statements ?? []).some(
    (s) =>
      ts.isVariableStatement(s) &&
      s.declarationList.declarations.some((d) => {
        if (!ts.isArrayBindingPattern(d.name)) return false;
        const first = d.name.elements[0];
        if (first === undefined || !ts.isBindingElement(first) || !ts.isIdentifier(first.name)) return false;
        const init = d.initializer;
        return (
          first.name.text === name &&
          init !== undefined &&
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          init.expression.text === "useState"
        );
      }),
  );
}

function stub(name: string): () => null {
  const f = () => null;
  Object.defineProperty(f, "name", { value: name });
  return f;
}

/** The real gate, compiled from the route file, wired to an inert context. */
function gate(file: string, gateName: string, sessionName: string, auth: () => Auth): Gate {
  const { ast, fn } = declaration(file, gateName);
  const js = ts.transpileModule(fn.getText(ast), {
    fileName: "gate.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  const context: Record<string, unknown> = {
    React,
    useAuth: auth,
    useAppRouter: () => ({ back: () => undefined, push: () => undefined }),
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
    Redirect: stub("Redirect"),
    DeepSpaceScreen: stub("DeepSpaceScreen"),
    View: stub("View"),
    PremiumLoadingState: stub("PremiumLoadingState"),
    styles: { center: {} },
    [sessionName]: stub(sessionName),
  };
  return new Function(...Object.keys(context), `${js}\nreturn ${gateName};`)(...Object.values(context)) as Gate;
}

function typeName(element: React.ReactElement | null): string | null {
  if (!element) return null;
  const type = element.type as { name?: string } | string;
  return typeof type === "string" ? type : type.name ?? null;
}

describe.each(SCREENS)("$file keeps one account's lens out of the next", ({ file, gate: gateName, session }) => {
  let auth: Auth = { userId: null, loading: true };
  const run = () => gate(file, gateName, session, () => auth)();

  test("waits for auth without mounting the session", () => {
    auth = { userId: null, loading: true };
    const element = run();
    expect(typeName(element)).toBe("DeepSpaceScreen");
  });

  test("sends a signed-out visitor to /sign-in", () => {
    auth = { userId: null, loading: false };
    const element = run();
    expect(typeName(element)).toBe("Redirect");
    expect((element?.props as { href?: string }).href).toBe("/sign-in");
  });

  test(`mounts ${session} keyed by its owner, so A -> B remounts it`, () => {
    auth = { userId: "owner-a", loading: false };
    const a = run();
    auth = { userId: "owner-b", loading: false };
    const b = run();
    expect(typeName(a)).toBe(session);
    expect(typeName(b)).toBe(session);
    expect(a?.key).toBe("owner-a");
    expect(b?.key).toBe("owner-b");
    // The session is handed its owner instead of asking auth again.
    expect((a?.props as { userId?: string }).userId).toBe("owner-a");
    expect((b?.props as { userId?: string }).userId).toBe("owner-b");
  });

  test("the gate owns no per-account state", () => {
    const { fn } = declaration(file, gateName);
    const owned = [...calledNames(fn)].filter((name) => STATE_HOOKS.has(name));
    expect(owned).toEqual([]);
  });

  test("the session holds the result and the survey switch, and never reads auth itself", () => {
    const { fn } = declaration(file, session);
    expect({ result: declaresState(fn, "result"), taking: declaresState(fn, "taking") })
      .toEqual({ result: true, taking: true });
    // Reading useAuth here would let it observe a second owner without a remount.
    expect(calledNames(fn).has("useAuth")).toBe(false);
  });
});
