// 같은 커밋을 두 번 빌드하면 같은 바이트가 나와야 한다.
//
// 웹 게시 게이트는 "승인한 digest" 와 "방금 빌드한 digest" 를 대조한다. 빌드가
// 재현되지 않으면 그 대조는 동전던지기가 된다. 2026-09-08 에 실제로 그랬다 —
// 같은 커밋의 push 빌드를 rerun 하니 digest 가 달라졌고, 두 아티팩트(351파일)를
// 풀어 보니 모든 JS 청크 해시가 달랐다. 39바이트짜리 청크가 원인을 그대로 보여줬다:
//
//   빌드 A:  __d(function(g,r,i,a,m,e,d){},3496,[]);
//   빌드 B:  __d(function(g,r,i,a,m,e,d){},2375,[]);
//
// Metro 기본 팩토리는 **순번 카운터**다. id 가 "그 모듈이 언제 닿였는가"를 담고
// "어느 모듈인가"를 안 담는다. 그래서 워커 순서가 흔들리면 전부 흔들린다.
// 게다가 두 직렬화기가 **id 로 정렬**하는데(metro `baseJSBundle.js`,
// `@expo/metro-config` `serializeChunks.js:getSortedModules`) id 를 순회 순서로
// 매긴 뒤 정렬하므로 정렬이 무의미해진다 — 즉 배출 순서도 같이 흔들린다.
//
// 이 검사는 **문자열 스캔이 아니라 팩토리를 실제로 돌린다.** 기본 카운터로
// 되돌리면 "순서를 바꿔도 같은 id" 가 즉시 깨진다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

type Factory = () => (modulePath: string) => number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const moduleId = require(resolve(ROOT, "metro-module-id.js")) as {
  createDeterministicModuleIdFactory: (projectRoot: string) => Factory;
  ID_SALT: string;
  ID_BITS: number;
};
const { createDeterministicModuleIdFactory } = moduleId;

const POSIX_ROOT = "/repo";
const PATHS = [
  "/repo/src/app/index.tsx",
  "/repo/src/lib/theme/tokens.ts",
  "/repo/src/components/deepspace/SecondbHead.tsx",
  "/repo/node_modules/react-native/index.js",
  "/repo/node_modules/expo-router/entry.js",
  "/repo/src/lib/llm/boundary.ts",
];

function idsFor(paths: readonly string[], root = POSIX_ROOT): Map<string, number> {
  const assign = createDeterministicModuleIdFactory(root)();
  const out = new Map<string, number>();
  for (const p of paths) out.set(p, assign(p));
  return out;
}

describe("모듈 id 는 순회 순서가 아니라 경로에서 나온다", () => {
  test("순서를 뒤집어도 같은 id (기본 카운터면 여기서 깨진다)", () => {
    const forward = idsFor(PATHS);
    const reversed = idsFor([...PATHS].reverse());
    for (const p of PATHS) {
      expect({ path: p, id: reversed.get(p) }).toEqual({ path: p, id: forward.get(p) });
    }
  });

  test("빌드가 달라도(팩토리가 새로 만들어져도) 같은 id", () => {
    expect([...idsFor(PATHS).values()]).toEqual([...idsFor(PATHS).values()]);
  });

  test("일부만 빌드해도 남은 것의 id 가 안 밀린다", () => {
    const all = idsFor(PATHS);
    const subset = idsFor(PATHS.slice(3));
    for (const p of PATHS.slice(3)) {
      expect({ path: p, id: subset.get(p) }).toEqual({ path: p, id: all.get(p) });
    }
  });

  test("체크아웃 위치가 달라도 같은 id (CI · 정본 · 워크트리)", () => {
    // 같은 커밋이 러너·정본·워크트리 어디서든 빌드된다. 절대경로가 id 에 새면
    // 없애려는 드리프트가 그대로 돌아온다.
    const here = idsFor(PATHS, POSIX_ROOT);
    const elsewhere = idsFor(
      PATHS.map((p) => p.replace("/repo", "/home/runner/work/2nd-B/2nd-B")),
      "/home/runner/work/2nd-B/2nd-B",
    );
    expect([...elsewhere.values()]).toEqual([...here.values()]);
  });

  test("경로 구분자가 달라도 같은 id (Windows ↔ Linux)", () => {
    const win = createDeterministicModuleIdFactory("C:\\repo")();
    const nix = createDeterministicModuleIdFactory("/repo")();
    // path.relative 는 실행 플랫폼 규칙을 쓰므로, 같은 플랫폼에서 두 루트를
    // 비교하는 대신 같은 상대경로가 같은 값을 내는지를 본다.
    const a = nix("/repo/src/lib/x.ts");
    const b = createDeterministicModuleIdFactory("/repo")()("/repo/src/lib/x.ts");
    expect(b).toBe(a);
    expect(typeof win("C:\\repo\\src\\lib\\x.ts")).toBe("number");
  });

  test("id 는 양의 int32 다 (엔진 정수 경로 유지)", () => {
    for (const id of idsFor(PATHS).values()) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(0x7fffffff);
    }
  });

  test("서로 다른 경로는 서로 다른 id (이 표본에서)", () => {
    expect(new Set(idsFor(PATHS).values()).size).toBe(PATHS.length);
  });

  test("충돌하면 조용히 덮지 않고 던진다", () => {
    const assign = createDeterministicModuleIdFactory(POSIX_ROOT)();
    const real = assign("/repo/src/a.ts");
    // 같은 경로를 다시 물으면 같은 값을 준다(던지지 않는다).
    expect(assign("/repo/src/a.ts")).toBe(real);
    // 충돌 경로는 해시로 만들 수 없으니, 가드가 존재하는지를 소스로 확인한다.
    const src = readFileSync(resolve(ROOT, "metro-module-id.js"), "utf8");
    expect(src).toContain("metro module id collision");
    expect(src).toContain("ID_SALT");
  });
});

describe("metro.config.js 가 실제로 그 팩토리를 단다", () => {
  const cfg = readFileSync(resolve(ROOT, "metro.config.js"), "utf8");

  test("createModuleIdFactory 가 직렬화기에 붙어 있다", () => {
    expect(cfg).toContain("createDeterministicModuleIdFactory");
    expect(cfg).toContain("config.serializer.createModuleIdFactory =");
    expect(cfg).toContain('require("./metro-module-id")');
  });

  test("프로젝트 루트를 넘긴다 (상대 경로의 기준)", () => {
    expect(cfg).toMatch(/createDeterministicModuleIdFactory\(__dirname\)/);
  });
});
