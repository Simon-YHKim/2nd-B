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
  //  "finally" · "afterCatch" 모양 분기는 그대로 둔다 - 새 경로가 그 모양으로 들어오면
  //  다시 쓰인다. deep-space 계정 삭제는 0217 부터 /sign-in 이 아니라 영수증 화면으로
  //  가므로 아래 따로 선 검사가 진다.)
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

  // 0217 (Simon 결정 Q-261004-42 = A): 서버가 삭제를 확인한 뒤 화면은 쌓인 스택을 걷고
  // 영수증 화면 하나만 남긴 다음 그 계정을 로그아웃한다(deletion-completion.ts). 다른
  // 계정이 이미 주인이면 영수증 화면을 열지 않고, 로그아웃 중에 바뀌면 홈으로 비킨다.
  test("deep-space account deletion dismisses the owned stack immediately before the receipt route", () => {
    const source = readFileSync(
      resolve(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(source.match(/rootRouter\.dismissAll\(\);/g)).toHaveLength(1);
    expect(source).toMatch(/rootRouter\.dismissAll\(\);\n\s*rootRouter\.replace\(ACCOUNT_DELETED_ROUTE\);/);
    expect(source).not.toContain('router.replace("/sign-in")');
    const completion = readFileSync(resolve(ROOT, "src/lib/account/deletion-completion.ts"), "utf8")
      .replace(/\r\n/g, "\n");
    const body = completion.slice(completion.indexOf("export async function finishAccountDeletion("));
    const ownerCheck = body.indexOf("if (active !== null && active !== owner)");
    const open = body.indexOf("input.openReceipt();");
    const signOut = body.indexOf("await input.signOut();");
    const leave = body.indexOf("input.leaveReceipt();");
    expect(ownerCheck).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(ownerCheck);
    expect(signOut).toBeGreaterThan(open);
    expect(leave).toBeGreaterThan(signOut);
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
