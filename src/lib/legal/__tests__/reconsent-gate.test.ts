// The re-consent gate encodes Simon's answers (re-consent report Q-261002-02..05, 2026-10-03;
// docs/legal/calendar-read-disclosure-draft-261002.md §7-2). It may switch on only once the
// revised privacy policy exists: until then there is nothing new to confirm.
import { readFileSync } from "node:fs";
import path from "node:path";

import { REQUIRED_ACK_KEYS } from "../../auth/consent-selections";
import {
  RECONSENT_EXITS,
  RECONSENT_GATE_ENABLED,
  reconsentGateMode,
  reconsentRecheckKeys,
  type ReconsentAccount,
} from "../reconsent-gate";

const ROOT = path.resolve(__dirname, "../../../..");
const adult: ReconsentAccount = { needsConfirmation: true, age: 30, emailVerified: true, aiConsent: "granted", canGrant: true };

describe("reconsentGateMode", () => {
  test("blocks an account that can consent and lists every required item, with the exits open (02 = A, 03 = A)", () => {
    expect(reconsentGateMode(adult, true)).toEqual({ kind: "block", recheck: REQUIRED_ACK_KEYS, exits: RECONSENT_EXITS });
    expect(RECONSENT_EXITS).toEqual(["settings", "account-deletion", "privacy-policy", "sign-out", "support"]);
  });

  test("14 to 17 consent for themselves, so they confirm like adults", () => {
    expect(reconsentGateMode({ ...adult, age: 14 }, true)).toMatchObject({ kind: "block" });
    expect(reconsentGateMode({ ...adult, age: 17 }, true)).toMatchObject({ kind: "block" });
  });

  test("accounts that cannot consent here only get a notice (05 = A)", () => {
    expect(reconsentGateMode({ ...adult, age: 13 }, true)).toEqual({ kind: "notice" });
    expect(reconsentGateMode({ ...adult, age: null }, true)).toEqual({ kind: "notice" });
    expect(reconsentGateMode({ ...adult, emailVerified: false }, true)).toEqual({ kind: "notice" });
  });

  test("an account the server cannot record a confirmation from is not blocked", () => {
    expect(reconsentGateMode({ ...adult, canGrant: false }, true)).toEqual({ kind: "notice" });
  });

  test("nothing shows once confirmed, or while the gate is off", () => {
    expect(reconsentGateMode({ ...adult, needsConfirmation: false }, true)).toEqual({ kind: "none" });
    expect(reconsentGateMode(adult, false)).toEqual({ kind: "none" });
  });

  test("the calendar has no box: it is asked when it is turned on (02 = A)", () => {
    const mode = reconsentGateMode(adult, true);
    expect(mode.kind === "block" && mode.recheck.some((key) => /calendar/i.test(key))).toBe(false);
  });
});

describe("reconsentRecheckKeys", () => {
  test("a withdrawn AI consent is not asked again, so the withdrawal stands", () => {
    const keys = reconsentRecheckKeys("revoked");
    expect(keys).not.toContain("llmProcessing");
    expect(keys).toEqual(REQUIRED_ACK_KEYS.filter((key) => key !== "llmProcessing"));
    expect(reconsentGateMode({ ...adult, aiConsent: "revoked" }, true)).toMatchObject({ kind: "block", recheck: keys });
  });

  test("everyone else re-checks all five, including blocked: AI being off for another reason is not a withdrawal", () => {
    expect(reconsentRecheckKeys("granted")).toEqual(REQUIRED_ACK_KEYS);
    expect(reconsentRecheckKeys("uncovered")).toEqual(REQUIRED_ACK_KEYS);
    expect(reconsentRecheckKeys("blocked")).toEqual(REQUIRED_ACK_KEYS);
    expect(REQUIRED_ACK_KEYS).toHaveLength(5);
  });
});

describe("switch", () => {
  test("stays off until the revised privacy policy (ko + en) covers the calendar", () => {
    const policy = readFileSync(path.join(ROOT, "docs/legal/privacy-policy.md"), "utf8");
    const revised = /캘린더/.test(policy) && /calendar/i.test(policy);
    if (!revised) expect(RECONSENT_GATE_ENABLED).toBe(false);
  });
});
