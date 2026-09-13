import { webcrypto } from "node:crypto";

import {
  createCheckoutBinding,
  verifyCheckoutBinding,
  verifyCheckoutBindingWithSecrets,
} from "../../../../supabase/functions/_shared/paddle-checkout-binding";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "current-checkout-binding-secret-32-bytes";
const PREVIOUS_SECRET = "previous-checkout-binding-secret-32-bytes";
const ISSUED_AT = 1_789_000_000;

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
});

describe("Paddle checkout ownership binding", () => {
  test("round-trips an exact HMAC-bound user, timestamp, and nonce", async () => {
    const binding = await createCheckoutBinding(SECRET, USER_ID, {
      issuedAt: ISSUED_AT,
      nonceBytes: new Uint8Array(16).fill(7),
    });

    expect(binding).toMatchObject({
      user_id: USER_ID,
      issued_at: ISSUED_AT,
      nonce: "07".repeat(16),
    });
    await expect(verifyCheckoutBinding(binding, SECRET, ISSUED_AT + 1)).resolves.toBe(USER_ID);
  });

  test("rejects tampering, expiry, and future-dated bindings", async () => {
    const binding = await createCheckoutBinding(SECRET, USER_ID, {
      issuedAt: ISSUED_AT,
      nonceBytes: new Uint8Array(16).fill(9),
    });

    await expect(verifyCheckoutBinding({ ...binding, user_id: "22222222-2222-4222-8222-222222222222" }, SECRET, ISSUED_AT)).resolves.toBeNull();
    await expect(verifyCheckoutBinding({ ...binding, signature: "0".repeat(64) }, SECRET, ISSUED_AT)).resolves.toBeNull();
    await expect(verifyCheckoutBinding(binding, SECRET, ISSUED_AT + 7 * 24 * 60 * 60 + 1)).resolves.toBeNull();
    await expect(verifyCheckoutBinding(binding, SECRET, ISSUED_AT - 301)).resolves.toBeNull();
  });

  test("supports bounded secret rotation without accepting a short secret", async () => {
    const binding = await createCheckoutBinding(PREVIOUS_SECRET, USER_ID, {
      issuedAt: ISSUED_AT,
      nonceBytes: new Uint8Array(16).fill(11),
    });

    await expect(
      verifyCheckoutBindingWithSecrets(binding, [SECRET, PREVIOUS_SECRET], ISSUED_AT),
    ).resolves.toBe(USER_ID);
    await expect(createCheckoutBinding("too-short", USER_ID)).rejects.toThrow(/too short/);
  });
});
