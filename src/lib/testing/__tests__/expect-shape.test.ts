import { expectShape, expectNoShape } from "../expect-shape";

// The helper's whole reason to exist is the failure message, so the message is
// what these tests assert. A helper whose message is untested is the same shape
// as the pattern it replaces: it goes red and tells you nothing.

interface Node {
  type: string;
  id?: string;
}

const nodes: Node[] = [
  { type: "Loader", id: "a" },
  { type: "Redirect", id: "b" },
];

test("일치하는 항목을 돌려준다 - 이어서 단언할 수 있게", () => {
  const found = expectShape(nodes, { type: "Redirect" });
  expect(found.id).toBe("b");
});

test("여러 키를 모두 만족해야 한다", () => {
  expect(() => expectShape(nodes, { type: "Loader", id: "b" })).toThrow();
  expect(expectShape(nodes, { type: "Loader", id: "a" }).type).toBe("Loader");
});

test("실패 메시지가 **목록에 실제로 있던 것**을 말한다", () => {
  let message = "";
  try {
    expectShape(nodes, { type: "AccountDeletionNoticePanel" }, "노드");
  } catch (e) {
    message = (e as Error).message;
  }
  // 이것이 이 헬퍼의 요점이다. 옛 패턴은 "Expected: true / Received: false" 만
  // 남겼고, 그 문장으로는 다음 행동을 정할 수 없다.
  expect(message).toContain("AccountDeletionNoticePanel");
  expect(message).toContain("Loader");
  expect(message).toContain("Redirect");
  expect(message).toContain("(2)");
});

test("빈 목록과 '없음' 을 다른 문장으로 가른다", () => {
  // 렌더가 통째로 아무것도 안 돌려준 것과, 돌려줬는데 그 항목이 없는 것은
  // **사람이 하는 다음 행동이 다르다.** 같은 false 로 보고하면 안 된다.
  let empty = "";
  try {
    expectShape([] as Node[], { type: "Panel" });
  } catch (e) {
    empty = (e as Error).message;
  }
  expect(empty).toContain("the list is EMPTY");

  let present = "";
  try {
    expectShape(nodes, { type: "Panel" });
  } catch (e) {
    present = (e as Error).message;
  }
  expect(present).not.toContain("the list is EMPTY");
});

test("긴 목록은 잘라서 보여주되 전체 개수를 말한다", () => {
  const many: Node[] = Array.from({ length: 20 }, (_, i) => ({ type: `T${i}` }));
  let message = "";
  try {
    expectShape(many, { type: "missing" });
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain("(20)");
  expect(message).toContain("12 more");
});

test("shape 가 비면 거부한다 - 무엇을 찾는지 안 적은 단언은 아무것도 안 지킨다", () => {
  expect(() => expectShape(nodes, {})).toThrow(/empty shape/);
});

test("expectNoShape 는 걸린 항목을 보여준다", () => {
  expect(() => expectNoShape(nodes, { type: "Panel" })).not.toThrow();
  let message = "";
  try {
    expectNoShape(nodes, { type: "Loader" }, "노드");
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain("found:");
  expect(message).toContain("Loader");
});
