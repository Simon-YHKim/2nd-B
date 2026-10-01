// PixelPressable 의 누름 래퍼는 늘 네이티브 뷰다(collapsable={false}).
//
// 온보딩 마지막 화면의 Continue 를 누르면 앱이 백지가 됐다(v0.8.0 APK, 에뮬레이터).
// 좁혀진 경로(DECISIONS.md 26.09.14 11:03 · 13:03):
//
//   1. Fabric 은 모양을 안 바꾸는 View 를 네이티브 뷰 없이 평탄화한다. 이 래퍼는 쉴 때
//      스타일이 비어 평탄화되고, 눌려 transform 이 붙는 순간 네이티브 뷰가 생긴다
//      (react-native v0.85.3 ViewShadowNode.cpp:50,54 - collapsable 이 false 이거나
//      transform 이 비어 있지 않으면 stacking context 를 만든다).
//   2. 그래서 누를 때와 뗄 때마다 안쪽 자식 전부(Continue 버튼에서는 11개)가 부모를 옮겨 탄다.
//   3. 그 커밋이 같은 제스처의 화면 제거(router.replace)와 한 배치로 합쳐지면 안드로이드가
//      "View already has a parent" 로 죽고, React Native 호스트가 내려가 백지가 된다.
//
// 탭은 누름 쪽에서, 눌린 모습을 확인하고 뗀 시도는 뗌 쪽에서 났고(3/3), 누름·뗌 커밋이 없는
// 키보드 ENTER 는 0/3 이었다. 이동을 늦추는 수정은 못 막는다 - 뗌 쪽이 새로 생긴다.
// 래퍼가 늘 네이티브 뷰면 누름·뗌은 속성만 바꾸고 자식을 옮기지 않는다.
// ⚠ 이 효과는 아직 빌드로 확인하지 않았다. 머지 뒤 main 진단 APK 로 잰다.
//
// 지키는 것 (AST 로 본다 - 컴포넌트 렌더 테스트는 RN 0.85 upstream 으로 막혀 있다):
//   1. transform 이나 opacity 를 가진 StyleSheet 항목을 **상태에 따라** 붙였다 뗐다 하는
//      View 는 collapsable={false} 를 JSX 속성으로 갖는다.
//   2. PixelPressable 에 그런 View 가 실제로 있다 - 없는데 통과하면 검사가 아니다.
//   3. 눌린 모양은 그대로다 - sunk 는 여전히 한 유닛 translateY, rest 는 빈 스타일이다.
//
// 주석에 collapsable={false} 를 적어도 통과하지 않는다 - 산문은 AST 노드가 아니다.
// 검사기가 무뎌지지 않았는지는 고치기 전 모양을 넣어 빨강이 나는지로 본다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as ts from "typescript";

const PRESSABLE = join(__dirname, "..", "PixelPressable.tsx");

function parse(name: string, text: string): ts.SourceFile {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function keyOf(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/** `const x = StyleSheet.create({...})` 마다 항목 이름 -> 식. */
function styleSheets(sf: ts.SourceFile): Map<string, Map<string, ts.ObjectLiteralExpression>> {
  const sheets = new Map<string, Map<string, ts.ObjectLiteralExpression>>();
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const init = node.initializer;
    if (!ts.isCallExpression(init) || init.expression.getText(sf) !== "StyleSheet.create") return;
    const arg = init.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    const entries = new Map<string, ts.ObjectLiteralExpression>();
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue;
      const key = keyOf(prop.name);
      if (key) entries.set(key, prop.initializer);
    }
    sheets.set(node.name.text, entries);
  });
  return sheets;
}

/** 이 항목이 평탄화를 푸는 키를 갖는가 - transform 이나 opacity. */
function unflattens(entry: ts.ObjectLiteralExpression): boolean {
  return entry.properties.some((p) => {
    const key = ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) ? keyOf(p.name) : undefined;
    return key === "transform" || key === "opacity";
  });
}

/**
 * style 식이 상태에 따라 평탄화를 켜고 끄는가. 삼항의 두 갈래 중 한쪽에만, 또는 `&&` 의
 * 오른쪽에 평탄화를 푸는 항목이 있으면 그렇다. 넉넉하게 잡는다 - 다른 곳에서 늘 네이티브
 * 뷰인 경우도 걸릴 수 있지만, 그때도 collapsable={false} 는 해가 없다.
 */
function togglesFlattening(sf: ts.SourceFile, expr: ts.Expression): boolean {
  const sheets = styleSheets(sf);
  const refers = (node: ts.Node): boolean => {
    let hit = false;
    walk(node, (n) => {
      if (!ts.isPropertyAccessExpression(n) || !ts.isIdentifier(n.expression)) return;
      const entry = sheets.get(n.expression.text)?.get(n.name.text);
      if (entry && unflattens(entry)) hit = true;
    });
    return hit;
  };
  let toggles = false;
  walk(expr, (n) => {
    if (ts.isConditionalExpression(n) && refers(n.whenTrue) !== refers(n.whenFalse)) toggles = true;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      refers(n.right)
    ) {
      toggles = true;
    }
  });
  return toggles;
}

