import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// W-09 (QA 261004): the deep-space /secondb intro modal and reference drawer
// hid the whole chat behind an opaque slab.
//
// `ds.modalBackdrop` carried `backgroundColor: sbAlpha(deepSpace.bgEdge, 0.8)`.
// `sbAlpha` pre-composites over a fixed ground (`flattenAlpha`), so the 80%
// scrim became one opaque colour, rgb(12,17,28) alpha 1 (measured on web). The
// file's own header says a scrim must NOT go through sbAlpha: it covers
// something it cannot see, so PIXEL-CLAY rule 4 asks for a dither there. The
// legacy half already drew `PixelScrim`; the shipped deep-space half did not.
//
// Second trap: `PixelScrim` with only `absoluteFill` paints a single 4×4 tile
// on RN Web, so the image needs an explicit 100% width/height (the same fix
// the home phone backdrop and the Polaris card use).
//
// This reads the real source with the TypeScript AST. RN render tests are
// blocked in this repo, so the contract is checked on the declarations.
const FILE = resolve(__dirname, "../secondb.tsx");
const SOURCE = readFileSync(FILE, "utf8");
const AST = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

function styleSheet(name: string): ts.ObjectLiteralExpression {
  let found: ts.ObjectLiteralExpression | null = null;
  walk(AST, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText(AST) === "StyleSheet.create"
    ) {
      const arg = n.initializer.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) found = arg;
    }
  });
  if (!found) throw new Error(`StyleSheet ${name} not found in secondb.tsx`);
  return found;
}

function prop(obj: ts.ObjectLiteralExpression, key: string): ts.ObjectLiteralExpression {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText(AST) === key && ts.isObjectLiteralExpression(p.initializer)) {
      return p.initializer;
    }
  }
  throw new Error(`style ${key} not found`);
}

function keys(obj: ts.ObjectLiteralExpression): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p)) out.set(p.name.getText(AST), p.initializer.getText(AST));
  }
  return out;
}

function styleAttr(el: ts.JsxOpeningLikeElement): string | null {
  for (const a of el.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText(AST) === "style" && a.initializer && ts.isJsxExpression(a.initializer)) {
      return a.initializer.expression?.getText(AST) ?? null;
    }
  }
  return null;
}

describe("secondb deep-space modal scrim (W-09)", () => {
  const ds = styleSheet("ds");

  it("ds.modalBackdrop paints no colour of its own", () => {
    const backdrop = keys(prop(ds, "modalBackdrop"));
    expect(backdrop.has("backgroundColor")).toBe(false);
  });

  it("the scrim image is sized to the whole backdrop", () => {
    const img = keys(prop(ds, "modalScrimImage"));
    expect(img.get("width")).toBe('"100%"');
    expect(img.get("height")).toBe('"100%"');
  });

  it("every Pressable on ds.modalBackdrop draws a full-size PixelScrim under its card", () => {
    const backdrops: ts.JsxElement[] = [];
    walk(AST, (n) => {
      if (
        ts.isJsxElement(n) &&
        n.openingElement.tagName.getText(AST) === "Pressable" &&
        styleAttr(n.openingElement) === "ds.modalBackdrop"
      ) {
        backdrops.push(n);
      }
    });
    // intro modal + reference drawer
    expect(backdrops.length).toBeGreaterThanOrEqual(2);

    for (const el of backdrops) {
      const scrims: string[] = [];
      walk(el, (n) => {
        if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(AST) === "PixelScrim") {
          scrims.push(styleAttr(n) ?? "");
        }
      });
      const line = AST.getLineAndCharacterOfPosition(el.getStart(AST)).line + 1;
      expect({ line, scrims }).toEqual({ line, scrims: ["ds.modalScrimImage"] });
    }
  });
});
