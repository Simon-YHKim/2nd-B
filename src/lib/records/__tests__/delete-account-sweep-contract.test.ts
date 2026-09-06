import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * R4 (기술 흐름 정합성) — 계정 삭제 Storage 정리의 부분 성공.
 *
 * delete-account 는 raw-clippings 를 페이지 단위로 지우고, 끝났는지를
 * `raw_clippings_erased` 로 보고한다. 클라이언트는 이제 그 값을 영수증으로
 * 받는다(delete-bulk-receipt.test.ts). 그래서 이 플래그가 정직해야 한다.
 *
 * 결함: `remove(paths)` 는 **부분 성공할 수 있다.** 지운 객체 목록을 `data` 로
 * 돌려주는데 코드가 `error` 만 봤다. 1000개를 지워달라고 해서 3개만 지워지고
 * 에러가 없으면, 루프는 그 페이지를 성공으로 치고 `rawClippingsErased = true`
 * 인 채로 끝난다 — **관측하지 않은 삭제를 확인했다고 보고**하게 된다.
 *
 * 이건 이번 회차 내내 나온 것과 같은 모양이다. 없는 확인을 지어내지 않는다.
 *
 * Deno 함수는 Jest 에서 실행할 수 없으므로 `edge-jwt-hardening.test.ts` 와 같은
 * 소스 계약 검사로 지킨다. 주석은 걷어낸다 — 검사를 **언급만** 하는 주석이
 * 없는 코드를 가리면 안 된다.
 */
const FUNCTION_FILE = resolve(
  __dirname,
  "../../../../supabase/functions/delete-account/index.ts",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(readFileSync(FUNCTION_FILE, "utf8"));

describe("delete-account raw-clippings sweep reports only what it observed", () => {
  test("reads the removal RESULT, not just the error", () => {
    // `const { error: rmErr } = await ...remove(paths)` throws the removed list
    // away. The destructure must bind the data side too.
    const removeCall = code.match(/const\s*\{([^}]*)\}\s*=\s*await\s+admin\.storage[^;]*\.remove\(/);
    expect(removeCall).not.toBeNull();
    expect(removeCall![1]).toMatch(/\bdata\b/);
  });

  test("the count actually comes from the removal result", () => {
    // 변이 검증에서 이 단언이 한 번 무뎠다. 처음에는 `removed` 로 시작하는
    // **이름**이 `paths.length` 와 비교되기만 하면 통과했는데, 그러면
    // `const removedCount = paths.length` 로 가드를 완전히 무력화해도 초록이었다.
    // 그래서 결과 배열의 길이를 **실제로 읽는지**를 따로 못박는다.
    expect(code).toMatch(/Array\.isArray\(\s*removed\s*\)|\bremoved\s*(\?\.|\.)\s*length/);
  });

  test("compares something derived from the removal result against the requested count", () => {
    // A short result with no error is a partial removal. The contract is that
    // a value derived from `removed` is measured against `paths.length` — not
    // any particular expression shape, so a later refactor can keep the
    // guarantee without tripping this guard.
    expect(code).toMatch(/\bremoved[A-Za-z]*\b[\s\S]{0,200}?<\s*paths\.length/);
  });

  test("a short removal marks the sweep as NOT erased", () => {
    const idx = code.search(/<\s*paths\.length/);
    expect(idx).toBeGreaterThan(-1);
    const after = code.slice(idx, idx + 400);
    expect(after).toMatch(/rawClippingsErased\s*=\s*false/);
  });

  test("still marks not-erased on a list error and on a remove error", () => {
    // Regression guard: the pre-existing honesty must survive the change.
    expect(code).toMatch(/listErr[\s\S]{0,200}?rawClippingsErased\s*=\s*false/);
    expect(code).toMatch(/rmErr[\s\S]{0,200}?rawClippingsErased\s*=\s*false/);
  });

  test("still reports the two sweeps separately in the response", () => {
    expect(code).toMatch(/deleted:\s*true/);
    expect(code).toMatch(/profile_erased:\s*profileErased/);
    expect(code).toMatch(/raw_clippings_erased:\s*rawClippingsErased/);
  });

  test("the sweep never fails the request — the account is already erased", () => {
    // The auth delete is the only fatal step. A Storage hiccup must not turn a
    // completed deletion into a 500 the user reads as failure.
    expect(code).toMatch(/auth_delete_failed/);
    const sweepStart = code.indexOf("rawClippingsErased");
    expect(sweepStart).toBeGreaterThan(-1);
    expect(code.slice(sweepStart)).not.toMatch(/return\s+jsonResponse\([^)]*,\s*5\d\d\s*\)/);
  });
});
