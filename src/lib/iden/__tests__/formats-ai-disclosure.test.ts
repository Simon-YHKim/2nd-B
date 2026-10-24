import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parse } from "yaml";
import { buildIdenExport, withIdenAiCopyTail } from "../iden-export";
import { SAMPLE_IDEN } from "../sample";
import type { IdenDoc } from "../types";
import { visibleIdenDocForExport } from "../load-persisted-iden";
import { composeWikiExport } from "../../wiki/export";
import { northstarAiTag } from "../../persona/northstar-provenance";

const ROOT = resolve(__dirname, "../../../..");
const source = ts.createSourceFile("formats.tsx", readFileSync(resolve(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler = "";
function visit(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "runExport") handler = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
const code = ts.transpileModule(`${handler}\nrunExport;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

describe.each(["ko", "en", "es", "pt", "id"])("persona export disclosure (%s)", (language) => {
  const tail = (JSON.parse(readFileSync(resolve(ROOT, `locales/${language}/secondb.json`), "utf8")) as { aiCopyTail: string }).aiCopyTail;
  test.each(["iden", "html", "json"])("%s leaves with the model summary labelled and its format intact", async (format) => {
    const doc = structuredClone(SAMPLE_IDEN);
    const original = structuredClone(doc);
    let output: { text: string; name: string } | null = null;
    const error = jest.fn();
    const run = runInNewContext(code, {
      format, userId: "owner", isMinor: false, exporting: false, locale: language === "ko" ? "ko" : "en",
      setExporting: jest.fn(), setNote: error, setResult: (value: typeof output) => { output = value; },
      t: (key: string) => { expect(key).toBe("secondb:aiCopyTail"); return tail; },
      exportIden: async (_owner: string, opts: Parameters<typeof buildIdenExport>[1]) => buildIdenExport(doc, opts),
      buildIdenDoc: async () => doc, withIdenAiCopyTail,
    }) as () => Promise<void>;
    await run();
    expect(error).not.toHaveBeenCalledWith("error");
    const result = output as unknown as { text: string; name: string };
    expect(result.text).toContain(tail);
    if (format === "json") expect((JSON.parse(result.text) as IdenDoc).summary?.text.endsWith(tail)).toBe(true);
    if (format === "iden") {
      const machine = parse(result.text.match(/^---\n([\s\S]*?)\n---\n/)![1]) as IdenDoc;
      expect(machine.summary?.text.endsWith(tail)).toBe(true);
      expect(machine.summary?.source.kind).toBe("ai_summary");
    }
    if (format === "html") expect(result.text.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toEqual(original);
  });
});

test.each([undefined, { text: " ", source: { kind: "ai_summary" as const } }, { text: "My words", source: { kind: "self_report" as const } }])("non-model or absent summaries get no added label", (summary) => {
  const doc = { ...SAMPLE_IDEN, summary };
  expect(withIdenAiCopyTail(doc, "TAIL")).toBe(doc);
  const out = buildIdenExport(doc, { aiCopyTail: "TAIL" });
  for (const text of [out.iden, out.html, out.json]) expect(text).not.toContain("TAIL");
});

test("HTML escapes the disclosure with the model summary", () => {
  expect(buildIdenExport(SAMPLE_IDEN, { aiCopyTail: "<script>bad</script>" }).html).toContain("&lt;script&gt;bad&lt;/script&gt;");
});

test("Formats Markdown labels only fingerprint-matched northstar rows", async () => {
  const body = "I keep learning.";
  const row = { kind: "note", topic: null, body, created_at: "2026-10-19", tags: [], system_tags: [northstarAiTag(body)] };
  let output: { text: string } | null = null;
  const error = jest.fn();
  const run = runInNewContext(code, {
    format: "markdown", userId: "owner", isMinor: false, exporting: false, locale: "en", includeRecords: true,
    setExporting: jest.fn(), setNote: error, setResult: (value: typeof output) => { output = value; },
    t: () => "AI TAIL", exportUserWiki: async (_owner: string, opts: Parameters<typeof composeWikiExport>[2]) =>
      composeWikiExport([], [], opts, [row, { ...row, body: "My edited line." }, { ...row, system_tags: [] }]),
  }) as () => Promise<void>;
  await run();
  expect(error).not.toHaveBeenCalledWith("error");
  expect((output as unknown as { text: string }).text.match(/AI TAIL/g)).toHaveLength(1);
});

const idenSource = ts.createSourceFile("iden.tsx", readFileSync(resolve(ROOT, "src/app/iden.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function idenAction(name: string): string {
  let handler = "";
  function find(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(idenSource) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      handler = node.initializer.arguments[0].getText(idenSource);
    }
    ts.forEachChild(node, find);
  }
  find(idenSource);
  if (!handler) throw new Error(`Missing ${name}`);
  return ts.transpileModule(`(${handler});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

describe.each(["ko", "en", "es", "pt", "id"])("/iden exports in %s", (language) => {
  const tail = (JSON.parse(readFileSync(resolve(ROOT, `locales/${language}/secondb.json`), "utf8")) as { aiCopyTail: string }).aiCopyTail;
  test.each(["handleSend", "handleCopyJson", "handlePreview"])("%s carries the northstar disclosure, keeps hidden summary out, and honors row exclusion", async (name) => {
    for (const state of ["marked", "unmarked", "excluded"]) {
      const doc = { ...SAMPLE_IDEN, oneLinerAiSuggested: state !== "unmarked" };
      const delivered = jest.fn();
      const warnings = jest.fn();
      const run = runInNewContext(idenAction(name), {
        hasData: true, locale: language === "ko" ? "ko" : "en", buildIdenExport,
        currentExportDoc: () => visibleIdenDocForExport(doc, state === "excluded" ? ["northstar"] : []),
        t: (key: string) => key === "secondb:aiCopyTail" ? tail : key,
        Share: { share: ({ message }: { message: string }) => delivered(message) },
        Clipboard: { setStringAsync: delivered }, Platform: { OS: "web" }, openSheetInNewTab: delivered,
        setNotice: jest.fn(), console: { warn: warnings },
      }) as () => Promise<void>;
      await run();
      expect(warnings).not.toHaveBeenCalled();
      expect(delivered).toHaveBeenCalledTimes(1);
      const text = delivered.mock.calls[0][0] as string;
      expect(text.includes(tail)).toBe(state === "marked");
      expect(text).not.toContain(SAMPLE_IDEN.summary!.text);
      if (name === "handleCopyJson") expect(JSON.parse(text).oneLiner.includes(tail)).toBe(state === "marked");
    }
  });
});
