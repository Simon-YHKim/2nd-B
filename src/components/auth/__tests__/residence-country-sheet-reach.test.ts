// 거주 국가 시트의 63개국과 '목록에 없어요'에 손과 키보드가 다 닿는가 (R2C-03, 2026-10-05).
//
// 웹 실측(390x844 · 1280x800, 지역 판독 불가)에서 시트가 스크롤되지 않았다. radio 64개 중
// 화면 안은 14개였고, 휠 20회 · 드래그 6회 뒤에도 모든 조상의 scrollTop 이 0 이었다.
// 상한은 PixelSurface 바깥(765px)까지는 살아 있었는데, 그 안의 면 View 한 층이 RN-web
// 기본값 `flex: 0 0 auto` 로 내용 높이(3273px)까지 자랐다. 그러면 안쪽의
// `maxHeight: "100%"` 는 높이가 auto 인 면을 기준으로 풀리고, FlatList 의 flexShrink 도
// 줄어들 이유가 없어 3150px 이 됐다. 스크롤이 생길 자리가 없었다.
//
// 고친 뒤 같은 조건(세션 확인용 서버, 390x844 · 1280x800)에서 다시 쟀다: 목록 스크롤러
// 높이 638 / 내용 3150 이고 휠로 끝까지 내려가 마지막 나라(홍콩)가 보이며 눌러서 골라진다.
// '목록에 없어요'는 열자마자 화면 안(bottom 799 / 844)이다. 첫 포커스는 '국가 목록 닫기'
// 버튼이고, Tab 64번에 radio 64개가 전부 화면 안에서 포커스를 받는다. Enter 로 고를 수 있다.
//
// 렌더 테스트는 RN 0.85 상류 문제로 막혀 있다(재시도 금지). 그래서 화면과 PixelSurface 의
// **실제 스타일 객체와 JSX 를 AST 로 읽어** 상한에서 목록까지 각 층이 줄어들 수 있는지를
// 엔진 규칙으로 따진다. 문자열 한 줄을 박는 핀은 고장 값을 그대로 고정하기 쉬워서 쓰지 않는다.
//
// 엔진 규칙(둘 다 같은 답을 낸다):
//   - RN-web 0.21 의 View 기본값은 `flex-shrink: 0`. Yoga 의 기본 flexShrink 도 0.
//   - 그래서 상한과 스크롤러 사이의 흐름 안 층은 스스로 flexShrink > 0 을 적어야 내용보다
//     짧아질 수 있다. 하나라도 빠지면 그 층이 내용 높이로 자라 상한을 뚫는다.
//   - 높이가 auto 인 부모를 기준으로 한 퍼센트 상한은 아무것도 막지 못한다. 그래서 여기서는
//     퍼센트를 상한으로 세지 않는다. 상한은 dialog 의 maxHeight 하나다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as ts from "typescript";

import { residenceCountryOptions } from "@/lib/auth/residence-country-options";

const FIELD = "src/components/auth/ResidenceCountryField.tsx";
const SURFACE = "src/components/pixel/PixelSurface.tsx";

type Style = Record<string, string>;
type Sheet = Record<string, Style>;
type Jsx = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function parse(rel: string): ts.SourceFile {
  const src = readFileSync(join(process.cwd(), rel), "utf8");
  return ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function objectStyle(node: ts.ObjectLiteralExpression, sf: ts.SourceFile): Style {
  const out: Style = {};
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p)) out[p.name.getText(sf)] = p.initializer.getText(sf);
  }
  return out;
}

/** 파일의 `StyleSheet.create({...})` 를 이름 -> 속성 -> 원문 값으로 읽는다. */
function styleSheet(sf: ts.SourceFile): Sheet {
  let sheet: Sheet | null = null;
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "StyleSheet.create") {
      const arg = n.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const out: Sheet = {};
        for (const p of arg.properties) {
          if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) {
            out[p.name.getText(sf)] = objectStyle(p.initializer, sf);
          }
        }
        sheet = out;
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  if (!sheet) throw new Error(`${sf.fileName}: StyleSheet.create 를 못 찾았다 - 검사가 공허해진다`);
  return sheet;
}

