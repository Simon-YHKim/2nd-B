// 네이티브에서는 <Helmet> 을 그리지 않는다.
//
// PR 1742(`e1fec159`, 2026-09-08)가 서빙되는 웹 페이지의 첫 <title> 을 채우려고 루트
// 레이아웃에 vendored react-helmet-async 의 <Helmet> 을 넣었다(web-title-first.test.ts).
// 그런데 두 분기 모두에서 플랫폼을 가리지 않고 그렸다. src 어디에도 HelmetProvider 가
// 없고 네이티브에서는 그것을 올려 주는 곳이 없다. 그래서 그 뒤 main 안드로이드 진단
// APK 는 켜자마자 RootLayout 첫 렌더에서 오류 화면에 멈췄다:
//
//   TypeError: Cannot read property 'add' of undefined
//     at HelmetDispatcher -> Helmet -> RootLayout
//
// dbe4c1ab 부팅 4/4 · 18ef7f43 1/1 재현, PR 1742 이전 7a14f812 는 0/1(로그인 화면).
// DECISIONS.md 26.09.14 09:11 · 09:55. 같은 커밋의 웹 산출물은 멀쩡했다.
//
// 모듈 최상단 import 는 원인이 아니었다. 스택에 RootLayout 이 **렌더 중**으로 찍혔다는
// 것은 _layout.tsx 가 그 import 까지 평가를 이미 마쳤다는 뜻이다. 막을 것은 렌더다.
//
// 지키는 것 (AST 로 본다 - 컴포넌트 렌더 테스트는 RN 0.85 upstream 으로 막혀 있다):
//   1. <Helmet> JSX 는 모두 `Platform.OS === "web"` 의 참 갈래 안에 있다.
//   2. 그 Platform 은 react-native 에서 이름 그대로 가져온 것이다.
//   3. SITE_HEAD 는 네이티브에서 null 이다 - 두 분기가 네이티브에서 더 그리는 것이 없다.
//   4. src 의 다른 배송 파일은 react-helmet-async 를 불러오지 않는다(.web.ts(x) 는 예외).
//
// 조건이 `typeof document` 면 안 된다. 정적 export 는 document 가 없는 Node 에서 이
// 모듈을 그리고, 제목을 내보내야 하는 렌더가 바로 그것이다. 그 조건이면 네이티브는
// 살지만 웹 수정이 조용히 되돌아간다.
//
// 주석은 AST 노드가 아니어서 이 머리글이나 _layout.tsx 의 설명 산문은 증거가 되지 않는다.
// 검사기가 무뎌지지 않았는지는 고치기 전 모양을 그대로 넣어 빨강이 나는지로 본다.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import * as ts from "typescript";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const LAYOUT = "src/app/_layout.tsx";

const read = (file: string): string => readFileSync(file, "utf8");

function parse(name: string, text: string): ts.SourceFile {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  return e;
}

/** `Platform.OS === "web"` (좌우 순서는 둘 다). 느슨한 비교 · 부정 · 다른 신호는 아니다. */
function isWebCheck(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (!ts.isBinaryExpression(e) || e.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return false;
  }
  const isPlatformOS = (x: ts.Expression): boolean =>
    ts.isPropertyAccessExpression(x) &&
    ts.isIdentifier(x.expression) &&
    x.expression.text === "Platform" &&
    x.name.text === "OS";
  const isWeb = (x: ts.Expression): boolean => ts.isStringLiteral(x) && x.text === "web";
  return (isPlatformOS(e.left) && isWeb(e.right)) || (isWeb(e.left) && isPlatformOS(e.right));
}

/** 이 파일이 `Platform` 을 react-native 에서 이름 그대로 가져오는가. */
function importsPlatformFromReactNative(sf: ts.SourceFile): boolean {
  return sf.statements.some((s) => {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) return false;
    if (s.moduleSpecifier.text !== "react-native") return false;
    const bindings = s.importClause?.namedBindings;
    return (
      !!bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some((el) => el.name.text === "Platform" && !el.propertyName)
    );
  });
}

function helmetElements(sf: ts.SourceFile): (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] {
  const out: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  walk(sf, (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "Helmet") {
      out.push(node);
    }
  });
  return out;
}

/** 원소가 web 조건의 참 갈래 안에 있는가 - 삼항의 참 갈래, 또는 `&&` 의 오른쪽. */
function webGuarded(node: ts.Node): boolean {
  let child: ts.Node = node;
  let parent: ts.Node | undefined = node.parent;
  while (parent) {
    if (ts.isConditionalExpression(parent) && parent.whenTrue === child && isWebCheck(parent.condition)) {
      return true;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      parent.right === child &&
      isWebCheck(parent.left)
    ) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

/** 네이티브에서 <Helmet> 이 그려질 수 있는 자리. 빈 배열이어야 한다. */
function nativeHelmetRisks(name: string, text: string): string[] {
  const sf = parse(name, text);
  const platformFromReactNative = importsPlatformFromReactNative(sf);
  return helmetElements(sf).flatMap((el) => {
    const line = sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1;
    if (!webGuarded(el)) return [`${name}:${line} <Helmet> 이 Platform.OS === "web" 조건 밖에 있다`];
    if (!platformFromReactNative) return [`${name}:${line} 조건의 Platform 이 react-native 에서 온 것이 아니다`];
    return [];
  });
}

function siteHeadInitializer(sf: ts.SourceFile): ts.Expression | undefined {
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === "SITE_HEAD") return d.initializer;
    }
  }
  return undefined;
}

function shippedSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "__mocks__") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) shippedSources(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** react-helmet-async 를 코드로 불러오는가 - import · export from · require() · import(). */
function importsHelmet(name: string, text: string): boolean {
  // 빠른 거르기다. 산문도 여기서는 걸리지만 아래 AST 가 가른다(+html.tsx 가 그 예다).
  if (!text.includes("react-helmet-async")) return false;
  let found = false;
  walk(parse(name, text), (node) => {
    let spec: ts.Expression | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) spec = node.moduleSpecifier;
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      spec = node.arguments[0];
    }
    if (spec && ts.isStringLiteral(spec) && spec.text.includes("react-helmet-async")) found = true;
  });
  return found;
}

// 고치기 전 main(dbe4c1ab) 의 모양 그대로.
const BEFORE = `
import { AppState } from "react-native";
import { Helmet } from "expo-router/vendor/react-helmet-async/lib";
const SITE_HEAD = (
  <Helmet>
    <title>{SITE_TITLE}</title>
  </Helmet>
);
export default function RootLayout() {
  return <>{SITE_HEAD}</>;
}
`;

const guardedWith = (condition: string, importLine = 'import { AppState, Platform } from "react-native";') => `
${importLine}
import { Helmet } from "expo-router/vendor/react-helmet-async/lib";
const SITE_HEAD =
  ${condition} ? (
    <Helmet>
      <title>{SITE_TITLE}</title>
    </Helmet>
  ) : null;
`;

describe("검사기가 시작 크래시의 모양을 알아본다", () => {
  it("고치기 전 모양(dbe4c1ab)은 빨강이다", () => {
    expect(nativeHelmetRisks("before.tsx", BEFORE)).toHaveLength(1);
  });

  it("typeof document 로 막으면 빨강이다 - 정적 export 가 제목을 잃는다", () => {
    expect(nativeHelmetRisks("dom.tsx", guardedWith('typeof document !== "undefined"'))).toHaveLength(1);
  });

  it("조건을 뒤집으면 빨강이다", () => {
    expect(nativeHelmetRisks("flip.tsx", guardedWith('Platform.OS !== "web"'))).toHaveLength(1);
  });

  it("Platform 이 react-native 에서 온 것이 아니면 빨강이다", () => {
    const local = guardedWith('Platform.OS === "web"', 'const Platform = { OS: "web" };');
    expect(nativeHelmetRisks("local.tsx", local)).toHaveLength(1);
  });

  it("`&&` 로 막은 모양과 좌우를 바꾼 비교는 통과한다", () => {
    const and = `
import { Platform } from "react-native";
export const A = () => <>{Platform.OS === "web" && <Helmet><title>x</title></Helmet>}</>;
export const B = () => <>{"web" === Platform.OS ? <Helmet><title>x</title></Helmet> : null}</>;
`;
    expect(nativeHelmetRisks("and.tsx", and)).toEqual([]);
  });

  it("주석 속 <Helmet> 은 증거가 아니다 - 흔들리면 안 되는 항", () => {
    const prose = `// <Helmet> 은 여기서 그리지 않는다. import { Helmet } from "react-helmet-async";\nexport const x = 1;\n`;
    expect(helmetElements(parse("prose.tsx", prose))).toHaveLength(0);
    expect(nativeHelmetRisks("prose.tsx", prose)).toEqual([]);
    expect(importsHelmet("prose.tsx", prose)).toBe(false);
  });
});

describe("루트 레이아웃은 네이티브에서 <Helmet> 을 그리지 않는다", () => {
  const text = read(join(ROOT, LAYOUT));
  const sf = parse(LAYOUT, text);

  it("검사할 <Helmet> 이 실제로 있다 - 하나도 없이 통과하면 검사가 아니다", () => {
    expect(helmetElements(sf).length).toBeGreaterThan(0);
  });

  it('모든 <Helmet> 이 react-native 의 Platform.OS === "web" 참 갈래 안에 있다', () => {
    expect(nativeHelmetRisks(LAYOUT, text)).toEqual([]);
  });

  it("SITE_HEAD 는 네이티브에서 null 이다", () => {
    const init = siteHeadInitializer(sf);
    if (!init) throw new Error("SITE_HEAD 선언을 못 찾았다 - 이름이 바뀌었으면 이 검사부터 고칠 것");
    const e = unwrap(init);
    if (!ts.isConditionalExpression(e)) throw new Error("SITE_HEAD 가 삼항식이 아니다");
    expect(isWebCheck(e.condition)).toBe(true);
    expect(unwrap(e.whenFalse).kind).toBe(ts.SyntaxKind.NullKeyword);
  });

  it("src 의 다른 배송 파일은 react-helmet-async 를 불러오지 않는다", () => {
    const importers = shippedSources(SRC)
      .filter((file) => !/\.web\.tsx?$/.test(file))
      .filter((file) => importsHelmet(file, read(file)))
      .map((file) => relative(ROOT, file).split(sep).join("/"));
    expect(importers).toEqual([LAYOUT]);
  });
});
