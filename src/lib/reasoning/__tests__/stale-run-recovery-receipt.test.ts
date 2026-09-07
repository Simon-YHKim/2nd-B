import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// 서버가 횟수를 돌려줬는데 화면은 여전히 쓴 걸로 보여준다.
//
// 크래시나 강제 종료로 `reserved`/`running` 에 갇힌 추론 실행은 다음 방문 때
// `recoverStaleRuns` 가 쓸어 담아 **환불**한다. 그 함수는 환불한 개수를 돌려준다.
// 그런데 화면은 그 수를 버린다 - `await recoverStaleRuns(userId);` 하고 끝이다.
//
// 잔여 횟수는 **다른 effect** 가 `getReasoningUsage` 로 따로 읽는다. 둘은 서로를
// 기다리지 않으므로, 환불이 커밋되기 전에 사용량을 읽으면 **환불 전 숫자가
// 그대로 남는다.** 사용자는 크래시 뒤 화면을 열고 "아직 다 썼다"를 본다.
// 서버에는 돌려줬는데 화면이 모른다.
//
// 두 번째 문제는 같은 함수의 반환 규약이다 - 문서가 스스로 "Returns count,
// **0 on error**" 라고 적는다. 그러면 **"쓸 게 없었다"와 "쓸어 담기가 실패했다"가
// 같은 0** 이다. 정상 범위 안의 폴백 기본값이라 호출자가 둘을 가를 수 없다.
const RUNS = resolve(__dirname, "../runs.ts");
const SCREEN = resolve(__dirname, "../../../app/reasoning.tsx");
const RUNS_SOURCE = readFileSync(RUNS, "utf8");
const SCREEN_SOURCE = readFileSync(SCREEN, "utf8");

/** 소스에서 함수 선언 하나를 꺼내 실행 가능한 형태로 돌려준다. */
function extractFunction(source: string, path: string, name: string): string {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: string | null = null;
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(file) === name) {
      found = node.getText(file);
    }
    node.forEachChild(walk);
  };
  walk(file);
  if (!found) throw new Error(`${name} not found in ${path}`);
  return found;
}

