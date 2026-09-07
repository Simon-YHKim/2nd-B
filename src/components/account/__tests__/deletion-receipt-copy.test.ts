import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// 서버가 "못 끝냈다"고 말한 것과 서버가 아무 말도 안 한 것은 다른 사실이다.
//
// `delete-bulk.ts:200-221` 이 세 값의 뜻을 못박는다:
//   true  = 확인됨
//   false = 서버가 그 정리를 끝내지 **못했다고 보고**함
//   null  = 서버가 아무 말도 안 함 (옛 배포는 필드 자체가 없다)
// 그 파일은 "Collapsing null into false would report a residual nobody
// observed; collapsing it into true would hide one. Neither is honest, so both
// stay visible" 라고 적고 자료구조에서 둘을 갈라 놓았다.
//
// ⚠ 그런데 **화면 문구가 다시 합쳤다.** 자료구조는 갈라져 있는데 사용자가
// 읽는 문장은 둘 다 "확인하지 못했다" 였다. 사용자가 **다음에 할 행동이
// 다르다** - 서버가 못 끝냈다고 말했으면 문의할 일이고, 아무 말도 안 했으면
// 확인할 일이다.
//
// 옆 파일의 하네스(account-deletion-notice.test.ts)가 아무것도 안 본 것은
// 아니다 - 키 집합, title·notReported·scope·support 문구, es/pt/id === en 을
// 못박는다. 다만 **세 값이 고르는 문구 자체**는 자리가 비어 있었다. 실측:
// 한국어 문구만 되돌리는 변이가 그 하네스를 통째로 통과한다(영어만 바꾸는
// 변이는 es/pt/id 거울 단언에 걸리지만, 그건 구조가 걸린 것이지 뜻이 아니다).
//
// 이 검사가 그 빈 자리를 덮는다: 키가 아니라 **실제 번들 문구**를 읽는다.
const COMPONENT = "src/components/account/AccountDeletionNotice.tsx";
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

/** 컴포넌트에 실제로 있는 `observationKey` 선언을 그대로 떼어 쓴다. 재구현이 아니다. */
function loadObservationKey(): (value: boolean | null) => string {
  const source = fs.readFileSync(path.join(process.cwd(), COMPONENT), "utf8");
  const ast = ts.createSourceFile(COMPONENT, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "observationKey" && node.initializer) {
      expression = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error("observationKey 선언을 찾지 못했다");
  const js = ts.transpileModule(`const fn = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(`${js}\nreturn fn;`)() as (value: boolean | null) => string;
}

const observationKey = loadObservationKey();
const bundles = LOCALES.map(code => {
  const raw = fs.readFileSync(path.join(process.cwd(), "locales", code, "consent.json"), "utf8");
  return [code, JSON.parse(raw).account.deletionReceipt as Record<string, unknown>] as const;
});
const bundle = (code: (typeof LOCALES)[number]) => bundles.find(entry => entry[0] === code)![1];

/** 사용자가 실제로 읽는 문장. 키가 아니라 문구다. */
function copyFor(source: Record<string, unknown>, value: boolean | null): string {
  const text = source[observationKey(value)];
  if (typeof text !== "string") throw new Error(`문구가 없다: ${observationKey(value)}`);
  return text;
}

test("세 값이 모두 실제 문구를 갖고, 서로 다른 문장이다", () => {
  const collapsed = bundles
    .filter(([, source]) => new Set([true, false, null].map(value => copyFor(source, value))).size !== 3)
    .map(([code]) => code);
  expect(collapsed).toEqual([]);
});

test("서버가 못 끝냈다고 보고한 것을 '확인하지 못했다'로 말하지 않는다", () => {
  // 이 정규식은 `null`(서버 무응답) 쪽 문구가 쓰는 헤지 표현이다. 같은 표현이
  // `false` 에 나타나면 두 사실이 한 문장으로 합쳐진 것이다.
  const hedge = /could not be confirmed|확인하지 못했어요/;
  const hedged = bundles.filter(([, source]) => hedge.test(copyFor(source, false))).map(([code]) => code);
  expect(hedged).toEqual([]);
});

test("문구가 말한 주체를 밝힌다 - 서버가 보고한 것이다", () => {
  expect(copyFor(bundle("en"), false)).toMatch(/server/i);
  expect(copyFor(bundle("ko"), false)).toMatch(/서버/);
});

test("부분 실패가 확인된 계정 삭제를 뒤집은 것처럼 읽히지 않는다", () => {
  // 서버가 프로필 행을 못 지웠다고 말하면 사용자는 "삭제가 실패했나" 로 읽고
  // 다시 시도하려 한다. 그런데 재시도할 계정이 이미 없다 - `deleted: true` 는
  // 이 영수증이 존재하기 위한 전제다. 같은 부류의 다른 문구
  // (`localPurge.unconfirmed`, `localSignOut.unconfirmed`)가 이미 이 안전
  // 문장을 달고 있으므로 이 문구도 같은 가족이어야 한다.
  expect(copyFor(bundle("en"), false)).toMatch(/does not undo the confirmed account deletion/i);
  expect(copyFor(bundle("ko"), false)).toMatch(/확인된 계정 삭제가 취소/);
});

test("서버 무응답·확인됨 문구는 그대로 남는다", () => {
  // 위 검사들이 `false` 를 옮기다가 나머지 둘까지 같이 끌고 가지 않도록 고정한다.
  expect(copyFor(bundle("en"), null)).toMatch(/no usable result was returned/i);
  expect(copyFor(bundle("en"), true)).toMatch(/observed absent when checked/i);
});
