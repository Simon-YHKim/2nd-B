// 은퇴시킨 화면들은 아무도 안 보는 곳에 있다 — 그래서 지켜야 한다.
//
// `legacy/` 는 tsconfig · jest · eslint · metro 에서 전부 제외돼 있다. 그게 은퇴의
// 요점이다(빌드 비용을 없앤다). 부작용은 **그 파일들이 어떤 검사도 안 지나간다**는
// 것이고, 2026-09-08 에 세어보니 아카이브 16개를 지키는 검사가 **하나도 없었다**:
//
//   · INDEX.md 에 적혀 있는지    아무도 안 봄
//   · 본문이 은퇴 당시 그대로인지  아무도 안 봄
//   · src/ 가 다시 가져다 쓰는지   아무도 안 봄
//
// 은퇴가 "지운 게 아니라 옮긴 것"이려면 **옮긴 것이 그대로 있어야** 한다. 조용히
// 편집된 아카이브는 지워진 것보다 나쁘다 — 있는 줄 알고 읽었는데 다른 것이 적혀 있다.
//
// ⚠ digest 가 증명하는 것과 아닌 것을 갈라 둔다. 이 표는 **이 검사가 생긴 뒤로
// 아무도 안 고쳤다**를 증명한다. 은퇴 당시 원본과 같다는 것은 증명하지 않는다 —
// 그건 각 은퇴 PR 이 그때 확인한 것이고(여러 건은 바이트 핀이 따라왔다), 여기서
// 소급해 다시 세지는 않는다. 두 주장을 섞으면 없는 보장을 있다고 말하게 된다.
//
// ## 2026-10-05: 이 폴더의 뜻이 바뀌었다
//
// 롤백 레버 EXPO_PUBLIC_UI 가 없어졌다(Simon 결정 Q-261004-11 C). 그 전의 legacy/screens/
// 는 "레버를 켜면 다시 쓸 수 있는 반쪽"의 보관소였다. 지금은 **되살리기 원본**만 있다
// (Q-261004-12 A · 상충 해소 ①): 되살릴 기능을 배송 화면에 옮기는 동안 읽을 원본이고,
// 되살리기가 끝난 묶음부터 E:/Legacy/2ndB 로 나간다. 되살리기 원본이 아닌 보관본 16개는
// 같은 날 E:/Legacy/2ndB 로 나갔다(MANIFEST batch qa261004-lever). 그래서
//
//   · 아카이브 수는 하한(>= 15)이 아니라 **정확한 명단**이다. 하나가 생기거나 사라지면
//     그것은 되살리기가 끝났거나(명단에서 지운다) 누가 새 반쪽을 들였다는 뜻이다.
//   · 이 폴더를 읽어도 되는 검사는 **이 파일 하나**다. 다른 검사가 보관본에 핀을 박으면
//     그 핀은 어떤 빌드도 안 그리는 코드를 지키며 영원히 초록이다 — 은퇴한
//     guard-pins-not-in-dead-renderers 래칫이 세던 부류다. 그 성질을 아래
//     "검사가 보관본을 읽지 않는다" 가 0건 무관용으로 잇는다.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const ROOT = process.cwd();
const DIR = "legacy/screens";
const SELF = "src/lib/legal/__tests__/legacy-archive-integrity.test.ts";

/**
 * 되살리기 원본 명단과 sha256(LF 정규화). 정확히 이 일곱이다.
 *
 * import.tsx 는 2026-09-08 보관본 그대로다(digest 불변). 나머지 여섯은 2026-10-05 레버
 * 제거 때 e0b274d0 의 라우트 파일(core-brain 은 발췌)을 머리말과 함께 들였다.
 * 되살리기가 끝나면 그 줄을 지우고 INDEX.md 표 줄도 지운다(파일은 E:/Legacy 로).
 */
