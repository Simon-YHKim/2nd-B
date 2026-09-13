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
 * Deno endpoint 자체는 소스 계약으로 지키고, 분리한 Storage 알고리즘은
 * `supabase/functions/delete-account/__tests__/storage-erasure.test.ts` 에서 실제로
 * 실행한다. 이 파일에서는 주석을 걷는다 — 검사를 **언급만** 하는 주석이
 * 없는 코드를 가리면 안 된다.
 */
const FUNCTION_FILE = resolve(
  __dirname,
  "../../../../supabase/functions/delete-account/index.ts",
);
const STORAGE_FILE = resolve(
  __dirname,
  "../../../../supabase/functions/delete-account/storage-erasure.ts",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(`${readFileSync(STORAGE_FILE, "utf8")}\n${readFileSync(FUNCTION_FILE, "utf8")}`);

describe("delete-account raw-clippings sweep reports only what it observed", () => {
  test("reads the removal RESULT, not just the error", () => {
    expect(code).toMatch(/removeResponse\s*=\s*await bucket\.remove\(paths\)/);
    expect(code).toMatch(/Array\.isArray\(removeResponse\.data\)/);
  });

  test("the count actually comes from the removal result", () => {
    // 변이 검증에서 이 단언이 한 번 무뎠다. 처음에는 `removed` 로 시작하는
    // **이름**이 `paths.length` 와 비교되기만 하면 통과했는데, 그러면
    // `const removedCount = paths.length` 로 가드를 완전히 무력화해도 초록이었다.
    // 그래서 결과 배열의 길이를 **실제로 읽는지**를 따로 못박는다.
    expect(code).toMatch(/for \(const removed of removeResponse\.data\)/);
    expect(code).toMatch(/confirmed\.add\(removed\.name\)/);
  });

  test("compares the exact returned-name set against the requested set", () => {
    expect(code).toMatch(/requested\.has\(removed\.name\)/);
    expect(code).toMatch(/confirmed\.size\s*!==\s*requested\.size/);
  });

  test("a short removal returns an explicit unconfirmed result", () => {
    const idx = code.search(/confirmed\.size\s*!==\s*requested\.size/);
    expect(idx).toBeGreaterThan(-1);
    const after = code.slice(idx, idx + 400);
    expect(after).toMatch(/storage_remove_incomplete/);
  });

  test("still fails closed on a list error and on a remove error", () => {
    expect(code).toMatch(/listingResponse\.error[\s\S]{0,300}?storage_list_failed/);
    expect(code).toMatch(/removeResponse\.error[\s\S]{0,300}?storage_remove_failed/);
  });

  test("reports durable fence and one completed pre-Auth sweep", () => {
    expect(code).toMatch(/deleted:\s*true/);
    expect(code).toMatch(/profile_erased:\s*profileErased/);
    expect(code).toMatch(/deletion_fenced:\s*true/);
    expect(code).toMatch(/raw_clippings_erased:\s*true/);
    expect(code).toMatch(/raw_clippings_empty_at_check:\s*true/);
    expect(code).toMatch(/raw_clippings_removed:\s*preDeletionStorage\.removed/);
  });

  test("pre-delete cleanup progress is returned without claiming account deletion", () => {
    expect(code).toMatch(/preDeletionStorage\.code\s*===\s*'storage_cleanup_in_progress'\s*\?\s*409\s*:\s*503/);
    expect(code).toMatch(/raw_clippings_removed:\s*preDeletionStorage\.removed/);
  });

  test("never deletes Auth until the fenced Storage sweep observed empty", () => {
    const fenceAt = code.indexOf("'begin_account_deletion'");
    const sweepAt = code.indexOf("preDeletionStorage = await eraseRawClippings");
    const deleteAt = code.indexOf("await deleteAuthUserWithReconciliation(");
    expect(fenceAt).toBeGreaterThan(-1);
    expect(sweepAt).toBeGreaterThan(fenceAt);
    expect(deleteAt).toBeGreaterThan(sweepAt);
    expect(code).not.toContain("postDeletionStorage");
  });
});
