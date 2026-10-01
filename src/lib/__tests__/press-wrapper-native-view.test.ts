// 누름 상태가 닿는 View 는 늘 네이티브 뷰다(collapsable={false}) - 저장소 전체.
//
// 온보딩 Continue 백지(v0.8.0 APK, DECISIONS.md 26.09.14 11:03 · 13:03)는 이렇게 났다.
//   1. Fabric 은 모양을 안 바꾸는 View 를 네이티브 뷰 없이 평탄화한다.
//   2. 누름 상태로 transform 이 붙었다 떨어지는 래퍼는 누를 때와 뗄 때 평탄화가 켜지고 꺼져,
//      안쪽 자식이 전부 부모를 옮겨 탄다.
//   3. 그 커밋이 같은 제스처의 화면 제거와 한 배치로 합쳐지면 안드로이드가
//      "View already has a parent" 로 죽고 앱이 백지가 된다.
// PixelPressable 은 커밋 2eb6266b 가 고쳤고, `src/components/pixel/__tests__/
// pixel-pressable-native-view.test.ts` 가 그 한 곳의 모양까지 지킨다. 같은 래퍼가 다섯 곳 더
// 있었다(설정 · 캡처 · 연결 · 개발자 목록 두 행). 이 검사는 규칙을 저장소 전체로 넓힌다.
//
// 규칙: react-native 에서 들여온 View 가 자식을 갖고, 속성(style 포함) 중 하나라도 누름 상태를
// 읽으면 collapsable={false} 를 JSX 속성으로 갖는다.
//
// 누름 상태는 아래 둘과, 그 이름을 읽어 만든 지역 값이다.
//   - onPressIn · onPressOut 이 부르는 useState setter 의 값. 인라인 화살표든 useCallback 이든,
//     지역 함수나 객체 속성을 거쳐도 따라간다. 이 길은 이름을 보지 않는다.
//   - 이름이 pressed · held · sunken(is- 꼴 포함)인 함수 매개변수. PixelSurface 처럼 누름을
//     prop 으로 받는 프리미티브가 이 길이다.
// 이름은 함수 단위로 묶는다. 한 파일에 held 가 둘이어도 누름을 받는 함수의 held 만 누름 상태다.
//
// 일부러 넉넉하게 잡는 것:
//   - 어떤 속성이 평탄화를 바꾸는지 가리지 않는다. transform · opacity 말고도 stacking context
//     조건이 여럿이다(react-native v0.85.3 ViewShadowNode.cpp:50-68 - pointerEvents · nativeID ·
//     position 이 있는 zIndex · overflow 등). 키 목록으로 가르면 목록 밖 키가 조용히 통과한다.
//     넘치게 요구한 값은 쉴 때 네이티브 뷰 하나다.
//   - 그 누름이 화면을 없애는지(router.replace · dismissAll · 로그아웃) 따지지 않는다. onPress 는
//     호출부가 넘기고 나중에 바뀐다. push 가 replace 로 바뀌어도 소스 검사는 그걸 알 수 없다.
//     같은 이유로 dev 전용 화면(dev-screens)도 빼지 않는다.
//
// 보지 않는 것:
//   - 자식이 없는 View. 옮겨 탈 자식이 없다(PixelSurface 의 안쪽 베벨 막대).
//   - react-native 의 View 가 아닌 태그. Pressable 자신의 style 은 여기서 안 본다 - Pressable 은
//     늘 네이티브 뷰다. Animated.View 와 다른 모듈의 View 도 안 본다. 누름 상태를 style prop 으로
//     받아 안쪽 View 에 넘기는 컴포넌트는 따라가지 않으니, 누름은 pressed · held · sunken 이름의
//     prop 으로 넘길 것.
//   - 누름이 아닌 상태(locked · dim 등). 같은 제스처의 화면 제거와 한 배치로 묶인 것은 누름 · 뗌
//     커밋이었다.
//
// AST 로 본다. 주석이나 문자열에 collapsable={false} 나 누름 래퍼 모양을 적어도 증거가 되지 않는다.
// 검사기가 무뎌지지 않았는지는 알려진 여섯 자리를 실제로 찾는지와, 고치기 전 모양이 빨강인지로 본다.

