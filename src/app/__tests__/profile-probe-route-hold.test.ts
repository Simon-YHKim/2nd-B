// 프로필 프로브가 실패한(모름) 동안 기능 라우트가 열리지 않는가 (vibe r260914 R3-A 게이트 발견).
//
// 두 게이트가 같은 뿌리를 다른 경로로 잡았다. 실패 화면(ProfileProbeRetryScreen)이
// DeepSpaceScreen 도크를 달고 있었고, 전역 C10 리다이렉트(IntroGate)는
// `!profileProbeFailed` 일 때만 돌아서 실패 상태를 그대로 통과시켰다. 도크 목적지
// /records · /settings · /import-hub 는 userId 만 본다. 그래서
//   - 프로필 · 생년월일 · 동의가 없는 신규 OAuth 세션이 연령 · 동의 전에 기능 화면에 들어갔고
//     (생성물 게이트),
//   - 첫 프로브 실패로 isMinor=null 인 등록 14~17세 계정이 설정 → 데이터 가져오기 → SMS 로
//     통신 파생 데이터를 저장할 수 있었다(인가 게이트).
//
// 고친 모양은 라우트 층에서 막는 것이다. 판정은 profileProbeHoldsRoute 하나고, 두 자리가 부른다.
//   1. IntroGate - 실패 상태에서는 Stack(기능 라우트 자식)을 마운트하지 않고 다시 시도를 그린다.
//   2. ThemedStack screenLayout 의 ProfileProbeScope - 장면마다 자기 라우트 이름으로 같은 판정을
//      한다. IntroGate 가 읽는 경로(useSegments)는 라우터 저장소에서 오고, 그 저장소는
//      네비게이터가 커밋한 뒤에야 바뀐다(expo-router store.onStateChange). 그래서 예외
//      라우트((auth) · onboarding)에서 나간 장면은 한 커밋 동안 마운트돼 효과를 돌린다.
//      예외 라우트 밑에 쌓여 있던 장면도 마운트된 채다. 장면의 라우트 이름은 그 커밋 안에 있다.
//
// 컴포넌트 렌더 테스트가 막혀 있어(RN 0.85 upstream) 판정은 실행하고 배선은 AST 로 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import {
  PROFILE_GATE_EXEMPT_SEGMENTS,
  profileGate,
  profileProbeHoldsRoute,
  type ProfileGateSnapshot,
} from "../../lib/auth/profile-probe";

const ROOT = process.cwd();

function parse(file: string): ts.SourceFile {
  const text = readFileSync(join(ROOT, file), "utf8");
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function hasDescendant(node: ts.Node, predicate: (candidate: ts.Node) => boolean): boolean {
  if (predicate(node)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && hasDescendant(child, predicate)) found = true;
  });
  return found;
}

function containsIdentifier(node: ts.Node, name: string): boolean {
  return hasDescendant(node, (candidate) => ts.isIdentifier(candidate) && candidate.text === name);
}

function findCall(node: ts.Node, name: string): ts.CallExpression | undefined {
  let call: ts.CallExpression | undefined;
  hasDescendant(node, (candidate) => {
    if (ts.isCallExpression(candidate) && ts.isIdentifier(candidate.expression) && candidate.expression.text === name) {
      call = candidate;
      return true;
    }
    return false;
  });
  return call;
}

