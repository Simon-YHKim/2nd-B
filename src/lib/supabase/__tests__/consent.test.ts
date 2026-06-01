// PR-5 (task B): consent ledger writer. Verifies recordConsent maps args to the
// consent_records row shape (versions stamped server-side from constants) and
// propagates DB errors. The notice/ack UI that drives this is a later surface.

jest.mock("../client", () => {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn(() => ({ insert }));
  const mock = { from };
  return { getSupabaseClient: () => mock, __mock: mock, __insert: insert };
});

import {
  recordConsent,
  recordConsentBestEffort,
  CONSENT_VERSION,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from "../consent";

const { __mock, __insert } = require("../client") as {
  __mock: { from: jest.Mock };
  __insert: jest.Mock;
};

describe("recordConsent", () => {
  beforeEach(() => {
    __insert.mockClear();
    __mock.from.mockClear();
    __insert.mockResolvedValue({ error: null });
  });

  test("appends a consent_records row with stamped versions + acks", async () => {
    await recordConsent({
      userId: "u1",
      ageBand: "minor_self",
      minorTier: "minor_self",
      locale: "ko",
      purposes: ["service"],
      requiredAck: true,
      llmProcessingAck: true,
      overseasTransferAck: true,
      sensitiveDataAck: true,
    });

    expect(__mock.from).toHaveBeenCalledWith("consent_records");
    const row = __insert.mock.calls[0]![0]!;
    expect(row.user_id).toBe("u1");
    expect(row.age_band).toBe("minor_self");
    expect(row.minor_tier).toBe("minor_self");
    // Versions are stamped from the module constants, never client-supplied.
    expect(row.consent_version).toBe(CONSENT_VERSION);
    expect(row.policy_version).toBe(PRIVACY_POLICY_VERSION);
    expect(row.terms_version).toBe(TERMS_VERSION);
    expect(row.overseas_transfer_ack).toBe(true);
    expect(row.sensitive_data_ack).toBe(true);
    // Defaults for unset optional fields.
    expect(row.optional_consents).toEqual({});
    expect(row.ip_hash).toBeNull();
  });

  test("propagates a DB insert error", async () => {
    __insert.mockResolvedValueOnce({ error: new Error("db down") });
    await expect(
      recordConsent({
        userId: "u1",
        ageBand: "adult",
        locale: "en",
        purposes: [],
        requiredAck: true,
        llmProcessingAck: false,
        overseasTransferAck: false,
        sensitiveDataAck: false,
      }),
    ).rejects.toThrow("db down");
  });

  test("version constants are non-empty (must track published docs)", () => {
    expect(CONSENT_VERSION.length).toBeGreaterThan(0);
    expect(PRIVACY_POLICY_VERSION.length).toBeGreaterThan(0);
    expect(TERMS_VERSION.length).toBeGreaterThan(0);
  });

  describe("recordConsentBestEffort (sign-up path)", () => {
    test("returns true and writes when the ledger is available", async () => {
      __insert.mockResolvedValueOnce({ error: null });
      const ok = await recordConsentBestEffort({
        userId: "u1",
        ageBand: "adult",
        locale: "en",
        purposes: ["service"],
        requiredAck: true,
        llmProcessingAck: true,
        overseasTransferAck: true,
        sensitiveDataAck: true,
      });
      expect(ok).toBe(true);
      expect(__mock.from).toHaveBeenCalledWith("consent_records");
    });

    test("swallows a DB error (table missing pre-migration) and returns false", async () => {
      __insert.mockResolvedValueOnce({ error: new Error('relation "consent_records" does not exist') });
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const ok = await recordConsentBestEffort({
        userId: "u1",
        ageBand: "minor_self",
        minorTier: "minor_self",
        locale: "ko",
        purposes: ["service"],
        requiredAck: true,
        llmProcessingAck: true,
        overseasTransferAck: true,
        sensitiveDataAck: true,
      });
      expect(ok).toBe(false); // never throws -> sign-up is not blocked
      warn.mockRestore();
    });
  });
});
