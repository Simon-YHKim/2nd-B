import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  test("every AuthContext state publication has a synchronous owner note", () => {
    const publications = AUTH.match(/\bsetState\s*\(/g) ?? [];
    const notes = AUTH.match(/\bnoteResolvedOwner\s*\(/g) ?? [];
    // 10 after encrypted-storage recovery, not 9: successful explicit recovery
    // destroys the local auth material and publishes a fresh-bootstrap frame.
    // The earlier AUTH-01 publication still ends an
    // ordinary startup whose session lookup never answered. It is a real state
    // publication, so it carries its own synchronous noteResolvedOwner(null)
    // immediately before setState — which is exactly the invariant this test
    // exists to hold, and why the second assertion (equal counts) is the load-
    // bearing one. The count was raised only after adding the matching note.
    expect(publications).toHaveLength(10);
    expect(notes).toHaveLength(publications.length);

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

  test("storage fault detection stays unresolved, while consented reset notes owner-null", () => {
    const detectStart = AUTH.indexOf("const detectEncryptedStorageRecovery = useCallback");
    const detectEnd = AUTH.indexOf("const activateRecoverySession", detectStart);
    const detect = AUTH.slice(detectStart, detectEnd);
    expect(detect).toContain("publishUnresolvedAuthState({");
    expect(detect).not.toContain("noteResolvedOwner(");

    const recoverStart = AUTH.indexOf("const recoverEncryptedStorage = useCallback");
    const recoverEnd = AUTH.indexOf("const value = useMemo", recoverStart);
    const recover = AUTH.slice(recoverStart, recoverEnd);
    const note = recover.indexOf("noteResolvedOwner(null);");
    const publish = recover.indexOf("setState({", note);
    expect(note).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(note);
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
