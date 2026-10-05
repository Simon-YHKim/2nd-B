import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

interface SignOutPath {
  label: string;
  source: string;
  navigationOwner: "success" | "finally" | "afterCatch";
}

const PATHS: SignOutPath[] = [
  {
    label: "settings sign-out success",
    source: readFileSync(resolve(ROOT, "src/app/settings.tsx"), "utf8").replace(/\r\n/g, "\n"),
    navigationOwner: "success",
  },
  // ("legacy account deletion" 항목은 2026-10-05 에 걷었다. 그 렌더러의 보관본
  //  legacy/screens/account.tsx 가 E:/Legacy/2ndB 로 나갔고(롤백 레버 제거, Simon 결정
  //  Q-261004-11 C), 검사는 보관본을 읽지 않는다(legacy-archive-integrity.test.ts).
  //  배송 화면의 같은 규칙은 아래 deep-space 항목이 진다. "finally" 모양 분기는 그대로
  //  둔다 - 새 경로가 그 모양으로 들어오면 다시 쓰인다.)
  // ("deep-space account deletion" moved out of this table on 2026-10-05: a
  //  confirmed erasure no longer lands on /sign-in but on the receipt route that
  //  reads the server's record by number (Simon decision Q-261004-42 = A). Its
  //  own test below keeps the same "dismiss right before replace" rule. The
  //  "afterCatch" branch stays for the next path shaped that way.)
];

describe("account sign-out navigation dismissal", () => {
  test.each(PATHS)("$label dismisses the owned stack immediately before replacement", ({
    source,
    navigationOwner,
  }) => {
    const signOutCall = source.includes("await signOutExpected(authExpectation);")
      ? "await signOutExpected(authExpectation);"
      : "await signOut();";
    const signOutAt = source.indexOf(signOutCall);
    const dismissAt = source.indexOf("router.dismissAll();", signOutAt);
    const replaceAt = source.indexOf('router.replace("/sign-in");', signOutAt);

    expect(source.split(signOutCall)).toHaveLength(2);
    expect(source.match(/router\.dismissAll\(\);/g)).toHaveLength(1);
    expect(source.match(/router\.replace\("\/sign-in"\);/g)).toHaveLength(1);
    expect(signOutAt).toBeGreaterThan(-1);
    expect(dismissAt).toBeGreaterThan(signOutAt);
    expect(replaceAt).toBeGreaterThan(dismissAt);
    expect(source.slice(dismissAt, replaceAt)).toMatch(/^router\.dismissAll\(\);\n\s*$/);

    const catchAt = source.indexOf("} catch (e) {", signOutAt);
    if (navigationOwner === "success") {
      expect(replaceAt).toBeLessThan(catchAt);
    } else if (navigationOwner === "finally") {
      const finallyAt = source.indexOf("} finally {", catchAt);
      expect(finallyAt).toBeGreaterThan(catchAt);
      expect(dismissAt).toBeGreaterThan(finallyAt);
    } else {
      const ownerChangedReturn = source.indexOf(
        "if (e instanceof AuthSessionOwnerChangedError)",
        catchAt,
      );
      expect(ownerChangedReturn).toBeGreaterThan(catchAt);
      expect(source.slice(ownerChangedReturn, dismissAt)).toContain("return;");
      expect(dismissAt).toBeGreaterThan(catchAt);
    }
  });

  test("deep-space account deletion dismisses the owned stack immediately before the receipt route", () => {
    const source = readFileSync(
      resolve(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    // finishAccountDeletion opens the route through this callback BEFORE it
    // signs A out (deletion-completion.ts says why), and takes it back down
    // through leaveReceipt when another account took over.
    const finishAt = source.indexOf("await finishAccountDeletion({");
    const openAt = source.indexOf("openReceipt: (href) => {", finishAt);
    const dismissAt = source.indexOf("rootRouter.dismissAll();", openAt);
    const replaceAt = source.indexOf("rootRouter.replace(href);", dismissAt);
    const callEnd = source.indexOf("});", finishAt);

    expect(finishAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(finishAt);
    expect(source.match(/rootRouter\.dismissAll\(\);/g)).toHaveLength(1);
    expect(source.match(/rootRouter\.replace\(href\);/g)).toHaveLength(1);
    expect(source.slice(dismissAt, replaceAt)).toMatch(/^rootRouter\.dismissAll\(\);\n\s*$/);
    expect(replaceAt).toBeLessThan(callEnd);
    expect(source.slice(finishAt, callEnd)).toContain('leaveReceipt: () => rootRouter.replace("/")');
    // Nothing navigates after the call returns: the owner-changed branch only
    // lifts the screen's own fence.
    const afterCall = source.slice(callEnd, source.indexOf("function requestDeleteAccountConfirm", callEnd));
    expect(afterCall).not.toMatch(/router\.(replace|push|dismissAll)/);
  });

  test("complete-profile resets the root and nested auth stacks after every successful sign-out", () => {
    const source = readFileSync(
      resolve(ROOT, "src/app/(auth)/complete-profile.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(source.match(/signOutAndSettle\(\{/g)).toHaveLength(3);
    expect(source.match(/if \(signedOut\) \{/g)).toHaveLength(3);
    expect(source.match(/^\s*resetSignedOutNavigation\(\);$/gm)).toHaveLength(3);
    expect(source.match(/rootNavigation\.resetRoot\(\{/g)).toHaveLength(1);
    expect(source).toContain('name: "(auth)"');
    expect(source).toContain('state: { index: 0, routes: [{ name: "sign-in" }] }');
    expect(source).toMatch(
      /if \(!rootNavigation\) \{[\s\S]*?router\.dismissAll\(\);\n\s*router\.replace\("\/sign-in"\);[\s\S]*?return;/,
    );
  });
});
