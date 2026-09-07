// The chat screen must gate on the ALLOWANCE, never on the bare tier cap.
//
// checkChatLimit returns the cap and the allowance as separate fields on
// purpose: `limit` is the tier's daily cap and never includes a rewarded-ad
// bonus, while the real wall is `cap + adBonus` -- the same gate the server RPC
// applies (`count < cap + ad_bonus`).
//
// src/app/secondb.tsx did not know adBonus existed. It derived
// `CHAT_DAILY_LIMIT[tier]` and drove the composer, the paywall prompt, the
// at-limit styling and the rewarded sheet off that bare cap. So the engine
// would have accepted the turn, the database would have accepted the turn, and
// the button was disabled anyway: a user who watched a rewarded ad earned a
// bonus they could not spend. Nothing logged it, because nothing failed --
// the send simply never happened.
//
// It was not shipped when this was found: HAS_LIVE_AD_UNIT is false, so adBonus
// is always 0 in production today. It would have activated on ad launch, which
// is the first time the rewarded flow meets real users and the worst possible
// moment to discover it.
//
// Component render tests are blocked in this repo (RN upstream), so the screen
// half is pinned by reading the source, the way focus-refetch-contract and
// home-cta-design-system already pin this same file.

import { readFileSync } from "node:fs";
import path from "node:path";

import { CHAT_DAILY_LIMIT, chatAllowance, checkChatLimit } from "../limits";

const root = path.resolve(__dirname, "../../../..");
const screen = readFileSync(path.join(root, "src/app/secondb.tsx"), "utf8");

describe("chatAllowance", () => {
  it("widens the tier cap by today's bonus", () => {
    expect(chatAllowance("soma", 0)).toBe(CHAT_DAILY_LIMIT.soma);
    expect(chatAllowance("soma", 2)).toBe(CHAT_DAILY_LIMIT.soma + 2);
  });

  it("ignores a negative bonus rather than shrinking the cap", () => {
    // A bad row must never make the client stricter than the tier it paid for.
    expect(chatAllowance("soma", -5)).toBe(CHAT_DAILY_LIMIT.soma);
  });

  it("is the number checkChatLimit measures remaining against", () => {
    // One source, so the screen and the engine cannot drift apart again.
    const used = 3;
    const bonus = 2;
    const check = checkChatLimit("soma", used, bonus);
    expect(check.remaining).toBe(chatAllowance("soma", bonus) - used);
    // ...and `limit` stays the CAP, which is why gating on it was wrong.
    expect(check.limit).toBe(CHAT_DAILY_LIMIT.soma);
    expect(check.limit).not.toBe(chatAllowance("soma", bonus));
  });
});

describe("the chat screen gates on the allowance", () => {
  it("reads today's bonus at all", () => {
    // The original defect in one assertion: this file used to contain zero
    // occurrences of adBonus.
    expect(screen).toContain("readChatUsageDetail");
    expect(screen).toContain("setAdBonusToday");
    expect(screen).toContain("chatAllowance(progression.tier, adBonusToday)");
  });

  it("never compares usage against the bare cap", () => {
    // Every gate -- composer, at-limit styling, paywall funnel, rewarded sheet
    // -- must read `allowance`. A single `limit` comparison left behind puts
    // the wall back at the cap for whichever surface it guards.
    expect(screen).not.toMatch(/usedToday\s*[<>]=?\s*limit\b/);
    expect(screen).not.toMatch(/\blimit\s*-\s*\(?usedToday/);
    expect(screen).toMatch(/usedToday\s*<\s*allowance\b/);
    expect(screen).toMatch(/usedToday\s*>=\s*allowance\b/);
  });

  it("re-reads usage after a rewarded grant, or the wall never moves", () => {
    // Granting the bonus changes the allowance on the server. Without a
    // re-read the client keeps the old wall and the composer stays locked --
    // which is exactly the state this change removes, reintroduced one layer
    // up. The old comment here claimed "the user just sends again"; they
    // could not, because there was nothing to send with.
    const grants = screen.split("await grantChatAdBonus(userId);").length - 1;
    expect(grants).toBeGreaterThan(0);
    const refreshes = screen.split("await refreshChatUsage();").length - 1;
    expect(refreshes).toBe(grants);
  });
});
