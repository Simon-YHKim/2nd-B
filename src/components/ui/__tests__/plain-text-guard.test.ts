// 줄바꿈 규칙이 앱 전체에 걸려 있는지 지킨다 (Simon QA 2026-09-30).
//
// 한국어는 띄어쓰기(어절) 단위로 줄을 바꾸고 한 단어의 음절 사이에서는 바꾸지
// 않는다. 웹은 +html.tsx 의 CSS 한 줄이, 네이티브는 components/ui/PlainText 가
// 그 규칙을 건다. 네이티브 쪽은 **PlainText 를 거친 Text 에만** 걸리므로,
// 어느 파일이 react-native 의 Text 를 직접 가져오는 순간 그 화면만 조용히
// 음절 사이에서 끊긴다. 수정 전에는 64개 파일이 그랬다.
//
// 렌더 테스트는 막혀 있으므로(RN 0.85 upstream) 소스를 읽어 본다.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const PLAIN_TEXT = "src/components/ui/PlainText.tsx";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__") out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

/** react-native 에서 값으로 가져온 Text 를 찾는다 (TextInput · TextStyle · type Text 는 제외). */
function directTextImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  if (!text.includes("react-native")) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.moduleSpecifier.text !== "react-native" || st.importClause?.isTypeOnly) continue;
    const nb = st.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) continue;
    for (const el of nb.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (imported === "Text" && !el.isTypeOnly) hits.push(`${rel(file)}: ${el.getText(sf)}`);
    }
  }
  return hits;
}

describe("가드가 진짜 소스를 읽는다", () => {
  test("src 아래 파일을 수백 개 읽는다", () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(300);
  });

  test("직접 import 를 실제로 잡는다 (PlainText 자신이 그 한 곳)", () => {
    expect(directTextImports(join(ROOT, PLAIN_TEXT))).toHaveLength(1);
  });
});

describe("네이티브 Text 는 전부 PlainText 를 거친다", () => {
  test("react-native 에서 Text 를 직접 가져오는 파일이 PlainText 말고는 없다", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => rel(f) !== PLAIN_TEXT)
      .flatMap(directTextImports);
    // 새 화면은 `import { PlainText as Text } from "@/components/ui/PlainText";`
    // 또는 `@/components/ui/Text` 의 <Text variant> 를 쓴다.
    expect(offenders).toEqual([]);
  });

  test("<Text variant> 도 PlainText 위에 서 있다", () => {
    const src = readFileSync(join(SRC, "components/ui/Text.tsx"), "utf8");
    expect(src).toMatch(/import \{ PlainText as RNText \} from "@\/components\/ui\/PlainText";/);
  });

  test("PlainText 는 선택 가능한 글을 그대로 두고, 음절 잇기는 네이티브에서만 한다", () => {
    const src = readFileSync(join(ROOT, PLAIN_TEXT), "utf8");
    expect(src).toContain("if (selectable || children == null) return createElement(RNText, props);");
    // 웹은 CSS keep-all 이 단어를 지키므로 가운뎃점 규칙만 돌린다.
    expect(src).toContain("mapStringChildren(children, web ? keepMiddleDotOffLineStart : keepAllKo)");
  });
});

describe("웹은 CSS 한 줄이 같은 규칙을 건다", () => {
  test("+html.tsx 가 <html> 에 word-break: keep-all 을 건다", () => {
    const src = readFileSync(join(SRC, "app/+html.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(src).toMatch(/\nhtml \{\n {2}word-break: keep-all;\n\}\n/);
  });
});
