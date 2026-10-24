// Q-261018-50 가 (Simon 2026-10-18 12:00): the sign-out a person presses ends only this device's
// session; settings adds 「모든 기기에서 로그아웃」 for every device. Account deletion keeps signing out
// everywhere, and a password change or recovery ends the other sessions on the server side.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const auth = read("src/lib/supabase/auth.ts");
const settings = read("src/app/settings.tsx");

describe("Q-261018-50: sign-out scope", () => {
  test("signOut() defaults to this device only", () => {
    expect(auth).toContain('export async function signOut(scope: "global" | "local" = "local"): Promise<void> {');
    expect(auth).not.toContain('export async function signOut(scope: "global" | "local" = "global")');
  });

  test("account deletion still signs out every device", () => {
    expect(auth).toContain('export async function signOutExpected(\n  expected: AuthSessionExpectation,\n  scope: "global" | "local" = "global",');
    const deletion = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    expect(deletion).toContain("await signOutExpected(authExpectation);");
    expect(deletion).not.toMatch(/signOutExpected\(authExpectation,\s*"local"\)/);
  });

  test("settings has a this-device sign-out and a separate all-devices sign-out, both asking first", () => {
    const local = settings.indexOf('onPress={() => void askSignOut("local")}');
    const global = settings.indexOf('onPress={() => void askSignOut("global")}');
    expect(local).toBeGreaterThan(-1);
    expect(global).toBeGreaterThan(local);
    expect(settings).toContain('label={t("signOutAll")}');
    expect(settings).toContain('confirm(t("actions.signOutHint"), signOutAndLeave(expected, "local"), { title: t("modals.signOut.title")');
    expect(settings).toContain('confirm(t("actions.signOutAllHint"), signOutAndLeave(expected, "global"), { title: t("modals.signOutAll.title"), action: t("signOutAll"), actionHint: t("actions.signOutAllHint"), cancelHint: t("modals.signOut.cancelHint") }');
    expect(settings.split("await signOutCaptured(expected, scope);")).toHaveLength(2);
    expect(settings).not.toMatch(/await signOut\(/);
  });

  // Review #2625 r1: the session confirmed is the session signed out, and a sign-out runs once.
  test("the session is captured when the button is pressed, before the dialog opens", () => {
    const ask = settings.slice(settings.indexOf("async function askSignOut("), settings.indexOf("function signOutAndLeave("));
    const capture = ask.indexOf("expected = await captureSignOutExpectation();");
    expect(capture).toBeGreaterThan(-1);
    expect(ask.indexOf("confirm(")).toBeGreaterThan(capture);
    expect(ask).toContain("if (!expected.userId) {");
    expect(auth).toContain("export async function signOutCaptured(");
    const captured = auth.slice(auth.indexOf("export async function signOutCaptured("));
    expect(captured.slice(0, captured.indexOf("\n}\n"))).toContain("await signOutExpected(expected, scope);");
  });

  test("a confirm after another account took over signs out no one and shows no error", () => {
    const leave = settings.slice(settings.indexOf("function signOutAndLeave("), settings.indexOf("function showActionError("));
    const catchAt = leave.indexOf("} catch (e) {");
    const ownerChanged = leave.indexOf("if (e instanceof AuthSessionOwnerChangedError) return;");
    expect(ownerChanged).toBeGreaterThan(catchAt);
    expect(leave.indexOf("showActionError(", catchAt)).toBeGreaterThan(ownerChanged);
    expect(leave.indexOf("router.replace(\"/sign-in\");")).toBeGreaterThan(leave.indexOf("return;\n    }\n"));
  });

  // The gate's own behaviour is in sign-out-gate.test.ts; these check that settings uses it in order.
  test("the gate is taken before the session is read, and the dialog opens only after it", () => {
    expect(settings).toContain("const [signOutGate] = useState(createSignOutGate);");
    const ask = settings.slice(settings.indexOf("async function askSignOut("), settings.indexOf("function signOutAndLeave("));
    const take = ask.indexOf("if (!signOutGate.tryCapture()) return;");
    const busy = ask.indexOf('setBusy("signOut");');
    const read = ask.indexOf("await captureSignOutExpectation();");
    const confirming = ask.indexOf("signOutGate.confirming();");
    expect(take).toBeGreaterThan(-1);
    expect(busy).toBeGreaterThan(take);
    expect(read).toBeGreaterThan(busy);
    expect(confirming).toBeGreaterThan(read);
    expect(ask.indexOf("confirm(")).toBeGreaterThan(confirming);
    expect(ask.slice(take, read)).not.toContain("await");
    // Capture failure and "nobody signed in" release the gate.
    expect(ask.split("signOutGate.release();")).toHaveLength(3);
  });

  test("only the confirm of an open dialog runs, and a failure or an owner change releases the gate", () => {
    const leave = settings.slice(settings.indexOf("function signOutAndLeave("), settings.indexOf("function showActionError("));
    const run = leave.indexOf("if (!signOutGate.tryRun()) return;");
    const call = leave.indexOf("await signOutCaptured(expected, scope);");
    expect(run).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(run);
    const failure = leave.slice(leave.indexOf("} catch (e) {"));
    expect(failure.indexOf("signOutGate.release();")).toBeGreaterThan(-1);
    expect(failure.indexOf("signOutGate.release();")).toBeLessThan(failure.indexOf("if (e instanceof AuthSessionOwnerChangedError) return;"));
  });

  test("closing the dialog without confirming returns the gate to idle", () => {
    expect(settings).toMatch(/useEffect\(\(\) => \{\n\s*if \(pendingConfirm === null\) signOutGate\.cancelConfirm\(\);\n\s*\}, \[pendingConfirm, signOutGate\]\);/);
  });

  test("both sign-out buttons are disabled while a flow is reading or signing out", () => {
    // Both sign-out buttons are disabled while it runs.
    expect(settings.match(/label=\{t\("signOut(All)?"\)\}\n\s*accessibilityHint=\{t\("actions\.signOut(All)?Hint"\)\}\n\s*variant="secondary"\n\s*disabled=\{busy !== null\}/g)).toHaveLength(2);
  });

  test.each(["en", "ko", "es", "pt", "id"])("%s names the all-devices sign-out, its hint and its question", (lng) => {
    const s = JSON.parse(read(`locales/${lng}/settings.json`)) as {
      signOutAll: string; actions: { signOutAllHint: string }; modals: { signOutAll: { title: string } };
    };
    expect(s.signOutAll).toEqual(expect.any(String));
    expect(s.actions.signOutAllHint).toEqual(expect.any(String));
    expect(s.modals.signOutAll.title).toEqual(expect.any(String));
  });

  test("Korean uses the decided label", () => {
    const ko = JSON.parse(read("locales/ko/settings.json")) as { signOutAll: string };
    expect(ko.signOutAll).toBe("모든 기기에서 로그아웃");
  });
});
