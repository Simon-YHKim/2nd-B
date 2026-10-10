import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { chatDisplayText } from "../display-text";
import { parseSourceCitations } from "../sources";

test.each([
  ["**짧게 읽고 바로 말로 바꾸는 것**이 좋습니다.", "짧게 읽고 바로 말로 바꾸는 것이 좋습니다."],
  ["__굵게__ 그리고 **굵게**", "굵게 그리고 굵게"],
  ["*기울임* 그리고 _기울임_", "기울임 그리고 기울임"],
  ["***둘 다***, ___둘 다___", "둘 다, 둘 다"],
  ["**굵게 *안쪽* 끝**", "굵게 안쪽 끝"],
  ["# 제목\n## 소제목\n\n본문\n", "제목\n소제목\n\n본문\n"],
  ["  ### 들여쓰기\r\n- **첫째**\r\n1. _둘째_", "  들여쓰기\r\n- 첫째\r\n1. 둘째"],
  ["* 목록\n* **다른 목록**\n- 항목\n1. 항목", "* 목록\n* 다른 목록\n- 항목\n1. 항목"],
  ["`한글_이름`과 `2 * 3`", "한글_이름과 2 * 3"],
  ["**사용: `변수_이름`**", "사용: 변수_이름"],
  ["`코드`# 제목 아님", "코드# 제목 아님"],
  ["원문\u0000과 `코드`", "원문\u0000과 코드"],
  ["```\n**원문**\n변수_이름\n```", "\n**원문**\n변수_이름\n"],
  ["```ts\nconst n = 2 * 3;\n```", "ts\nconst n = 2 * 3;\n"],
  ["**여러\n줄**\n\n다음", "여러\n줄\n\n다음"],
  ["", ""],
  ["file_name_here 한글_낱말_내부 foo__bar__baz", "file_name_here 한글_낱말_내부 foo__bar__baz"],
  ["2 * 3 = 6, 2*3*4 = 24, x * y * z", "2 * 3 = 6, 2*3*4 = 24, x * y * z"],
  ["**열린 별표, 닫힘*, 홀로 *", "**열린 별표, 닫힘*, 홀로 *"],
  ["**열림*** 그리고 ***닫힘**", "**열림*** 그리고 ***닫힘**"],
  ["* 공백 *와 _ 공백 _", "* 공백 *와 _ 공백 _"],
  ["C# 그리고 #태그", "C# 그리고 #태그"],
  ["\\*별표\\*", "\\*별표\\*"],
  ["\\`백틱\\`", "\\`백틱\\`"],
  ["**https://example.com**", "https://example.com"],
  ["*https://example.com*", "https://example.com"],
  ["**참고 https://example.com**.", "참고 https://example.com."],
  ["**https://example.com**으로 가기", "https://example.com으로 가기"],
  ["(**https://example.com**)", "(https://example.com)"],
  ["**https://example.com**으로_가기", "https://example.com으로_가기"],
  ["**https://example.com**으로**가기**", "https://example.com으로가기"],
  ["**https://example.com**과 *다음*", "https://example.com과 다음"],
  ["https://example.com/_path_ https://example.com/`path`", "https://example.com/_path_ https://example.com/`path`"],
  ["__https://example.com__", "https://example.com"],
  ["*나* _나_ **나** __나__", "나 나 나 나"],
  ["[원문](https://example.com/_path_) https://example.com/*path*", "[원문](https://example.com/_path_) https://example.com/*path*"],
])("display only: %j", (input, expected) => {
  expect(chatDisplayText(input)).toBe(expected);
});

test("citation labels keep sentence order while the original slugs and display stay intact", () => {
  const parsed = parseSourceCitations("**먼저** [[아침-기록]]\n_다음_ [[book_notes]] 그리고 [[아침-기록]]");
  const original = { display: parsed.display, chips: [...parsed.chips] };
  expect(chatDisplayText(parsed.display)).toBe("먼저 아침 기록\n다음 Book Notes 그리고 아침 기록");
  expect(parsed).toEqual(original);
  expect(parsed.chips).toEqual(["아침-기록", "book_notes"]);
});

const source = readFileSync(resolve(__dirname, "../../../app/secondb.tsx"), "utf8");
const ast = ts.createSourceFile("secondb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findCalls(name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast); return found;
}

test("the single display conversion is the model-only branch inside the selectable bubble Text", () => {
  const calls = findCalls("chatDisplayText");
  expect(calls).toHaveLength(1);
  const expression = calls[0].parent;
  expect(ts.isConditionalExpression(expression)).toBe(true);
  const choose = expression as ts.ConditionalExpression;
  expect(choose.getText(ast)).toBe('turn.role === "secondb" ? chatDisplayText(turn.text) : turn.text');
  const element = expression.parent.parent as ts.JsxElement;
  expect(element.openingElement.tagName.getText(ast)).toBe("Text");
  expect(element.openingElement.attributes.getText(ast)).toContain("selectable");
  for (const role of ["user", "secondb"]) {
    const turn = { role, text: "**원문**" };
    const result = new Function("turn", "chatDisplayText", `return ${choose.getText(ast)}`)(turn, chatDisplayText);
    expect(result).toBe(role === "user" ? "**원문**" : "원문");
    expect(turn.text).toBe("**원문**");
  }
});

test("copy, wiki capture, reply storage and citation navigation keep the original inputs", () => {
  expect(findCalls("copyTurn")[0].arguments.map(arg => arg.getText(ast))).toEqual(["i", "turn.text"]);
  expect(findCalls("composeExchangeBody")[0].arguments[0].getText(ast)).toContain("reply: reply.text");
  expect(findCalls("parseSourceCitations")[0].arguments[0].getText(ast)).toBe("result.reply.text");
  expect(source).toContain("text: twi.display, chips, branches: twi.branches, safetyZone: result.reply.safety?.zone");
  expect(source).toContain("onPress={() => setRefDrawer(turn.chips ?? [])}");
  expect(source).toContain("onPress={() => openCitedPage(slug)}");
  const helper = readFileSync(resolve(__dirname, "../display-text.ts"), "utf8");
  expect(helper).not.toMatch(/\bimport\b/);
});
