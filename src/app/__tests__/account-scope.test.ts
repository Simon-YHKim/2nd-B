import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import * as account from "@/lib/auth/account-epoch";
import { profileRouteHold } from "@/lib/auth/profile-probe";
import { avatarFirstRunDecision } from "@/lib/avatar/first-run-store";
import { authExitDestination, profileEntryDestination, resolveAuthExitDestination } from "@/lib/auth/auth-exit";

const ROOT = resolve(__dirname, "../../..");
const AUTH = readFileSync(resolve(ROOT, "src/lib/auth/AuthContext.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const LAYOUT = readFileSync(resolve(ROOT, "src/app/_layout.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

// Use the shipped router's pure reducer, as go-home.test.ts does. A navigation
// action must produce the home snapshot; the test never inserts one as proof.
interface ExitStack {
  key: string; type: string; stale: boolean; index: number; routeNames: string[];
  preloadedRoutes: { key: string; name: string }[];
  routes: { key: string; name: string; params?: object; state?: ExitStack }[];
}
const { StackRouter } = require("expo-router/build/react-navigation/routers/StackRouter") as {
  StackRouter: (options: object) => {
    getInitialState: (options: object) => ExitStack;
    getRehydratedState: (state: object, options: object) => ExitStack;
    getStateForAction: (state: ExitStack, action: object, options: object) => ExitStack | null;
  };
};

const readSource = (file: string) => readFileSync(resolve(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sourceAst = (file: string) => ts.createSourceFile(file, readSource(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodesIn<T extends ts.Node>(file: ts.SourceFile, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const walk = (node: ts.Node) => { if (predicate(node)) found.push(node); node.forEachChild(walk); };
  walk(file);
  return found;
}
function evaluate(expression: string, values: Record<string, unknown> = {}) {
  const inputs = { authExitDestination, profileEntryDestination, ...values };
  return new Function(...Object.keys(inputs), `return (${expression});`)(...Object.values(inputs));
}
const PROFILE = "src/app/(auth)/complete-profile.tsx";
const SIGNUP = "src/lib/auth/useSignUpForm.ts";
const SIGNUP_SCREEN = "src/screens/deepspace/dds-sign-up-screen.tsx";
function entryRoute(file: string, consentRecorded: boolean | null): string {
  const ast = sourceAst(file);
  const declaration = nodesIn(ast, ts.isVariableDeclaration).find(node => node.name.getText(ast) === "nextRoute")!;
  return evaluate(declaration.initializer!.getText(ast), { result: { consentRecorded } });
}

// Every explicit product exit in the auth routes and their live presenters/
// hooks. Ordinals select the ACTUAL call/return, so removing its normalization
// changes the behavioral result instead of merely failing a string match.
const authExits = [
  { name: "profile welcome", file: PROFILE, kind: "replace", at: 1, next: "profile" },
  { name: "profile submit", file: PROFILE, kind: "replace", at: 2, next: "profile" },
  { name: "profile settled/crisis guard", file: PROFILE, kind: "guard", at: 0, next: "profile" },
  { name: "signup welcome", file: SIGNUP, kind: "replace", at: 0, next: "signup" },
  { name: "signup submit", file: SIGNUP, kind: "replace", at: 1, next: "signup" },
  { name: "signup code/link guard", file: SIGNUP_SCREEN, kind: "guard", at: 0, next: "signup" },
  { name: "signup home button", file: SIGNUP_SCREEN, kind: "push", at: 0, next: "home" },
  { name: "signup manual", file: SIGNUP_SCREEN, kind: "push", at: 3, next: "manual" },
  { name: "email sign-in", file: "src/lib/auth/useSignInForm.ts", kind: "replace", at: 0, next: "home" },
  { name: "sign-in session guard", file: "src/screens/deepspace/dds-sign-in-screen.tsx", kind: "RedirectHome", at: 0, next: "home" },
  { name: "OAuth callback", file: "src/app/(auth)/oauth-callback.tsx", kind: "replace", at: 0, next: "home" },
  { name: "recovery hardware back", file: "src/screens/deepspace/dds-auth-screens.tsx", kind: "replace", at: 0, next: "home" },
  { name: "recovery header", file: "src/screens/deepspace/dds-auth-screens.tsx", kind: "replace", at: 2, next: "home" },
  { name: "recovery done", file: "src/screens/deepspace/dds-auth-screens.tsx", kind: "replace", at: 3, next: "home" },
  { name: "terms/refund/privacy cold back", file: "src/screens/deepspace/dds-legal-doc-screen.tsx", kind: "replace", at: 0, next: "home" },
  { name: "consent detail cold back", file: "src/screens/deepspace/dds-consent-notice-screen.tsx", kind: "replace", at: 0, next: "home" },
] as const;
type AuthExit = typeof authExits[number];
function exitHref(row: AuthExit, created = true): { href: string; method: string; intended: string } {
  const intended = row.next === "profile" ? entryRoute(PROFILE, created ? true : null)
    : row.next === "signup" ? entryRoute(SIGNUP, created ? true : null)
    : row.next === "manual" ? "/manual" : "/";
  const ast = sourceAst(row.file);
  if (row.kind === "RedirectHome") {
    expect(nodesIn(ast, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText(ast) === "RedirectHome")).toHaveLength(1);
    return { href: "/", method: "POP_TO", intended };
  }
  if (row.kind === "guard") {
    const branch = nodesIn(ast, ts.isIfStatement).find(node => node.thenStatement.getText(ast).includes("<RedirectHome"))!;
    const js = ts.transpileModule(`exports.run = () => { ${branch.thenStatement.getText(ast)} };`, {
      compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const env = { authExitDestination, postEntryRoute: intended, avatarSetupAfterConfirmation: created,
      RedirectHome: "home", Redirect: "redirect", React: { createElement: (type: string, props: { href: string }) => ({ type, props }) } };
    const output = {} as { run: () => { type: string; props: { href: string } } };
    new Function("exports", ...Object.keys(env), js)(output, ...Object.values(env));
    const result = output.run();
    return { href: result.type === "home" ? "/" : result.props.href, method: result.type === "home" ? "POP_TO" : "REPLACE", intended };
  }
  const calls = nodesIn(ast, ts.isCallExpression).filter(node => node.expression.getText(ast) === `router.${row.kind}`);
  if (row.file === SIGNUP_SCREEN && row.kind === "push") {
    let callback: ts.Node | undefined = calls[row.at];
    while (callback && !ts.isArrowFunction(callback)) callback = callback.parent;
    if (!callback || !ts.isArrowFunction(callback)) throw new Error("exit handler missing");
    const sent: { href: string; method: string; intended: string }[] = [];
    const handler = evaluate(callback.getText(ast), {
      ...account, canLeaveGate: () => true,
      router: { push: (href: string) => sent.push({ href, method: "PUSH", intended }),
        replace: (href: string) => sent.push({ href, method: "REPLACE", intended }) },
    });
    handler();
    expect(sent).toHaveLength(1);
    return sent[0];
  }
  const expression = calls[row.at].arguments[0].getText(ast);
  const values: Record<string, unknown> = { nextRoute: intended, step: "done", userId: "owner-b" };
  const exitDeclaration = nodesIn(ast, ts.isVariableDeclaration).find(node => node.name.getText(ast) === "exitHref");
  if (exitDeclaration) values.exitHref = evaluate(exitDeclaration.initializer!.getText(ast), values);
  const href = evaluate(expression, values);
  return { href, method: "REPLACE", intended };
}

test("auth exit audit includes every route and every explicit navigation in its live presenters", () => {
  expect(readdirSync(resolve(ROOT, "src/app/(auth)")).sort()).toEqual([
    "_layout.tsx", "complete-profile.tsx", "consent-notice.tsx", "oauth-callback.tsx", "privacy-policy.tsx",
    "refund.tsx", "reset-password.tsx", "sign-in.tsx", "sign-up.tsx", "terms.tsx",
  ]);
  const roster: Record<string, string[]> = {
    [PROFILE]: ['router.replace("/sign-in")', '<RedirectHome />', '<Redirect href={destination} />', '<Redirect href="/sign-in" />',
      'router.replace(authExitDestination(nextRoute))', 'router.replace(authExitDestination(nextRoute))'],
    [SIGNUP]: ['router.replace(authExitDestination(nextRoute))', 'router.replace(authExitDestination(nextRoute))'],
    [SIGNUP_SCREEN]: ['<RedirectHome />', '<Redirect href={destination} />', 'router.replace("/")', 'router.push("/")',
      'router.push("/sign-in")', 'router.push("/sign-in")', 'router.replace("/")', 'router.push("/manual")', 'router.push("/terms")',
      'router.push({ pathname: "/consent-notice", params: { item: key } })',
      'router.push({ pathname: "/consent-notice", params: { item: "marketing" } })'],
    "src/lib/auth/useSignInForm.ts": ['router.replace("/")'],
    "src/screens/deepspace/dds-sign-in-screen.tsx": ['<RedirectHome />', 'router.push(resetPasswordHref(email))',
      'router.push("/sign-up")', 'router.push("/terms")', 'router.push("/privacy-policy")', 'router.push("/refund")'],
    "src/app/(auth)/oauth-callback.tsx": ['router.replace("/")', 'router.replace("/sign-in")'],
    "src/screens/deepspace/dds-auth-screens.tsx": ['router.replace(step === "done" || userId ? "/" : "/sign-in")',
      'router.replace("/sign-in")', 'router.replace(exitHref)', 'router.replace("/")'],
    "src/screens/deepspace/dds-legal-doc-screen.tsx": ['router.replace("/")', 'router.push(link.href)'],
    "src/screens/deepspace/dds-consent-notice-screen.tsx": ['router.replace("/")'],
    "src/lib/auth/sign-up-back.ts": ['router.dismissTo("/sign-in")'],
  };
  // Include the facades, flow hooks and deletion result panel even when they
  // have no navigation. A new exit there must join this audit, not vanish.
  const files = new Set([...Object.keys(roster), ...readdirSync(resolve(ROOT, "src/app/(auth)")).map(name => `src/app/(auth)/${name}`),
    "src/lib/auth/useResetPasswordForm.ts", "src/components/account/AccountDeletionNotice.tsx",
    "src/lib/auth/sign-in-back.ts", "src/lib/auth/sign-up-back.ts"]);
  for (const file of files) {
    const ast = sourceAst(file);
    const exits = nodesIn(ast, (node): node is ts.CallExpression | ts.JsxSelfClosingElement =>
      (ts.isCallExpression(node) && /^(?:router\.(?:replace|push|dismissTo)|goHome)$/.test(node.expression.getText(ast))) ||
      (ts.isJsxSelfClosingElement(node) && ["Redirect", "RedirectHome"].includes(node.tagName.getText(ast))));
    // sign-up-back's injected router is a parameter; it only returns to auth.
    expect(exits.map(node => node.getText(ast))).toEqual(roster[file] ?? []);
  }
  for (const name of ["terms", "refund", "privacy-policy", "consent-notice"]) {
    expect(readSource(`src/app/(auth)/${name}.tsx`)).toMatch(/DeepSpace(?:LegalDoc|ConsentNotice)Screen/);
  }
  const legal = readSource("src/screens/deepspace/dds-legal-doc-screen.tsx");
  expect(legal).toContain('href: "/terms" | "/refund" | "/privacy-policy"');
  expect(readSource("src/lib/nav/go-home.ts")).toContain("router.dismissTo(HOME_HREF)");
});

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

describe("account release observation and gate ordering", () => {
  const resolver = LAYOUT_AST.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "PendingAccountTransitionResolver")!;
  const effects: ts.ArrowFunction[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(LAYOUT_AST) === "useEffect") {
      effects.push(node.arguments[0] as ts.ArrowFunction);
    }
    node.forEachChild(collect);
  };
  collect(resolver);

  // Execute only the source's effect callbacks with explicit inputs. No React
  // or RN mounting: the subscription/dispatch wiring itself is the contract.
  function effect(index: number, inputs: Record<string, unknown>): (() => void) | void {
    const js = ts.transpileModule(`exports.run = ${effects[index].getText(LAYOUT_AST)};`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    const output = {} as { run: () => (() => void) | void };
    new Function("exports", ...Object.keys(inputs), js)(output, ...Object.values(inputs));
    return output.run();
  }

  function harness() {
    account.__resetAccountEpochForTests();
    account.noteResolvedOwner("owner-a");
    account.noteResolvedOwner("owner-b");
    const home = { key: "home", name: "index" };
    const old = { key: "old", name: "records" };
    const root = {
      key: "container", type: "stack", stale: false, index: 0, routeNames: ["__root"], preloadedRoutes: [],
      routes: [{ key: "generated", name: "__root", state: {
        key: "app", type: "stack", stale: false, routeNames: ["index", "records", "(auth)"],
        preloadedRoutes: [], index: 1, routes: [home, old],
      } }],
    };
    let listener: (() => void) | undefined;
    const unsubscribe = jest.fn(() => { listener = undefined; });
    const inputs = {
      ...account,
      pending: true,
      epoch: account.currentAccountEpoch(),
      segments: [] as string[],
      resetPass: 0,
      resetDispatchRef: { current: null as { attempts: number; epoch: number; lastDispatchPass: number } | null },
      ACCOUNT_RESET_MAX_ATTEMPTS: Number(LAYOUT.match(/const ACCOUNT_RESET_MAX_ATTEMPTS = (\d+);/)![1]),
      ACCOUNT_RESET_RETRY_RENDER_PASSES: Number(LAYOUT.match(/const ACCOUNT_RESET_RETRY_RENDER_PASSES = (\d+);/)![1]),
      router: { dismissAll: jest.fn(), replace: jest.fn() },
      navigation: {
        isReady: () => true,
        getRootState: (): Parameters<typeof account.shouldReleaseAccountTransition>[1] => root,
        addListener: jest.fn((name: string, fn: () => void) => {
          expect(name).toBe("state"); listener = fn; return unsubscribe;
        }),
      },
      setResetPass: jest.fn((update: (pass: number) => number) => { inputs.resetPass = update(inputs.resetPass); }),
    };
    return { inputs, root, home, unsubscribe, emit: () => listener?.() };
  }

  function connectRouter(h: ReturnType<typeof harness>, hydrated = true, direct = false) {
    const options = { routeNames: ["index", "records", "(auth)", "avatar-studio", "manual"], routeParamList: {}, routeGetIdList: {} };
    // IntroGate replaces its children while redirecting to complete-profile;
    // the mounted auth Stack is the starting state, never a fabricated home.
    const reducer = StackRouter({ initialRouteName: "(auth)" });
    let stack = reducer.getInitialState(options);
    const wrapper = StackRouter({ initialRouteName: "__root" }).getInitialState({
      routeNames: ["__root"], routeParamList: {}, routeGetIdList: {},
    });
    const read = () => {
      const state = hydrated ? stack : { ...stack, stale: true };
      return direct ? state : { ...wrapper, routes: [{ ...wrapper.routes[0], state }] };
    };
    const commit = (href: string, method = "REPLACE") => {
      const [path, query] = href.split("?");
      const name = path === "/" ? "index" : path.slice(1);
      const next = reducer.getStateForAction(stack, { type: method, payload: { name, params: query ? { setup: "1" } : undefined } }, options);
      if (!next) throw new Error(`unhandled ${method} ${href}`);
      stack = next;
      const active = stack.routes[stack.index];
      h.inputs.segments = active.name === "index" ? [] : [active.name];
      h.emit();
    };
    h.inputs.navigation.getRootState = read;
    h.inputs.segments = ["(auth)", "complete-profile"];
    return { commit, read, state: () => stack };
  }

  function finishProfile(h: ReturnType<typeof harness>, direct = false) {
    const nav = connectRouter(h, true, direct);
    const exit = exitHref(authExits[1]);
    expect(exit.intended).toBe("/avatar-studio?setup=1");
    expect(exit.href).toBe("/");
    expect(scene("avatar-studio")).toBeNull();
    expect(intro(true, h.inputs.segments).type).toBe("GateCover"); // refresh settled before submit returns
    nav.commit(exit.href, exit.method);
    expect(h.inputs.segments).toEqual([]);
    expect(scene("index")).toBeNull(); // committed home still hidden until resolver sees proof
    expect(avatar(true, undefined, true)).toBe("hold");
    effect(1, h.inputs);
    expect(account.isAccountTransitionPending()).toBe(false);
    expect(avatar(true, undefined, true)).toBe("setup");
    const gateSource = readSource("src/components/avatar/AvatarSetupGate.tsx");
    const destination = gateSource.match(/:\s*("\/avatar-studio\?setup=1")/)![1];
    nav.commit(evaluate(destination));
    expect(h.inputs.segments).toEqual(["avatar-studio"]);
    expect(nav.state().routes[nav.state().index].params).toEqual({ setup: "1" });
    expect(avatar(true, "avatar-studio", true)).toBe("allow");
    expect(scene("avatar-studio")?.children).toContain("scene");
    expect(intro(true, h.inputs.segments).type).toBe("GateCover");
  }

  test("subscribes only during the hold and returns the listener cleanup", () => {
    expect(effects).toHaveLength(2);
    const h = harness();
    effect(0, { ...h.inputs, pending: false });
    expect(h.inputs.navigation.addListener).not.toHaveBeenCalled();
    const stop = effect(0, h.inputs);
    h.emit();
    expect(h.inputs.resetPass).toBe(1);
    expect(stop).toBe(h.unsubscribe);
    stop!();
    h.emit();
    expect(h.inputs.resetPass).toBe(1);
    expect(resolver.getText(LAYOUT_AST)).toContain("[navigation, pending]");
    expect(resolver.getText(LAYOUT_AST)).toContain("[epoch, navigation, pending, resetPass, segments]");
  });

  test("late navigation proof releases after all three reset attempts, with no fourth dispatch", () => {
    const h = harness();
    const stop = effect(0, h.inputs);
    for (let pass = 0; pass < 10; pass++) effect(1, h.inputs);
    expect(h.inputs.router.dismissAll).toHaveBeenCalledTimes(3);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(3);
    expect(account.isAccountTransitionPending()).toBe(true);
    h.inputs.setResetPass.mockClear();
    // No segment change or retry render remains to wake the resolver.
    h.root.routes[0].state = { ...h.root.routes[0].state, index: 0, routes: [h.home] };
    h.emit();
    expect(h.inputs.setResetPass).toHaveBeenCalledTimes(1);
    effect(1, h.inputs);
    expect(account.isAccountTransitionPending()).toBe(false);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(3);
    stop!();
  });

  test("queued reset and an old retained scene never release the hold", () => {
    const h = harness();
    effect(1, h.inputs);
    expect(h.inputs.router.replace).toHaveBeenCalledWith("/");
    expect(account.isAccountTransitionPending()).toBe(true);
    // The URL is already home, but the old stack has not committed its reset.
    effect(1, h.inputs);
    expect(account.isAccountTransitionPending()).toBe(true);
    h.root.routes[0].state = { ...h.root.routes[0].state, index: 0, routes: [h.home] };
    effect(1, h.inputs);
    expect(account.isAccountTransitionPending()).toBe(false);
  });

  test("auth segments neither dispatch a reset nor release, even with a home snapshot", () => {
    const h = harness();
    h.inputs.segments = ["(auth)", "complete-profile"];
    h.root.routes[0].state = { ...h.root.routes[0].state, index: 0, routes: [h.home] };
    effect(1, h.inputs);
    expect(h.inputs.router.dismissAll).not.toHaveBeenCalled();
    expect(h.inputs.router.replace).not.toHaveBeenCalled();
    expect(account.isAccountTransitionPending()).toBe(true);
    h.inputs.segments = [];
    effect(1, h.inputs);
    expect(account.isAccountTransitionPending()).toBe(false);
  });

  test("avatar setup keeps its cover until account proof, then sends setup without a latch", () => {
    const source = readFileSync(resolve(ROOT, "src/components/avatar/AvatarSetupGate.tsx"), "utf8");
    expect(source).toMatch(/accountTransitionPendingFromSnapshot\(useSyncExternalStore\(\s*subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot/);
    const expression = source.match(/const decision = (.*);/)![1];
    const decide = new Function("accountPending", "avatarDecision", `return ${expression};`);
    expect(decide(true, "setup")).toBe("hold");
    expect(decide(false, "setup")).toBe("setup");
    expect(decide(true, "allow")).toBe("allow"); // auth / studio exemptions remain
    expect(source).toContain('cover={decision === "allow" ? null : <InlineLoader />}');
    expect(source).toMatch(/decision === "setup" \? \(\s*<Redirect/);
    expect(source).toContain('"/avatar-studio?setup=1"');
  });

  test("profile completion redirects during the hold and keeps the auth exemption", () => {
    const gate = LAYOUT_AST.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "IntroGate")!;
    const branch = gate.body!.statements.find((node): node is ts.IfStatement =>
      ts.isIfStatement(node) && node.thenStatement.getText(LAYOUT_AST).includes('"/complete-profile"'))!;
    const redirect = new Function("accountPending", "segments", "loading", "userId", "hasProfile", "profileProbeFailed",
      `return ${branch.expression.getText(LAYOUT_AST)};`);
    expect(redirect(true, [], false, "owner-b", false, false)).toBe(true);
    expect(redirect(false, [], false, "owner-b", false, false)).toBe(true);
    expect(redirect(true, ["(auth)"], false, "owner-b", false, false)).toBe(false);
    expect(redirect(false, ["(auth)"], false, "owner-b", false, false)).toBe(false);
  });

  // Execute the production decisions, including their early returns, without
  // mounting React/RN. These are element descriptions, not render tests.
  type Element = { type: string; props: Record<string, unknown>; children: unknown[] };
  const React = { createElement: (type: string, props: Record<string, unknown>, ...children: unknown[]): Element =>
    ({ type, props: props ?? {}, children }) };
  function callDecision(name: string, args: Record<string, unknown>, inputs: Record<string, unknown>): Element | null {
    const declaration = LAYOUT_AST.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name)!;
    const js = ts.transpileModule(`${declaration.getText(LAYOUT_AST)}\nexports.run = ${name};`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText;
    const environment = {
      ...account, React, Fragment: "Fragment", useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
      ...inputs,
    };
    const output = {} as { run: (props: Record<string, unknown>) => Element | null };
    new Function("exports", ...Object.keys(environment), js)(output, ...Object.values(environment));
    return output.run(args);
  }
  function scene(routeName: string) {
    return callDecision("AccountScope", { routeName, children: "scene" }, {});
  }
  function intro(hasProfile: boolean | null, segments: string[], recovery = false, loading = false, failed = false) {
    return callDecision("IntroGate", { children: "Stack" }, {
      useAuth: () => ({ userId: "owner-b", hasProfile, loading, profileProbeFailed: failed,
        recoveryReady: true, recoveryUserId: recovery ? "owner-b" : null }),
      useSegments: () => segments, usePathname: () => segments[1] ? `/${segments[1]}` : "/",
      useGlobalSearchParams: () => ({}), isMarkedShareCapture: () => false,
      useState: () => [true, jest.fn()], introAlreadyPlayed: () => true, profileRouteHold,
      GateCover: "GateCover", Redirect: "Redirect", InlineLoader: "InlineLoader", ProfileProbeRetryScreen: "Retry",
      shareRefusedHref: (href: string) => href,
      accountPending: account.isAccountTransitionPending(), // lets the rejected R1 condition be mutation-tested
    })!;
  }
  function avatar(hasProfile: boolean | null, segment: string | undefined, missing: boolean) {
    const source = readFileSync(resolve(ROOT, "src/components/avatar/AvatarSetupGate.tsx"), "utf8");
    const expression = source.match(/const decision = (.*);/)![1];
    const base = avatarFirstRunDecision("owner-b", hasProfile, segment,
      { userId: "owner-b", status: missing ? "missing" : "saved" });
    return new Function("accountPending", "avatarDecision", `return ${expression};`)(account.isAccountTransitionPending(), base);
  }

  test.each([0, 3])("profile completion remains reachable after %i resets; auth stays covered only for product scenes", (attempts) => {
    const h = harness();
    const stop = effect(0, h.inputs);
    if (attempts === 3) for (let i = 0; i < 10; i++) effect(1, h.inputs);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(attempts);
    expect(intro(false, []).props.href).toBe("/complete-profile");
    expect(scene("index")).toBeNull();
    expect(scene("avatar-studio")).toBeNull();

    // Redirect replaces IntroGate's children: the Stack can be absent. The
    // resolver lives outside IntroGate and retains both its ref and attempt cap.
    h.inputs.navigation.isReady = () => false;
    effect(1, h.inputs);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(attempts);
    expect(account.isAccountTransitionPending()).toBe(true);
    h.inputs.navigation.isReady = () => true;
    h.inputs.segments = ["(auth)", "complete-profile"];
    expect(intro(false, h.inputs.segments).type).toBe("GateCover");
    expect(scene("(auth)")?.children).toContain("scene");
    h.root.routes[0].state = { ...h.root.routes[0].state, index: 0, routes: [h.home] };
    h.emit();
    effect(1, h.inputs); // even an out-of-date home snapshot cannot release inside auth
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(attempts);
    expect(account.isAccountTransitionPending()).toBe(true);

    // Continue through the real submit destination and router actions.
    finishProfile(h);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(attempts);
    stop!();
  });

  test.each(["reset-first", "profile-first"])("queued %s actions settle in profile completion without a home proof", (order) => {
    const h = harness();
    const stop = effect(0, h.inputs);
    let redirects = 0;
    let settled = false;
    for (let render = 0; render < 20; render++) {
      const gate = intro(false, h.inputs.segments);
      const profileActions = gate.type === "Redirect" ? ["/complete-profile"] : [];
      redirects += profileActions.length;
      const before = h.inputs.router.replace.mock.calls.length;
      effect(1, h.inputs);
      const resetActions = h.inputs.router.replace.mock.calls.slice(before).map(call => call[0] as string);
      const actions = order === "reset-first" ? [...resetActions, ...profileActions] : [...profileActions, ...resetActions];
      if (actions.length === 0) { settled = true; break; }
      for (const href of actions) {
        h.inputs.segments = href === "/" ? [] : ["(auth)", "complete-profile"];
        h.root.routes[0].state = { ...h.root.routes[0].state, stale: true, index: 0,
          routes: [href === "/" ? h.home : { key: "auth", name: "(auth)" }] };
        h.emit(); // navigation commits; hydration proof deliberately never comes
      }
    }
    expect(settled).toBe(true);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(order === "reset-first" ? 1 : 3);
    expect(redirects).toBe(order === "reset-first" ? 1 : 4);
    expect(h.inputs.segments).toEqual(["(auth)", "complete-profile"]);
    expect(account.isAccountTransitionPending()).toBe(true);
    expect(scene("(auth)")?.children).toContain("scene");
    expect(scene("index")).toBeNull();
    // R3: retain the R2 bound above, then submit to the actual avatar target.
    finishProfile(h);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(order === "reset-first" ? 1 : 3);
    stop!();
  });

  test.each([false, true])("three exhausted resets -> profile submit -> home proof -> avatar (direct=%s)", (direct) => {
    const h = harness();
    const stop = effect(0, h.inputs);
    for (let pass = 0; pass < 10; pass++) effect(1, h.inputs);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(3);
    finishProfile(h, direct);
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(3);
    stop!();
  });

  test.each(authExits)("auth exit $name reaches proof with zero reset budget", row => {
    const h = harness();
    const stop = effect(0, h.inputs);
    for (let pass = 0; pass < 10; pass++) effect(1, h.inputs);
    const nav = connectRouter(h);
    const exit = exitHref(row);
    expect(exit.href).toBe("/");
    expect(scene("index")).toBeNull();
    nav.commit(exit.href, exit.method);
    expect(account.shouldReleaseAccountTransition(h.inputs.segments, nav.read())).toBe(true);
    expect(scene("index")).toBeNull();
    effect(1, h.inputs);
    expect(account.isAccountTransitionPending()).toBe(false);
    expect(scene("index")?.children).toContain("scene");
    expect(h.inputs.router.replace).toHaveBeenCalledTimes(3);
    stop!();
  });

  test.each(authExits)("auth exit $name preserves its destination outside a hold", row => {
    account.__resetAccountEpochForTests();
    const exit = exitHref(row);
    expect(exit.href).toBe(exit.intended);
  });

  test.each([null, false, true])("profile and signup completion share the real destination for consentRecorded=%s", value => {
    account.__resetAccountEpochForTests();
    const expected = value === null ? "/" : "/avatar-studio?setup=1";
    expect(entryRoute(PROFILE, value)).toBe(expected);
    expect(entryRoute(SIGNUP, value)).toBe(expected);
    expect(resolveAuthExitDestination(expected, true)).toBe("/");
    expect(resolveAuthExitDestination(expected, false)).toBe(expected);
  });

  test.each([authExits[0], authExits[3]])("$name reads the live hold when its existing timer fires", row => {
    account.__resetAccountEpochForTests();
    account.noteResolvedOwner("owner-a");
    const ast = sourceAst(row.file);
    const timer = nodesIn(ast, ts.isCallExpression).find(node =>
      node.expression.getText(ast) === "setTimeout" && node.arguments[0]?.getText(ast).includes("router.replace"))!;
    const replace = jest.fn();
    const callback = evaluate(timer.arguments[0].getText(ast), {
      nextRoute: entryRoute(row.file, true), mountedRef: { current: true }, router: { replace },
    });
    callback();
    expect(replace).toHaveBeenLastCalledWith("/avatar-studio?setup=1");
    account.noteResolvedOwner("owner-b");
    const epochB = account.currentAccountEpoch();
    callback();
    expect(replace).toHaveBeenLastCalledWith("/");
    account.noteResolvedOwner("owner-c");
    expect(account.clearAccountTransition(epochB)).toBe(false);
    callback();
    expect(replace).toHaveBeenLastCalledWith("/");
  });

  // Main 087f7ced's observable reachability, not its defective top-level proof:
  // auth forms remain usable under a hold; every product scene is hidden.
  // Each completion starts at its actual destination, executed via StackRouter.
  const cases = [
    { name: "no profile", profile: false, missing: true, auth: "complete-profile", target: "/complete-profile" },
    { name: "profile without avatar", profile: true, missing: true, auth: "", target: undefined },
    { name: "profile and avatar", profile: true, missing: false, auth: "", target: undefined },
    { name: "password recovery", profile: true, missing: false, auth: "reset-password", target: "/reset-password" },
    { name: "signup confirmation", profile: false, missing: true, auth: "sign-up", target: undefined },
  ];
  describe.each([false, true])("main reachability matrix, proof arrives=%s", (proof) => {
    test.each(cases)("$name keeps every previously accessible auth path", (row) => {
      const h = harness();
      for (let pass = 0; pass < 10; pass++) effect(1, h.inputs);
      expect(h.inputs.router.replace).toHaveBeenCalledTimes(3);
      if (row.auth !== "sign-up") {
        expect(intro(row.profile, [], row.auth === "reset-password").props.href).toBe(row.target);
      }
      if (row.auth) {
        h.inputs.segments = ["(auth)", row.auth];
        expect(intro(row.profile, h.inputs.segments, row.auth === "reset-password").type).toBe("GateCover");
        expect(scene("(auth)")?.children).toContain("scene");
      }
      expect(scene("index")).toBeNull();
      expect(scene("avatar-studio")).toBeNull();
      effect(1, h.inputs);
      expect(account.isAccountTransitionPending()).toBe(true);
      if (proof) {
        const nav = connectRouter(h);
        const exit = exitHref(row.name === "no profile" ? authExits[1]
          : row.name === "signup confirmation" ? authExits[5]
          : row.name === "password recovery" ? authExits[13] : authExits[9]);
        nav.commit(exit.href, exit.method);
        effect(1, h.inputs);
        expect(intro(true, []).type).toBe("GateCover");
        expect(scene("index")?.children).toContain("scene");
        expect(avatar(true, undefined, row.missing)).toBe(row.missing ? "setup" : "allow");
      } else {
        expect(intro(row.profile, h.inputs.segments, row.auth === "reset-password").type)
          .toBe("GateCover");
        expect(avatar(row.profile, h.inputs.segments[0], row.missing))
          .toBe(row.auth || !row.missing ? "allow" : "hold");
        expect(scene("avatar-studio")).toBeNull(); // main redirected here, but AccountScope already hid it
        const nav = connectRouter(h, false);
        const exit = exitHref(row.name === "no profile" ? authExits[1]
          : row.name === "signup confirmation" ? authExits[5]
          : row.name === "password recovery" ? authExits[13] : authExits[9]);
        nav.commit(exit.href, exit.method);
        effect(1, h.inputs); // real completion but hydration never becomes proof
        expect(account.isAccountTransitionPending()).toBe(true);
        expect(scene("index")).toBeNull();
      }
      expect(h.inputs.router.replace).toHaveBeenCalledTimes(3);
    });
  });

  test("unknown profile answers still show their cover instead of opening profile completion", () => {
    harness();
    expect(intro(false, [], false, false, true).props.cover).toEqual(expect.objectContaining({ type: "Retry" }));
    expect(intro(null, [], false, true).props.cover).toEqual(expect.objectContaining({ type: "InlineLoader" }));
    expect(scene("index")).toBeNull();
  });
});

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
    new Function("exports", "React", "ProfileProbeScope", "AvatarSetupSceneGuard", "WorldRouteTransition", "AccountScope", js)(
      exported,
      { createElement: (type: unknown, _p: unknown, ...children: unknown[]) => ({ type, children }) },
      "ProfileProbeScope",
      "AvatarSetupSceneGuard",
      "WorldRouteTransition",
      "AccountScope",
    );
    const tree = exported.f!({ children: "SCENE", route: { name: "secondb" } });
    expect(tree.type).toBe("ProfileProbeScope");
    const avatarGuard = tree.children[0] as Node;
    expect(avatarGuard.type).toBe("AvatarSetupSceneGuard");
    const transition = avatarGuard.children[0] as Node;
    expect(transition.type).toBe("WorldRouteTransition");
    expect(transition.children).toHaveLength(1);
    const inner = transition.children[0] as Node;
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
