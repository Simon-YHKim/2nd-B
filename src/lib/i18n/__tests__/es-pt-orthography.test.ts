// R2B-06 (2026-10-05): Spanish and Portuguese copy kept in code must keep its
// accents.
//
// Several screens keep an es/pt copy table in code instead of locales/ (career
// drill-down bands, the domain-star lenses, the reasoning notices on home, the
// audit/strengths/values surveys, the archived flow map). Those tables were
// written in ASCII: "Por que voce fez", "personas de 20 a 39 anos" (in Spanish
// "anos" is not "years"), "Ainda nao ha registros de saude". check:i18n and
// check:lexicon only read locales/*.json, so nothing looked at them, and the
// career drill-down even saved the ASCII labels into users' records.
//
// This scans every string literal under src/ (TypeScript AST, so comments and
// identifiers are ignored) for forms that are ASCII-ized es/pt and are not
// words in en, es, pt or id. It is deliberately narrow: ambiguous forms
// ("anos", "mas", "aqui", "esta", "proxima" as in Proxima Centauri) are left
// out, so a hit is always a real missing accent. The long-term home for these
// tables is locales/, under C7 parity.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const SRC = join(__dirname, "..", "..", "..");

// Endings that always carry a diacritic: pt -ção/-ções/-sões, es -ción.
const ENDINGS = "[a-z]+(?:cao|coes|soes|cion)";
// Single forms that exist only as ASCII-ized es/pt.
const WORDS = [
  "voce", // você
  "nao", // não
  "apos", // após
  "saude", // saúde
  "possivel", // possível
  "estao", // estão
  "serao", // serão
  "padrao", // padrão
  "padroes", // padrões
  "lideranca", // liderança
  "lembranca", // lembrança
  "automatico", // automático (es + pt)
  "rapido", // rápido (es + pt)
  "despues", // después
  "tambien", // también
  "recibio", // recibió
  "cercania", // cercanía
  "diseno", // diseño
  "anios", // años
  "puntua", // puntúa
  "angulo", // ángulo (es + pt)
];
// \p{L}/\p{M} guards instead of \b: \b treats "ó" as a boundary, so
// "funcionó" would read as "funcion" + end of word.
const ASCII_IZED = new RegExp(
  `(?<![\\p{L}\\p{M}])(?:${ENDINGS}|${WORDS.join("|")})(?![\\p{L}\\p{M}])`,
  "giu",
);

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function stringTexts(file: string): { line: number; text: string }[] {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      found.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function offendersIn(files: string[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    for (const { line, text } of stringTexts(file)) {
      for (const match of text.matchAll(ASCII_IZED)) {
        offenders.push(`${relative(SRC, file).split(sep).join("/")}:${line} ${match[0]}`);
      }
    }
  }
  return offenders;
}

describe("es/pt copy kept in code keeps its accents", () => {
  it("the matcher flags ASCII-ized forms and leaves the accented ones alone", () => {
    const hits = (text: string) => [...text.matchAll(ASCII_IZED)].map((m) => m[0]);
    expect(hits("Por que voce fez")).toEqual(["voce"]);
    expect(hits("Ainda nao ha registros de saude")).toEqual(["nao", "saude"]);
    expect(hits("Donde funciono la solucion")).toEqual(["solucion"]);
    expect(hits("Educacao · Divulgacao · execucoes")).toEqual(["Educacao", "Divulgacao", "execucoes"]);
    expect(hits("Por que você fez · Ainda não há registros de saúde")).toEqual([]);
    expect(hits("Dónde funcionó la solución · Educação · execuções")).toEqual([]);
    // Ambiguous on purpose: valid words in some shipped language.
    expect(hits("anos mas aqui esta Proxima Centauri sintesis")).toEqual([]);
  });

  it("src/ has no ASCII-ized es/pt string literal", () => {
    expect(offendersIn(walk(SRC, []))).toEqual([]);
  });
});
