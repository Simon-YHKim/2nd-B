// Every limit bubble comes with 요금제 보기 (Simon 2026-10-14, Q-261014-24: "the limit sentence and
// 요금제 보기 only"). The link used to follow the local count alone (atLimit). When the server's cap
// refused a send while the local count was still under the wall, sendChatMessage returned "blocked"
// with its own limit sentence, the bubble appeared, and the link did not (review r1 on #2497).
//
// Component render tests are blocked in this repo (RN upstream), so the screen is pinned through its
// source: the state's first value and the link's condition are read from the syntax tree and the
// condition is run (review r2 on #2497: string checks let useState(true) through). What the send
// handler does with the state is asserted in the handler harnesses (secondb-messenger-layout and
// secondb-retry-failed-reply), and the ad grant in rewarded-grant-failure.
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const screen = readFileSync(path.resolve(__dirname, "../secondb.tsx"), "utf8").replace(/\r\n/g, "\n");
const ast = ts.createSourceFile("secondb.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findAll(predicate: (node: ts.Node) => boolean): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return out;
}

test("the refusal starts false, so the first screen under the limit shows no link", () => {
  const states = findAll((node) => ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
    && node.name.elements.some((element) => ts.isBindingElement(element) && element.name.getText(ast) === "setLimitRefused")) as ts.VariableDeclaration[];
  expect(states).toHaveLength(1);
  const init = states[0].initializer;
  expect(init && ts.isCallExpression(init) && init.expression.getText(ast)).toBe("useState");
  const [first] = (init as ts.CallExpression).arguments;
  expect(first?.kind).toBe(ts.SyntaxKind.FalseKeyword);
});

test("the plans link shows at the local wall or after a refusal, and only then", () => {
  const links = findAll((node) => ts.isConditionalExpression(node)
    && node.whenTrue.getText(ast).includes('router.push("/plans?from=ai_limit")')) as ts.ConditionalExpression[];
  expect(links).toHaveLength(1);
  const [link] = links;
  expect(link.whenFalse.kind).toBe(ts.SyntaxKind.NullKeyword);
  const condition = link.condition.getText(ast);
  const shows = (atLimit: boolean, limitRefused: boolean): boolean => Boolean(runInNewContext(`(${condition})`, { atLimit, limitRefused }));
  expect([
    [false, false, shows(false, false)],
    [false, true, shows(false, true)],
    [true, false, shows(true, false)],
    [true, true, shows(true, true)],
  ]).toEqual([
    [false, false, false],
    [false, true, true],
    [true, false, true],
    [true, true, true],
  ]);
  // One link: the old local-only gate is gone.
  expect(screen.split('router.push("/plans?from=ai_limit")')).toHaveLength(2);
});

test("only a refusal sets it, and only a reply or a granted ad bonus clears it", () => {
  const writes = findAll((node) => ts.isCallExpression(node) && node.expression.getText(ast) === "setLimitRefused") as ts.CallExpression[];
  expect(writes.map((call) => call.arguments.map((arg) => arg.getText(ast)).join(", ")).sort()).toEqual(["false", "false", "true"]);
});
