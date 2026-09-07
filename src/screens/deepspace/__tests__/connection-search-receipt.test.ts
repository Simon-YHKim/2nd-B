import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// 아무것도 못 찾았는데 세컨비가 "찾아냈다" 표정을 짓는다.
//
// `/connect` 의 "연결 찾기" 버튼은 `proposeAllRelatedLinks` 를 돌리고 그 결과를
// **버린다**. 그 함수는 `{ pagesScanned, proposed }` 를 돌려주는데, 화면은
// 개수를 보지 않고 곧바로 `reactExpression("smug")` 을 부른다. 그 표정은
// 저장소 안에서 이름이 붙어 있는 것이다 -
// `CompanionSprite.tsx` 의 `EXPRESSION_BY_EVENT` 가 `connectionFound: "smug"`.
//
// 즉 **제안이 0건이어도 마스코트가 "연결을 찾아냈다" 를 연기한다.** 예외도
// 없고 화면도 안 죽는다. 앱이 하지 않은 일을 했다고 주장하는 것이고, 이
// 저장소가 마스코트 발화에 CI 게이트를 둔 이유가 그것이다.
//
// 이 검사는 표정 자체를 판정하지 않는다. **개수를 보고 갈라지는가**만 본다.
const SCREEN = resolve(__dirname, "../DeepSpaceDesignScreens.tsx");
const SOURCE = readFileSync(SCREEN, "utf8");
const AST = ts.createSourceFile(SCREEN, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** `findProposals` 선언 전체 텍스트. */
function findProposalsSource(): string {
  let found: string | null = null;
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(AST) === "findProposals") {
      found = node.getText(AST);
    }
    node.forEachChild(walk);
  };
  walk(AST);
  if (!found) throw new Error("findProposals not found");
  return found;
}

const BODY = findProposalsSource();

test("함수를 실제로 찾았다 - 0건 통과를 막는다", () => {
  expect(BODY.length).toBeGreaterThan(200);
  expect(BODY).toContain("proposeAllRelatedLinks");
  expect(BODY).toContain("reactExpression");
});

test("제안 개수를 버리지 않는다", () => {
  expect(BODY).toMatch(/(const|let)\s*\{?[^=]*\}?\s*=\s*await\s+proposeAllRelatedLinks/);
});

test("찾아냈다는 표정이 개수 뒤에 온다 - 무조건이 아니다", () => {
  // smug 는 EXPRESSION_BY_EVENT 에서 connectionFound 에 묶인 표정이다.
  // 개수를 보지 않고 부르면 0건에도 "찾아냈다" 가 연기된다.
  const smug = BODY.indexOf('reactExpression("smug")');
  expect(smug).toBeGreaterThan(0);
  const before = BODY.slice(0, smug);
  expect(before).toMatch(/if\s*\(/);
  expect(before).toMatch(/proposed/);
});

test("결정이 개수마다 다른 답을 낸다", () => {
  // 소스에서 그 조건식을 꺼내 진리표를 돌린다. 모양이 아니라 동작을 본다.
  const binding = /(?:const|let)\s*\{([^}]*)\}\s*=\s*await\s+proposeAllRelatedLinks/.exec(BODY);
  expect(binding).not.toBeNull();
  const name = binding![1].split(",").map(s => s.trim().split(":").pop()!.trim()).find(Boolean);
  expect(name).toBeTruthy();
  const guard = new RegExp(`if\\s*\\(([^)]*${name}[^)]*)\\)`).exec(BODY);
  expect(guard).not.toBeNull();
  const decide = new Function(name!, `return Boolean(${guard![1]});`) as (n: number) => boolean;
  expect(decide(2)).toBe(true); // 찾았다 → 축하해도 된다
  expect(decide(0)).toBe(false); // 못 찾았다 → 축하하지 않는다
});

test("두 갈래가 **각각** 사용자에게 말한다", () => {
  // ⚠ 처음에는 그냥 `setAnnounce(` 가 있는지만 봤다. 변이 검증이 뚫었다 -
  // 빈 결과 쪽 알림을 통째로 지워도 **찾았을 때 쪽 호출** 때문에 통과했다.
  // 함수 안 어딘가에 있는지가 아니라, **갈래마다** 있는지를 물어야 한다.
  //
  // 표정만 바꾸고 말을 안 하면 버튼을 눌렀는데 아무 일도 안 일어난 것처럼
  // 보인다. 스크린리더 사용자에게는 그 알림이 유일한 신호다.
  const elseAt = BODY.indexOf("} else {");
  expect(elseAt).toBeGreaterThan(0);
  const found = BODY.slice(0, elseAt);
  const empty = BODY.slice(elseAt);
  expect(found).toMatch(/setAnnounce\(/);
  expect(empty).toMatch(/setAnnounce\(/);
  // 그리고 두 갈래가 **다른** 문구를 쓴다 - 같은 문구면 갈라 놓은 의미가 없다.
  const keyOf = (s: string) => /setAnnounce\(t\("([^"]+)"\)\)/.exec(s)?.[1];
  expect(keyOf(found)).toBeTruthy();
  expect(keyOf(empty)).toBeTruthy();
  expect(keyOf(found)).not.toBe(keyOf(empty));
});

describe("문구가 다섯 로케일에 있다", () => {
  const KEYS = ["connectionsFound", "connectionsNoneFound"] as const;
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

  test.each(LOCALES)("%s", locale => {
    const bundle = JSON.parse(
      readFileSync(resolve(__dirname, `../../../../locales/${locale}/deepspace.json`), "utf8"),
    ) as Record<string, unknown>;
    for (const key of KEYS) {
      expect(typeof bundle[key]).toBe("string");
      expect((bundle[key] as string).length).toBeGreaterThan(0);
    }
  });

  test("개수를 명사에 붙이지 않는다", () => {
    // 이 저장소에는 복수형 키(_one/_other)가 하나도 없다. 숫자를 명사에
    // 붙이면 "1 connections" 가 나온다. 그래서 문구는 개수를 쓰지 않는다.
    const en = JSON.parse(
      readFileSync(resolve(__dirname, "../../../../locales/en/deepspace.json"), "utf8"),
    ) as Record<string, string>;
    for (const key of KEYS) expect(en[key]).not.toMatch(/\{\{count\}\}/);
  });
});
