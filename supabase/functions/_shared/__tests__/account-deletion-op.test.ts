import { createHash, createHmac } from "node:crypto";

import {
  OP_TOKEN_RE,
  issueOpToken,
  opTokenHashHex,
  opTokenMessage,
  parseDeleteAccountBody,
  parseReceiptLookupBody,
  publicReceipt,
  recoveryRow,
  sweepsForRecord,
  verifyOpToken,
} from "../account-deletion-op";

const PEPPER = "p".repeat(40);
const OP = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11";
const OWNER = "5f1d6a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const OTHER = "5f1d6a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5c";
const MS = 1_791_300_000_123;

describe("op token (0217 I4)", () => {
  test("is the v1 base64url HMAC of op, owner and issue time under the pepper", async () => {
    const token = await issueOpToken(PEPPER, OP, OWNER, MS);
    expect(token).toMatch(OP_TOKEN_RE);
    const expected = createHmac("sha256", PEPPER).update(opTokenMessage(OP, OWNER, MS)).digest("base64url");
    expect(token).toBe(`v1.${expected}`);
    expect(opTokenMessage(OP, OWNER, MS)).toBe(`account-deletion-op:v1|${OP}|${OWNER}|${MS}`);
  });

  test("verifies only for the same op, owner, issue time and pepper", async () => {
    const token = await issueOpToken(PEPPER, OP, OWNER, MS);
    await expect(verifyOpToken(PEPPER, token, OP, OWNER, MS)).resolves.toBe(true);
    await expect(verifyOpToken(PEPPER, token, OP, OTHER, MS)).resolves.toBe(false);
    await expect(verifyOpToken(PEPPER, token, OP, OWNER, MS + 1)).resolves.toBe(false);
    await expect(verifyOpToken(PEPPER, token, OTHER, OWNER, MS)).resolves.toBe(false);
    await expect(verifyOpToken("q".repeat(40), token, OP, OWNER, MS)).resolves.toBe(false);
    const flipped = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    await expect(verifyOpToken(PEPPER, flipped, OP, OWNER, MS)).resolves.toBe(false);
    await expect(verifyOpToken(PEPPER, "v2.x", OP, OWNER, MS)).resolves.toBe(false);
  });

  test("refuses a short pepper and malformed input instead of signing it", async () => {
    await expect(issueOpToken("short", OP, OWNER, MS)).rejects.toThrow();
    await expect(issueOpToken(PEPPER, "OP", OWNER, MS)).rejects.toThrow();
    await expect(issueOpToken(PEPPER, OP, OWNER, 0)).rejects.toThrow();
    await expect(verifyOpToken("short", "v1." + "A".repeat(43), OP, OWNER, MS)).resolves.toBe(false);
  });

  test("the database sees sha256(token) as lowercase hex, never the token", async () => {
    const token = await issueOpToken(PEPPER, OP, OWNER, MS);
    await expect(opTokenHashHex(token)).resolves.toBe(createHash("sha256").update(token).digest("hex"));
  });
});

describe("delete-account bodies", () => {
  test("accepts the old `{}`, begin and execute, exactly", async () => {
    const token = await issueOpToken(PEPPER, OP, OWNER, MS);
    expect(parseDeleteAccountBody("{}")).toEqual({ kind: "legacy" });
    expect(parseDeleteAccountBody(JSON.stringify({ op: "begin", op_id: OP }))).toEqual({ kind: "begin", opId: OP });
    expect(parseDeleteAccountBody(JSON.stringify({ op: "execute", op_id: OP, op_token: token }))).toEqual({
      kind: "execute",
      opId: OP,
      opToken: token,
    });
  });

  test("refuses a target, extra keys, upper-case ids, a missing token and non-objects", async () => {
    const token = await issueOpToken(PEPPER, OP, OWNER, MS);
    for (const body of [
      "{ }",
      "[]",
      "null",
      "not json",
      JSON.stringify({ user_id: OWNER }),
      JSON.stringify({ op: "begin", op_id: OP, user_id: OWNER }),
      JSON.stringify({ op: "begin", op_id: OP.toUpperCase() }),
      JSON.stringify({ op: "execute", op_id: OP }),
      JSON.stringify({ op: "execute", op_id: OP, op_token: "v1.short" }),
      JSON.stringify({ op: "begin", op_id: OP, op_token: token }),
      JSON.stringify({ op: "delete", op_id: OP }),
    ]) {
      expect(parseDeleteAccountBody(body)).toBeNull();
    }
  });
});

