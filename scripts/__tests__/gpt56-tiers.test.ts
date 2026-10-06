// REQ-260823-03 §1-§2: gpt-5.6 ships as tiered ids, and the refresher could not
// see them.
//
// gpt-5.6 went GA on 2026-07-09 as gpt-5.6-sol / -terra / -luna, and on
// 2026-08-23 the refresher still chose 5.5. Not a bug in the matching so much
// as a consequence of its design: openai-frontier's `match` is a SHAPE
// ALLOWLIST that admits only bare generation slugs, which is exactly what kept
// gpt-5-search-api out of the reasoning seats in August. Loosening it to let
// tiers in would have re-opened that hole, so the tiers are admitted by name.
//
// Simon's placement, which the tests below encode:
//   terra = the general default, chat and OCR included
//   sol   = highest difficulty and cross-validation only
//   luna  = never
//
// S0.5 (2026-10-07) deleted the cross-validation pipeline with its only,
// unreachable caller, and the openai-sol seat with it. sol therefore has no
// seat at all now: the "sol" describe below pins that it stays unreachable
// (and out of the general seat) instead of pinning a seat that no longer exists.
//
// The luna ban is the assertion that matters most here, because it is the one
// that cannot be walked back cheaply: a banned model reaching a general seat
// is a cost and a policy event at once, and it would look like a normal
// promotion in the log.

import { SEATS, COST_AXIS, pickNewest, secretsFor, type SeatClass } from "../refresh-models";

const seat = (id: string): SeatClass => {
  const s = SEATS.find((x) => x.id === id);
  if (!s) throw new Error(`seat not found: ${id}`);
  return s;
};

// A plausible listing for the day 5.6 lands, including the shapes that have
// bitten this seat before.
const LISTING = [
  "gpt-4.1",
  "gpt-5",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.6-mini",
  "gpt-5-search-api-2025-10-14",
  "gpt-5-codex",
  "gpt-5-2025-08-07",
  "gpt-5.4-nano",
];

describe("luna is unreachable", () => {
  test("no seat can select it", () => {
    for (const s of SEATS) {
      expect(pickNewest(LISTING, s)).not.toBe("gpt-5.6-luna");
    }
  });

  test("it is not merely excluded - it never matches", () => {
    // The difference matters. An exclude is a denylist, and this file's own
    // history is that denylists open quietly when a new variant appears. The
    // ban is enforced by the allowlist naming one tier; the exclude is a
    // second layer, not the layer.
    expect(seat("openai-frontier").match.test("gpt-5.6-luna")).toBe(false);
    // And the name is still written into the exclude, so the ban does not
    // rest on one regex character. (openai-sol carried the same pair until S0.5.)
    expect(seat("openai-frontier").exclude?.source).toContain("luna");
    for (const s of SEATS) {
      if (s.vendor === "openai") expect(s.match.test("gpt-5.6-luna")).toBe(false);
    }
  });
});

describe("terra is the general default", () => {
  test("the frontier seat picks terra over the older bare generation", () => {
    expect(pickNewest(LISTING, seat("openai-frontier"))).toBe("gpt-5.6-terra");
  });

  test("sol never reaches the general seat", () => {
    // The whole point of splitting the two seats. If one seat matched both
    // tiers they would tie on versionKey (which does not read the suffix) and
    // the general seat's tier would be decided by sort order.
    expect(seat("openai-frontier").match.test("gpt-5.6-sol")).toBe(false);
  });

  test("a bare generation still works, for the versions that have no tiers", () => {
    expect(pickNewest(["gpt-5.4", "gpt-5.5"], seat("openai-frontier"))).toBe("gpt-5.5");
  });

  test("a same-version tie resolves to terra rather than to sort order", () => {
    // versionKey ignores the suffix, so gpt-5.6 and gpt-5.6-terra are [5,6]
    // both ways. Without the tiebreak the winner is whichever the sort happens
    // to leave first - an arbitrary choice between two different prices.
    expect(pickNewest(["gpt-5.6", "gpt-5.6-terra"], seat("openai-frontier"))).toBe("gpt-5.6-terra");
    expect(pickNewest(["gpt-5.6-terra", "gpt-5.6"], seat("openai-frontier"))).toBe("gpt-5.6-terra");
  });

  test("the shapes that bit this seat before are still rejected", () => {
    const s = seat("openai-frontier");
    for (const bad of ["gpt-5-search-api-2025-10-14", "gpt-5-codex", "gpt-5-2025-08-07", "gpt-5.4-nano", "gpt-5.6-mini"]) {
      expect(pickNewest([bad], s)).toBeNull();
    }
  });
});

describe("sol has no seat since S0.5, and stays out of general routing", () => {
  test("the openai-sol seat is gone, from the seat list and the cost axes", () => {
    expect(SEATS.find((x) => x.id === "openai-sol")).toBeUndefined();
    expect(Object.values(COST_AXIS).flat()).not.toContain("openai-sol");
  });

  test("no seat selects the sol tier", () => {
    for (const s of SEATS) {
      expect(pickNewest(LISTING, s)).not.toBe("gpt-5.6-sol");
      expect(pickNewest(["gpt-5.6-sol"], s)).toBeNull();
    }
  });

  test("a stray sol decision writes no secret, and never the purpose map", () => {
    // OPENAI_CROSSCHECK_MODEL was the dedicated name that kept sol out of
    // OPENAI_PURPOSE_MODELS. With the seat gone nothing may write either: the
    // moment sol lands in the purpose map it becomes reachable by purpose,
    // which is exactly the placement Simon ruled out.
    const out = secretsFor([
      { seat: { id: "openai-sol" }, chosen: "gpt-5.6-sol" },
      { seat: { id: "openai-frontier" }, chosen: "gpt-5.6-terra" },
    ]);
    expect(out.map((s) => s.name)).not.toContain("OPENAI_CROSSCHECK_MODEL");
    expect(out.map((s) => s.value)).not.toContain("gpt-5.6-sol");

    const purposeMap = JSON.parse(out.find((s) => s.name === "OPENAI_PURPOSE_MODELS")!.value);
    expect(Object.values(purposeMap)).not.toContain("gpt-5.6-sol");
    for (const model of Object.values(purposeMap)) expect(model).toBe("gpt-5.6-terra");
  });
});