/** 추출한 선언을 주어진 supabase 스텁 위에서 실제로 돌린다. */
function runRecoverStaleRuns(rpc: () => unknown): Promise<number | null> {
  const declaration = extractFunction(RUNS_SOURCE, RUNS, "recoverStaleRuns")
    .replace(/^export\s+/, "");
  const body = ts.transpileModule(`${declaration}\nreturn recoverStaleRuns("u1");`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  const factory = new Function(
    "getSupabaseClient",
    "STALE_RUN_MINUTES",
    "console",
    body,
  );
  return factory(
    () => ({ rpc: async () => rpc() }),
    30,
    { warn: () => undefined },
  ) as Promise<number | null>;
}

describe("쓸어 담기가 세 상태를 가른다", () => {
  test("환불한 개수를 그대로 돌려준다", async () => {
    await expect(runRecoverStaleRuns(() => ({ data: 3, error: null }))).resolves.toBe(3);
  });

  test("쓸 것이 없으면 0", async () => {
    await expect(runRecoverStaleRuns(() => ({ data: 0, error: null }))).resolves.toBe(0);
  });

  test("실패는 0 이 아니라 null - 0 과 구분된다", async () => {
    // 이것이 이 회차의 첫 번째 결함이다. 실패를 0 으로 접으면 호출자가
    // "돌려줄 게 없었다" 와 "돌려주지 못했다" 를 가를 수 없다.
    await expect(
      runRecoverStaleRuns(() => ({ data: null, error: { message: "rpc down" } })),
    ).resolves.toBeNull();
  });

  test("던져도 null - 같은 이유", async () => {
    await expect(
      runRecoverStaleRuns(() => {
        throw new Error("network");
      }),
    ).resolves.toBeNull();
  });

  test("모르는 모양이면 null 이지 0 이 아니다", async () => {
    // 숫자가 아닌 응답은 '개수를 모른다' 이지 '0개' 가 아니다.
    await expect(runRecoverStaleRuns(() => ({ data: "3", error: null }))).resolves.toBeNull();
  });
});

describe("화면이 그 영수증을 쓴다", () => {
  const AST = ts.createSourceFile(SCREEN, SCREEN_SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  /** `recoverStaleRuns(...)` 호출을 감싸고 있는 문장의 텍스트. */
  function recoveryStatement(): string {
    let found: string | null = null;
    const walk = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "recoverStaleRuns"
      ) {
        let parent: ts.Node = node;
        while (parent.parent && !ts.isBlock(parent.parent)) parent = parent.parent;
        found = parent.getText(AST);
      }
      node.forEachChild(walk);
    };
    walk(AST);
    if (!found) throw new Error("recoverStaleRuns call site not found");
    return found;
  }

  test("호출 자리를 실제로 찾았다 - 0건 통과를 막는다", () => {
    expect(recoveryStatement().length).toBeGreaterThan(10);
    expect(SCREEN_SOURCE).toContain("recoverStaleRuns");
  });

  test("결과를 버리지 않는다", () => {
    // `await recoverStaleRuns(userId);` 한 줄이면 영수증이 사라진다.
    expect(recoveryStatement()).toMatch(/(const|let)\s+\w+\s*=\s*await\s+recoverStaleRuns/);
  });

  test("환불이 있었으면 잔여 횟수를 다시 읽는다", () => {
    // 잔여 표시는 다른 effect 가 따로 읽는다. 서로 기다리지 않으므로 환불
    // 커밋보다 먼저 읽히면 화면이 환불 전 숫자에 머문다.
    const block = SCREEN_SOURCE.slice(
      SCREEN_SOURCE.indexOf("recoverStaleRuns(userId)"),
      SCREEN_SOURCE.indexOf("recoverStaleRuns(userId)") + 700,
    );
    expect(block).toContain("refreshUsage");
  });

  /** 화면이 "새로고침할까"를 정하는 그 조건식을, 소스에서 꺼내 실행한다. */
  function refreshDecision(): (refunded: number | null) => boolean {
    const binding = /(?:const|let)\s+(\w+)\s*=\s*await\s+recoverStaleRuns/.exec(recoveryStatement());
    if (!binding) throw new Error("refund is not bound to a name");
    const name = binding[1];
    const after = SCREEN_SOURCE.slice(SCREEN_SOURCE.indexOf(recoveryStatement()));
    const guard = new RegExp(`if\\s*\\(([^)]*${name}[^)]*)\\)\\s*\\{[^}]*refreshUsage`).exec(after);
    if (!guard) throw new Error("no refreshUsage guarded by the refund value");
    return new Function(name, `return Boolean(${guard[1]});`) as (r: number | null) => boolean;
  }

  test("실패를 성공처럼 다루지 않는다 - 조건식을 실제로 돌려 본다", () => {
    // ⚠ 처음에는 이 자리에서 그냥 `/null/` 을 찾았고, **고치기 전에도 통과했다**
    // (근처에 `proposal !== null` 이 있어서). 그다음 판은 결과 변수를 쓴 null
    // 비교를 요구했는데, 변이 검증이 그것도 뚫었다 - `refunded === null ||
    // refunded > 0` 이 그 정규식을 만족하면서 **실패를 성공처럼** 다룬다.
    //
    // 모양을 묻는 대신 **조건식을 소스에서 꺼내 실행**한다. 진리표는 세 줄이고
    // 셋 다 다른 답이어야 한다 - 그래야 신호다.
    const shouldRefresh = refreshDecision();
    expect(shouldRefresh(3)).toBe(true); // 환불이 있었다 → 다시 읽는다
    expect(shouldRefresh(0)).toBe(false); // 돌려줄 게 없었다 → 읽을 이유 없다
    expect(shouldRefresh(null)).toBe(false); // 쓸어 담기가 실패했다 → 없던 환불을 주장하지 않는다
  });
});
