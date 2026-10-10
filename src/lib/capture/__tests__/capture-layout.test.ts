import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Source contracts: RN 0.85 cannot run the old native test renderer. Check the
// shipping JSX/style chain; browser measurements cover its actual flex layout.
const file = resolve(__dirname, "../../../components/deep-space/DeepSpaceViews.tsx");
const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const capture = ast.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "CaptureView",
);
if (!capture) throw new Error("CaptureView is missing");
const body = capture.getText(ast);

function initializer(name: string): string {
  let result: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer?.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(capture!);
  if (!result) throw new Error(`Missing layout condition: ${name}`);
  return result;
}

function style(name: string): Record<string, unknown> {
  let result: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!result) throw new Error(`Missing layout style: ${name}`);
  return runInNewContext(`(${result})`) as Record<string, unknown>;
}

describe("capture available-height layout", () => {
  test.each([
    ["text", false, true], ["text", true, false],
    ["link", false, true], ["link", true, true],
    ["todo", false, false], ["todo", true, false],
  ])("%s / 4W1H=%s fills only a single-input form", (mode, fourwOn, expected) => {
    expect(runInNewContext(initializer("fillAvailableSpace"), { mode, fourwOn })).toBe(expected);
  });

  test("content and the transition wrapper both receive the remaining height", () => {
    expect(body).toContain("contentContainerStyle={[styles.capBody, fillAvailableSpace && styles.capFillSpace]}");
    expect(body).toMatch(/<SceneTransition[^>]*style=\{fillAvailableSpace && styles\.capFillSpace\}/);
  });

  test("memo passes height through the form, coach anchor, and multiline input", () => {
    const memo = body.slice(body.indexOf("{!fourwOn ? ("), body.indexOf("<CaptureField"));
    expect(memo).toContain("style={[styles.capForm, styles.capFillSpace]} {...saveReveal.keepTopProps}");
    expect(memo).toMatch(/<View ref=\{inputCoachTargetRef\} collapsable=\{false\} style=\{styles\.capFillSpace\}>/);
    expect(memo).toContain("style={[styles.capFieldInput, styles.capFreeInput, styles.capFillSpace]}");
    expect(memo).toMatch(/<TextInput[\s\S]*?multiline[\s\S]*?textAlignVertical="top"/);
    expect(memo.indexOf("{attachStrip}")).toBeGreaterThan(memo.indexOf("</View>"));
  });

  test("growth keeps intrinsic height and never creates a zero basis or absolute footer", () => {
    expect(style("capFillSpace")).toEqual({ flexGrow: 1 });
    expect(style("capFreeInput")).toEqual({ minHeight: 300 });
    for (const name of ["capBody", "capForm", "capSubmit"]) {
      const value = style(name);
      expect(value.flex).toBeUndefined();
      expect(value.flexBasis).toBeUndefined();
      expect(value.height).toBeUndefined();
      expect(value.position).not.toBe("absolute");
    }
  });

  test("URL stays a single-line input and multi-field forms retain their flow", () => {
    const link = body.slice(body.indexOf(') : mode === "link" ? ('), body.indexOf("<View style={styles.capTodoCol}>"));
    expect(link).toContain("style={styles.capForm}");
    expect(link).toContain("style={[styles.capFieldInput, styles.capMono]}");
    expect(link).not.toContain("multiline");
    expect(body).toContain("<View style={styles.capTodoCol}>");
    expect(body).toContain("<View style={styles.capForm}>\n              <CaptureField");
  });

  test("save, success action, and errors stay inside the keyboard-aware remembered scroll", () => {
    expect(source).toContain("PhoneScrollView as ScrollView");
    expect(body).toContain("<KeyboardAvoidingArea style={styles.capCoachRoot} iosHandledByScrollView>");
    expect(body).toContain('keyboardShouldPersistTaps="handled"');
    expect(body).toContain("automaticallyAdjustKeyboardInsets");
    expect(body).toContain("{...saveReveal.scrollProps}");
    expect(body).toContain("{...saveReveal.inputProps}");
    expect(body).toContain("style={styles.capSubmit} {...saveReveal.targetProps}");
    const scrollEnd = body.indexOf("</ScrollView>");
    for (const fragment of ["{saved ? (", 'label={f("openRecords")}', "{error ? ("]) {
      expect(body.indexOf(fragment)).toBeGreaterThan(body.indexOf("style={styles.capSubmit}"));
      expect(body.indexOf(fragment)).toBeLessThan(scrollEnd);
    }
  });
});
