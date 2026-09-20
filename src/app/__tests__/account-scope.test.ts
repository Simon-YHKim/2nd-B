import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../..");
const AUTH = readFileSync(resolve(ROOT, "src/lib/auth/AuthContext.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const LAYOUT = readFileSync(resolve(ROOT, "src/app/_layout.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("root account scene boundary wiring", () => {
  test("every resolved AuthContext publication notes its owner; storage loss stays unresolved", () => {
    const publications = AUTH.match(/\bsetState\s*\(/g) ?? [];
    const notes = AUTH.match(/\bnoteResolvedOwner\s*\(/g) ?? [];
    // 13 after encrypted-storage recovery: detection adds one deliberately
    // unresolved masked publication; consented reset and a synchronous client-
    // construction failure add two resolved owner-null publications. The other
    // 10 predate this recovery gate.
    // 10 since callback quarantine reconciliation (2026-09-13), not 9: an
    // explicit refresh retry can now publish the same unavailable boundary
    // while its durable callback tuple remains locked. AUTH-01's
    // publishSessionUnavailable() likewise ends an
    // ordinary startup whose session lookup never answered. It is a real state
    // publication, so it carries its own synchronous noteResolvedOwner(null)
    // immediately before setState — which is exactly the invariant this test
    // exists to hold, and why the second assertion (equal counts) is the load-
    // bearing one. The count was raised only after adding the matching note.
    expect(publications).toHaveLength(13);
    expect(notes).toHaveLength(publications.length - 1);

    const storageLockStart = AUTH.indexOf("const markStorageRecoveryRequired = useCallback");
    const storageLockEnd = AUTH.indexOf("useEffect(() => subscribeRecoveryPending", storageLockStart);
    const storageLock = AUTH.slice(storageLockStart, storageLockEnd);
    expect(storageLock).toContain("setState({");
    expect(storageLock).not.toContain("noteResolvedOwner(");

    const consentStart = AUTH.indexOf("const recoverEncryptedStorage = useCallback");
    const consentEnd = AUTH.indexOf("const value = useMemo", consentStart);
    const consentReset = AUTH.slice(consentStart, consentEnd);
    expect(consentReset.indexOf("noteResolvedOwner(null);")).toBeGreaterThan(-1);
    expect(consentReset.indexOf("noteResolvedOwner(null);")).toBeLessThan(
      consentReset.indexOf("setState({"),
    );

    const earlyProbe = AUTH.indexOf(
      "setState({ userId, hasProfile: null, isMinor: null, age: null",
    );
    expect(AUTH.lastIndexOf("noteResolvedOwner(userId);", earlyProbe)).toBeGreaterThan(-1);
    expect(AUTH.lastIndexOf("noteResolvedOwner(userId);", earlyProbe)).toBeLessThan(earlyProbe);

    const refreshGuard = AUTH.lastIndexOf("if (gen !== probeGenRef.current) return;");
    const refreshNote = AUTH.indexOf("noteResolvedOwner(uid);", refreshGuard);
    const refreshPublish = AUTH.indexOf("setState({", refreshNote);
    expect(refreshGuard).toBeLessThan(refreshNote);
    expect(refreshNote).toBeLessThan(refreshPublish);
  });

  test("a changed auth owner hides the product tree before notification cleanup awaits", () => {
    const resolveStart = AUTH.indexOf("async function resolveSession");
    const resolveEnd = AUTH.indexOf("type QueuedAuthEvent", resolveStart);
    const resolveBody = AUTH.slice(resolveStart, resolveEnd);
    const begin = resolveBody.indexOf("beginAccountOwnerTransition(userId);");
    const cleanupAwait = resolveBody.indexOf("await accountNotificationGateRef.current!.prepare(");

    expect(begin).toBeGreaterThan(-1);
    expect(cleanupAwait).toBeGreaterThan(begin);
  });

  test("screenLayout holds product children but exempts the auth group", () => {
    expect(LAYOUT).toContain("screenLayout={({ children: screen, route }) => (");
    expect(LAYOUT).toContain('<AccountScope routeName={route.name}>{screen}</AccountScope>');
    expect(LAYOUT).toContain('if (routeName === "(auth)") return <>{children}</>;');
    expect(LAYOUT).toContain("if (pending) return null;");
    expect(LAYOUT).toContain("key={epoch}");
    expect(LAYOUT).toContain("accountTransitionSnapshot");
    expect(LAYOUT).toContain("accountEpochFromSnapshot(transitionSnapshot)");
    expect(LAYOUT).not.toMatch(/<Stack[^>]*\skey=/);
  });

  test("sentinel-proven storage loss replaces every route before the bootstrap loader", () => {
    const storageGate = LAYOUT.indexOf(
      "if (storageRecoveryRequired) return <EncryptedStorageRecoveryGate />;",
    );
    const bootstrapLoader = LAYOUT.indexOf("if (!recoveryReady) return <InlineLoader />;");
    expect(storageGate).toBeGreaterThan(-1);
    expect(storageGate).toBeLessThan(bootstrapLoader);
  });

  test("navigation dispatch and transition release occur in separate proof branches", () => {
    const resolver = LAYOUT.slice(LAYOUT.indexOf("function PendingAccountTransitionResolver"));
    const proofBranch = resolver.indexOf("shouldReleaseAccountTransition(segments, rootState)");
    const clear = resolver.indexOf("clearAccountTransition(epoch);", proofBranch);
    const dismiss = resolver.indexOf("router.dismissAll();");
    const replace = resolver.indexOf('router.replace("/");');
    expect(proofBranch).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(proofBranch);
    expect(dismiss).toBeGreaterThan(clear);
    expect(replace).toBeGreaterThan(dismiss);
    expect(resolver.slice(dismiss, replace)).not.toContain("clearAccountTransition");
    expect(resolver).toContain("ACCOUNT_RESET_RETRY_RENDER_PASSES");
    expect(resolver).toContain("ACCOUNT_RESET_MAX_ATTEMPTS");
    expect(resolver).toContain("setResetPass((pass) => pass + 1)");
  });
});

// ---------------------------------------------------------------------------
// The boundary is a DEFAULT, and a default is something a route can opt out of.
//
// `screenLayout` on the navigator is what puts every product scene inside
// <AccountScope>. expo-router resolves a scene's wrapper as
//
//     screen.layout ?? config.layout ?? screenLayout
//
// so ONE `<Stack.Screen name="secondb" layout={...} />`, or one
// `<Stack.Group screenLayout={...}>`, takes that route out of the account
// boundary - and every assertion in the test above still passes, because they
// read the navigator's own props and never look at the routes.
//
// That is the hole this block closes. It checks the route tree itself, and it
// executes the real resolver expression out of the installed expo-router so the
// premise ("an override really would win") is measured rather than asserted.
// ---------------------------------------------------------------------------

const LAYOUT_AST = ts.createSourceFile(
  "src/app/_layout.tsx",
  LAYOUT,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function jsxElements(): JsxTag[] {
  const found: JsxTag[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) found.push(node);
    node.forEachChild(walk);
  };
  walk(LAYOUT_AST);
  return found;
}

const tagOf = (el: JsxTag): string => el.tagName.getText(LAYOUT_AST);

function attribute(el: JsxTag, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(LAYOUT_AST) === name,
  );
}

/** `name="secondb"` -> `secondb`; anything else -> the raw tag, so a failure
 *  still names the offender instead of printing `undefined`. */
function routeLabel(el: JsxTag): string {
  const nameAttr = attribute(el, "name");
  const init = nameAttr?.initializer;
  if (init && ts.isStringLiteral(init)) return init.text;
  return el.getText(LAYOUT_AST).split("\n")[0];
}

// The props that displace the navigator default, per the resolver pinned below.
// `layout` is the per-Screen one; `screenLayout` is the per-Group one.
const OVERRIDE_PROPS = ["layout", "screenLayout"];

/** Every way this element sets one of `OVERRIDE_PROPS`, named so a failure says
 *  which prop and how it arrived.
 *
 *  Spreads count, and that is the whole point of this function. `attribute()`
 *  above sees only explicit JSX attributes, and `{...{ layout: f }}` is the same
 *  prop by the time the resolver pinned below reads it. Measured by the 09-20
 *  gate on this very suite: the explicit mutation turned it red, the
 *  byte-equivalent spread mutation left it green 9/9, and the shipped resolver
 *  returned the private scene for both. A guard that reads half of the syntax
 *  is not a guard.
 *
 *  A spread nobody can read statically is reported as well. "I could not tell"
 *  is not "it is clean" - the only honest answer is to make the route say it in
 *  the open. `_layout.tsx` carries no JSX spread attribute at all today
 *  (measured: 0 across its 37 Stack elements), so this costs the current tree
 *  nothing; a spread of a readable object that does NOT name a wrapper prop
 *  stays allowed, which is what keeps this from being a style rule. */
function overridesOn(el: JsxTag, src: ts.SourceFile): string[] {
  const found: string[] = [];
  for (const prop of el.attributes.properties) {
    if (ts.isJsxAttribute(prop)) {
      const name = prop.name.getText(src);
      if (OVERRIDE_PROPS.includes(name)) found.push(name);
      continue;
    }
    if (!ts.isJsxSpreadAttribute(prop)) continue;
    const keys = spreadKeys(prop.expression, src);
    if (keys === null) {
      found.push("...(" + prop.expression.getText(src) + ") - unreadable");
      continue;
    }
    for (const key of keys) if (OVERRIDE_PROPS.includes(key)) found.push("...{ " + key + " }");
  }
  return found;
}

/** The prop names an expression contributes when spread, or `null` when reading
 *  cannot decide. Only an object literal whose every key is a plain name can be
 *  decided; an identifier, a call, a conditional or a computed key cannot, and
 *  a nested spread is only as readable as what it spreads. */
function spreadKeys(expr: ts.Expression, src: ts.SourceFile): string[] | null {
  if (!ts.isObjectLiteralExpression(expr)) return null;
  const keys: string[] = [];
  for (const member of expr.properties) {
    if (ts.isSpreadAssignment(member)) {
      const nested = spreadKeys(member.expression, src);
      if (nested === null) return null;
      keys.push(...nested);
      continue;
    }
    const name = member.name;
    if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
      keys.push(name.text);
      continue;
    }
    return null;
  }
  return keys;
}

describe("no product route opts out of the account boundary", () => {
  const routeElements = jsxElements().filter((el) => tagOf(el).startsWith("Stack."));

  test("the route roster was actually read", () => {
    // A tree-walk that silently matched nothing would report "0 overrides" and
    // pass forever. The root layout declares the whole app's routes, so this
    // floor is far below the real count (37 at the time of writing) and still
    // catches a walker that stopped working.
    expect(routeElements.length).toBeGreaterThanOrEqual(30);
    const screens = routeElements.filter((el) => tagOf(el) === "Stack.Screen");
    expect(screens.length).toBeGreaterThanOrEqual(30);
    // ...and these are the routes, not some other Stack: every Screen names
    // itself. Mapped to a label first - comparing AST nodes prints 40k lines of
    // diff, which is a guard nobody reads. A Group carries no `name` and is
    // deliberately not held to this.
    expect(screens.filter((el) => attribute(el, "name") === undefined).map(routeLabel)).toEqual([]);
  });

  test("no Stack.Screen or Stack.Group carries its own layout", () => {
    const escapes = routeElements.flatMap((el) =>
      overridesOn(el, LAYOUT_AST).map((how) => `${tagOf(el)} name=${routeLabel(el)} sets ${how}`),
    );
    // Not a style rule. Each entry here is a route that renders OUTSIDE
    // <AccountScope> and therefore keeps the previous account's mounted state
    // across an A -> B publication. If a route genuinely needs its own layout,
    // it has to wrap AccountScope itself, and this list is where that is argued.
    expect(escapes).toEqual([]);
  });

  test("exactly one element in the file sets a scene wrapper, and it is <Stack>", () => {
    // Counted over EVERY element in the file and over BOTH syntaxes: exactly one
    // element sets exactly one wrapper prop, and it names it in the open. That
    // single expectation also carries what used to be a separate assertion -
    // the setter must not additionally carry `layout`, which would shadow it.
    const setters = jsxElements().filter((el) => overridesOn(el, LAYOUT_AST).length > 0);
    expect(setters.map((el) => `${tagOf(el)} ${overridesOn(el, LAYOUT_AST).join(" + ")}`)).toEqual([
      "Stack screenLayout",
    ]);

    // And what it sets is the AccountScope wrapper, executed rather than matched
    // as a string: transpiling the real attribute expression and calling it with
    // a stand-in React shows the scene really does land inside AccountScope.
    const initializer = attribute(setters[0], "screenLayout")?.initializer;
    if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) {
      throw new Error("screenLayout is no longer an inline expression");
    }
    const js = ts.transpileModule(`exports.f = (${initializer.expression.getText(LAYOUT_AST)});`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText;
    interface Node {
      type: unknown;
      children: unknown[];
    }
    const exported: { f?: (args: { children: unknown; route: { name: string } }) => Node } = {};
    new Function("exports", "React", "ProfileProbeScope", "AccountScope", js)(
      exported,
      { createElement: (type: unknown, _p: unknown, ...children: unknown[]) => ({ type, children }) },
      "ProfileProbeScope",
      "AccountScope",
    );
    const tree = exported.f!({ children: "SCENE", route: { name: "secondb" } });
    expect(tree.type).toBe("ProfileProbeScope");
    const inner = tree.children[0] as Node;
    expect(inner.type).toBe("AccountScope");
    expect(inner.children).toEqual(["SCENE"]);
  });

  test("the installed router really does let a route override the default", () => {
    // The premise, taken from the shipped resolver instead of from memory. If a
    // future expo-router drops per-screen layouts, the test above becomes
    // unnecessary rather than wrong - and this is where that would surface.
    const descriptors = readFileSync(
      resolve(ROOT, "node_modules/expo-router/build/react-navigation/core/useDescriptors.js"),
      "utf8",
    );
    const start = descriptors.indexOf("const layout = ");
    expect(start).toBeGreaterThan(-1);
    const expression = descriptors.slice(start + "const layout = ".length, descriptors.indexOf(";", start));
    expect(expression).toContain("screen.layout");
    expect(expression).toContain("config.layout");
    expect(expression).toContain("screenLayout");

    // Executed, with the real text: a Screen's `layout` beats a Group's, and a
    // Group's beats the navigator default. Either one silently replaces the
    // AccountScope wrapper proven above.
    const resolveLayout = new Function(
      "screen",
      "config",
      "screenLayout",
      `return (${expression});`,
    ) as (s: unknown, c: unknown, d: unknown) => unknown;
    expect(resolveLayout({ layout: "PER_SCREEN" }, {}, "DEFAULT")).toBe("PER_SCREEN");
    expect(resolveLayout({}, { layout: "PER_GROUP" }, "DEFAULT")).toBe("PER_GROUP");
    expect(resolveLayout({}, {}, "DEFAULT")).toBe("DEFAULT");
  });
});

/** The scan above, exercised on synthetic routes instead of on the real tree.
 *
 *  The real tree is clean, so every assertion over it reads the same whether the
 *  scan works or has stopped working. That is how the spread hole survived: the
 *  suite reported "0 escapes" on a tree that had none, which a scan seeing
 *  nothing at all also reports. These cases are the ones that tell the two
 *  apart, so they are written as routes rather than as unit fixtures.
 *
 *  Measured, so the block is not read as more than it is: disabling the spread
 *  branch of `overridesOn` turns exactly TWO of the five tests below red - "a
 *  spread carrying the same prop" and "a spread nobody can read statically".
 *  The clean-route case returns `[]` either way (a blind scan returns `[]` too;
 *  M4 in the round's mutation log is what exercises it for real), and the
 *  resolver case measures expo-router, not this scan. The anti-vacuity proof
 *  rests on those two. */
describe("the override scan reads spread props, not only explicit attributes", () => {
  const scan = (tsx: string): string[] => {
    const file = ts.createSourceFile("probe.tsx", tsx, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const walk = (node: ts.Node): void => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(file).startsWith("Stack.")
      ) {
        found.push(...overridesOn(node, file));
      }
      node.forEachChild(walk);
    };
    walk(file);
    return found;
  };

  test("a clean route stays clean, and so does a readable unrelated spread", () => {
    // The second one is the false-red this guard must not produce: spreading is
    // not the offence, spreading a WRAPPER prop is.
    expect(scan('<Stack.Screen name="secondb" />')).toEqual([]);
    expect(scan('<Stack.Screen name="wiki" {...{ options: fadeTransition }} />')).toEqual([]);
  });

  test("an explicit wrapper prop is caught - the half that already worked", () => {
    expect(scan("<Stack.Screen name=\"secondb\" layout={({ children }) => children} />")).toEqual([
      "layout",
    ]);
    expect(scan("<Stack.Group screenLayout={Passthrough} />")).toEqual(["screenLayout"]);
  });

  test("a spread carrying the same prop is caught too - the half that did not", () => {
    // Byte-for-byte the gate's bypass. Before this change the same route came
    // back `[]` from the scan and the whole suite stayed green.
    expect(
      scan("<Stack.Screen name=\"secondb\" {...{ layout: ({ children }) => children }} />"),
    ).toEqual(["...{ layout }"]);
    expect(scan("<Stack.Group {...{ screenLayout: Passthrough }} />")).toEqual([
      "...{ screenLayout }",
    ]);
  });

  test("a spread nobody can read statically is reported, not assumed clean", () => {
    expect(scan('<Stack.Screen name="secondb" {...rest} />')).toEqual(["...(rest) - unreadable"]);
    expect(scan('<Stack.Screen name="secondb" {...makeProps()} />')).toEqual([
      "...(makeProps()) - unreadable",
    ]);
    // Readable on the outside, opaque one level in. Answering "clean" here would
    // hand the bypass straight back.
    expect(scan('<Stack.Screen name="secondb" {...{ ...BASE, options: o }} />')).toEqual([
      "...({ ...BASE, options: o }) - unreadable",
    ]);
  });

  test("the spread form really does reach the resolver, so the catch is not cosmetic", () => {
    // Executed, not argued. Compile the spread route, read the props React would
    // actually receive, and feed them to the SAME resolver text lifted out of the
    // installed expo-router above. A catch that fired on syntax the router then
    // ignored would be a style rule wearing a boundary's clothes.
    const js = ts.transpileModule(
      'exports.el = <Stack.Screen name="secondb" {...{ layout: "PRIVATE_SCENE" }} />;',
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.React,
        },
      },
    ).outputText;
    const out: { el?: { props: Record<string, unknown> } } = {};
    new Function("exports", "React", "Stack", js)(
      out,
      { createElement: (_type: unknown, props: Record<string, unknown>) => ({ props }) },
      { Screen: "Stack.Screen" },
    );
    expect(Object.keys(out.el!.props)).toEqual(["name", "layout"]);

    const descriptors = readFileSync(
      resolve(ROOT, "node_modules/expo-router/build/react-navigation/core/useDescriptors.js"),
      "utf8",
    );
    const start = descriptors.indexOf("const layout = ");
    expect(start).toBeGreaterThan(-1);
    const expression = descriptors.slice(
      start + "const layout = ".length,
      descriptors.indexOf(";", start),
    );
    const resolveLayout = new Function(
      "screen",
      "config",
      "screenLayout",
      `return (${expression});`,
    ) as (s: unknown, c: unknown, d: unknown) => unknown;
    expect(resolveLayout(out.el!.props, {}, "ACCOUNT_SCOPE")).toBe("PRIVATE_SCENE");
  });
});