function jsxElements(sf: ts.SourceFile): Jsx[] {
  const out: Jsx[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) out.push(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

const tagOf = (el: Jsx, sf: ts.SourceFile): string => el.tagName.getText(sf);

/** 속성 표현식. 값 없이 적힌 불리언 속성(`shrink`)은 true. 없으면 undefined. */
function attr(el: Jsx, name: string): ts.Expression | true | undefined {
  for (const a of el.attributes.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== name) continue;
    if (!a.initializer) return true;
    if (ts.isStringLiteral(a.initializer)) return a.initializer;
    if (ts.isJsxExpression(a.initializer)) return a.initializer.expression;
    throw new Error(`${name}: 읽을 수 없는 속성 값`);
  }
  return undefined;
}

interface Scope {
  sf: ts.SourceFile;
  sheet: Sheet;
  /** 조건(`shrink && ...`)에 쓰는 불리언 prop. */
  flags?: Record<string, boolean>;
  /** 호출부에서 넘어온 스타일 prop(`style`, `contentStyle`)을 그 호출부 기준으로 푼다. */
  props?: Record<string, Style>;
}

/** 스타일 표현식 하나를 합친 스타일로 푼다. 모르는 모양을 만나면 던진다(조용히 넘기면 거짓 초록). */
function resolveStyle(expr: ts.Expression, scope: Scope): Style {
  const { sf, sheet } = scope;
  if (ts.isParenthesizedExpression(expr)) return resolveStyle(expr.expression, scope);
  if (ts.isArrayLiteralExpression(expr)) {
    return Object.assign({}, ...expr.elements.map((e) => resolveStyle(e, scope)));
  }
  if (ts.isPropertyAccessExpression(expr) && expr.expression.getText(sf) === "styles") {
    const name = expr.name.getText(sf);
    if (!sheet[name]) throw new Error(`${sf.fileName}: styles.${name} 가 없다`);
    return sheet[name];
  }
  if (ts.isPropertyAccessExpression(expr) && expr.getText(sf) === "StyleSheet.absoluteFill") {
    return { position: '"absolute"' };
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const cond = expr.left.getText(sf);
    if (!(cond in (scope.flags ?? {}))) throw new Error(`${sf.fileName}: 조건 ${cond} 의 값을 모른다`);
    return scope.flags![cond] ? resolveStyle(expr.right, scope) : {};
  }
  if (ts.isObjectLiteralExpression(expr)) return objectStyle(expr, sf);
  if (ts.isIdentifier(expr) && scope.props && expr.text in scope.props) return scope.props[expr.text];
  throw new Error(`${sf.fileName}: 풀 수 없는 스타일 표현식 ${expr.getText(sf)}`);
}

function styleOf(el: Jsx, name: string, scope: Scope): Style {
  const a = attr(el, name);
  if (a === undefined) return {};
  if (a === true) throw new Error(`${name} 가 값 없이 적혀 있다`);
  return resolveStyle(a, scope);
}

/** RN-web 0.21 · Yoga 공통: flexShrink 를 적지 않은 View 는 0 이라 내용보다 짧아지지 않는다. */
const canShrink = (s: Style): boolean => Number(s.flexShrink ?? "0") > 0;

const fieldSf = parse(FIELD);
const fieldSheet = styleSheet(fieldSf);
const fieldEls = jsxElements(fieldSf);
const fieldScope: Scope = { sf: fieldSf, sheet: fieldSheet };

const surfaceSf = parse(SURFACE);
const surfaceSheet = styleSheet(surfaceSf);
const surfaceEls = jsxElements(surfaceSf);

const one = (els: Jsx[], pred: (el: Jsx) => boolean, what: string): Jsx => {
  const hits = els.filter(pred);
  if (hits.length !== 1) throw new Error(`${what}: ${hits.length}개 - 정확히 하나여야 한다`);
  return hits[0];
};

const styleText = (el: Jsx, sf: ts.SourceFile): string => {
  const a = attr(el, "style");
  return a && a !== true ? a.getText(sf) : "";
};

// PixelSurface 안의 세 층. 바깥(wrap)은 호출부 style 을, 안쪽(content)은 contentStyle 을 받는다.
const wrapEl = one(surfaceEls, (el) => /styles\.wrap/.test(styleText(el, surfaceSf)), "PixelSurface wrap");
const faceEl = one(surfaceEls, (el) => /styles\.face\b/.test(styleText(el, surfaceSf)), "PixelSurface face");
const contentEl = one(surfaceEls, (el) => /styles\.content\b/.test(styleText(el, surfaceSf)), "PixelSurface content");

// 시트 쪽 층.
const dialogEl = one(
  fieldEls,
  (el) => tagOf(el, fieldSf) === "View" && attr(el, "accessibilityViewIsModal") !== undefined,
  "시트 dialog",
);
const surfaceUse = one(fieldEls, (el) => tagOf(el, fieldSf) === "PixelSurface", "시트의 PixelSurface");
const listEl = one(fieldEls, (el) => tagOf(el, fieldSf) === "FlatList", "시트의 FlatList");

/** 시트가 PixelSurface 를 쓰는 그대로 세 층을 푼다. */
function surfaceLayers(flags: { shrink: boolean }): { wrap: Style; face: Style; content: Style } {
  const props = {
    style: styleOf(surfaceUse, "style", fieldScope),
    contentStyle: styleOf(surfaceUse, "contentStyle", fieldScope),
  };
  const scope: Scope = { sf: surfaceSf, sheet: surfaceSheet, flags: { ...flags, edged: true }, props };
  return {
    wrap: styleOf(wrapEl, "style", scope),
    face: styleOf(faceEl, "style", scope),
    content: styleOf(contentEl, "style", scope),
  };
}

describe("상한에서 목록까지 모든 층이 줄어든다 - 그래야 목록이 스크롤된다", () => {
  test("상한은 dialog 의 maxHeight 하나다", () => {
    expect(styleOf(dialogEl, "style", fieldScope).maxHeight).toBeDefined();
  });

  test("시트는 PixelSurface 의 shrink 를 켠다", () => {
    expect(attr(surfaceUse, "shrink")).toBe(true);
  });

  test("바깥 · 면 · 안쪽 · 목록이 각자 flexShrink 를 갖는다", () => {
    const layers = surfaceLayers({ shrink: attr(surfaceUse, "shrink") === true });
    const list = styleOf(listEl, "style", fieldScope);
    // 층 이름을 같이 남겨 둔다. 실패하면 어느 층이 내용 높이로 자라는지 바로 보인다.
    expect({
      wrap: canShrink(layers.wrap),
      face: canShrink(layers.face),
      content: canShrink(layers.content),
      list: canShrink(list),
    }).toEqual({ wrap: true, face: true, content: true, list: true });
    // 목록은 늘어나지 않는다. 나라가 적은 언어에서 빈 칸이 생기지 않게.
    expect(list.flexGrow).toBe("0");
  });

  test("머리줄과 '목록에 없어요'는 줄지 않는다 - 목록만 줄어 둘은 늘 보인다", () => {
    const header = one(
      fieldEls,
      (el) => tagOf(el, fieldSf) === "View" && styleText(el, fieldSf) === "styles.dialogHeader",
      "머리줄",
    );
    expect(canShrink(styleOf(header, "style", fieldScope))).toBe(false);
    const notListed = one(
      fieldEls,
      (el) =>
        tagOf(el, fieldSf) === "PixelPressable" &&
        /residenceCountry\.notListed"/.test((attr(el, "accessibilityLabel") as ts.Expression | undefined)?.getText(fieldSf) ?? ""),
      "'목록에 없어요'",
    );
    expect(canShrink(styleOf(notListed, "rootStyle", fieldScope))).toBe(false);
    expect(canShrink(styleOf(notListed, "contentStyle", fieldScope))).toBe(false);
  });

  test("shrink 를 안 켠 PixelSurface 는 예전 그대로 내용 높이로 자란다 - 다른 사용처는 안 움직인다", () => {
    const layers = surfaceLayers({ shrink: false });
    expect(surfaceSheet.face.flexShrink).toBeUndefined();
    expect(surfaceSheet.content.flexShrink).toBeUndefined();
    // 시트가 넘긴 style 이 바깥에 flexShrink 를 주는 것은 시트 몫이다. 면과 안쪽은 끔이면 0.
    expect(canShrink(layers.face)).toBe(false);
    expect(canShrink(layers.content)).toBe(false);
  });
});

describe("키보드와 스크린 리더도 전 항목에 닿는다", () => {
  test("스크림은 Pressable 이 아니라 응답자 View 다 - 첫 Tab 이 이름 없는 전체 화면 칸으로 가지 않는다", () => {
    // RN-web 0.21 은 Pressable 에 accessible={false} 를 줘도 tabIndex 0 을 붙이고,
    // Modal 포커스 트랩이 첫 포커스 요소에 포커스를 넣는다(PixelTimeSheet 리뷰 실측).
    expect(fieldEls.filter((el) => tagOf(el, fieldSf) === "Pressable")).toEqual([]);
    const scrim = one(
      fieldEls,
      (el) => tagOf(el, fieldSf) === "View" && attr(el, "onResponderRelease") !== undefined,
      "스크림",
    );
    expect((attr(scrim, "onStartShouldSetResponder") as ts.Expression).getText(fieldSf)).toBe("() => true");
    expect((attr(scrim, "onResponderRelease") as ts.Expression).getText(fieldSf)).toBe("close");
    // 시트는 스크림의 자식이 아니다. 자식이면 시트 안 빈 곳을 눌러도 닫힌다.
    const scrimNode = scrim.parent;
    for (let n: ts.Node | undefined = dialogEl; n; n = n.parent) expect(n).not.toBe(scrimNode);
  });

  test("목록은 처음부터 전부 그려 두고 내리지 않는다", () => {
    // initialNumToRender 안의 행은 창 밖으로 나가도 내려지지 않는다. 그래야 Tab 이 아직 안
    // 그려진 행을 건너뛰어 '목록에 없어요'로 가거나, 스크린 리더가 중간에서 멈추지 않는다.
    expect((attr(listEl, "initialNumToRender") as ts.Expression).getText(fieldSf)).toBe("options.length");
    expect(attr(listEl, "windowSize")).toBeUndefined();
    expect(residenceCountryOptions("ko")).toHaveLength(63);
    expect(residenceCountryOptions("en")).toHaveLength(63);
  });

  test("'목록에 없어요'는 목록 밖, 목록 바로 뒤에 있다 - 가상화 대상이 아니다", () => {
    const surfaceJsx = surfaceUse.parent as ts.JsxElement;
    const kids = surfaceJsx.children.filter((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
    const names = kids.map((c) =>
      ts.isJsxElement(c) ? c.openingElement.tagName.getText(fieldSf) : (c as ts.JsxSelfClosingElement).tagName.getText(fieldSf),
    );
    expect(names).toEqual(["View", "FlatList", "PixelPressable"]);
  });
});
