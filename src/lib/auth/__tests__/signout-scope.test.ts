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
    expect(ask).toContain("if (!expected.userId) return;");
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

  test("one sign-out at a time: the latch is taken before the await and released only on failure", () => {
    expect(settings).toContain("const signOutInFlight = useRef(false);");
    const ask = settings.slice(settings.indexOf("async function askSignOut("), settings.indexOf("function signOutAndLeave("));
    expect(ask.indexOf("if (signOutInFlight.current) return;")).toBe(ask.indexOf("{") + ask.slice(ask.indexOf("{")).indexOf("if (signOutInFlight.current) return;"));
    const leave = settings.slice(settings.indexOf("function signOutAndLeave("), settings.indexOf("function showActionError("));
    const guard = leave.indexOf("if (signOutInFlight.current) return;");
    const take = leave.indexOf("signOutInFlight.current = true;");
    const busy = leave.indexOf('setBusy("signOut");');
    const call = leave.indexOf("await signOutCaptured(expected, scope);");
    expect(guard).toBeGreaterThan(-1);
    expect(take).toBeGreaterThan(guard);
    expect(busy).toBeGreaterThan(take);
    expect(call).toBeGreaterThan(busy);
    const failure = leave.slice(leave.indexOf("} catch (e) {"));
    expect(failure.indexOf("signOutInFlight.current = false;")).toBeGreaterThan(-1);
    expect(failure.indexOf("setBusy(null);")).toBeGreaterThan(-1);
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
