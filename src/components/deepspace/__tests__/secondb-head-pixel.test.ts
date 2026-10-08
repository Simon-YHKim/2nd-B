import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { HUSTLEK_EXPRESSIONS } from "@/lib/assets/hustlek";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
function portrait(platform: "web" | "android", props: Props): Tree {
  const source = readFileSync(resolve(__dirname, "../../character/HustleKPortrait.tsx"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const modules: Record<string, unknown> = {
    "react-native": { Platform: { OS: platform } },
    "expo-image": { Image: "Image" },
    "react/jsx-runtime": { jsx: (type: string, value: Props) => ({ type, props: value }) },
    "@/lib/assets/hustlek": { HUSTLEK_EXPRESSIONS },
  };
  const exported: { HustleKPortrait?: (value: Props) => Tree } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error("Unexpected dependency: " + name);
    return modules[name];
  }, exported);
  return exported.HustleKPortrait!(props);
}

test.each(["web", "android"] as const)("%s displays the original image without face layers or a crossfade", platform => {
  const tree = portrait(platform, { expression: "C08", size: 30.4, accessibilityLabel: "HustleK" });
  expect(tree.type).toBe("Image");
  expect(tree.props).toMatchObject({
    source: HUSTLEK_EXPRESSIONS.C08.source, contentFit: "contain", transition: 0,
    accessible: true, accessibilityLabel: "HustleK", testID: "hustlek-portrait-C08",
  });
  expect(tree.props.children).toBeUndefined();
  const style = Object.assign({}, ...(tree.props.style as (object | undefined)[]));
  expect(style).toEqual({ width: 30, height: 30, ...(platform === "web" ? { imageRendering: "pixelated" } : {}) });
  expect(tree.props.tintColor).toBeUndefined();
  expect(tree.props.colorFilter).toBeUndefined();
});

test("small portraits retain the caller's size and decorative images stay silent", () => {
  const tree = portrait("web", { size: 22 });
  expect(tree.props.accessible).toBe(false);
  expect(tree.props.accessibilityLabel).toBe("");
  expect(tree.props.testID).toBe("hustlek-portrait-A01");
  expect(tree.props.style).toEqual([{ width: 22, height: 22 }, { imageRendering: "pixelated" }]);
});
