import { createdSourceIds, withoutSharedSourceIds } from "../history-ownership";

// 가져오기 이력의 한 항목은 "이 가져오기가 만든 행" 을 가리키고, 철회는 그 행을 지운다.
// 그래서 항목이 가리키는 행은 곧 그 철회가 지워도 되는 행이어야 한다.
//
// r29 §3-6 (2026-09-20) 이 이 약속이 깨진 순서를 찾았다. 허브에서 같은 파일 · 같은
// 선택을 두 번 비준하면 두 번째 capture 는 정확 중복으로 첫 번째가 만든 행 R 을 돌려준다
// (새 행도 원문도 쓰지 않는다). 허브가 그 R 을 두 번째 항목에도 적었고, 두 번째 항목을
// 철회하면 첫 가져오기의 R 이 지워졌다.
//
// 판정은 두 화면(/import-hub · /import)이 함께 쓰는 순수 함수 둘이 한다. 화면 배선은
// src/screens/deepspace/__tests__/import-withdrawal-pointer.test.ts 가 실제 핸들러로 본다.

const entry = (id: string, sourceIds: string[], sourceKey = "notion") => ({
  id,
  sourceKey,
  name: sourceKey,
  atIso: "2026-09-20T00:00:00.000Z",
  summary: "",
  sourceIds,
});

describe("createdSourceIds - 비준이 이력에 적는 행", () => {
  test("새로 만든 행은 적는다", () => {
    expect(createdSourceIds({ source: { id: "r" }, deduped: null })).toEqual(["r"]);
  });

  test("근접 중복도 새 행이다 (dedup_of 로 이어질 뿐) - 적는다", () => {
    expect(createdSourceIds({ source: { id: "n" }, deduped: "near_duplicate" })).toEqual(["n"]);
  });

  test("정확 중복은 앞선 담기가 만든 기존 행이다 - 적지 않는다", () => {
    expect(createdSourceIds({ source: { id: "r" }, deduped: "exact_duplicate" })).toEqual([]);
  });
});

describe("withoutSharedSourceIds - 철회가 지우는 행", () => {
  test("r29 순서: 같은 선택을 두 번 비준하면 두 번째 항목에는 지울 행이 없다", () => {
    const first = entry("e1", createdSourceIds({ source: { id: "r" }, deduped: null }));
    const second = entry("e2", createdSourceIds({ source: { id: "r" }, deduped: "exact_duplicate" }));
    const log = [second, first];
    expect(withoutSharedSourceIds(second, log).sourceIds).toEqual([]);
    expect(withoutSharedSourceIds(first, log).sourceIds).toEqual(["r"]);
  });

  test("이미 적힌 옛 허브 항목 E2=[R] 을 /import 에서 철회해도 E1 의 R 은 지우지 않는다", () => {
    // 두 화면이 같은 로그를 그리고 같은 이 함수로 판정한다. 로그에는 파일 가져오기
    // 항목도 섞여 있다.
    const e1 = entry("e1", ["r"]);
    const legacyE2 = entry("e2", ["r"]);
    const fileImport = entry("f1", ["x", "y"], "file");
    expect(withoutSharedSourceIds(legacyE2, [legacyE2, fileImport, e1]).sourceIds).toEqual([]);
    // 마지막으로 가리키던 항목이 남으면 그때는 지운다.
    expect(withoutSharedSourceIds(e1, [fileImport, e1]).sourceIds).toEqual(["r"]);
  });

  test("공유가 없으면 그 항목의 행을 모두 지운다", () => {
    const target = entry("e2", ["b1", "b2"]);
    expect(withoutSharedSourceIds(target, [target, entry("e1", ["a"])]).sourceIds).toEqual(["b1", "b2"]);
  });

  test("다른 항목이 가리키는 행만 빼고 순서는 그대로 둔다", () => {
    const target = entry("e3", ["a", "shared", "b"]);
    const log = [target, entry("e2", ["shared"]), entry("e1", ["z"])];
    expect(withoutSharedSourceIds(target, log).sourceIds).toEqual(["a", "b"]);
  });

  test("id 가 같은 항목은 '다른 항목' 이 아니다 - 철회가 id 로 함께 뺀다", () => {
    // removeImportHistory 는 id 로 거른다. 같은 id 의 항목이 둘이면 둘 다 빠지므로
    // 서로의 행을 붙잡으면 아무도 가리키지 않는 행이 남는다.
    const target = entry("same", ["r"]);
    expect(withoutSharedSourceIds(target, [target, entry("same", ["r"])]).sourceIds).toEqual(["r"]);
  });

  test("로그에서 이미 빠진 항목이어도 로그가 가리키는 행은 지우지 않는다", () => {
    // 다른 화면이 먼저 뺐거나, 50건 상한에 밀려났다.
    const gone = entry("e0", ["r", "s"]);
    expect(withoutSharedSourceIds(gone, [entry("e1", ["r"])]).sourceIds).toEqual(["s"]);
  });

  test("로그가 비어 있으면 그 항목의 행을 모두 지운다", () => {
    expect(withoutSharedSourceIds(entry("e1", ["r"]), []).sourceIds).toEqual(["r"]);
  });

  test("한 항목 안에 겹친 id 는 한 번만 센다", () => {
    // 지운 수를 요청한 수와 비교하므로, 겹친 id 가 있으면 멀쩡한 철회가 되읽기로 간다.
    expect(withoutSharedSourceIds(entry("e1", ["r", "r", "s"]), []).sourceIds).toEqual(["r", "s"]);
  });

  test("입력을 바꾸지 않고 나머지 필드는 그대로 돌려준다", () => {
    const target = entry("e2", ["r", "s"]);
    const other = entry("e1", ["r"]);
    const narrowed = withoutSharedSourceIds(target, [target, other]);
    expect(narrowed).toEqual({ ...target, sourceIds: ["s"] });
    expect(target.sourceIds).toEqual(["r", "s"]);
    expect(other.sourceIds).toEqual(["r"]);
  });
});
