import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { screenModalVisible } from "../screen-modal-visible";

// R2A-03 (QA 261005, Android): the /secondb intro modal, left open while a
// deep link pushed /notices over /secondb, popped up over /notices after a
// font-size change recreated the activity, and the second change crashed the
// app ("not attached to window manager" from ReactModalHostManager
// .onDropViewInstance). Mechanism and RN line refs: screen-modal-visible.ts.
//
// The fix: a route screen's modal asks for its dialog only while the screen
// is focused. RN render tests are blocked in this repo (RN 0.85), so the
// focus rule is a pure function and the wiring is checked on the source AST.

const ROOT = resolve(__dirname, "../../../..");

function parse(rel: string): ts.SourceFile {
  const file = resolve(ROOT, rel);
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

function jsxOpenings(sf: ts.SourceFile, tag: string): ts.JsxOpeningLikeElement[] {
  const out: ts.JsxOpeningLikeElement[] = [];
  walk(sf, (n) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(sf) === tag) out.push(n);
  });
  return out;
}

function namedImports(sf: ts.SourceFile, from: string): string[] {
  const names: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== from) continue;
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) names.push(el.name.text);
  }
  return names;
}

describe("screenModalVisible: a route screen's modal shows only while the screen is focused", () => {
  it("open and focused -> shown", () => {
    expect(screenModalVisible(true, true)).toBe(true);
  });

  it("open but covered by another screen -> hidden (the R2A-03 case)", () => {
    expect(screenModalVisible(true, false)).toBe(false);
  });

  it("closed stays closed whatever the focus", () => {
    expect(screenModalVisible(false, true)).toBe(false);
    expect(screenModalVisible(false, false)).toBe(false);
  });

  it("follows RN Modal's own default: omitted visible means open, null means closed", () => {
    // Modal.defaultProps.visible === true; render() checks `visible === true`.
    expect(screenModalVisible(undefined, true)).toBe(true);
    expect(screenModalVisible(undefined, false)).toBe(false);
    expect(screenModalVisible(null, true)).toBe(false);
  });
});

describe("ScreenModal wires RN Modal's visible through the screen's focus", () => {
  const sf = parse("src/components/ui/ScreenModal.tsx");

  it("reads focus with expo-router's useIsFocused and renders RN's Modal", () => {
    expect(namedImports(sf, "expo-router")).toContain("useIsFocused");
    expect(namedImports(sf, "react-native")).toContain("Modal");
  });

  it("passes visible = screenModalVisible(props.visible, <useIsFocused()>) AFTER the props spread", () => {
    let focusVar: string | null = null;
    walk(sf, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        ts.isCallExpression(n.initializer) &&
        n.initializer.expression.getText(sf) === "useIsFocused"
      ) {
        focusVar = n.name.text;
      }
    });
    expect(focusVar).not.toBeNull();

    const modals = jsxOpenings(sf, "Modal");
    expect(modals).toHaveLength(1);
    const attrs = modals[0].attributes.properties;
    const spreadAt = attrs.findIndex((a) => ts.isJsxSpreadAttribute(a));
    const visibleAt = attrs.findIndex((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "visible");
    expect(spreadAt).toBeGreaterThanOrEqual(0);
    // A visible written before the spread would be overwritten by props.visible.
    expect(visibleAt).toBeGreaterThan(spreadAt);

    const visible = attrs[visibleAt] as ts.JsxAttribute;
    const expr = visible.initializer && ts.isJsxExpression(visible.initializer) ? visible.initializer.expression : undefined;
    expect(expr && ts.isCallExpression(expr)).toBe(true);
    const call = expr as ts.CallExpression;
    expect(call.expression.getText(sf)).toBe("screenModalVisible");
    expect(call.arguments.map((a) => a.getText(sf))).toEqual(["props.visible", focusVar]);
  });
});

describe("/secondb: both of its modals are ScreenModal (R2A-03)", () => {
  const sf = parse("src/app/secondb.tsx");

  it("renders no raw RN Modal", () => {
    expect(namedImports(sf, "react-native")).not.toContain("Modal");
    expect(jsxOpenings(sf, "Modal")).toHaveLength(0);
  });

  it("the intro modal and the reference drawer go through ScreenModal", () => {
    expect(namedImports(sf, "@/components/ui/ScreenModal")).toContain("ScreenModal");
    const visibles = jsxOpenings(sf, "ScreenModal").map((el) => {
      for (const a of el.attributes.properties) {
        if (ts.isJsxAttribute(a) && a.name.getText(sf) === "visible" && a.initializer && ts.isJsxExpression(a.initializer)) {
          return a.initializer.expression?.getText(sf) ?? "";
        }
      }
      return "";
    });
    expect(visibles).toEqual(["introOpen", "refDrawer !== null"]);
  });
});