import fs from "node:fs";
import path from "node:path";

import * as ts from "typescript";

const SRC = path.resolve(__dirname, "../..");

/** 누름을 prop 으로 받는 매개변수 이름. */
const PRESS_PARAM = /^(is)?(pressed|held|sunken)$/i;

/** 이 이름의 JSX 속성이나 객체 속성이 부르는 setter 의 상태가 누름 상태다. */
const PRESS_HANDLERS = new Set(["onPressIn", "onPressOut"]);

/**
 * 알려진 누름 래퍼(src 기준 경로 + 컴포넌트). 검사기가 이것들을 못 찾으면 규칙이 지켜진 것이
 * 아니라 검사기가 눈을 감은 것이다.
 */
const KNOWN_PRESS_WRAPPERS = [
  "components/pixel/PixelPressable.tsx PixelPressable",
  "app/settings.tsx SettingsActionButton",
  "components/deep-space/DeepSpaceViews.tsx CaptureTile",
  "screens/deepspace/DeepSpaceDesignScreens.tsx IntegrationEntryRow",
  "app/dev-screens.tsx PressRow",
  "app/dev-screens.tsx VariantRow",
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

type Fn = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

function isFn(node: ts.Node): node is Fn {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function nameText(name: ts.Node | undefined): string | undefined {
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  const elements: readonly ts.ArrayBindingElement[] = name.elements;
  const out: string[] = [];
  for (const element of elements) {
    if (ts.isBindingElement(element)) out.push(...bindingNames(element.name));
  }
  return out;
}

/** node 안에서 값으로 읽히는 이름. 속성 이름과 선언 이름은 읽기가 아니고, 주석 · 문자열은 노드가 아니다. */
function namesRead(node: ts.Node): Set<string> {
  const out = new Set<string>();
  walk(node, (n) => {
    if (!ts.isIdentifier(n)) return;
    const p = n.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === n) return;
    if (ts.isBindingElement(p) && (p.name === n || p.propertyName === n)) return;
    if (
      (ts.isPropertyAssignment(p) ||
        ts.isJsxAttribute(p) ||
        ts.isParameter(p) ||
        ts.isVariableDeclaration(p) ||
        ts.isFunctionDeclaration(p) ||
        ts.isMethodDeclaration(p)) &&
      p.name === n
    ) {
      return;
    }
    out.add(n.text);
  });
  return out;
}

function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  let hit = false;
  a.forEach((name) => {
    if (b.has(name)) hit = true;
  });
  return hit;
}

function isUseState(callee: ts.Expression): boolean {
  return (
    (ts.isIdentifier(callee) && callee.text === "useState") ||
    (ts.isPropertyAccessExpression(callee) && callee.name.text === "useState")
  );
}

