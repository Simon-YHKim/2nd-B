import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hustlekPortraitLayout } from "@/lib/assets/hustlek-framing";

const root = resolve(__dirname, "../../../..");
function declaration(file: string, name: string) {
  const source = ts.createSourceFile(file, readFileSync(resolve(root, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const node = source.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error(`${name} is missing`);
  return { source, node };
}

type Tree = { type: string; props: Record<string, unknown>; children: Tree[] };
function renderer(file: string, name: string) {
  const { source, node } = declaration(file, name);
  const code = ts.transpileModule(`(${node.getText(source)})`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  // No animation/effect/timer globals: an accidental movement subscription fails.
  return runInNewContext(code, {
    React: { createElement: (type: string, props: Record<string, unknown>, ...children: Tree[]) => ({ type, props, children }) },
    window: { SbHead: "portrait" },
  }) as (props: Record<string, unknown>) => Tree;
}

const render = renderer("public/proto/sb-data.jsx", "SbHead");
test.each([22, 48, 152])("prototype %ipx faces use the same fixed frame as native with no position effects", size => {
  for (const [expression, id] of [["neutral", "A01"], ["positive", "A02"], ["negative", "C07"]] as const) {
    const tree = render({ size, expression, track: true, bob: true });
    const layout = hustlekPortraitLayout(size, id);
    expect(tree.props.style).toMatchObject({ width: size, height: size, overflow: "hidden" });
    expect(tree.children[0].props.style).toMatchObject(layout.image);
    expect(tree.children[0].props.style).not.toHaveProperty("transform");
    expect(tree.children[0].props.style).not.toHaveProperty("animation");
  }
});

test("home keeps its layout ref while neither its wrapper nor parent animates the head", () => {
  const renderHomeHead = renderer("public/proto/sb-home.jsx", "SecondBHead");
  const headRef = { current: null };
  const tree = renderHomeHead({ headRef, scale: 1, expression: "positive" });
  expect(tree.props.ref).toBe(headRef);
  expect(tree.children[0].props).toMatchObject({ expression: "positive", size: 152 });
  const { source, node } = declaration("public/proto/sb-home.jsx", "ConstellationHome");
  expect(node.getText(source)).not.toMatch(/headRef\.current\.style\.transform|sb-bob|hold\.current/);
});

test("positioned prototype avatars retain their placement and decorative accessibility", () => {
  const tree = render({ size: 18, accessibilityLabel: "", style: { position: "absolute", inset: 4 } });
  expect(tree.props.style).toMatchObject({ position: "absolute", inset: 4, width: 18, height: 18 });
  expect(tree.children[0].props.alt).toBe("");
});

test.each(["B04", "A08"] as const)("prototype persona %s retains its original face in the shared frame", id => {
  const source = `assets/hustlek/${id}-portrait.png`;
  const tree = render({ size: 64, source });
  expect(tree.children[0].props.src).toBe(source);
  expect(tree.children[0].props.style).toMatchObject(hustlekPortraitLayout(64, id).image);
});
