import { isLexiconScanAllowed } from "../lexicon";

/**
 * Locks the forbidden-lexicon scan allowlist matcher (used by
 * scripts/check-forbidden-lexicon.ts). The matcher must treat a `dir/**` entry
 * as "paths strictly under dir/", never as a bare prefix — otherwise a forbidden
 * term hiding in a sibling path (e.g. docs/legacy-quarantine, or db/seed.sql vs
 * the db/seed/** entry) is silently skipped and the safety gate is weakened.
 */
describe("lexicon scan allowlist matching", () => {
  test("allows files under a /** directory entry", () => {
    expect(isLexiconScanAllowed("docs/legacy/old-concept.md")).toBe(true);
    expect(isLexiconScanAllowed("docs/research/paper.md")).toBe(true);
  });

  test("allows exact-path entries exactly", () => {
    expect(isLexiconScanAllowed("src/lib/safety/lexicon.ts")).toBe(true);
    expect(isLexiconScanAllowed("src/app/index.tsx")).toBe(true);
    expect(isLexiconScanAllowed("locales/en/safety.json")).toBe(true);
  });

  test("does NOT allow sibling paths that only share a /** dir's prefix", () => {
    expect(isLexiconScanAllowed("docs/legacy-quarantine/note.md")).toBe(false);
    expect(isLexiconScanAllowed("docs/legacyfoo.md")).toBe(false);
    // db/seed.sql is NOT under db/seed/, so the db/seed/** entry must not cover it.
    expect(isLexiconScanAllowed("db/seed.sql")).toBe(false);
  });

  test("does NOT allow arbitrary scanned surfaces", () => {
    expect(isLexiconScanAllowed("src/app/big-five.tsx")).toBe(false);
    expect(isLexiconScanAllowed("locales/en/home.json")).toBe(false);
  });
});
