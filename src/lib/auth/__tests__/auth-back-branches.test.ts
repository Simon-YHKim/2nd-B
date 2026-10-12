import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { selectSignInBranch, selectSignInNoticePlacement, type SignInBranch } from "../sign-in-branch";
import type { SignInToast } from "../sign-in-toast";
import { attachSignInExit, createSignInBackHandler, presentSignInExit, type PresentedSignInExit } from "../sign-in-back";
import { createSignUpBackHandler } from "../sign-up-back";

const read = (path: string) => readFileSync(path, "utf8");
const bools = [false, true];
const signInFile = "src/screens/deepspace/dds-sign-in-screen.tsx";

// Independent expected table shared by selector coverage and screen wiring.
// A new union member must have a row; an extra screen return fails the same table.
const presentations = {
  deletion: { guard: 'branch.kind === "deletion"', exit: "overlay", other: "inline", children: ["inlineNotice", "AccountDeletionNoticePanel", "exitNoticeOverlay"] },
  loading: { guard: 'branch.kind === "loading"', exit: "overlay", other: "inline", children: ["PixelGateShell", "exitNoticeOverlay"] },
  home: { guard: 'branch.kind === "home"', exit: "none", other: "none", children: ["RedirectHome"] },
  form: { guard: "form", exit: "overlay", other: "inline", children: ["PixelGateShell", "exitNoticeOverlay"] },
} satisfies Record<SignInBranch<unknown>["kind"], {
  guard: string; exit: string; other: string; children: string[];
}>;

