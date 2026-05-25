// C6: judge whitelist. False positives = arbitrary users get unmetered AI.
// False negatives = real judges hit paywalls. Both fail the rulebook.

import { isJudgeEmail, JUDGE_DOMAINS } from "../domains";

describe("isJudgeEmail", () => {
  test.each<[unknown, boolean]>([
    ["judge@xprize.org", true],
    ["Judge@XPRIZE.ORG", true],
    ["staff@devpost.com", true],
    ["panel@hacker.fund", true],
    ["nobody@gmail.com", false],
    ["", false],
    ["user@", false],
    ["@xprize.org", false],
    ["no-at-sign", false],
    ["a@mail.xprize.org", false],
    [null, false],
    [undefined, false],
    [123, false],
  ])("isJudgeEmail(%j) === %s", (input, expected) => {
    expect(isJudgeEmail(input as string)).toBe(expected);
  });

  test("multiple @ uses lastIndexOf (defensive)", () => {
    expect(isJudgeEmail("a@b@xprize.org")).toBe(true);
  });

  test("whitelist has exactly the 3 documented domains", () => {
    expect([...JUDGE_DOMAINS].sort()).toEqual(["devpost.com", "hacker.fund", "xprize.org"]);
  });
});
