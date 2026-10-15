import { FACES, type Expression } from "../faces";
import { hustlekExpressionFor } from "../hustlek-expression";
import { HUSTLEK_EXPRESSIONS } from "@/lib/assets/hustlek";

test("every existing app reaction resolves to an available supplied portrait", () => {
  for (const expression of Object.keys(FACES) as Expression[]) {
    expect(HUSTLEK_EXPRESSIONS[hustlekExpressionFor(expression)]).toBeDefined();
  }
});

test("thinking, completion, concern and idle keep distinct readable expressions", () => {
  expect(hustlekExpressionFor("thinking")).toBe("B04");
  expect(hustlekExpressionFor("happy")).toBe("A04");
  expect(hustlekExpressionFor("negative")).toBe("C07");
  expect(hustlekExpressionFor("sleepy")).toBe("D10");
  expect(hustlekExpressionFor("neutral")).toBe("A01");
});