/** fn 안에서 누름 상태로 보는 이름. inherited 는 바깥 함수의 누름 상태다(닫힌 변수로 보인다). */
function pressNames(fn: Fn, inherited: ReadonlySet<string>): Set<string> {
  const names = new Set<string>();
  inherited.forEach((name) => names.add(name));
  for (const param of fn.parameters) {
    for (const name of bindingNames(param.name)) if (PRESS_PARAM.test(name)) names.add(name);
  }
  const body = fn.body;
  if (!body) return names;

  const locals = new Map<string, Set<string>>(); // 지역 이름 -> 그 값이 읽는 이름
  const decls: { names: string[]; reads: Set<string> }[] = [];
  const states: { state: string; setter: string }[] = [];
  const queue: string[] = [];
  walk(body, (n) => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const reads = namesRead(n.initializer);
      const declared = bindingNames(n.name);
      decls.push({ names: declared, reads });
      for (const name of declared) locals.set(name, reads);
      const [state, setter] = ts.isArrayBindingPattern(n.name) ? n.name.elements : [];
      if (
        ts.isCallExpression(n.initializer) &&
        isUseState(n.initializer.expression) &&
        state &&
        setter &&
        ts.isBindingElement(state) &&
        ts.isIdentifier(state.name) &&
        ts.isBindingElement(setter) &&
        ts.isIdentifier(setter.name)
      ) {
        states.push({ state: state.name.text, setter: setter.name.text });
      }
    } else if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      locals.set(n.name.text, namesRead(n.body));
    } else if (ts.isJsxAttribute(n) && PRESS_HANDLERS.has(nameText(n.name) ?? "") && n.initializer) {
      namesRead(n.initializer).forEach((name) => queue.push(name));
    } else if (ts.isPropertyAssignment(n) && PRESS_HANDLERS.has(nameText(n.name) ?? "")) {
      namesRead(n.initializer).forEach((name) => queue.push(name));
    } else if (ts.isShorthandPropertyAssignment(n) && PRESS_HANDLERS.has(n.name.text)) {
      queue.push(n.name.text);
    }
  });

  // 핸들러가 읽는 이름에서 지역 선언을 따라가 닿는 이름을 모은다(useCallback · 지역 함수 · 객체).
  const reached = new Set<string>();
  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (reached.has(name)) continue;
    reached.add(name);
    locals.get(name)?.forEach((next) => queue.push(next));
  }
  for (const { state, setter } of states) if (reached.has(setter)) names.add(state);

  // 파생값: 누름 상태를 읽어 만든 지역 값도 누름 상태다(const sunken = held && !disabled).
  for (let grew = true; grew; ) {
    grew = false;
    for (const decl of decls) {
      if (decl.names.every((name) => names.has(name)) || !overlaps(decl.reads, names)) continue;
      for (const name of decl.names) names.add(name);
      grew = true;
    }
  }
  return names;
}

/** 이 파일에서 react-native 의 View 를 가리키는 지역 이름(별칭 포함). */
function reactNativeViews(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "react-native" || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly && nameText(element.propertyName ?? element.name) === "View") {
        out.add(element.name.text);
      }
    }
  }
  return out;
}

/** 이 노드를 품은 가장 가까운 이름 있는 함수. */
function ownerName(node: ts.Node): string {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) {
      return nameText(p.name) ?? p.name.getText();
    }
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent)) {
      const name = nameText(p.parent.name);
      if (name) return name;
    }
  }
  return "(top level)";
}

function hasChildren(element: ts.JsxOpeningElement): boolean {
  return element.parent.children.some(
    (child) =>
      !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces) &&
      !(ts.isJsxExpression(child) && !child.expression),
  );
}

interface PressView {
  file: string;
  line: number;
  owner: string;
  /** 누름 상태를 읽는 속성 이름. 펼침 속성은 `{...}`. */
  reads: string[];
  collapsableFalse: boolean;
}

/** 자식이 있고 속성이 누름 상태를 읽는 react-native View 전부와, 각각 collapsable={false} 인지. */
function pressViews(file: string, text: string): PressView[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const views = reactNativeViews(sf);
  const found: PressView[] = [];
  if (views.size === 0) return found;

  const visit = (node: ts.Node, inScope: ReadonlySet<string>): void => {
    const names = isFn(node) ? pressNames(node, inScope) : inScope;
    if (
      names.size > 0 &&
      ts.isJsxOpeningElement(node) &&
      ts.isIdentifier(node.tagName) &&
      views.has(node.tagName.text) &&
      hasChildren(node)
    ) {
      const reads: string[] = [];
      let collapsableFalse = false;
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
          if (overlaps(namesRead(attribute.expression), names)) reads.push("{...}");
          continue;
        }
        const attributeName = nameText(attribute.name) ?? attribute.name.getText(sf);
        const value = attribute.initializer;
        if (attributeName === "collapsable") {
          collapsableFalse =
            !!value && ts.isJsxExpression(value) && value.expression?.kind === ts.SyntaxKind.FalseKeyword;
        } else if (attributeName !== "key" && value && overlaps(namesRead(value), names)) {
          reads.push(attributeName);
        }
      }
      if (reads.length > 0) {
        found.push({
          file,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          owner: ownerName(node),
          reads,
          collapsableFalse,
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, names));
  };
  visit(sf, new Set<string>());
  return found;
}

