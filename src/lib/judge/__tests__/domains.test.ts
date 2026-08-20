// C6, inverted (REQ-260820-04, 2026-08-21).
//
// This file used to assert that judge@xprize.org got unmetered AI. The contest
// ended 2026-08-15 and Simon ordered the remnant removed, so the property under
// test is now the opposite: NO email domain grants anything.
//
// That inversion is the whole point rather than bookkeeping. Comp by email
// domain handed out the TOP PAID TIER - effective_subscription_tier() reads
// judge_mode and returns 'brain' - from a string the user picks at sign-up. The
// list being empty is what makes that unreachable from the client, and 0138
// revoked the client's write access to the column so the empty list is not the
// only thing standing there.
//
// The parsing behaviour is still pinned. isJudgeEmail keeps its shape while the
// RBAC replacement (REQ-260821-02) is designed, and a future maintainer who
// re-points it at a real list should inherit working input handling rather than
// re-derive it.

import { isJudgeEmail, JUDGE_DOMAINS } from "../domains";

describe("no email domain grants comp access", () => {
  test("the list is empty", () => {
    expect(JUDGE_DOMAINS).toEqual([]);
  });

  test.each([
    "judge@xprize.org",
    "Judge@XPRIZE.ORG",
    "staff@devpost.com",
    "panel@hacker.fund",
    "nobody@gmail.com",
    "someone@example.com",
  ])("%s is not comped", (email) => {
    expect(isJudgeEmail(email)).toBe(false);
  });
});

describe("input handling is unchanged", () => {
  // Kept so the helper stays safe to re-point. A crash here would surface as a
  // blank sign-up screen, not as a wrong entitlement.
  test.each<[unknown, boolean]>([
    ["", false],
    ["user@", false],
    ["@xprize.org", false],
    ["no-at-sign", false],
    ["a@mail.xprize.org", false],
    [null, false],
    [undefined, false],
    [123, false],
    [{}, false],
    [[], false],
  ])("isJudgeEmail(%p) === %p", (input, expected) => {
    expect(isJudgeEmail(input as string)).toBe(expected);
  });

  test("multiple @ uses lastIndexOf (defensive)", () => {
    // Whatever the list holds later, the domain must be read from the LAST @ -
    // "a@b@evil.com" is one address whose domain is evil.com, and reading the
    // first @ would let a crafted local part impersonate a listed domain.
    expect(isJudgeEmail("a@b@example.com")).toBe(false);
  });
});