describe("account-deletion-receipt bodies", () => {
  test("a receipt is asked by number; a device asks with its token and owner", async () => {
    const token = await issueOpToken(PEPPER, OP, OWNER, MS);
    expect(parseReceiptLookupBody({ op_id: OP })).toEqual({ kind: "receipt", opId: OP });
    expect(parseReceiptLookupBody({ op_id: OP, op_token: token, owner_id: OWNER })).toEqual({
      kind: "recover",
      opId: OP,
      opToken: token,
      ownerId: OWNER,
    });
    expect(parseReceiptLookupBody({ op_id: OP, op_token: token })).toBeNull();
    expect(parseReceiptLookupBody({ op_id: OP, owner_id: OWNER })).toBeNull();
    expect(parseReceiptLookupBody({ op_id: "x" })).toBeNull();
    expect(parseReceiptLookupBody({ receipt_id: OP })).toBeNull();
  });
});

describe("receipt shaping", () => {
  const row = {
    op_id: OP,
    status: "completed",
    finished_at: "2026-10-07T01:02:03+00:00",
    receipt_expires_at: "2027-10-07T01:02:03+00:00",
    sweeps: { profile_erased: true, raw_clippings_erased: null, owner_id: OWNER, email: "x@example.com" },
    sweeps_reported: true,
    token_issued_ms: MS,
    owner_id: OWNER,
  };

  test("copies only the receipt fields and drops anything the row might grow", () => {
    const receipt = publicReceipt(row, OP);
    expect(receipt).toEqual({
      op_id: OP,
      erased_at: "2026-10-07T01:02:03.000Z",
      expires_at: "2027-10-07T01:02:03.000Z",
      sweeps: { profile_erased: true, raw_clippings_erased: null },
      sweeps_reported: true,
      unrecorded: false,
    });
    expect(JSON.stringify(receipt)).not.toContain(OWNER);
    expect(JSON.stringify(receipt)).not.toContain(String(MS));
  });

  test("is null for another number, an open op or a broken row", () => {
    expect(publicReceipt(row, OTHER)).toBeNull();
    expect(publicReceipt({ ...row, status: "executing" }, OP)).toBeNull();
    expect(publicReceipt({ ...row, finished_at: "soon" }, OP)).toBeNull();
    expect(publicReceipt(null, OP)).toBeNull();
  });

  test("says so when the server confirmed an erasure the trigger did not record", () => {
    expect(publicReceipt({ ...row, sweeps: { unrecorded: true } }, OP)?.unrecorded).toBe(true);
  });

  test("a recovery row needs a known status and the issue time", () => {
    expect(recoveryRow(row, OP)).toEqual({ status: "completed", issuedMs: MS });
    expect(recoveryRow({ ...row, status: "done" }, OP)).toBeNull();
    expect(recoveryRow({ ...row, token_issued_ms: null }, OP)).toBeNull();
    expect(recoveryRow(row, OTHER)).toBeNull();
  });

  test("records only the six allow-listed sweep observations", () => {
    expect(sweepsForRecord({
      profile_erased: null,
      deletion_fenced: true,
      record_photos_empty_at_check: false,
      ...({ raw_clippings_removed: 3 } as object),
    })).toEqual({ profile_erased: null, deletion_fenced: true, record_photos_empty_at_check: false });
  });
});
