import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { selectSignInBranch, type SignInBranch } from "../sign-in-branch";
import { attachSignInExit, clearSignInExit, createSignInBackHandler, detachSignInExit, presentSignInExit, type PresentedSignInExit } from "../sign-in-back";
import type { SignInToast } from "../sign-in-toast";

const hook = readFileSync("src/lib/auth/useSignInForm.ts", "utf8");
const screen = readFileSync("src/screens/deepspace/dds-sign-in-screen.tsx", "utf8");
const focusEffect = hook.slice(hook.indexOf("  // D2 (Simon"), hook.indexOf("  const setEmailAndClearReset"));
// Execute the actual wiring predicates, not a second hand-written ownership rule.
const installGuard = focusEffect.match(/if \((.*?)\) return;/)![1];
const committedOwner = hook.match(/isGuestRef.current = ([^;]+);/)![1];
const bools = [false, true];
const kinds = ["deletion", "loading", "home", "form"] as const;
const receipt = { result: "deleted" };
const inputs = bools.flatMap(deleted => bools.flatMap(loading => bools.map(signedIn => ({
  deletionNotice: deleted ? receipt : null, loading, userId: signedIn ? "owner" : null,
}))));

// 4 branches x 2 user states x 2 focus states x 2 platforms = 32 cells.
// Impossible: home without a user, form with a user (8 cells).
const matrix = kinds.flatMap(kind => bools.flatMap(signedIn => bools.flatMap(focused =>
  ["android", "ios"].map(OS => ({ kind, signedIn, focused, OS })))));

function wiring(branch: SignInBranch<unknown>, userId: string | null, focused: boolean, OS: string) {
  const scope = { branch, userId, isFocused: focused, Platform: { OS } };
  return {
    subscribed: focused && !runInNewContext(installGuard, scope),
    guest: Boolean(runInNewContext(committedOwner, scope)),
  };
}

describe("R6 branch Back matrix", () => {
  test.each(matrix)("$kind user=$signedIn focus=$focused OS=$OS", ({ kind, signedIn, focused, OS }) => {
    const candidates = inputs.filter(input => Boolean(input.userId) === signedIn && selectSignInBranch(input).kind === kind);
    const impossible = (kind === "home" && !signedIn) || (kind === "form" && signedIn);
    expect(candidates.length === 0).toBe(impossible); // 분기 함수가 만들지 않음.
    for (const input of candidates) {
      const branch = selectSignInBranch(input);
      const owner = wiring(branch, input.userId, focused, OS);
      const expectedOwner = kind !== "home" && focused && OS === "android";
      expect(owner.subscribed).toBe(expectedOwner);
      expect(owner.guest).toBe(kind !== "home" && focused);
      let notice: SignInToast | null = null;
      let presented: PresentedSignInExit | null = null;
      const exitApp = jest.fn();
      const showNotice = jest.fn(() => { notice = { tone: "info", message: "exit", exitOnBack: true }; });
      const back = createSignInBackHandler({
        isGuest: () => owner.guest, isBusy: () => false,
        presentedExit: () => presented, hasPendingExit: () => notice?.exitOnBack === true,
        now: () => 100, showNotice, exitApp,
      });
      if (owner.subscribed) {
        expect(back()).toBe(true);
        expect(showNotice).toHaveBeenCalledTimes(1);
        expect(exitApp).not.toHaveBeenCalled();
        const requested = notice!;
        presented = attachSignInExit(notice, requested, presented);
        presented = presentSignInExit(notice, requested, presented, 100);
        expect(back()).toBe(true);
        expect(showNotice).toHaveBeenCalledTimes(1);
        expect(exitApp).toHaveBeenCalledTimes(1);
      } else {
        // No installed listener: the active route/platform owns both presses.
        expect(showNotice).not.toHaveBeenCalled();
        expect(exitApp).not.toHaveBeenCalled();
        if (kind === "home" || !focused) {
          // Even an old listener with a painted notice can only consume.
          notice = { tone: "info", message: "old", exitOnBack: true };
          presented = presentSignInExit(notice, notice, attachSignInExit(notice, notice, null), 100);
          expect(back()).toBe(true);
          expect(back()).toBe(true);
          expect(showNotice).not.toHaveBeenCalled();
          expect(exitApp).not.toHaveBeenCalled();
        }
      }
    }
  });
});