function parse(source: string) {
  return ts.createSourceFile(signInFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function declaration(name: string): string {
  const ast = parse(read(signInFile));
  const matches: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      matches.push(node.initializer?.getText(ast) ?? "");
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(matches).toHaveLength(1);
  return matches[0];
}

function jsxRoot(expression: string): ts.JsxElement | ts.JsxSelfClosingElement {
  const ast = parse(`const presentation = ${expression};`);
  const statement = ast.statements[0] as ts.VariableStatement;
  let node = statement.declarationList.declarations[0].initializer!;
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) throw new Error("Expected one screen root");
  return node;
}

function childNames(node: ts.JsxElement): string[] {
  return node.children.filter(child => !ts.isJsxText(child)).map(child => {
    if (ts.isJsxElement(child)) return child.openingElement.tagName.getText();
    if (ts.isJsxSelfClosingElement(child)) return child.tagName.getText();
    if (ts.isJsxExpression(child)) return child.expression?.getText() ?? "";
    return child.getText();
  });
}

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
  test("all eight login states select one branch and one placement for every notice kind", () => {
    const receipt = { localSignOut: "pending" };
    const notices: (SignInToast | null)[] = [
      null,
      ...(["info", "success", "danger"] as const).flatMap(tone => [
        { tone, message: "other" },
        { tone, message: "exit", exitOnBack: true as const },
      ]),
    ];
    const seen = new Set<string>();
    for (const deleted of bools) for (const loading of bools) for (const signedIn of bools) {
      const branch = selectSignInBranch({ deletionNotice: deleted ? receipt : null, loading, userId: signedIn ? "owner" : null });
      const expected = deleted ? "deletion" : loading ? "loading" : signedIn ? "home" : "form";
      expect(branch.kind).toBe(expected);
      expect(branch.includesNotice).toBe(expected !== "home");
      if (branch.kind === "deletion") expect(branch.notice).toBe(receipt);
      seen.add(branch.kind);
      for (const notice of notices) {
        const placement = notice === null ? "none"
          : notice.exitOnBack ? presentations[expected].exit : presentations[expected].other;
        expect(selectSignInNoticePlacement(branch, notice)).toBe(placement);
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(presentations).sort());
  });

  test("every guest presentation holds pending presses and exits only after attachment and paint", () => {
    for (const deleted of bools) for (const loading of bools) for (const busy of bools) {
      const branch = selectSignInBranch({ deletionNotice: deleted ? {} : null, loading, userId: null });
      let notice: SignInToast | null = null;
      let presented: PresentedSignInExit | null = null;
      const exit = jest.fn();
      const show = jest.fn(() => { notice = { tone: "info", message: "exit", exitOnBack: true }; });
      const back = createSignInBackHandler({
        isGuest: () => true, isBusy: () => busy, presentedExit: () => presented, hasPendingExit: () => notice?.exitOnBack === true,
        now: () => 100, showNotice: show, exitApp: exit,
      });
      expect(back()).toBe(true);
      expect(exit).not.toHaveBeenCalled();
      expect(selectSignInNoticePlacement(branch, notice)).toBe(busy ? "none" : "overlay");
      expect(back()).toBe(true);
      expect(exit).not.toHaveBeenCalled();
      if (notice) {
        presented = attachSignInExit(notice, notice, presented);
        presented = presentSignInExit(notice, notice, presented, 100);
      }
      expect(back()).toBe(true);
      expect(exit).toHaveBeenCalledTimes(busy ? 0 : 1);
      expect(show).toHaveBeenCalledTimes(busy ? 0 : 1);
    }
  });

  test("the selector table matches every return with one overlay sibling outside scroll content", () => {
    const branches = screenReturns(signInFile, "DeepSpaceSignInDesignScreen");
    expect(branches.map(row => row.guard)).toEqual(Object.values(presentations).map(row => row.guard));
    for (const [index, [kind, expected]] of Object.entries(presentations).entries()) {
      const root = jsxRoot(branches[index].jsx);
      if (kind === "home") {
        expect(root.getText()).toBe("<RedirectHome />");
        continue;
      }
      expect(ts.isJsxElement(root)).toBe(true);
      if (!ts.isJsxElement(root)) throw new Error("Missing viewport wrapper");
      expect(root.openingElement.getText()).toBe("<View style={styles.screen}>");
      expect(childNames(root)).toEqual(expected.children);
      expect(branches[index].jsx.match(/\{exitNoticeOverlay\}/g)).toHaveLength(1);
      expect(branches[index].jsx.match(/\{inlineNotice\}/g)).toHaveLength(1);
      const shell = root.children.find(child => ts.isJsxElement(child) && child.openingElement.tagName.getText() === "PixelGateShell");
      if (shell && ts.isJsxElement(shell)) {
        expect(childNames(shell).at(-1)).toBe("inlineNotice");
        expect(shell.getText()).not.toContain("exitNoticeOverlay");
      }
    }
    expect(branches[0].jsx).toContain("<AccountDeletionNoticePanel notice={branch.notice} />");
    expect(branches[3].jsx.indexOf("<BusinessFooter />")).toBeLessThan(branches[3].jsx.indexOf("{inlineNotice}"));
  });

  test("only the pure placement result routes the one unchanged accessible notice", () => {
    // R6 moves selection into the hook; the screen consumes that exact branch.
    expect(read(signInFile)).toContain("} = useSignInForm(deletionNotice);");
    expect(declaration("noticePlacement")).toBe("selectSignInNoticePlacement(branch, toast)");
    expect(declaration("inlineNotice")).toBe('noticePlacement === "inline" ? signInNotice : null');
    const notice = declaration("signInNotice");
    expect(notice).toMatch(/^noticePlacement !== "none" && toast \? \(/);
    expect(notice).toContain('accessibilityRole="alert"');
    expect(notice).toContain('accessibilityLiveRegion={toast.tone === "danger" ? "assertive" : "polite"}');
    expect(notice).toContain('<PixelSurface');
    expect(notice).toContain('variant="frame"');
    expect(notice).toContain("contentStyle={styles.toast}");
    for (const color of ["errorContainer", "tertiaryContainer", "primaryContainer"]) expect(notice).toContain(`m3.color.${color}`);
    for (const style of ["toastText", "toastDanger", "toastSuccess", "toastInfo"]) expect(notice).toContain(`styles.${style}`);
    expect(notice).toContain("{toast.message}");
    const source = read(signInFile);
    expect(source.match(/\{toast.message\}/g)).toHaveLength(1);
    expect(source.match(/\{signInNotice\}/g)).toHaveLength(1);
    expect(source.match(/<SafeAreaView\b/g)).toHaveLength(1);
    expect(source).not.toContain("toast.exitOnBackUntil");
  });

  test("the common overlay uses a bottom safe area, absolute token margins and passes every touch through", () => {
    const overlay = declaration("exitNoticeOverlay");
    expect(overlay).toMatch(/^noticePlacement === "overlay" && toast \? \(/);
    expect(overlay).toMatch(/<SignInExitNotice toast=\{toast\} onAttached=\{onExitNoticeAttached\} onPresented=\{onExitNoticePresented\}>\s*\{signInNotice\}\s*<\/SignInExitNotice>\s*\) : null$/);
    const component = read(signInFile).split("function SignInExitNotice(")[1].split("export function DeepSpaceSignInDesignScreen")[0];
    expect(component).toMatch(/<SafeAreaView\s+pointerEvents="none"\s+edges=\{\["bottom"\]\}\s+style=\{styles.exitNoticeOverlay\}\s*>\s*\{children\}\s*<\/SafeAreaView>/);
    const styles = declaration("styles");
    expect(declaration("EXIT_NOTICE_LAYER")).toBe("1");
    expect(styles).toMatch(/screen: \{ flex: 1 \}/);
    expect(styles).toMatch(/exitNoticeOverlay: \{\s*position: "absolute",\s*left: m3.spacing.s4,\s*right: m3.spacing.s4,\s*bottom: m3.spacing.s4,\s*zIndex: EXIT_NOTICE_LAYER,\s*elevation: EXIT_NOTICE_LAYER,\s*\}/);
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

  test("registration covers every focused Android notice branch and every signup branch", () => {
    const signIn = read("src/lib/auth/useSignInForm.ts");
    const signUp = read("src/lib/auth/useSignUpForm.ts");
    for (const [source, guard] of [
      [signIn, 'Platform.OS !== "android" || !isFocused || !branch.includesNotice'], [signUp, 'Platform.OS !== "android" || !isFocused'],
    ]) {
      const effect = source.slice(source.indexOf("  // D2 (Simon"));
      expect(effect.slice(0, effect.indexOf("const onBackPress"))).toContain(`if (${guard}) return;`);
      expect(effect.slice(0, effect.indexOf("const onBackPress"))).not.toMatch(/if \(loading/);
      expect(effect).toContain("sub.remove()");
      for (const OS of ["android", "ios", "web"]) for (const includesNotice of bools) {
        expect(Boolean(runInNewContext(guard, { Platform: { OS }, isFocused: true, branch: { includesNotice } })))
          .toBe(OS !== "android" || (source === signIn && !includesNotice));
      }
    }
  });
});
