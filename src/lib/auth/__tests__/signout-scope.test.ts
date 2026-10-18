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
    const local = settings.indexOf('onPress={() => confirm(t("actions.signOutHint"), signOutAndLeave("local"),');
    const global = settings.indexOf('onPress={() => confirm(t("actions.signOutAllHint"), signOutAndLeave("global"),');
    expect(local).toBeGreaterThan(-1);
    expect(global).toBeGreaterThan(local);
    expect(settings).toContain('label={t("signOutAll")}');
    expect(settings).toContain('{ title: t("modals.signOutAll.title"), action: t("signOutAll"), actionHint: t("actions.signOutAllHint"), cancelHint: t("modals.signOut.cancelHint") }');
    expect(settings.split("await signOut(scope);")).toHaveLength(2);
    expect(settings).not.toMatch(/await signOut\(\);/);
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
