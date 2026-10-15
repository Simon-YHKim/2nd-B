import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

import {
  __resetAccountEpochForTests,
  accountEpochFromSnapshot,
  accountTransitionPendingFromSnapshot,
  accountTransitionSnapshot,
  beginAccountOwnerTransition,
  clearAccountTransition,
  currentAccountEpoch,
  noteResolvedOwner,
} from "../../lib/auth/account-epoch";

// 소유자가 바뀌면 /privacy 는 새 인스턴스로 다시 마운트된다 (게이트 지적
// AG-03 · AUTH-R2-01 의 반박 근거, PR #2040).
//
// 두 지적은 같은 전제에 서 있었다. "/privacy 배송 분기(privacy.tsx 의
// `<DeepSpacePrivacyDesignScreen />`)에 owner key 가 없다. 그래서 refresh() 가
// B 를 loading:false 로 바로 게시하면 같은 인스턴스가 살아남아, A 의 설정
// 상태·삭제 오류·열린 확인창이 B 화면에 한 커밋 보이고, A 삭제가 남긴
// allowDeletionNavigationRef=true 가 B 의 다음 삭제까지 넘어간다."
//
// key 는 라우트 파일이 아니라 루트 레이아웃에 있다. `_layout.tsx` 의
// screenLayout 이 모든 Stack 장면을 <AccountScope> 로 감싸고, AccountScope 는
// 전환이 보류 중이면 장면을 아예 그리지 않고(null), 아니면
// `<Fragment key={epoch}>` 로 그린다. 소유자가 바뀌는 게시는 전부
// noteResolvedOwner() 로 epoch 를 올리고 그 직후에 setState 한다
// (account-scope.test.ts 가 그 순서를 지킨다). 그래서 B 를 본 첫 렌더에서
// A 의 인스턴스는 이미 내려가 있다.
//
// ⚠ 이 파일이 생긴 이유: 그 전제를 지키는 검사가 반쪽이었다. account-scope.test
// 는 `key={epoch}` 와 `(auth)` 면제 문자열이 "있는지"만 본다. 그래서
// `if (routeName === "privacy") return <>{children}</>;` 한 줄을 끼워 넣어
// /privacy 를 경계 밖으로 빼도 14/14 초록이었다(2026-10-05 변이로 실측).
// 여기서는 AccountScope 의 실제 본문을 떼어 실행하고, 실제 account-epoch
// 상태 기계로 소유자를 바꿔 가며 무엇이 그려지는지 본다.

const ROOT = resolve(__dirname, "../../..");
const LAYOUT_PATH = "src/app/_layout.tsx";
const LAYOUT = readFileSync(resolve(ROOT, LAYOUT_PATH), "utf8");
const AST = ts.createSourceFile(LAYOUT_PATH, LAYOUT, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const FRAGMENT = "Fragment";
const REACT_FRAGMENT = "React.Fragment";

interface Rendered {
  type: unknown;
  key: unknown;
  children: unknown[];
}

function routeRoster(): string[] {
  const names: string[] = [];
  const walk = (node: ts.Node): void => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
      && node.tagName.getText(AST) === "Stack.Screen"
    ) {
      for (const prop of node.attributes.properties) {
        if (
          ts.isJsxAttribute(prop)
          && prop.name.getText(AST) === "name"
          && prop.initializer
          && ts.isStringLiteral(prop.initializer)
        ) {
          names.push(prop.initializer.text);
        }
      }
    }
    node.forEachChild(walk);
  };
  walk(AST);
  return names;
}