const DIGESTS: Readonly<Record<string, string>> = {
  "core-brain.tsx": "fc27584580c0c448ac50b44a448ab8fb1928ce5c47c8f6df856bf62670702c2c",
  "data.tsx": "2615c214e75fa5431a0aa17499681831576d287739fb11eb6b6ec06460074b0f",
  "import.tsx": "15cb1bf5bffebbc580d962414b1d8d9d444ba829182b8d74a52442ba306b99ae",
  "inbox.tsx": "4e09006f918e9552c4252b14fac659ed2b827c431657787926a985b58ca5679e",
  "privacy.tsx": "5e1c887ccf6cd08995dcf3573f7076e8f3493eea347616d7cc1c242e231e8e18",
  "record-detail.tsx": "579ec72216881047dbcc5c469400ff571298d1828d3879c5e40fc384aa2e2098",
  "wiki.tsx": "da42a81d51edd5e0e9da96d169feeac8810663377ed84e6990d453f12ef76f38",
};

const read = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const archives = fs
  .readdirSync(path.join(ROOT, DIR))
  .filter(name => name.endsWith(".tsx"))
  .sort();

describe("은퇴한 화면들이 옮긴 그대로 있는가", () => {
  test("보관 폴더에는 되살리기 원본 명단 그대로만 있다", () => {
    // 하한이 아니라 정확한 명단이다(위 2026-10-05 절). 0건 통과도 함께 막는다.
    expect(archives).toEqual(Object.keys(DIGESTS).sort());
    expect(fs.existsSync(path.join(ROOT, DIR, "INDEX.md"))).toBe(true);
  });

  test("아카이브마다 어디서 왔는지가 적혀 있다", () => {
    // 출처 없는 아카이브는 되살릴 수 없다. 헤더 네 칸이 그 최소치다.
    const missing = archives.flatMap(name => {
      const head = read(`${DIR}/${name}`).slice(0, 2400);
      return ["was:", "why:", "read:", "run:"]
        .filter(field => !head.includes(field))
        .map(field => `${name} -> ${field} 없음`);
    });
    expect(missing).toEqual([]);
  });

  test("INDEX.md 와 실제 파일이 서로를 덮는다", () => {
    const index = read(`${DIR}/INDEX.md`);
    // ⚠ **표 줄**만 센다. 처음엔 파일 이름이 문서 어디에든 있으면 통과시켰는데,
    // 변이 검증에서 잡혔다 — theme.tsx 는 본문 산문에도 한 번 나와서, 표에서
    // 줄을 지워도 초록이었다. 산문이 구조 요건을 대신 채운 것이다.
    // (이 저장소에서 오늘만 세 번째 얼굴이다: 검사가 산문을 증거로 읽는다.)
    const rows = new Set(
      [...index.matchAll(/^\|\s*`([\w.-]+\.tsx)`\s*\|/gm)].map(m => m[1]),
    );
    const unlisted = archives.filter(name => !rows.has(name));
    // 표에만 있고 파일이 없는 줄 = 없는 것을 지키는 척하는 줄
    const ghost = [...rows].filter(name => !archives.includes(name));
    expect({ 표에_없는_파일: unlisted, 파일이_없는_표_줄: ghost }).toEqual({
      표에_없는_파일: [],
      파일이_없는_표_줄: [],
    });
  });

  test("은퇴 뒤로 아무도 아카이브를 고치지 않았다", () => {
    const drifted = archives
      .filter(name => DIGESTS[name] !== undefined)
      .filter(name => sha256(read(`${DIR}/${name}`)) !== DIGESTS[name])
      .map(name => `${name} -> ${sha256(read(`${DIR}/${name}`))}`);
    const unpinned = archives.filter(name => DIGESTS[name] === undefined);

    // 둘은 다른 상태다. 바뀐 것은 "왜 고쳤나"를 묻고, 안 적힌 것은 "줄을 더하라"다.
    expect({ 내용이_바뀐_아카이브: drifted }).toEqual({ 내용이_바뀐_아카이브: [] });
    expect({ 표에_없는_새_아카이브: unpinned }).toEqual({ 표에_없는_새_아카이브: [] });
  });

  test("배송 코드가 아카이브를 다시 가져다 쓰지 않는다", () => {
    // legacy/ 는 빌드 그래프 밖이다. src/ 가 여기서 import 하면 번들이 깨지거나
    // (경로 별칭이 없다) 더 나쁘게는 은퇴가 되돌려진 채로 통과한다.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") walk(rel);
        } else if (/\.tsx?$/.test(entry.name)) {
          const src = read(rel);
          if (/from\s+["'][^"']*legacy\/screens\//.test(src)) offenders.push(rel);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});

// ── 검사가 보관본을 읽지 않는다 (2026-10-05 신설) ───────────────────────────────

/**
 * 코드 안에서 보관 폴더를 가리키는 문자열. **주석은 보지 않는다** — 검사 파일들은
 * 보관본의 위치를 산문으로 설명하는 일이 잦고(이 파일도 그렇다), 산문을 증거로
 * 읽으면 설명을 적는 것만으로 실패한다. 문자열 리터럴만 본다:
 *
 *   "legacy/screens/x.tsx"                     경로 한 덩어리
 *   join(ROOT, "legacy", "screens", "x.tsx")   조각으로 나눈 경로(실측: tools-reachable)
 */
function archiveReads(fileName: string, source: string): string[] {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text.replace(/\\/g, "/");
      if (/(^|\/)legacy\/screens(\/|$)/.test(text)) found.push(`${fileName}:${at(node)}`);
    }
    if (ts.isCallExpression(node)) {
      const parts = node.arguments.map(arg => (ts.isStringLiteralLike(arg) ? arg.text : null));
      for (let i = 0; i + 1 < parts.length; i += 1) {
        if (parts[i] === "legacy" && parts[i + 1] === "screens") found.push(`${fileName}:${at(node)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** 검사 코드: scripts/ 전부, src 의 __tests__ · __mocks__, PIXEL-CLAY 채점 도구. */
function checkerFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string, all: boolean): void => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return;
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(rel, all || entry.name === "__tests__" || entry.name === "__mocks__");
      } else if (all && /\.(?:tsx?|mjs|cjs|js)$/.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  walk("scripts", true);
  walk("src", false);
  walk("design/pixel_clay_260825/tools", true);
  return out.sort();
}

describe("검사가 보관본을 읽지 않는다 - 보관 폴더를 읽는 검사는 이 파일 하나", () => {
  const files = checkerFiles();

  test("스캐너가 실제로 읽었다 - 0건 통과를 막는다", () => {
    expect(files.length).toBeGreaterThan(400);
    expect(files).toContain(SELF);
    expect(files.some(f => f.startsWith("scripts/"))).toBe(true);
    expect(files.some(f => f.startsWith("design/pixel_clay_260825/tools/"))).toBe(true);
  });

  test("판정기 대조군 - 경로 문자열·조각 경로는 잡고 주석은 안 잡는다", () => {
    const quote = (s: string) => JSON.stringify(s);
    const dir = ["legacy", "screens"].join("/");
    expect(archiveReads("a.ts", `readFileSync(${quote(`${dir}/wiki.tsx`)});`)).toEqual(["a.ts:1"]);
    expect(archiveReads("b.ts", `join(ROOT, ${quote("legacy")}, ${quote("screens")}, ${quote("ops.tsx")});`)).toEqual(["b.ts:1"]);
    expect(archiveReads("c.ts", "const x = `" + dir + "/${name}`;")).toEqual(["c.ts:1"]);
    expect(archiveReads("d.ts", `// read ${dir}/wiki.tsx before reviving\nconst y = 1;`)).toEqual([]);
    expect(archiveReads("e.ts", `const z = ${quote("assets/legacy-art/x.png")};`)).toEqual([]);
  });

  test("보관 폴더를 코드로 읽는 검사가 이 파일 말고는 0건이다", () => {
    const offenders = files
      .filter(f => f !== SELF)
      .flatMap(f => archiveReads(f, fs.readFileSync(path.join(ROOT, f), "utf8")));
    // 실패하면: 그 핀은 어떤 빌드도 그리지 않는 코드를 지키고 있다. 지키려던 성질이
    // 배송 화면에도 있으면 그쪽으로 재조준하고, 없으면 은퇴시키고 이유를 적는다.
    expect(offenders).toEqual([]);
  });
});
