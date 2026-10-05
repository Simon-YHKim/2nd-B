// 롤백 레버 EXPO_PUBLIC_UI 는 2026-10-05 에 없어졌다(Simon 결정 Q-261004-11 C).
//
// ## 무엇이었나
//
// `src/lib/ui-mode.ts` 가 `EXPO_PUBLIC_UI` 를 읽어 `UI_MODE`("deep-space" | "legacy")를
// 만들고, 라우트 서른한 곳이 `if (isDeepSpaceUI()) return <A />; return <Legacy />;` 로
// 두 화면을 함께 들고 있었다. 배송 경로(웹 · 8081 · APK · EAS)는 전부 deep-space 를 박고
// 있었고 legacy 를 켜는 배포는 하나도 없었다(1단계 실측). 그래서 legacy 반쪽은 어떤
// 빌드도 그리지 않는 코드였고, 법무 인용과 검사 핀이 그 안에 박혀 영원히 초록인 일이
// 거듭 생겼다(legal-citations-not-in-dead-renderers · guard-pins-not-in-dead-renderers,
// 둘 다 이 날 은퇴해 E:/Legacy/2ndB 로 갔다).
//
// ## 이 파일이 지키는 것
//
// 레버가 **조용히 돌아오지 않는다.** 되살리기(Q-261004-12)는 기능을 배송 화면으로 옮기는
// 일이지 스킨 분기를 되살리는 일이 아니다. 되돌리기는 git revert 뿐이고, 그것도 이
// 파일을 함께 되돌려야 통과하게 해서 결정 없이는 일어나지 않게 한다.
//
//   1. src/lib/ui-mode.ts 가 없다
//   2. 코드(주석·문자열 산문이 아니라)에 레버 식별자 · 모듈 경로 · 환경 변수 키가 0건
//   3. 배포 설정(워크플로 · eas.json · app.json · app.config.*)에 그 키가 0건
//
// ⚠ 주석은 읽지 않는다. 레버가 있던 자리를 설명하는 주석은 수십 곳에 있고 있어야 한다
// (되살리는 사람이 이유를 읽는다). 산문을 증거로 읽는 검사는 설명을 적는 것만으로
// 실패하거나, 반대로 산문 덕에 통과한다 — 이 저장소가 여러 번 밟은 함정이다.
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const ROOT = process.cwd();

/** 레버의 이름들. 이 이름이 **코드 식별자**로 나오면 레버가 돌아온 것이다. */
const LEVER_IDENTIFIERS = new Set([
  "isDeepSpaceUI",
  "isLegacyUI",
  "UI_MODE",
  "UiMode",
  "isCharacterFallback",
  "CHARACTER_MODE",
  "CharacterMode",
]);
/** 레버의 환경 변수 키. 이름을 이어 붙여 적는다 — 이 파일 자신이 걸리지 않게. */
const LEVER_ENV_KEYS = new Set(["EXPO_PUBLIC_" + "UI", "EXPO_PUBLIC_" + "CHARACTER"]);
/**
 * 레버 모듈 경로: `@/lib/ui-mode` · `../ui-mode` · `./lib/ui-mode` … (모듈 지정자 모양만.
 * 파일 이름 조각 "ui-mode.ts" 는 아래 '파일이 없다' 검사처럼 정당하게 쓰인다.)
 */
const LEVER_MODULE = /^(?:@\/|\.{1,2}\/)(?:.*\/)?ui-mode(?:\.tsx?)?$/;

