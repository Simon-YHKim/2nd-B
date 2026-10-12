import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { selectSignInBranch } from "../sign-in-branch";
import { createSignInBackHandler } from "../sign-in-back";
import { createSignUpBackHandler } from "../sign-up-back";

const read = (path: string) => readFileSync(path, "utf8");
const bools = [false, true];

// Inspect only this screen's returns, never callbacks, nested components or hooks.
function screenReturns(file: string, name: string) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = source.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!screen?.body) throw new Error(`Missing screen: ${name}`);
  const returns: { guard: string; jsx: string }[] = [];
  const visit = (node: ts.Node, guard = "form") => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isIfStatement(node)) {
      visit(node.thenStatement, node.expression.getText(source));
      if (node.elseStatement) visit(node.elseStatement, `!(${node.expression.getText(source)})`);
    } else if (ts.isReturnStatement(node)) {
      returns.push({ guard, jsx: node.expression?.getText(source) ?? "" });
    } else ts.forEachChild(node, child => visit(child, guard));
  };
  visit(screen.body);
  return returns;
}

describe("R3-1 auth branch matrix", () => {
  test("all eight login states select the receipt, loading, home or form with a notice slot", () => {
    const receipt = { localSignOut: "pending" };
    for (const deleted of bools) for (const loading of bools) for (const signedIn of bools) {
      const branch = selectSignInBranch({ deletionNotice: deleted ? receipt : null, loading, userId: signedIn ? "owner" : null });
      const expected = deleted ? "deletion" : loading ? "loading" : signedIn ? "home" : "form";
      expect(branch.kind).toBe(expected);
      expect(branch.includesNotice).toBe(expected !== "home");
      if (branch.kind === "deletion") expect(branch.notice).toBe(receipt);
    }
  });

  test("every guest presentation shows the first notice and exits only on the second idle press", () => {
    for (const deleted of bools) for (const loading of bools) for (const busy of bools) {
      const branch = selectSignInBranch({ deletionNotice: deleted ? {} : null, loading, userId: null });
      let notice: number | undefined;
      const exit = jest.fn();
      const show = jest.fn((deadline: number) => { notice = deadline; });
      const back = createSignInBackHandler({ isBusy: () => busy, exitDeadline: () => notice, now: () => 100, showNotice: show, exitApp: exit });
      expect(back()).toBe(true);
      expect(exit).not.toHaveBeenCalled();
      expect(branch.includesNotice && notice !== undefined).toBe(!busy);
      expect(back()).toBe(true);
      expect(exit).toHaveBeenCalledTimes(busy ? 0 : 1);
      expect(show).toHaveBeenCalledTimes(busy ? 0 : 1);
    }
  });

  test("the screen has exactly the selector branches and renders the same accessible notice in each owned branch", () => {
    const file = "src/screens/deepspace/dds-sign-in-screen.tsx";
    const source = read(file);
    const branches = screenReturns(file, "DeepSpaceSignInDesignScreen");
    expect(branches.map(row => row.guard)).toEqual([
      'branch.kind === "deletion"', 'branch.kind === "loading"', 'branch.kind === "home"', "form",
    ]);
    for (const [index, kind] of ["deletion", "loading", "home", "form"].entries()) {
      expect(branches[index].jsx.includes("{signInNotice}")).toBe(kind !== "home");
    }
    expect(branches[0].jsx).toContain("<AccountDeletionNoticePanel notice={branch.notice} />");
    expect(source).toContain("const branch = selectSignInBranch({ deletionNotice, loading, userId })");
    expect(source).toContain("const signInNotice = branch.includesNotice && toast ? (");
    expect(source).toContain('accessibilityRole="alert"');
    expect(source).toContain('accessibilityLiveRegion={toast.tone === "danger" ? "assertive" : "polite"}');
    expect(source).toContain("{toast.message}");
  });

  test("all signup branches, including redirect variants and confirmation, request sign-in or hold the live write", () => {
    const branches = screenReturns("src/screens/deepspace/dds-sign-up-screen.tsx", "DeepSpaceSignUpDesignScreen");
    expect(branches.map(row => row.guard)).toEqual(["loading", "userId && !submitting && !judgeWelcome && !toast", "form"]);
    expect(branches[1].jsx).toBe('avatarSetupAfterConfirmation ? <Redirect href="/avatar-studio?setup=1" /> : <RedirectHome />');
    const seen = new Set<string>();
    for (const loading of bools) for (const signedIn of bools) for (const submitting of bools)
      for (const judgeWelcome of bools) for (const toast of bools) for (const avatar of bools) {
        const state = { loading, userId: signedIn ? "owner" : null, submitting, judgeWelcome, toast };
        // Evaluate only the two real source predicates, with no hooks or RN imports.
        const row = branches.find(row => row.guard === "form" || runInNewContext(row.guard, state))!;
        const kind = row === branches[1] ? (avatar ? "avatar" : "home") : row === branches[0] ? "loading" : "form";
        expect(kind).toBe(loading ? "loading" : signedIn && !submitting && !judgeWelcome && !toast ? (avatar ? "avatar" : "home") : "form");
        seen.add(kind);
        for (const busy of bools) {
          const dismissTo = jest.fn();
          const back = createSignUpBackHandler({ isBusy: () => busy, router: { dismissTo } });
          expect(back()).toBe(true);
          expect(dismissTo.mock.calls).toEqual(busy ? [] : [["/sign-in"]]);
        }
      }
    expect([...seen].sort()).toEqual(["avatar", "form", "home", "loading"]);
  });

  test("registration covers every focused Android guest branch and every signup branch", () => {
    const signIn = read("src/lib/auth/useSignInForm.ts");
    const signUp = read("src/lib/auth/useSignUpForm.ts");
    for (const [source, guard] of [
      [signIn, 'Platform.OS !== "android" || userId'], [signUp, 'Platform.OS !== "android"'],
    ]) {
      const effect = source.slice(source.indexOf("useFocusEffect(useCallback("));
      expect(effect.slice(0, effect.indexOf("const onBackPress"))).toContain(`if (${guard}) return;`);
      expect(effect.slice(0, effect.indexOf("const onBackPress"))).not.toMatch(/if \(loading/);
      expect(effect).toContain("sub.remove()");
      for (const OS of ["android", "ios", "web"]) for (const userId of [null, "owner"]) {
        expect(Boolean(runInNewContext(guard, { Platform: { OS }, userId })))
          .toBe(OS !== "android" || (source === signIn && userId !== null));
      }
    }
  });
});
