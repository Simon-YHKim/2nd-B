import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(__dirname, "../../..");

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? tsxFiles(filename) : entry.name.endsWith(".tsx") ? [filename] : [];
  });
}

test("screen components used as JSX are not declared inside another component", () => {
  const unstable: string[] = [];

  for (const directory of ["src/app", "src/screens", "src/components"]) {
    for (const filename of tsxFiles(path.join(root, directory))) {
      const source = ts.createSourceFile(
        filename,
        readFileSync(filename, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const nestedComponents: { name: string; line: number }[] = [];
      const jsxNames = new Set<string>();

      function visit(node: ts.Node, insideFunction: boolean): void {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          jsxNames.add(node.tagName.getText(source));
        }

        let childInsideFunction = insideFunction;
        if (ts.isFunctionDeclaration(node) && node.name) {
          if (insideFunction && /^[A-Z]/.test(node.name.text)) {
            nestedComponents.push({ name: node.name.text, line: source.getLineAndCharacterOfPosition(node.name.getStart(source)).line + 1 });
          }
          childInsideFunction = true;
        } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
          const declaration = node.parent;
          if (insideFunction && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && /^[A-Z]/.test(declaration.name.text)) {
            nestedComponents.push({ name: declaration.name.text, line: source.getLineAndCharacterOfPosition(declaration.name.getStart(source)).line + 1 });
          }
          childInsideFunction = true;
        }

        ts.forEachChild(node, (child) => visit(child, childInsideFunction));
      }

      visit(source, false);
      for (const component of nestedComponents) {
        if (jsxNames.has(component.name)) {
          unstable.push(`${path.relative(root, filename)}:${component.line} <${component.name}>`);
        }
      }
    }
  }

  expect(unstable).toEqual([]);
});
