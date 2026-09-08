// 라우트가 이름대로의 화면을 그리는가.
//
// 이 검사는 **내가 저지른 실수**에서 나왔다. 2026-09-08 에 /sign-up 라우트를 래퍼로
// 줄이면서, 배송되는 `dds-sign-up-screen` 대신 같은 이름을 가진 **224줄짜리 그림자
// 사본**(`dds-auth-screens`)을 import 했다. 컴파일도 되고 검사도 전부 초록이었다.
// 잡힌 것은 `git show origin/main:<route>` 로 원본 import 를 읽어봤기 때문이지
// 어떤 검사가 울어서가 아니다. 뒤에 변이 검증으로 다시 확인했다 — 래퍼를 그림자로
// 겨눠도 `shadow-screens` 도 `screen-index` 도 **아무것도 안 운다**.
//
// 두 가지를 못박는다. 둘 다 오늘 실측 0 위반이라 면제 명단이 필요 없다:
//
//   ① 라우트는 화면 컴포넌트를 **별칭으로 가져오지 않는다.** 별칭은 이름과 실체를
//      갈라놓는 도구이고, 라우트에서 그게 필요할 일이 없다. 내 실수도 정확히
//      `X as Y` 였다 — 별칭이 없었다면 타입이 아니라 **이름**이 먼저 어긋났을 것이다.
//      실측: 라우트의 별칭 import 13건 중 화면꼴 **0건**.
//
//   ② 이름이 두 파일에 있는 컴포넌트를 라우트가 가져올 때는 **배송되는 쪽**이어야
//      한다. 어느 쪽이 배송인지는 아래 SHIPPED_OF 가 **독립적으로** 적는다.
//
//      ⚠ 처음엔 shadow-screens 의 `shipped` 를 그대로 기대값으로 썼다. 그건
//      **순환이었다** — 그 모듈은 "라우트가 실제로 import 하는 파일"을 shipped 라고
//      정의하므로, 라우트를 그림자로 바꾸면 기대값도 따라 바뀐다. 변이 검증에서
//      드러났다: 그림자로 겨눠도 통과했다. **검사 대상에서 파생된 기대값은 아무것도
//      증명하지 않는다.** 그래서 네 줄을 손으로 적는다 - 적은 것이 곧 주장이다.
//
// ⚠ ①은 **모양**을 금지하는 규칙이라 성질을 직접 재지 않는다. 별칭 없이도 엉뚱한
// 화면을 그릴 수는 있다(같은 이름의 다른 컴포넌트). 그건 ②가 덮고, 둘 다 못 덮는
// 경우 — 이름도 다르고 중복도 아닌 완전히 다른 화면 — 는 남는다. 좁다는 것을 여기
// 적어 두고, 넓히려면 라우트별 기대 화면 명단이 필요하다(85개, 유지비가 크다).
import fs from "node:fs";
import path from "node:path";

import { duplicatedComponentNames } from "../shadow-screens";

const ROOT = process.cwd();
const APP = path.join(ROOT, "src", "app");
const read = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

function routeFiles(dir: string = APP, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "__mocks__") routeFiles(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/** 화면처럼 보이는 이름. 좁게 잡아 오탐보다 미탐 쪽으로 틀린다. */
const SCREENISH = /Screen|Shell|Legacy/;

/**
 * 이름이 겹치는 화면마다 **배송되는 정의 파일**. 코드에서 파생하지 않고 적는다 —
 * 위 ②의 이유. 새 그림자 짝이 생기면 아래 검사가 "명단에 없다"로 실패한다.
 */
const SHIPPED_OF: Readonly<Record<string, string>> = {
  DeepSpaceInboxScreen: "src/screens/deepspace/dds-inbox-screen.tsx",
  DeepSpaceManualScreen: "src/screens/deepspace/dds-manual-screen.tsx",
  DeepSpaceOpsScreen: "src/screens/deepspace/dds-ops-screen.tsx",
  DeepSpaceSignUpDesignScreen: "src/screens/deepspace/dds-sign-up-screen.tsx",
};

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

interface Imported {
  route: string;
  original: string;
  local: string;
  spec: string;
}

function routeImports(): Imported[] {
  const out: Imported[] = [];
  for (const route of routeFiles()) {
    const src = read(route);
    IMPORT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT.exec(src)) !== null) {
      for (const piece of m[1].split(",")) {
        const token = piece.trim();
        if (token.length === 0) continue;
        const alias = /^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/.exec(token);
        const original = alias ? alias[1] : token.replace(/^type\s+/, "");
        const local = alias ? alias[2] : original;
        out.push({ route, original, local, spec: m[2] });
      }
    }
  }
  return out;
}