function accountScope(): (props: { children: unknown; routeName: string }) => Rendered | null {
  let text = "";
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "AccountScope") text = node.getText(AST);
    node.forEachChild(walk);
  };
  walk(AST);
  if (!text) throw new Error("AccountScope 선언을 찾지 못했다");
  const js = ts.transpileModule(`${text}\nexports.f = AccountScope;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported: { f?: (props: { children: unknown; routeName: string }) => Rendered | null } = {};
  const React = {
    Fragment: REACT_FRAGMENT,
    createElement: (type: unknown, props: { key?: unknown } | null, ...children: unknown[]): Rendered => ({
      type,
      key: props?.key ?? null,
      children,
    }),
  };
  new Function(
    "exports",
    "React",
    "Fragment",
    "useSyncExternalStore",
    "subscribeAccountTransition",
    "accountTransitionSnapshot",
    "accountTransitionPendingFromSnapshot",
    "accountEpochFromSnapshot",
    js,
  )(
    exported,
    React,
    FRAGMENT,
    // 실제 훅처럼 렌더 시점의 스냅숏을 읽는다.
    (_subscribe: unknown, getSnapshot: () => number) => getSnapshot(),
    () => () => undefined,
    accountTransitionSnapshot,
    accountTransitionPendingFromSnapshot,
    accountEpochFromSnapshot,
  );
  if (!exported.f) throw new Error("AccountScope 를 실행하지 못했다");
  return exported.f;
}

const ROUTES = routeRoster();
const scope = accountScope();
const render = (routeName: string) => scope({ children: "SCENE", routeName });

beforeEach(() => {
  __resetAccountEpochForTests();
  noteResolvedOwner(A);
});

describe("AccountScope 의 면제는 (auth) 하나뿐이다", () => {
  test("로스터와 함수를 실제로 읽었다", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(30);
    expect(ROUTES).toContain("privacy");
    expect(ROUTES).toContain("(auth)");
  });

  test("전환이 보류 중이면 (auth) 말고 어떤 장면도 그리지 않는다", () => {
    beginAccountOwnerTransition(B);
    const drawn = ROUTES.filter((route) => render(route) !== null);
    expect(drawn).toEqual(["(auth)"]);
  });

  test("보류가 아니면 (auth) 말고 모든 장면이 owner epoch 를 key 로 단다", () => {
    const epoch = currentAccountEpoch();
    const unkeyed = ROUTES.filter((route) => {
      const out = render(route);
      return !(out && out.type === FRAGMENT && out.key === epoch && out.children[0] === "SCENE");
    });
    expect(unkeyed).toEqual(["(auth)"]);
    // (auth) 는 가입·비밀번호 복구의 손넘김을 지키려고 일부러 key 없이 그린다.
    expect(render("(auth)")).toEqual({ type: REACT_FRAGMENT, key: null, children: ["SCENE"] });
  });
});

describe("/privacy 는 다음 소유자에게 인스턴스를 넘기지 않는다", () => {
  test.each([
    // refresh() 는 begin 다음 note 를 부르고 loading:false 로 B 를 게시한다.
    ["refresh() 처럼 begin(B) -> note(B), 로딩 없음", true],
    // begin 없이 note 만 와도(동기 게시 직전 한 줄) 같은 결과여야 한다.
    ["note(B) 만", false],
  ])("A -> B (%s): B 가 게시된 스냅숏에서 A 인스턴스는 이미 내려가 있고, 다시 그릴 때는 새 key 다", (_label, withBegin) => {
    const before = render("privacy");
    expect(before?.type).toBe(FRAGMENT);

    if (withBegin) {
      beginAccountOwnerTransition(B);
      // B 를 게시하기도 전에(알림 정리 await 동안) 이미 그리지 않는다.
      expect(render("privacy")).toBeNull();
    }
    noteResolvedOwner(B);
    // AuthContext 는 이 직후 setState({ userId: B, loading: false }) 한다.
    // 그 렌더가 읽는 스냅숏에서 /privacy 는 그려지지 않는다.
    expect(render("privacy")).toBeNull();

    // 루트 스택이 "/" 하나뿐임이 증명되면(PendingAccountTransitionResolver) 풀린다.
    expect(clearAccountTransition(currentAccountEpoch())).toBe(true);
    const after = render("privacy");
    expect(after?.type).toBe(FRAGMENT);
    // 다른 key = React 가 이전 인스턴스를 버리고 새로 마운트한다. A 의 useState
    // (설정 값, delError, 열린 확인창)도 useRef(allowDeletionNavigationRef)도
    // 새 인스턴스에는 없다.
    expect(after?.key).not.toBe(before?.key);
  });

  test("A -> null (다른 탭 로그아웃, resolveSession 순서): 새 key 로 다시 마운트된다", () => {
    const before = render("privacy");
    beginAccountOwnerTransition(null);
    expect(render("privacy")).toBeNull();
    noteResolvedOwner(null);
    const after = render("privacy");
    expect(after?.type).toBe(FRAGMENT);
    expect(after?.key).not.toBe(before?.key);
  });

  test("같은 소유자의 재게시는 인스턴스를 유지한다 (불필요한 재마운트 없음)", () => {
    const before = render("privacy");
    noteResolvedOwner(A);
    expect(render("privacy")?.key).toBe(before?.key);
  });
});
