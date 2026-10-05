import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../../..");
const AUTH_FACADE = path.join(ROOT, "src/lib/supabase/auth.ts");
const SESSION_BOUNDARY = path.join(ROOT, "src/lib/auth/session-mutation.ts");
const PRODUCER_NAMES = new Set([
  "exchangeCodeForSession",
  "linkIdentity",
  "reauthenticate",
  "refreshSession",
  "resetPasswordForEmail",
  "setSession",
  "signInAnonymously",
  "signInWithIdToken",
  "signInWithOAuth",
  "signInWithOtp",
  "signInWithPassword",
  "signInWithSSO",
  "signInWithWeb3",
  "signOut",
  "signUp",
  "unlinkIdentity",
  "updateUser",
  "verifyOtp",
]);
const SDK_UNLOCKED_WRITERS = new Set([
  "linkIdentity",
  "resetPasswordForEmail",
  "signInAnonymously",
  "signInWithIdToken",
  "signInWithOAuth",
  "signInWithOtp",
  "signInWithPassword",
  "signInWithSSO",
  "signInWithWeb3",
  "signUp",
  "unlinkIdentity",
  "verifyOtp",
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return sourceFiles(full);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function accessedName(node: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

function findAuthProducerLines(source: string): number[] {
  const tree = ts.createSourceFile("producer-scan.ts", source, ts.ScriptTarget.Latest, true);
  const authAliases = new Set<string>();
  const producerAliases = new Set<string>();
  const lines = new Set<number>();
  const isAuthExpression = (node: ts.Expression): boolean =>
    accessedName(node) === "auth" || (ts.isIdentifier(node) && authAliases.has(node.text));

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name) && isAuthExpression(node.initializer)) {
        authAliases.add(node.name.text);
      } else if (ts.isObjectBindingPattern(node.name) && isAuthExpression(node.initializer)) {
        for (const element of node.name.elements) {
          const sourceName = element.propertyName?.getText(tree) ?? element.name.getText(tree);
          if (PRODUCER_NAMES.has(sourceName) && ts.isIdentifier(element.name)) {
            producerAliases.add(element.name.text);
          }
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const directName = accessedName(callee);
      const directOwner =
        ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)
          ? callee.expression
          : null;
      if (
        (directName && PRODUCER_NAMES.has(directName) && directOwner && isAuthExpression(directOwner)) ||
        (ts.isIdentifier(callee) && producerAliases.has(callee.text))
      ) {
        lines.add(tree.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return [...lines].sort((left, right) => left - right);
}

describe("Supabase auth session mutation boundary", () => {
  test("producer scanner catches bracket, auth-alias, and destructured calls", () => {
    const source = [
      'client.auth["signOut"]();',
      "const auth = client.auth;",
      "auth.refreshSession();",
      "const { signInWithPassword: rawSignIn } = client.auth;",
      "rawSignIn({ email: 'a', password: 'b' });",
    ].join("\n");

    expect(findAuthProducerLines(source)).toEqual([1, 3, 5]);
  });

  test("main client uses v2 persistence, strict SDK lock, and no automatic URL writer", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/lib/supabase/client.ts"), "utf8");
    expect(source).toContain("getAuthStorageRuntime");
    expect(source).toContain("storageKey: authRuntime.storageKey");
    expect(source).toContain("storage: authRuntime.storage");
    expect(source).toContain("lock: authRuntime.sdkLock");
    expect(source).toContain("lockAcquireTimeout: -1");
    expect(source).toContain("detectSessionInUrl: false");
  });

  test("only the reviewed facade and owner-bound primitive call SDK identity producers", () => {
    const violations = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => file !== AUTH_FACADE && file !== SESSION_BOUNDARY)
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        return findAuthProducerLines(source).map(
          (line) => `${path.relative(ROOT, file)}:${line}`,
        );
      });

    expect(violations).toEqual([]);

    const directAuthJsImports = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => file !== SESSION_BOUNDARY)
      .filter((file) => fs.readFileSync(file, "utf8").includes('from "@supabase/auth-js"'))
      .map((file) => path.relative(ROOT, file));
    expect(directAuthJsImports).toEqual([]);
  });

  test("the reviewed facade declares the M boundary and explicit callback consumption", () => {
    const source = fs.readFileSync(AUTH_FACADE, "utf8");
    const tree = ts.createSourceFile(AUTH_FACADE, source, ts.ScriptTarget.Latest, true);
    const violations: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        PRODUCER_NAMES.has(node.expression.name.text) &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === "auth"
      ) {
        let guarded = false;
        let sdkStorageGuarded = false;
        for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
          if (
            ts.isCallExpression(parent) &&
            ts.isIdentifier(parent.expression) &&
            parent.expression.text === "runAuthSessionMutation"
          ) {
            guarded = true;
          }
          if (ts.isFunctionDeclaration(parent) && parent.name?.text.endsWith("InsideMutation")) {
            guarded = true;
          }
          if (
            ts.isCallExpression(parent) &&
            ts.isPropertyAccessExpression(parent.expression) &&
            parent.expression.name.text === "runSdkUnlockedWriter"
          ) {
            sdkStorageGuarded = true;
          }
        }
        if (!guarded) {
          const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          violations.push(`src/lib/supabase/auth.ts:${line}`);
        }
        if (SDK_UNLOCKED_WRITERS.has(node.expression.name.text) && !sdkStorageGuarded) {
          const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          violations.push(`src/lib/supabase/auth.ts:${line}:missing-S`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    expect(violations).toEqual([]);
    expect(source).toMatch(/consumeCurrentWebAuthCallback/);
  });

  test("pins the reviewed SDK pair and records its internal-order dependency", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(manifest.dependencies["@supabase/supabase-js"]).toBe("2.106.1");
    expect(manifest.dependencies["@supabase/auth-js"]).toBe("2.106.1");
    const lockfile = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
    expect(lockfile.packages["node_modules/@supabase/supabase-js"]).toMatchObject({
      version: "2.106.1",
      license: "MIT",
    });
    expect(lockfile.packages["node_modules/@supabase/auth-js"]).toMatchObject({
      version: "2.106.1",
      license: "MIT",
    });
    const design = fs.readFileSync(path.join(ROOT, "docs/AUTH-SESSION-MUTATION.md"), "utf8");
    expect(design).toContain("MIT");
    expect(design).toContain("$0");
    expect(design).toContain("_signOut");
    expect(design).toContain("_removeSession");
    expect(design).toContain("SIGNED_OUT");
  });

  test("account deletion binds both the server call and local finalizer to captured A", () => {
    const requestSource = fs.readFileSync(
      path.join(ROOT, "src/lib/records/delete-bulk.ts"),
      "utf8",
    );
    const screenSource = fs.readFileSync(
      path.join(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    );
    expect(requestSource).toContain("refreshExpectedSessionInsideMutation");
    expect(requestSource).toContain("{ requireCrossTab: true }");
    const localFence = requestSource.indexOf("await installAccountLocalDeletionFence(expected.userId)");
    const remoteInvoke = requestSource.indexOf('supabase.functions.invoke("delete-account"');
    expect(localFence).toBeGreaterThan(-1);
    expect(remoteInvoke).toBeGreaterThan(localFence);
    const capture = screenSource.indexOf("await captureSignOutExpectation()");
    const request = screenSource.indexOf("await requestAccountDeletion(authExpectation)");
    const localPurge = screenSource.indexOf("await purgeDeletedAccountLocalData(targetUserId)");
    const finalizer = screenSource.indexOf("await signOutExpected(authExpectation)");
    expect(capture).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(capture);
    expect(localPurge).toBeGreaterThan(request);
    expect(finalizer).toBeGreaterThan(localPurge);
    expect(screenSource).toContain("e instanceof AuthSessionOwnerChangedError");
  });

  test("sign-up rollback is owner-bound and never clears without a cross-tab lock", () => {
    const source = fs.readFileSync(AUTH_FACADE, "utf8");
    const signUp = source.slice(
      source.indexOf("export async function signUpWithEmail"),
      source.indexOf("// --- OAuth"),
    );

    expect(signUp).toContain("signOutExpectedSessionInsideMutation");
    expect(signUp).toContain("mutationContext.destructiveSafe");
    expect(signUp).not.toContain("supabase.auth.signOut(");
  });

  test("manual web callback bootstrap preserves PKCE recovery provenance", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/lib/auth/AuthContext.tsx"), "utf8");
    const consume = source.indexOf("await consumeCurrentWebAuthCallback(armedPending)");
    const hydrate = source.indexOf("const rawSessionLoad = supabase.auth.getSession()", consume);
    const recoveryActivation = source.indexOf(
      "await activateRecoverySession(callback.recoveryProof)",
      consume,
    );

    expect(consume).toBeGreaterThan(-1);
    expect(recoveryActivation).toBeGreaterThan(consume);
    expect(recoveryActivation).toBeLessThan(hydrate);
    expect(source.slice(consume, recoveryActivation)).toContain('type === "recovery"');
  });

  test("pins PKCE and rejects implicit credentials on the web callback path", () => {
    const client = fs.readFileSync(path.join(ROOT, "src/lib/supabase/client.ts"), "utf8");
    const auth = fs.readFileSync(AUTH_FACADE, "utf8");
    const webCallback = auth.slice(
      auth.indexOf("export async function consumeCurrentWebAuthCallback"),
      auth.indexOf("export async function sendPasswordResetEmail"),
    );

    expect(client).toContain('flowType: "pkce"');
    expect(webCallback).toContain("Implicit web auth callbacks are disabled; PKCE is required.");
    expect(webCallback).not.toContain("setSession(");
  });
});