/** `@/x/y` · `./y` 를 저장소 상대 경로로. 없으면 null. */
function resolveModule(spec: string, fromRoute: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(path.join(ROOT, fromRoute)), spec);
  else return null;
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (fs.existsSync(base + ext)) {
      return path.relative(ROOT, base + ext).split(path.sep).join("/");
    }
  }
  return null;
}

/** 그 이름을 실제로 정의하는 파일까지 재수출을 따라간다. */
function definingFile(name: string, spec: string, fromRoute: string): string | null {
  let where = resolveModule(spec, fromRoute);
  for (let hop = 0; where !== null && hop < 4; hop += 1) {
    const src = read(where);
    if (new RegExp(`^export (?:default )?function ${name}\\s*\\(`, "m").test(src)) return where;
    const reexport = new RegExp(
      `export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`,
    ).exec(src);
    if (reexport === null) return null;
    where = resolveModule(reexport[1], where);
  }
  return null;
}

describe("라우트가 이름대로의 화면을 그리는가", () => {
  const imports = routeImports();

  test("스캐너가 실제로 읽었다 - 0건 통과를 막는다", () => {
    expect(routeFiles().length).toBeGreaterThan(60);
    expect(imports.length).toBeGreaterThan(200);
    expect(imports.some(i => SCREENISH.test(i.original))).toBe(true);
  });

  test("라우트는 화면 컴포넌트를 별칭으로 가져오지 않는다", () => {
    const aliased = imports
      .filter(i => i.local !== i.original)
      .filter(i => SCREENISH.test(i.original) || SCREENISH.test(i.local))
      .map(i => `${i.route}: ${i.original} as ${i.local}  <- ${i.spec}`);
    if (aliased.length > 0) {
      throw new Error(
        `라우트가 화면을 다른 이름으로 가져온다:\n  ${aliased.join("\n  ")}\n\n` +
          `별칭은 이름과 실체를 갈라놓는다. 라우트에서는 그럴 이유가 없고,\n` +
          `2026-09-08 에 이 모양으로 **그림자 사본을 그리는 래퍼**가 만들어졌다.\n` +
          `정말 필요하다면 이 파일에 이유와 함께 면제를 적을 것 - 지금은 0건이다.`,
      );
    }
  });

  test("겹치는 이름의 명단이 실제 중복과 일치한다", () => {
    // 명단이 낡으면 아래 검사가 조용히 아무것도 안 지킨다.
    const dups = duplicatedComponentNames(ROOT).sort();
    expect(dups).toEqual(Object.keys(SHIPPED_OF).sort());
    // 적어둔 파일이 실제로 그 이름을 정의하는지도 본다.
    const wrongFile = Object.entries(SHIPPED_OF).filter(
      ([name, file]) =>
        !new RegExp(`^export (?:default )?function ${name}\\s*\\(`, "m").test(read(file)),
    );
    expect(wrongFile).toEqual([]);
  });

  test("이름이 겹치는 화면은 배송되는 쪽에서 가져온다", () => {
    const wrong = imports
      .filter(i => SHIPPED_OF[i.original] !== undefined)
      .map(i => ({ ...i, resolved: definingFile(i.original, i.spec, i.route) }))
      .filter(i => i.resolved !== SHIPPED_OF[i.original])
      .map(
        i =>
          `${i.route}: ${i.original} -> ${i.resolved ?? "해석 실패"} (배송: ${SHIPPED_OF[i.original]})`,
      );

    // "해석 실패"도 실패로 센다 - 못 따라간 경로는 안전하다는 뜻이 아니다.
    expect(wrong).toEqual([]);
  });
});
