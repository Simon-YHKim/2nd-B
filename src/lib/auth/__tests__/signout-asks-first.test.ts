// A-Z first-use check, round 3 (Z37). The settings screen signed out the moment the button was
// touched. It now asks first, through the confirm dialog that screen already uses for deletes,
// with the dialog's delete wording replaced for this one action.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const settings = read("src/app/settings.tsx");

describe("Z37: signing out asks first", () => {
  test("the button opens the confirm dialog and signs out only from it", () => {
    // Q-261018-50 (review #2625 r1): the button captures the session, then opens the dialog.
    expect(settings).toContain('onPress={() => void askSignOut("local")}');
    const call = settings.indexOf('confirm(t("actions.signOutHint"), signOutAndLeave(expected, "local"),');
    const ask = settings.indexOf('{ title: t("modals.signOut.title"), action: t("signOut")');
    expect(call).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(call);
    // Q-261018-50: both sign-out buttons share one path; the only signOut call is inside it.
    expect(settings.split("await signOutCaptured(expected, scope);")).toHaveLength(2);
  });

  test("the dialog does not use the delete wording for it", () => {
    expect(settings).toContain('{pendingConfirm?.ask?.title ?? t("modals.confirm.title")}');
    expect(settings).toContain('label={pendingConfirm?.ask?.action ?? t("modals.confirm.delete")}');
    expect(settings).toContain('variant={pendingConfirm?.ask ? "primary" : "danger"}');
    expect(settings).toContain('accessibilityHint={pendingConfirm?.ask?.cancelHint ?? t("modals.confirm.cancelHint")}');
  });

  test.each(["en", "ko", "es", "pt", "id"])("%s has the question and the cancel hint", (lng) => {
    const modals = (JSON.parse(read(`locales/${lng}/settings.json`)) as { modals: { signOut: Record<string, string>; confirm: Record<string, string> } }).modals;
    expect(modals.signOut.title.length).toBeGreaterThan(0);
    expect(modals.signOut.cancelHint.length).toBeGreaterThan(0);
    expect(modals.signOut.title).not.toBe(modals.confirm.title);
  });
});