interface ToggleView {
  line: number;
  collapsableFalse: boolean;
}

/** 상태에 따라 평탄화가 켜지고 꺼지는 <View> 와, 각각 collapsable={false} 속성이 있는지. */
function flattenTogglingViews(name: string, text: string): ToggleView[] {
  const sf = parse(name, text);
  const out: ToggleView[] = [];
  walk(sf, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    if (node.tagName.getText(sf) !== "View") return;
    const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
    const valueOf = (attr: string) => attrs.find((a) => a.name.getText(sf) === attr)?.initializer;
    const style = valueOf("style");
    if (!style || !ts.isJsxExpression(style) || !style.expression) return;
    if (!togglesFlattening(sf, style.expression)) return;
    const collapsable = valueOf("collapsable");
    out.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      collapsableFalse:
        !!collapsable &&
        ts.isJsxExpression(collapsable) &&
        collapsable.expression?.kind === ts.SyntaxKind.FalseKeyword,
    });
  });
  return out;
}

// 고치기 전 PixelPressable 의 뼈대 그대로 (e5c9f478 = cf0595be).
const BEFORE = `
import { Pressable, StyleSheet, View } from "react-native";
export function PixelPressable({ held, disabled, fullWidth, style }: Props) {
  const sunken = held && !disabled;
  return (
    <Pressable style={[styles.root, fullWidth && styles.fullWidth]}>
      <View style={[sunken ? styles.sunk : styles.rest, fullWidth && styles.fullWidth, style]}>
        <PixelSurface pressed={sunken} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  root: { alignSelf: "flex-start" },
  fullWidth: { alignSelf: "stretch", width: "100%" },
  rest: {},
  sunk: { transform: [{ translateY: m3.spacing.s1 }] },
});
`;

describe("검사기가 백지를 만든 모양을 알아본다", () => {
  it("고치기 전 모양은 빨강이다 - 평탄화를 켜고 끄는 래퍼에 collapsable 이 없다", () => {
    expect(flattenTogglingViews("before.tsx", BEFORE)).toEqual([{ line: 7, collapsableFalse: false }]);
  });

  it("주석에 적은 collapsable={false} 는 속성이 아니다 - 흔들리면 안 되는 항", () => {
    const prose = BEFORE.replace(
      "      <View style={[sunken",
      "      {/* collapsable={false} */}\n      <View style={[sunken",
    );
    expect(prose).not.toBe(BEFORE);
    expect(flattenTogglingViews("prose.tsx", prose).map((v) => v.collapsableFalse)).toEqual([false]);
  });

  it("속성으로 붙이면 통과한다", () => {
    const fixed = BEFORE.replace("<View style={[sunken", "<View collapsable={false} style={[sunken");
    expect(fixed).not.toBe(BEFORE);
    expect(flattenTogglingViews("fixed.tsx", fixed).map((v) => v.collapsableFalse)).toEqual([true]);
  });

  it("opacity 를 `&&` 로 붙이는 View 도 잡고, 늘 붙어 있는 transform 은 잡지 않는다", () => {
    const text = `
import { StyleSheet, View } from "react-native";
export const A = ({ pressed }: P) => <View style={[pressed && styles.dim]}><B /></View>;
export const C = () => <View style={styles.sunk}><B /></View>;
const styles = StyleSheet.create({ dim: { opacity: 0.5 }, sunk: { transform: [{ translateY: 2 }] } });
`;
    expect(flattenTogglingViews("and.tsx", text)).toEqual([{ line: 3, collapsableFalse: false }]);
  });
});

describe("PixelPressable 의 누름 래퍼는 누르고 떼도 부모를 바꾸지 않는다", () => {
  const text = readFileSync(PRESSABLE, "utf8");
  const views = flattenTogglingViews("PixelPressable.tsx", text);

  it("검사할 래퍼가 실제로 있다", () => {
    expect(views.length).toBeGreaterThan(0);
  });

  it("평탄화를 켜고 끄는 View 는 모두 collapsable={false} 다", () => {
    expect(views.filter((v) => !v.collapsableFalse)).toEqual([]);
  });

  it("눌린 모양은 그대로다 - sunk 는 한 유닛 아래, rest 는 비어 있다", () => {
    const sf = parse("PixelPressable.tsx", text);
    const sheet = styleSheets(sf).get("styles");
    if (!sheet) throw new Error("styles = StyleSheet.create(...) 를 못 찾았다 - 이름이 바뀌었으면 이 검사부터 고칠 것");
    expect(sheet.get("sunk")?.getText(sf)).toBe("{ transform: [{ translateY: m3.spacing.s1 }] }");
    expect(sheet.get("rest")?.getText(sf)).toBe("{}");
  });
});
