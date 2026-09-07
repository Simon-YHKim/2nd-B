import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// 가져오기 검토 목록의 체크박스가 체크박스로 노출되지 않는 문제를 잡는다.
//
// 이 줄들은 사용자가 "무엇을 실제로 내 기록에 넣을지" 를 고르는 자리다. 그런데
// 화면에서는 Pressable 하나에 ✓ 를 그리는 View 를 얹은 것뿐이고,
// accessibilityRole 도 accessibilityState 도 accessibilityLabel 도 없다.
// 그래서 스크린리더는 "체크박스" 라고 말하지 않고 켜졌는지도 말하지 않는다.
// 상태를 알리는 유일한 신호가 눈에 보이는 ✓ 다.
//
// 웹에서는 결과가 한 단계 더 나쁘다. React Native Web 의 PressResponder 는
// isButtonish (button 요소이거나 button role) 가 아니면 스페이스 키를 아예
// 처리하지 않고(usePressEvents/PressResponder.js:66-71), 역할 없는 View 는
// 포커스도 받지 못한다. 그래서 #1677 이 착지시킨 checkboxSpaceKeyProps 를 여기
// 그냥 얹어도 아무 일도 일어나지 않는다 - 역할이 먼저다.
//
// 컴포넌트 렌더 테스트는 이 저장소에서 막혀 있다(RN 0.85 upstream). 화면의 실제
// 선언을 AST 로 떼어 검사한다. 재구현이 아니라 실제 본문이다.
const FILE = resolve(__dirname, "../ImportHubScreen.tsx");
const SOURCE = readFileSync(FILE, "utf8");
const AST = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function walk(node: ts.Node, visit: (n: ts.Node) => boolean | void): void {
  if (visit(node) === true) return;
  node.forEachChild((child) => walk(child, visit));
}

/** toggleSel 을 onPress 로 부르는 JSX 요소 하나를 통째로 떼어낸다. */
function proposalRow(): { text: string; attributes: Map<string, string> } {
  let found: ts.JsxOpeningLikeElement | null = null;
  walk(AST, (node) => {
    const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;
    if (!opening) return;
    const text = opening.getText(AST);
    if (text.includes("toggleSel(") && !found) found = opening;
  });
  if (!found) throw new Error("toggleSel 을 부르는 요소를 찾지 못했다");
  const element = found as ts.JsxOpeningLikeElement;
  const attributes = new Map<string, string>();
  for (const property of element.attributes.properties) {
    if (ts.isJsxAttribute(property)) attributes.set(property.name.getText(AST), property.initializer?.getText(AST) ?? "true");
    else if (ts.isJsxSpreadAttribute(property)) attributes.set("..." + property.expression.getText(AST).slice(0, 60), "spread");
  }
  return { text: element.getText(AST), attributes };
}

describe("검토 목록의 각 줄이 체크박스로 노출된다", () => {
  test("하네스가 실제 그 줄을 찾았다", () => {
    const row = proposalRow();
    expect(row.text).toContain("toggleSel(");
    expect(row.attributes.size).toBeGreaterThan(2);
  });

  test("역할이 checkbox 다 - button 이 아니라", () => {
    // button 으로 두면 스크린리더가 "선택됨" 을 말할 자리가 없고, 웹에서는
    // 눌린 상태라는 개념이 없다. 이 줄은 켜고 끄는 것이지 실행하는 것이 아니다.
    expect(proposalRow().attributes.get("accessibilityRole")).toBe('"checkbox"');
  });

  test("켜짐·꺼짐을 상태로 말한다", () => {
    const state = proposalRow().attributes.get("accessibilityState");
    expect(state).toBeDefined();
    expect(state).toMatch(/checked:\s*on\b/);
  });

  test("무엇을 고르는지 이름이 붙는다", () => {
    const label = proposalRow().attributes.get("accessibilityLabel");
    expect(label).toBeDefined();
    // 라벨은 제안의 실제 텍스트에서 와야 한다. 고정 문자열이면 열 줄이 모두
    // 같은 이름으로 읽힌다.
    expect(label).toMatch(/p\.label/);
  });

  test("스페이스 키가 토글한다 - #1677 이 착지시킨 헬퍼를 쓴다", () => {
    const row = proposalRow();
    const spread = [...row.attributes.keys()].find((k) => k.startsWith("...") && k.includes("checkboxSpaceKeyProps"));
    expect(spread).toBeDefined();
    expect(SOURCE).toContain('from "@/lib/ui/checkbox-space-key"');
  });

  test("헬퍼를 복제하지 않았다", () => {
    // 인수 프롬프트의 명시 제약. 이 화면에 자체 keydown 처리가 있으면 안 된다.
    expect(SOURCE).not.toMatch(/onKeyDown/);
    expect(SOURCE).not.toMatch(/Spacebar/);
  });

  test("바쁜 동안에는 토글도 키도 받지 않는다", () => {
    const row = proposalRow();
    // 적용 버튼은 이미 busy 로 잠긴다. 그 사이 선택이 바뀌면 사용자가 고른 것과
    // 적용되는 것이 갈라진다.
    expect(row.attributes.get("disabled")).toMatch(/busy/);
    const spread = [...row.attributes.keys()].find((k) => k.includes("checkboxSpaceKeyProps"));
    expect(spread).toMatch(/!busy/);
  });
});

describe("눌러서 켜는 경로와 키로 켜는 경로가 같은 것을 부른다", () => {
  test("둘 다 toggleSel 을 부른다", () => {
    const row = proposalRow();
    const onPress = row.attributes.get("onPress") ?? "";
    const spread = [...row.attributes.keys()].find((k) => k.includes("checkboxSpaceKeyProps")) ?? "";
    expect(onPress).toContain("toggleSel(p.id)");
    expect(spread).toContain("toggleSel(p.id)");
  });
});
