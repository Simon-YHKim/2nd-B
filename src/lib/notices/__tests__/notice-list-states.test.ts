import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path: string) => readFileSync(join(__dirname, "../../..", path), "utf8");
const source = read("app/notices.tsx");
const phone = read("components/dashboard/DashboardPhone.tsx");
const ast = ts.createSourceFile("notices.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let list: ts.JsxSelfClosingElement | undefined;
function visit(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "FlatList") list = node;
  ts.forEachChild(node, visit);
}
visit(ast);

function listProp(name: string): string {
  const prop = list?.attributes.properties.find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === name,
  );
  if (!prop || !ts.isJsxAttribute(prop) || !prop.initializer || !ts.isJsxExpression(prop.initializer)) {
    return "undefined";
  }
  return prop.initializer.expression?.getText(ast) ?? "undefined";
}

// Execute only the actual list prop expressions as plain data. No React/RN
// imports, component mounting, renderer, network, or copied state predicates.
const dataExpression = source.slice(source.indexOf("export default function NoticesScreen"))
  .match(/const data = ([^;]+);/)?.[1] ?? "undefined";
const code = ts.transpileModule(`
  const data = ${dataExpression};
  ({ data: ${listProp("data")}, header: ${listProp("ListHeaderComponent")}, empty: ${listProp("ListEmptyComponent")} });
`, { compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: "element" } }).outputText;

function listState(hydrated: boolean, notices: readonly { id: string }[] = []) {
  return runInNewContext(code, {
    noticeCenter: { hydrated, notices },
    Text: "Text",
    styles: { listStatus: "listStatus" },
    t: (key: string) => key,
    element: (type: string, props: Record<string, unknown>, text: string) => ({ type, props, text }),
  }) as {
    data: { id: string }[];
    header: null | { text: string };
    empty: null | { type: string; props: Record<string, unknown>; text: string };
  };
}

describe("standalone notice list states (T49)", () => {
  test("a pending request shows the phone loading text, never the empty message", () => {
    const state = listState(false);
    expect(state.header).toMatchObject({ text: "phone.noticeLoading" });
    expect(state.empty).toBeNull();
    expect(state.data).toEqual([]);
  });

  test("a hydrated empty response shows the phone empty text and clears loading", () => {
    const state = listState(true);
    expect(state.header).toBeNull();
    expect(state.empty).toMatchObject({ text: "phone.noticeEmpty" });
    expect(state.data).toEqual([]);
  });

  test("notices remain in order and are passed to the existing list after hydration", () => {
    const notices = [{ id: "newer" }, { id: "older" }];
    expect(listState(false, notices).data).toEqual([]);
    const state = listState(true, notices);
    expect(state.data).toBe(notices);
    expect(state.header).toBeNull();
    // FlatList only displays ListEmptyComponent when its data has no rows.
    expect(listProp("renderItem")).toContain("noticeCenter.isUnread(item.id)");
    expect(listProp("renderItem")).toContain("setSelectedId(item.id)");
  });

  test("both messages use the phone caption component, colour, and line spacing", () => {
    expect(source).toContain('import { Text } from "@/components/ui/Text"');
    expect(source).toContain('useTranslation("ops")');
    for (const [prop, key] of [["ListHeaderComponent", "noticeLoading"], ["ListEmptyComponent", "noticeEmpty"]]) {
      expect(listProp(prop)).toContain('<Text variant="caption" style={styles.listStatus}>');
      expect(phone).toContain(`<Text variant="caption" style={styles.muted}>{t("phone.${key}")}</Text>`);
    }
    const referenceStyle = phone.match(/muted: (\{[^}]+\})/)?.[1];
    expect(referenceStyle).toBeDefined();
    expect(source).toContain(`listStatus: ${referenceStyle}`);
  });
});
