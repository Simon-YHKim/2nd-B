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

  // Simon Q-261013-29: a different owner starts the app again.
  test("a published different owner asks for the app restart before anything that needs the router, and never inside the sign-in screens", () => {
    const resolver = LAYOUT.slice(
      LAYOUT.indexOf("function PendingAccountTransitionResolver"),
      LAYOUT.indexOf("function ThemedStatusBar"),
    );
    const authReturn = resolver.indexOf('if (segments[0] === "(auth)") return;');
    const restart = resolver.indexOf(
      "if (isAccountNavigationResetPending() && accountRestartPending(() => setResetPass((pass) => pass + 1))) return;",
    );
    const proofBranch = resolver.indexOf("shouldReleaseAccountTransition(segments, rootState)");
    const routerReady = resolver.indexOf("if (!rootState?.key) return;");
    const dismiss = resolver.indexOf("router.dismissAll();");
    expect(authReturn).toBeGreaterThan(-1);
    expect(restart).toBeGreaterThan(authReturn);
    // Before the release proof: a build that can restart never lifts the hold by proof.
    expect(proofBranch).toBeGreaterThan(restart);
    // Before the router-ready return: a router that is not ready cannot keep the restart from being asked for.
    expect(routerReady).toBeGreaterThan(restart);
    expect(dismiss).toBeGreaterThan(routerReady);
    // One request, through the one helper. The resolver holds no platform branch and reloads nothing itself.
    expect(resolver.split("accountRestartPending(").length - 1).toBe(1);
    expect(resolver).not.toContain("Platform.OS");
    expect(resolver).not.toContain("reloadAsync");
    expect(resolver).not.toContain("location.");
    // Nothing between the sign-in exemption and the request reads the router.
    const between = resolver.slice(authReturn + 'if (segments[0] === "(auth)") return;'.length, restart);
    expect(between).not.toContain("rootState");
    expect(between).not.toContain("segments");
    expect(between).not.toContain("router.");
  });
});
