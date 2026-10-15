import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../..");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const retired = /세컨비|세컨B|\bSecond[ -]?B\b/;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(strings);
}

test.each(LOCALES)("%s ships HustleK copy while retaining the secondb namespace and persona ids", locale => {
  const dir = path.join(ROOT, "locales", locale);
  for (const file of readdirSync(dir).filter(name => name.endsWith(".json"))) {
    const copy = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    expect(strings(copy).filter(value => retired.test(value))).toEqual([]);
  }
  const chat = JSON.parse(readFileSync(path.join(dir, "secondb.json"), "utf8"));
  expect(chat.title).toBe(locale === "ko" ? "허슬케이" : "HustleK");
  expect(chat.rev2.secondb.name).toBe(locale === "ko" ? "허슬케이" : "HustleK");
  expect(chat.rev2.secondb.lensName).toBe(locale === "ko" ? "허슬케이" : "HustleK");
  expect(chat.rev2.secondb.tag).toBe("HustleK");
  expect(Object.keys(chat.rev2)).toEqual(expect.arrayContaining(["secondb", "meta", "twi"]));
  const capture = JSON.parse(readFileSync(path.join(dir, "capture.json"), "utf8"));
  expect(capture.textFormat.general).toBe({ en: "Standard", ko: "일반", es: "General", pt: "Padrão", id: "Umum" }[locale]);
});

test("runtime copy and generated-output prompts do not restore the retired character name", () => {
  const violations: string[] = [];
  function visitDirectory(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { visitDirectory(file); continue; }
      if (file.endsWith(".json")) {
        for (const value of strings(JSON.parse(readFileSync(file, "utf8")))) {
          if (retired.test(value)) violations.push(path.relative(ROOT, file));
        }
        continue;
      }
      if (!/\.[jt]sx?$/.test(file)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
          // Versioned legal history remains verbatim. Current legal paragraphs
          // are checked; module paths and existing routes are not display copy.
          const value = node.text.split(/\r?\n/).filter(line => !/^\| \d{4}-\d{2}-\d{2} \|/.test(line)).join("\n");
          if (!/^(?:@\/|\.\.?\/|\/|https?:\/\/)/.test(value) && retired.test(value)) {
            violations.push(`${path.relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
          }
        }
        node.forEachChild(visit);
      }
      visit(source);
    }
  }
  visitDirectory(path.join(ROOT, "src"));
  visitDirectory(path.join(ROOT, "public/proto"));
  expect(violations).toEqual([]);
  const conversation = readFileSync(path.join(ROOT, "src/lib/chat/conversation.ts"), "utf8");
  expect(conversation).toContain("You are HustleK,");
  expect(conversation).toContain("당신은 허슬케이,");
  expect(conversation).toContain('"User" : "HustleK"');
  expect(conversation).toContain('purpose: "secondb_chat"');
});
