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

/** `const <binding> = <callee>()` written directly in the function body, as binding names. */
function directBindings(fn: ts.FunctionDeclaration, callee: string): string[] {
  const out: string[] = [];
  for (const statement of fn.body?.statements ?? []) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === callee) {
        out.push(declaration.name.getText());
      }
    }
  }
  return out;
}

/** The module a top-level named import comes from. */
function importedFrom(parts: string[], name: string): string[] {
  const file = ts.createSourceFile(parts.join("/"), read(...parts), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings) && bindings.elements.some((e) => e.name.text === name && !e.propertyName)) {
      out.push(statement.moduleSpecifier.text);
    }
  }
  return out;
}

describe("the help screen's notices are one row to the notices screen", () => {
  test("exactly one row opens /notices, named with the notices screen's own title key", () => {
    const support = topFunction(SUPPORT, "DeepSpaceSupportDesignScreen");
    const rows = rowsOpening(support, "/notices");
    expect(rows).toEqual([{ tag: "Action", attributes: { label: '{t("ops:phone.apps.notifications")}', onPress: '{() => router.push("/notices")}' } }]);
    // The notices screen titles itself with the same key, so the row and the screen cannot drift.
    expect(read("src", "app", "notices.tsx")).toContain('title={t("phone.apps.notifications")}');
    expect(read("src", "app", "notices.tsx")).toContain('const { t, i18n } = useTranslation("ops");');
  });

  // Inside the dashboard phone the row must open the phone's own notices screen, so the `router`
  // the row calls is the phone-aware one bound in the screen body, not expo-router's global router.
  test("the row's router is the phone-aware one, bound directly in the screen body", () => {
    const support = topFunction(SUPPORT, "DeepSpaceSupportDesignScreen");
    expect(directBindings(support, "useAppRouter")).toEqual(["router"]);
    expect(importedFrom(SUPPORT, "useAppRouter")).toEqual(["@/lib/nav/phone-embed"]);
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

  // Word for word: the question, and the answer's facts (encrypted connection, the AI server does the
  // transcription, the original audio is deleted from the device right after, only the text and
  // signals are kept, encrypted). The Korean answer is the one the screen always had.
  const VOICE_FAQ: Record<(typeof LOCALES)[number], { q: string; a: string }> = {
    ko: {
      q: "음성 받아쓰기는 안전한가요?",
      a: "받아쓰기는 암호화된 연결로 AI 서버를 거치고, 원본 음성은 받아쓰기 직후 기기에서 삭제합니다. 텍스트와 신호만 암호화해 남깁니다.",
    },
    en: {
      q: "Is voice transcription safe?",
      a: "Voice is transcribed on the AI server over an encrypted connection, and the original audio is deleted from your device right after. Only the text and signals are kept, encrypted.",
    },
    es: {
      q: "¿Es segura la transcripción de voz?",
      a: "La voz se transcribe en el servidor de IA mediante una conexión cifrada, y el audio original se borra de tu dispositivo justo después. Solo se guardan, cifrados, el texto y las señales.",
    },
    pt: {
      q: "A transcrição de voz é segura?",
      a: "A voz é transcrita no servidor de IA por uma conexão criptografada, e o áudio original é apagado do seu dispositivo logo depois. Só o texto e os sinais ficam guardados, criptografados.",
    },
    id: {
      q: "Apakah transkripsi suara aman?",
      a: "Suara ditranskripsikan di server AI melalui koneksi terenkripsi, lalu audio aslinya langsung dihapus dari perangkatmu. Hanya teks dan sinyalnya yang disimpan dalam bentuk terenkripsi.",
    },
  };
  const CALL: Record<(typeof LOCALES)[number], RegExp> = { en: /\bcalls?\b/i, ko: /통화/, es: /llamada/i, pt: /chamada/i, id: /panggilan/i };
  test.each(LOCALES)("%s: the FAQ asks about transcription, word for word, and never about call recording", (locale) => {
    const faqs = (JSON.parse(read("locales", locale, "deepspace.json")) as {
      support: { faqs: Record<string, { q: string; a: string }> };
    }).support.faqs;
    expect(Object.keys(faqs)).toEqual(["brightness", "plan", "voice"]);
    expect(faqs.voice).toEqual(VOICE_FAQ[locale]);
    for (const { q, a } of Object.values(faqs)) expect({ locale, call: CALL[locale].test(`${q} ${a}`) }).toEqual({ locale, call: false });
  });
});