/** 한 파일에서 레버가 **코드로** 나오는 자리. 주석과 산문 문자열은 보지 않는다. */
function leverReferences(fileName: string, source: string): string[] {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const at = (node: ts.Node) => `${fileName}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
  const visit = (node: ts.Node): void => {
    // 식별자(선언 · 참조 · import 지정자 · 객체 키 `EXPO_PUBLIC_UI: "…"` · process.env.X)
    if (ts.isIdentifier(node) && (LEVER_IDENTIFIERS.has(node.text) || LEVER_ENV_KEYS.has(node.text))) {
      found.push(`${at(node)} ${node.text}`);
    }
    // 모듈 경로 문자열: import · export from · require · jest.mock · 동적 import 의 인자
    if (ts.isStringLiteralLike(node) && LEVER_MODULE.test(node.text)) {
      found.push(`${at(node)} "${node.text}"`);
    }
    // 문자열 키: process.env["EXPO_PUBLIC_UI"] · { "EXPO_PUBLIC_UI": … }
    if (ts.isStringLiteralLike(node) && LEVER_ENV_KEYS.has(node.text)) {
      const parent = node.parent;
      const isKey =
        (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node);
      if (isKey) found.push(`${at(node)} ["${node.text}"]`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** 배포 설정에서 그 키를 **키로** 쓰는 줄. yml 의 `KEY: value` · json 의 `"KEY": …`. */
function configKeyLines(fileName: string, text: string): string[] {
  const out: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    for (const key of LEVER_ENV_KEYS) {
      if (new RegExp(`(^|[\\s{,])"?${key}"?\\s*:`).test(line)) out.push(`${fileName}:${index + 1} ${key}`);
    }
  });
  return out;
}

function codeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return;
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(rel);
      } else if (/\.(?:tsx?|mjs|cjs|js)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  // legacy/ 는 일부러 안 읽는다 - 되살리기 원본은 레버 시절 코드 그대로 보관돼 있고
  // 빌드 · 검사 밖이다(legacy-archive-integrity.test.ts 가 바이트로 지킨다).
  walk("src");
  walk("scripts");
  walk("design/pixel_clay_260825/tools");
  for (const rootFile of ["app.config.js", "app.config.ts", "metro.config.js", "babel.config.js", "jest.config.js"]) {
    if (fs.existsSync(path.join(ROOT, rootFile))) out.push(rootFile);
  }
  return out.sort();
}

function configFiles(): string[] {
  const workflows = fs
    .readdirSync(path.join(ROOT, ".github", "workflows"))
    .filter(name => /\.ya?ml$/.test(name))
    .map(name => `.github/workflows/${name}`);
  return [...workflows, "eas.json", "app.json"].filter(rel => fs.existsSync(path.join(ROOT, rel))).sort();
}

describe("롤백 레버 EXPO_PUBLIC_UI 는 없다 (Q-261004-11 C)", () => {
  const files = codeFiles();
  const configs = configFiles();

  test("레버 모듈 파일이 없다", () => {
    expect(fs.existsSync(path.join(ROOT, "src", "lib", "ui-mode.ts"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "src", "lib", "ui-mode.tsx"))).toBe(false);
  });

  test("스캐너가 실제로 읽었다 - 0건 통과를 막는다", () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(files.some(f => f.startsWith("scripts/"))).toBe(true);
    expect(files.some(f => f.startsWith("design/pixel_clay_260825/tools/"))).toBe(true);
    expect(configs).toEqual(expect.arrayContaining([".github/workflows/android-release.yml", "eas.json"]));
  });

  test("판정기 대조군 - 코드는 잡고 주석 · 산문 문자열은 안 잡는다", () => {
    const lever = "isDeepSpace" + "UI";
    const env = "EXPO_PUBLIC_" + "UI";
    const mod = "@/lib/" + "ui-mode";
    // 잡아야 하는 것
    expect(leverReferences("a.tsx", `import { ${lever} } from "${mod}";`)).toHaveLength(2);
    expect(leverReferences("b.ts", `const on = process.env.${env} === "legacy";`)).toEqual([`b.ts:1 ${env}`]);
    expect(leverReferences("c.ts", `jest.mock("${mod}", () => ({}));`)).toEqual([`c.ts:1 "${mod}"`]);
    expect(leverReferences("d.js", `spawn("npx", [], { env: { ${env}: "deep-space" } });`)).toEqual([`d.js:1 ${env}`]);
    expect(leverReferences("e.ts", `const v = process.env["${env}"];`)).toEqual([`e.ts:1 ["${env}"]`]);
    expect(leverReferences("f.ts", `const m = require("../${"ui-mode"}");`)).toEqual([`f.ts:1 "../ui-mode"`]);
    // 잡지 말아야 하는 것: 설명하는 주석과 산문 문자열
    expect(leverReferences("g.ts", `// the ${lever}() lever left on 2026-10-05\nconst x = 1;`)).toEqual([]);
    expect(leverReferences("h.ts", `const note = "the ${env}=legacy track is gone";`)).toEqual([]);
    expect(configKeyLines("w.yml", `    env:\n      ${env}: "deep-space"\n`)).toEqual([`w.yml:2 ${env}`]);
    expect(configKeyLines("e.json", `{ "${env}": "legacy" }`)).toEqual([`e.json:1 ${env}`]);
    expect(configKeyLines("w.yml", `  # ${env}: removed 2026-10-05\n`)).toEqual([]);
  });

  test("코드에 레버가 0건이다", () => {
    const hits = files.flatMap(f => leverReferences(f, fs.readFileSync(path.join(ROOT, f), "utf8")));
    // 실패하면: 레버를 다시 들이는 것은 Q-261004-11 을 뒤집는 결정이다. 되살리려던 것이
    // 기능이면 배송 화면에 옮겨 심는다(Q-261004-12). 분기는 되살리지 않는다.
    expect(hits).toEqual([]);
  });

  test("배포 설정에 레버 키가 0건이다", () => {
    const hits = configs.flatMap(f => configKeyLines(f, fs.readFileSync(path.join(ROOT, f), "utf8")));
    // 워크플로 env 줄이 돌아오면 app-parity 설정 digest 와 웹 public_config_sha256 도
    // 같이 바뀐다 - 숫자만 보고 지나치지 않게 여기서 먼저 막는다.
    expect(hits).toEqual([]);
  });
});
