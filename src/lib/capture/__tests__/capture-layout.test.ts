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
  return runInNewContext(`(${result})`, { m3: { spacing: { s2: 4, s6: 12, s8: 16 } } }) as Record<string, unknown>;
}

function elementWith(attribute: string, value: string): ts.JsxElement {
  let result: ts.JsxElement | undefined;
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(
      (prop) => ts.isJsxAttribute(prop) && prop.name.getText(ast) === attribute && prop.initializer?.getText(ast) === value,
    )) result = node;
    ts.forEachChild(node, visit);
  }
  visit(capture!);
  if (!result) throw new Error(`Missing element: ${attribute}=${value}`);
  return result;
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
    expect(memo).toContain("style={[styles.capForm, styles.capFillSpace]}");
    expect(memo).toMatch(/<View ref=\{inputCoachTargetRef\} collapsable=\{false\} style=\{styles\.capFillSpace\}>/);
    expect(memo).toContain("style={[styles.capFieldInput, styles.capFreeInput, styles.capFillSpace]}");
    expect(memo).toMatch(/<TextInput[\s\S]*?multiline[\s\S]*?textAlignVertical="top"/);
    expect(memo.indexOf("{attachStrip}")).toBeGreaterThan(memo.indexOf("</View>"));
  });

  test("growth keeps intrinsic height and never creates a zero basis or absolute footer", () => {
    expect(style("capFillSpace")).toEqual({ flexGrow: 1 });
    expect(style("capFreeInput")).toEqual({ minHeight: 300 });
    for (const name of ["capBody", "capForm", "capSubmit", "capFooter"]) {
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

  test("all formats share one unconditional footer beside the scroll in the keyboard area", () => {
    const scroll = elementWith("ref", "{scrollRef}");
    const footer = elementWith("style", "{styles.capFooter}");
    const save = elementWith("ref", "{saveCoachTargetRef}");
    // AST parents catch a footer put back inside scrolling/animated/conditional content.
    expect(save.parent === footer).toBe(true);
    expect(footer.parent === scroll.parent).toBe(true);
    expect(ts.isJsxElement(footer.parent)).toBe(true);
    expect((footer.parent as ts.JsxElement).openingElement.getText(ast)).toBe(
      "<KeyboardAvoidingArea style={styles.capCoachRoot} iosKeyboardVerticalOffset={iosKeyboardOffset}>",
    );
    expect(footer.pos).toBeGreaterThan(scroll.end);
    expect(body.match(/ref=\{saveCoachTargetRef\}/g)).toHaveLength(1);
    expect(footer.getText(ast)).toContain("onPress={savePiece}");
    expect(footer.getText(ast)).toContain("disabled={!canSave}");
  });

  test.each([0, 47, 123])("iOS includes the actual keyboard host screen origin (%s)", (pageY) => {
    const setIosKeyboardOffset = jest.fn();
    const measureInWindow = jest.fn((callback: (x: number, y: number) => void) => callback(12, pageY));
    const measure = runInNewContext(initializer("measureKeyboardHost"), {
      Platform: { OS: "ios" }, keyboardHostRef: { current: { measureInWindow } }, setIosKeyboardOffset,
    }) as () => void;
    measure();
    expect(measureInWindow).toHaveBeenCalledTimes(1);
    expect(setIosKeyboardOffset).toHaveBeenCalledWith(pageY);
  });

  test.each(["android", "web"])("%s keeps its existing keyboard policy without measuring an iOS offset", (OS) => {
    const measureInWindow = jest.fn();
    const measure = runInNewContext(initializer("measureKeyboardHost"), {
      Platform: { OS }, keyboardHostRef: { current: { measureInWindow } },
    }) as () => void;
    measure();
    expect(measureInWindow).not.toHaveBeenCalled();
  });

  test("the keyboard area has a measured, non-collapsable parent with no local top offset", () => {
    const host = elementWith("ref", "{keyboardHostRef}");
    const scroll = elementWith("ref", "{scrollRef}");
    expect(scroll.parent.parent === host).toBe(true);
    expect(host.openingElement.getText(ast)).toContain("collapsable={false}");
    expect(host.openingElement.getText(ast)).toContain("onLayout={measureKeyboardHost}");
    expect(style("capCoachRoot")).toEqual({ flex: 1, minHeight: 0 });
  });

  test("the viewport can shrink while the footer keeps its intrinsic height and bottom spacing", () => {
    expect(style("capCoachRoot")).toMatchObject({ flex: 1, minHeight: 0 });
    expect(style("capScroll")).toMatchObject({ flex: 1, minHeight: 0 });
    expect(style("capFooter")).toEqual({ flexShrink: 0, paddingHorizontal: 12, paddingBottom: 20 });
    expect(style("capBody").paddingBottom).toBe(0);
  });

  test("input and auxiliary actions retain the keyboard-aware remembered scroll", () => {
    expect(source).toContain("PhoneScrollView as ScrollView");
    const scroll = elementWith("ref", "{scrollRef}").getText(ast);
    expect(body).toContain('keyboardShouldPersistTaps="handled"');
    expect(scroll.match(/\{attachStrip\}/g)).toHaveLength(2);
    expect(scroll).toContain('label={f("todoAdd")}');
    expect(scroll).toContain('returnKeyType="done"');
    expect(scroll).not.toContain("saveCoachTargetRef");
  });

  test("the success action and error remain after save, with the original coach anchors", () => {
    const footer = elementWith("style", "{styles.capFooter}").getText(ast);
    for (const fragment of ["{saved ? (", 'label={f("openRecords")}', "{error ? ("]) {
      expect(footer.indexOf(fragment)).toBeGreaterThan(footer.indexOf("style={styles.capSubmit}"));
    }
    expect(footer).toContain('onPress={() => router.push("/records")}');
    expect(elementWith("ref", "{saveCoachTargetRef}").openingElement.getText(ast)).toContain("collapsable={false}");
    expect(body).toContain("targetRef={coachTargetRef}");
    expect(body).toContain('coachStep === "format"\n      ? memoCoachTargetRef');
    expect(body).toContain('coachStep === "input"\n        ? inputCoachTargetRef\n        : saveCoachTargetRef');
    expect(body).toContain("onAction={coachStep === \"done\" ? () => router.replace(\"/\") : showSaveCoach}");
  });
});