test.each(["deletion", "loading"] as const)("R6 late user preserves %s ownership until the home commit", (kind) => {
  let branch: SignInBranch<unknown> = selectSignInBranch({ deletionNotice: kind === "deletion" ? receipt : null, loading: kind === "loading", userId: null });
  let owner = wiring(branch, null, true, "android");
  let toast: SignInToast | null = null;
  let presented: PresentedSignInExit | null = null;
  const setToast = (next: SignInToast | null) => { toast = next; if (!next) presented = null; };
  const showNotice = jest.fn(() => setToast({ tone: "info", message: "exit", exitOnBack: true }));
  const exitApp = jest.fn();
  const back = createSignInBackHandler({
    isGuest: () => owner.guest, isBusy: () => false, presentedExit: () => presented,
    hasPendingExit: () => toast?.exitOnBack === true, now: () => 100, showNotice, exitApp,
  });
  back();
  const notice = toast!;
  presented = presentSignInExit(toast, notice, attachSignInExit(toast, notice, null), 100);
  branch = selectSignInBranch({ deletionNotice: kind === "deletion" ? receipt : null, loading: kind === "loading", userId: "owner" });
  owner = wiring(branch, "owner", true, "android");
  expect(owner.subscribed).toBe(true);
  expect(back()).toBe(true);
  expect(exitApp).toHaveBeenCalledTimes(1);
  branch = selectSignInBranch({ deletionNotice: null, loading: false, userId: "owner" });
  presented = detachSignInExit(presented, notice);
  clearSignInExit(toast, setToast);
  owner = wiring(branch, "owner", true, "android");
  expect(owner.subscribed).toBe(false);
  expect(back()).toBe(true); // Retained callback also stays safe after layout removal.
  expect(exitApp).toHaveBeenCalledTimes(1);
  expect(showNotice).toHaveBeenCalledTimes(1);
});

test("R6 one selector result feeds screen returns, layout ownership and focus installation", () => {
  expect(hook.match(/selectSignInBranch\(/g)).toHaveLength(1);
  expect(hook).toContain("const branch = selectSignInBranch({ deletionNotice, loading, userId });");
  expect(hook).toMatch(/return \{\s*branch,/);
  expect(screen).not.toContain("selectSignInBranch");
  expect(screen.match(/useAccountDeletionNotice\(\)/g)).toHaveLength(1);
  expect(screen).toMatch(/const deletionNotice = useAccountDeletionNotice\(\);\s*const \{\s*branch,/);
  expect(screen).toContain("} = useSignInForm(deletionNotice);");
  expect(screen).not.toMatch(/\b(?:userId|loading)\s*[,=]/);
  expect(screen).toContain("selectSignInNoticePlacement(branch, toast)");
  // No hidden re-assignment or copy between the hook and any screen return.
  const ast = ts.createSourceFile("screen.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let branchBindings = 0;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "branch") branchBindings += 1;
    if (ts.isBindingElement(node) && node.name.getText(ast) === "branch") {
      branchBindings += 1;
      expect(node.propertyName).toBeUndefined();
    }
    if (ts.isBinaryExpression(node) && node.left.getText(ast) === "branch") {
      expect(node.operatorToken.kind).not.toBe(ts.SyntaxKind.EqualsToken);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(branchBindings).toBe(1);
});

test("R6 layout and subscription depend on includesNotice, never userId or branch identity", () => {
  expect(committedOwner).toBe("branch.includesNotice && isFocused");
  expect(installGuard).toBe('Platform.OS !== "android" || !isFocused || !branch.includesNotice');
  expect(focusEffect).not.toContain("userId");
  expect(focusEffect).toContain("[branch.includesNotice, isFocused, setToast, t]");
  const layout = hook.slice(hook.indexOf("  useLayoutEffect("), hook.indexOf("  const [resetHelpVisible"));
  expect(layout).not.toContain("userId");
  expect(layout).toContain("[branch.includesNotice, isFocused, setToast]");
  // A fresh branch object or a late user on the same notice branch must not
  // clear its toast or reset its painted deadline on every render.
  expect(layout).not.toContain("[branch,");
  expect(focusEffect).not.toContain("[branch,");
});