/** JSX 태그 이름을 나오는 순서대로. 바깥 요소가 먼저다. */
function jsxTags(node: ts.Node, sf: ts.SourceFile): string[] {
  const tags: string[] = [];
  const visit = (candidate: ts.Node): void => {
    if (ts.isJsxOpeningElement(candidate) || ts.isJsxSelfClosingElement(candidate)) {
      tags.push(candidate.tagName.getText(sf));
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return tags;
}

function redirectHrefs(node: ts.Node, sf: ts.SourceFile): string[] {
  const hrefs: string[] = [];
  const visit = (candidate: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(candidate) && candidate.tagName.getText(sf) === "Redirect") {
      for (const property of candidate.attributes.properties) {
        if (
          ts.isJsxAttribute(property) &&
          property.name.getText(sf) === "href" &&
          property.initializer &&
          ts.isStringLiteral(property.initializer)
        ) {
          hrefs.push(property.initializer.text);
        }
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return hrefs;
}

function functionBody(sf: ts.SourceFile, name: string): readonly ts.Statement[] {
  const declaration = sf.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!declaration?.body) throw new Error(`${sf.fileName} must declare function ${name}`);
  return declaration.body.statements;
}

const holdsCall = (statement: ts.Statement): statement is ts.IfStatement =>
  ts.isIfStatement(statement) && findCall(statement.expression, "profileProbeHoldsRoute") !== undefined;

describe("profileProbeHoldsRoute - 모름이면 기능 라우트를 붙든다", () => {
  const FAILED: ProfileGateSnapshot = {
    loading: false,
    userId: "user-a",
    hasProfile: false,
    profileProbeFailed: true,
  };

  // 도크가 열던 목적지와 홈 · 대화 · 가져오기. undefined 는 "/"(index)다 - useSegments() 가
  // 빈 배열을 준다. 장면 쪽은 라우트 이름 "index" 로 온다.
  const FEATURE_SEGMENTS: (string | undefined)[] = [
    undefined,
    "index",
    "records",
    "settings",
    "import-hub",
    "import",
    "capture",
    "secondb",
    "interview",
    "account",
    "call-reflection",
    "community",
    "+not-found",
  ];

  test.each(FEATURE_SEGMENTS)("실패 상태의 기능 라우트 %s 는 붙든다", (segment) => {
    expect(profileProbeHoldsRoute(FAILED, segment)).toBe(true);
  });

  test("예외는 가입을 마치는 (auth) 와 읽기 전용 onboarding 둘뿐이다", () => {
    expect([...PROFILE_GATE_EXEMPT_SEGMENTS].sort()).toEqual(["(auth)", "onboarding"]);
    for (const segment of PROFILE_GATE_EXEMPT_SEGMENTS) {
      expect(profileProbeHoldsRoute(FAILED, segment)).toBe(false);
    }
  });

  test("붙드는 상태는 profile-error 하나뿐이다 - 나머지는 원래 게이트가 맡는다", () => {
    const segments = [...FEATURE_SEGMENTS, ...PROFILE_GATE_EXEMPT_SEGMENTS];
    let held = 0;
    for (const loading of [false, true]) {
      for (const userId of [null, "user-a"]) {
        for (const hasProfile of [null, false, true]) {
          for (const profileProbeFailed of [false, true]) {
            const snapshot: ProfileGateSnapshot = { loading, userId, hasProfile, profileProbeFailed };
            for (const segment of segments) {
              const exempt = segment !== undefined && PROFILE_GATE_EXEMPT_SEGMENTS.includes(segment);
              const expected = profileGate(snapshot) === "profile-error" && !exempt;
              expect(profileProbeHoldsRoute(snapshot, segment)).toBe(expected);
              if (expected) held += 1;
            }
          }
        }
      }
    }
    // profile-error 스냅샷 3개(hasProfile null/false/true) × 기능 라우트 13개.
    expect(held).toBe(3 * FEATURE_SEGMENTS.length);
  });

  test("서버가 답한 상태는 붙들지 않는다 - 프로필 있음은 통과, 프로필 없음은 C10 리다이렉트 몫", () => {
    expect(profileProbeHoldsRoute({ ...FAILED, hasProfile: true, profileProbeFailed: false }, "records")).toBe(false);
    expect(profileProbeHoldsRoute({ ...FAILED, profileProbeFailed: false }, "records")).toBe(false);
  });
});

describe("IntroGate - 실패 상태에서는 기능 라우트 자식을 마운트하지 않는다", () => {
  const sf = parse("src/app/_layout.tsx");
  const statements = functionBody(sf, "IntroGate");
  const holdIndex = statements.findIndex(holdsCall);

  test("판정은 profileProbeHoldsRoute 가 하고 라우트는 segments[0] 로 넘긴다", () => {
    expect(holdIndex).toBeGreaterThan(-1);
    const call = findCall((statements[holdIndex] as ts.IfStatement).expression, "profileProbeHoldsRoute")!;
    expect(call.arguments).toHaveLength(2);
    expect(call.arguments[1].getText(sf)).toBe("segments[0]");
    const snapshot = call.arguments[0];
    expect(ts.isObjectLiteralExpression(snapshot)).toBe(true);
    const fields = (snapshot as ts.ObjectLiteralExpression).properties.map((p) => p.name?.getText(sf));
    expect(fields.sort()).toEqual(["hasProfile", "loading", "profileProbeFailed", "userId"]);
  });

  test("붙든 갈래는 공용 다시 시도만 그리고 children 을 내주지 않는다", () => {
    const hold = statements[holdIndex] as ts.IfStatement;
    expect(jsxTags(hold.thenStatement, sf)).toEqual(["ProfileProbeRetryScreen"]);
    expect(containsIdentifier(hold.thenStatement, "children")).toBe(false);
  });

  test("복구 · 비밀번호 재설정 뒤, children 을 내주는 어떤 갈래보다 앞이다", () => {
    const storageIndex = statements.findIndex((s) => jsxTags(s, sf).includes("EncryptedStorageRecoveryGate"));
    const resetIndex = statements.findIndex((s) => redirectHrefs(s, sf).includes("/reset-password"));
    const firstChildrenIndex = statements.findIndex((s) => containsIdentifier(s, "children"));
    expect(storageIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(storageIndex);
    expect(holdIndex).toBeGreaterThan(resetIndex);
    expect(firstChildrenIndex).toBeGreaterThan(holdIndex);
  });
});

describe("ThemedStack screenLayout - 장면마다 자기 라우트 이름으로 붙든다", () => {
  const sf = parse("src/app/_layout.tsx");

  test("모든 장면이 ProfileProbeScope 를 지나고, 계정 경계 AccountScope 는 그 안에 그대로다", () => {
    let layout: ts.JsxAttribute | undefined;
    hasDescendant(sf, (candidate) => {
      if (
        ts.isJsxAttribute(candidate) &&
        candidate.name.getText(sf) === "screenLayout" &&
        ts.isJsxOpeningElement(candidate.parent.parent) &&
        candidate.parent.parent.tagName.getText(sf) === "Stack"
      ) {
        layout = candidate;
        return true;
      }
      return false;
    });
    expect(layout).toBeDefined();
    expect(jsxTags(layout!, sf)).toEqual(["ProfileProbeScope", "AccountScope"]);
  });

  test("ProfileProbeScope 는 붙들면 children 대신 다시 시도를 그린다", () => {
    const statements = functionBody(sf, "ProfileProbeScope");
    const holdIndex = statements.findIndex(holdsCall);
    expect(holdIndex).toBeGreaterThan(-1);
    const hold = statements[holdIndex] as ts.IfStatement;
    expect(jsxTags(hold.thenStatement, sf)).toEqual(["ProfileProbeRetryScreen"]);
    expect(containsIdentifier(hold.thenStatement, "children")).toBe(false);
    const call = findCall(hold.expression, "profileProbeHoldsRoute")!;
    expect(containsIdentifier(call.arguments[1], "routeName")).toBe(true);
    const childrenIndex = statements.findIndex((s) => containsIdentifier(s, "children"));
    expect(childrenIndex).toBeGreaterThan(holdIndex);
  });
});
