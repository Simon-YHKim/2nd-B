// Z73 (Simon 2026-10-13 20:43, Q-261013-23): on the help screen, the question 「통화 녹음은 안전한가요?」
// had an answer about voice transcription (the app records no calls), and the three notice lines
// were the canon's fixed sample text, with no year, that could not be opened. Simon picked "the
// question becomes the voice-transcription one; notices become one row to the real notices screen".
//
// Read from the screen function's own returned tree with the TypeScript parser, so the same text
// left in a nested callback or an unused function does not count. Render tests are not available
// in this repo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8").split("\r\n").join("\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

function topFunction(parts: string[], name: string): ts.FunctionDeclaration {
  const file = ts.createSourceFile(parts.join("/"), read(...parts), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = file.statements.filter((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.body !== undefined &&
    hasModifier(statement, ts.SyntaxKind.ExportKeyword) && statement.name?.text === name);
  expect({ name, count: found.length }).toEqual({ name, count: 1 });
  return found[0];
}

/** Visit the function's own returned trees, not descending into nested functions. */
function walkReturned(fn: ts.FunctionDeclaration, visit: (node: ts.Node) => void): void {
  const returns: ts.Expression[] = [];
  const collect = (node: ts.Node): void => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) returns.push(node.expression);
    node.forEachChild(collect);
  };
  collect(fn);
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    visit(node);
    node.forEachChild(walk);
  };
  for (const expression of returns) walk(expression);
}

/** Elements in the returned tree whose onPress is `() => router.push("<route>")`, as tag + attribute texts. */
function rowsOpening(fn: ts.FunctionDeclaration, route: string): { tag: string; attributes: Record<string, string> }[] {
  const out: { tag: string; attributes: Record<string, string> }[] = [];
  walkReturned(fn, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return;
    const attributes: Record<string, string> = {};
    let opens = false;
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
      attributes[attribute.name.getText()] = attribute.initializer.getText();
      const value = ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
      if (attribute.name.getText() === "onPress" && value && ts.isArrowFunction(value) && ts.isCallExpression(value.body) &&
          value.body.expression.getText() === "router.push" && value.body.arguments.length === 1 &&
          ts.isStringLiteral(value.body.arguments[0]) && value.body.arguments[0].text === route) opens = true;
    }
    if (opens) out.push({ tag: node.tagName.getText(), attributes });
  });
  return out;
}

/** Every property access chain in the returned tree, e.g. "canonGaps.faqs.map". */
function accessesIn(fn: ts.FunctionDeclaration): string[] {
  const out: string[] = [];
  walkReturned(fn, (node) => {
    if (ts.isPropertyAccessExpression(node)) out.push(node.getText());
  });
  return out;
}

const SUPPORT = ["src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx"];

describe("the help screen's notices are one row to the notices screen", () => {
  test("exactly one row opens /notices, named with the notices screen's own title key", () => {
    const support = topFunction(SUPPORT, "DeepSpaceSupportDesignScreen");
    const rows = rowsOpening(support, "/notices");
    expect(rows).toEqual([{ tag: "Action", attributes: { label: '{t("ops:phone.apps.notifications")}', onPress: '{() => router.push("/notices")}' } }]);
    // The notices screen titles itself with the same key, so the row and the screen cannot drift.
    expect(read("src", "app", "notices.tsx")).toContain('title={t("phone.apps.notifications")}');
    expect(read("src", "app", "notices.tsx")).toContain('const { t, i18n } = useTranslation("ops");');
  });

  test("the screen no longer draws the canon's fixed notice lines", () => {
    const support = topFunction(SUPPORT, "DeepSpaceSupportDesignScreen");
    expect(accessesIn(support).filter((access) => access.startsWith("canonGaps.notices"))).toEqual([]);
    expect(accessesIn(support)).toContain("canonGaps.faqs.map");
  });

  test.each(LOCALES)("%s: the row's label is the notices screen's title, and the old notice copy is gone", (locale) => {
    const ops = JSON.parse(read("locales", locale, "ops.json")) as { phone: { apps: { notifications: string } } };
    expect(ops.phone.apps.notifications.length).toBeGreaterThan(0);
    const support = (JSON.parse(read("locales", locale, "deepspace.json")) as { support: Record<string, unknown> }).support;
    expect(support.notices).toBeUndefined();
    expect(support.noticesTitle).toBeUndefined();
  });
});

describe("the help screen asks about voice transcription, not call recording", () => {
  test("Korean paints the canon, whose question is the voice-transcription one, in both canon copies", () => {
    for (const copy of [["public", "proto"], ["design", "proto_rev2", "reference-app"]]) {
      const gaps = JSON.parse(read(...copy, "data", "screens", "gaps.json")) as { faqs: { q: string; a: string }[] };
      expect(gaps.faqs.map(({ q }) => q)).toEqual(["별 밝기는 무엇을 뜻하나요?", "유료가 더 똑똑한가요?", "음성 받아쓰기는 안전한가요?"]);
      expect(gaps.faqs[2].a).toContain("받아쓰기");
    }
  });

  const CALL: Record<(typeof LOCALES)[number], RegExp> = { en: /call/i, ko: /통화/, es: /llamada/i, pt: /chamada/i, id: /panggilan/i };
  test.each(LOCALES)("%s: the FAQ says transcription and never call recording", (locale) => {
    const faqs = (JSON.parse(read("locales", locale, "deepspace.json")) as {
      support: { faqs: Record<string, { q: string; a: string }> };
    }).support.faqs;
    expect(Object.keys(faqs)).toEqual(["brightness", "plan", "voice"]);
    for (const { q, a } of Object.values(faqs)) expect({ locale, call: CALL[locale].test(`${q} ${a}`) }).toEqual({ locale, call: false });
  });
});
