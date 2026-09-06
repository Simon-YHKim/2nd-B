// peer-respond derives minority from birthYear. It does not ask the informant.
//
// The endpoint already refused an under-14 informant by computing
// `nowYear - birthYear < MIN_INFORMANT_AGE`, so it plainly trusted that number.
// One line later it stopped trusting it and read `body.informantIsMinor` instead,
// and that boolean decided BOTH whether guardian consent was required and what
// went into informant_consents.informant_is_minor / guardian_consent_at.
//
// A 15-year-old who posts their real birth year with informantIsMinor:false
// therefore passed the C10 floor (they are over 14) and skipped the guardian
// check (they said they were an adult) -- and the consent row recorded them as
// an adult who needed no guardian. The screen's checkbox
// (src/app/peer/[token].tsx) was the only thing standing there, and an informant
// has no account, so a request that never renders that screen is the ordinary
// case for this endpoint, not an exotic one.
//
// These are source-scan assertions, not behavioural ones: the function is Deno
// edge code that jest does not execute. That is the same shape as
// billing-self-service-migration.test.ts and paddle-key-expiry-watch.test.ts.
// The negative assertion is the load-bearing half -- it is what fails if someone
// reintroduces the client-trusting form.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "functions", "peer-respond", "index.ts"),
  "utf8",
);

describe("peer-respond: informant minority is server-derived", () => {
  test("the adult boundary is a named constant, not an inline literal", () => {
    expect(SOURCE).toMatch(/const ADULT_AGE = 18;/);
    // The floor it sits next to must survive too -- deriving minority is worthless
    // if the under-14 rejection is what got refactored away.
    expect(SOURCE).toMatch(/const MIN_INFORMANT_AGE = 14;/);
  });

  test("minority is computed from birthYear", () => {
    expect(SOURCE).toMatch(/nowYear - birthYear < ADULT_AGE/);
  });

  test("the client flag can only ADD minority, never remove it", () => {
    // `derived || claimed` is safe. `claimed || derived` is also safe, but
    // `derived && claimed` or a bare `claimed` is not, so pin the disjunction and
    // pin that the derived term is present in it.
    const assignment = /const isMinor = ([^;]+);/.exec(SOURCE);
    expect(assignment).not.toBeNull();
    const expr = assignment![1];
    expect(expr).toContain("nowYear - birthYear < ADULT_AGE");
    expect(expr).toContain("||");
    expect(expr).not.toContain("&&");
  });

  test("minority is NOT read from the request body alone", () => {
    // The regression. This exact line shipped, and it is what a future edit is
    // most likely to restore by "simplifying".
    expect(SOURCE).not.toMatch(/const isMinor = body\.informantIsMinor === true;/);
  });

  test("the guardian check and both stored fields still hang off that one value", () => {
    // If a later edit splits the derived value away from what gets written, the
    // consent ledger can disagree with the check that let the response through.
    expect(SOURCE).toMatch(/if \(isMinor && body\.guardianConsent !== true\)/);
    expect(SOURCE).toMatch(/informant_is_minor: isMinor/);
    expect(SOURCE).toMatch(/guardian_consent_at: isMinor \? now : null/);
  });
});