describe("누름 상태가 닿는 View 는 늘 네이티브 뷰다 - 저장소 전체", () => {
  const found = sourceFiles(SRC).flatMap((file) => pressViews(rel(file), fs.readFileSync(file, "utf8")));
  const show = (view: PressView) => `${view.file}:${view.line} ${view.owner} [${view.reads.join(", ")}]`;

  it("검사기가 알려진 누름 래퍼 여섯을 실제로 찾는다", () => {
    expect(found.map((view) => `${view.file} ${view.owner}`)).toEqual(
      expect.arrayContaining(KNOWN_PRESS_WRAPPERS),
    );
  });

  it("그런 View 는 모두 collapsable={false} 를 JSX 속성으로 갖는다", () => {
    expect(found.filter((view) => !view.collapsableFalse).map(show)).toEqual([]);
  });
});

describe("검사기", () => {
  const summary = (text: string) =>
    pressViews("fixture.tsx", text).map(({ owner, reads, collapsableFalse }) => ({ owner, reads, collapsableFalse }));

  // 고치기 전 PixelPressable 의 뼈대(cf0595be). setter 는 useCallback 을 거치고, 래퍼는 파생값을 읽는다.
  const BEFORE = `
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
export function PixelPressable({ onPress, disabled, style }: Props) {
  const [held, setHeld] = useState(false);
  const press = useCallback(() => setHeld(true), []);
  const release = useCallback(() => setHeld(false), []);
  const sunken = held && !disabled;
  return (
    <Pressable onPress={onPress} onPressIn={press} onPressOut={release}>
      <View style={[sunken ? styles.sunk : styles.rest, style]}>
        <PixelSurface pressed={sunken} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({ rest: {}, sunk: { transform: [{ translateY: 2 }] } });
`;

  it("고치기 전 PixelPressable 은 빨강이다", () => {
    expect(summary(BEFORE)).toEqual([{ owner: "PixelPressable", reads: ["style"], collapsableFalse: false }]);
  });

  it("collapsable 은 값이 리터럴 false 인 JSX 속성일 때만 통과한다", () => {
    const fixed = BEFORE.replace("<View style={[sunken", "<View collapsable={false} style={[sunken");
    expect(fixed).not.toBe(BEFORE);
    expect(summary(fixed).map((view) => view.collapsableFalse)).toEqual([true]);
    for (const other of ["collapsable={true}", 'collapsable="false"', "collapsable={flag}"]) {
      const text = BEFORE.replace("<View style={[sunken", `<View ${other} style={[sunken`);
      expect(text).not.toBe(BEFORE);
      expect(summary(text).map((view) => view.collapsableFalse)).toEqual([false]);
    }
  });

  it("주석과 문자열은 속성도 누름 래퍼도 아니다 - 흔들리면 안 되는 항", () => {
    const prose = BEFORE.replace(
      "      <View style={[sunken",
      "      {/* <View collapsable={false}> */}\n      <View style={[sunken",
    );
    expect(prose).not.toBe(BEFORE);
    expect(summary(prose).map((view) => view.collapsableFalse)).toEqual([false]);

    const quoted = `
import { View } from "react-native";
export const SAMPLE = "<View style={held ? s.a : null}><B /></View>";
// function Row() { const [held, setHeld] = useState(false); return <Pressable onPressIn={() => setHeld(true)}><View style={held ? s.a : null}><B /></View></Pressable>; }
export function Plain({ label }: P) {
  return <View accessibilityLabel={label}><B /></View>;
}
`;
    expect(summary(quoted)).toEqual([]);
  });

  it("setter 는 이름이 아니라 onPressIn · onPressOut 에서 따라간다", () => {
    const text = `
import { useState } from "react";
import { Pressable, View } from "react-native";
export function Inline({ onPress }: P) {
  const [down, setDown] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)}>
      <View style={down ? s.lift : null}><B /></View>
    </Pressable>
  );
}
export function Spread() {
  const [a, setA] = useState(false);
  const handlers = { onPressIn: () => setA(true), onPressOut: () => setA(false) };
  return <Pressable {...handlers}><View style={[s.base, a && s.lift]}><B /></View></Pressable>;
}
export function OutOnly() {
  const [b, setB] = useState(true);
  function release() {
    setB(false);
  }
  return <Pressable onPressOut={release}><View style={b ? s.lift : null}><B /></View></Pressable>;
}
export function Mapped({ items }: P) {
  const [on, setOn] = useState<string | null>(null);
  return items.map((it) => (
    <Pressable key={it} onPressIn={() => setOn(it)} onPressOut={() => setOn(null)}>
      <View style={on === it ? s.lift : null}><B /></View>
    </Pressable>
  ));
}
export function NotPress() {
  const [open, setOpen] = useState(false);
  return <Pressable onPress={() => setOpen(!open)}><View style={open ? s.lift : null}><B /></View></Pressable>;
}
`;
    expect(summary(text).map((view) => view.owner)).toEqual(["Inline", "Spread", "OutOnly", "Mapped"]);
  });

  it("누름을 prop 으로 받는 프리미티브도 보고, 자식 없는 막대는 옮길 것이 없어 뺀다", () => {
    const text = `
import { View } from "react-native";
export function Surface({ pressed = false, children }: P) {
  const lift = pressed ? s.sunk : null;
  return (
    <View style={[s.wrap, lift]}>
      <View pointerEvents="none" style={[s.bevel, { backgroundColor: pressed ? LO : HI }]} />
      <View style={s.content}>{children}</View>
    </View>
  );
}
`;
    expect(summary(text)).toEqual([{ owner: "Surface", reads: ["style"], collapsableFalse: false }]);
  });

  it("react-native 의 View 만 보고, 별칭과 style 밖 속성은 본다", () => {
    const text = `
import { useState } from "react";
import { Pressable, Text, View as Box } from "react-native";
import { View } from "./elsewhere";
export function Tags() {
  const [held, setHeld] = useState(false);
  return (
    <Pressable onPressIn={() => setHeld(true)} onPressOut={() => setHeld(false)} style={held ? s.p : null}>
      <Text style={held ? s.t : null}>label</Text>
      <View style={held ? s.a : null}><B /></View>
      <Box pointerEvents={held ? "none" : "auto"}><B /></Box>
    </Pressable>
  );
}
`;
    expect(summary(text)).toEqual([{ owner: "Tags", reads: ["pointerEvents"], collapsableFalse: false }]);
  });

  it("같은 이름이라도 함수가 다르면 따로 본다 - 바인딩은 위치로", () => {
    const text = `
import { useState } from "react";
import { Pressable, View } from "react-native";
export function Pressy() {
  const [held, setHeld] = useState(false);
  return <Pressable onPressIn={() => setHeld(true)}><View style={held ? s.a : null}><B /></View></Pressable>;
}
export function Other() {
  const [held] = useState(false);
  return <View style={held ? s.a : null}><B /></View>;
}
`;
    expect(summary(text).map((view) => view.owner)).toEqual(["Pressy"]);
  });
});
