jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-key-0123456789abcdef",
  }),
}));

import {
  fetchAccountDeletionOpStatus,
  fetchAccountDeletionReceipt,
  knownSignedOut,
  normalizeReceiptId,
  parseOpStatusResponse,
  parseReceiptLookupResponse,
  receiptIdFromFragment,
  sweepsFromServer,
} from "../deletion-receipt";

const OP = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11";
const OWNER = "11111111-1111-4111-8111-111111111111";
const TOKEN = `v1.${"A".repeat(43)}`;
const RECEIPT = {
  op_id: OP,
  erased_at: "2026-10-07T01:02:03.000Z",
  expires_at: "2027-10-07T01:02:03.000Z",
  sweeps: { profile_erased: true, deletion_fenced: true, raw_clippings_erased: true, raw_clippings_empty_at_check: true },
  sweeps_reported: true,
  unrecorded: false,
};

function fakeFetch(status: number, body: unknown) {
  return jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

describe("receipt lookup keeps three answers apart (I5)", () => {
  test("found, none, and unknown", async () => {
    await expect(fetchAccountDeletionReceipt(OP, { fetchImpl: fakeFetch(200, { receipt: RECEIPT }) }))
      .resolves.toMatchObject({ status: "found", receipt: { opId: OP, sweepsReported: true } });
    await expect(fetchAccountDeletionReceipt(OP, { fetchImpl: fakeFetch(200, { receipt: null }) }))
      .resolves.toEqual({ status: "not-found" });
    // A 404 is what the gateway says when the function is not deployed: unknown, never "none".
    await expect(fetchAccountDeletionReceipt(OP, { fetchImpl: fakeFetch(404, { error: "not_found" }) }))
      .resolves.toEqual({ status: "unavailable" });
    await expect(fetchAccountDeletionReceipt(OP, { fetchImpl: fakeFetch(429, { error: "rate_limited" }) }))
      .resolves.toEqual({ status: "rate-limited" });
    await expect(fetchAccountDeletionReceipt(OP, { fetchImpl: jest.fn(async () => { throw new Error("offline"); }) }))
      .resolves.toEqual({ status: "unavailable" });
    await expect(fetchAccountDeletionReceipt(OP, { fetchImpl: fakeFetch(200, { receipt: { ...RECEIPT, op_id: OWNER } }) }))
      .resolves.toEqual({ status: "unavailable" });
  });

  test("posts only the number, with the publishable key, never the token or owner", async () => {
    const fetchImpl = fakeFetch(200, { receipt: null });
    await fetchAccountDeletionReceipt(` ${OP.toUpperCase()} `, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://test.supabase.co/functions/v1/account-deletion-receipt");
    expect(JSON.parse(init.body)).toEqual({ op_id: OP });
    expect(init.headers.authorization).toBe("Bearer anon-key-0123456789abcdef");
  });

  test("this device's own request carries the token and the owner it remembers", async () => {
    const fetchImpl = fakeFetch(200, { op: { status: "executing", receipt: null } });
    await expect(fetchAccountDeletionOpStatus({ opId: OP, token: TOKEN, owner: OWNER }, { fetchImpl }))
      .resolves.toEqual({ status: "known", op: "executing", receipt: null });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ op_id: OP, op_token: TOKEN, owner_id: OWNER });
  });

  test("a completed op without a readable receipt is not a definite answer", () => {
    expect(parseOpStatusResponse({ op: { status: "completed", receipt: null } }, OP)).toEqual({ status: "unavailable" });
    expect(parseOpStatusResponse({ op: { status: "completed", receipt: RECEIPT } }, OP))
      .toMatchObject({ status: "known", op: "completed", receipt: { opId: OP } });
    expect(parseOpStatusResponse({ op: null }, OP)).toEqual({ status: "not-found" });
    expect(parseOpStatusResponse({ op: { status: "done" } }, OP)).toEqual({ status: "unavailable" });
    expect(parseOpStatusResponse({}, OP)).toEqual({ status: "unavailable" });
  });

  test("raw clippings count as erased only when all three server observations agree", () => {
    expect(sweepsFromServer({ raw_clippings_erased: true, deletion_fenced: true, raw_clippings_empty_at_check: true }).rawClippingsErased).toBe(true);
    expect(sweepsFromServer({ raw_clippings_erased: true, deletion_fenced: null, raw_clippings_empty_at_check: true }).rawClippingsErased).toBeNull();
    expect(sweepsFromServer({ raw_clippings_erased: false }).rawClippingsErased).toBe(false);
    expect(sweepsFromServer({}).profileErased).toBeNull();
    expect(parseReceiptLookupResponse({ receipt: { ...RECEIPT, sweeps: "x" } }, OP))
      .toMatchObject({ status: "found", receipt: { sweeps: { profileErased: null } } });
  });
});

describe("the number and the session", () => {
  test("numbers are normalized; anything else is no number", () => {
    expect(normalizeReceiptId(` ${OP.toUpperCase()} `)).toBe(OP);
    expect(normalizeReceiptId("1234")).toBeNull();
    expect(normalizeReceiptId(null)).toBeNull();
  });

  test("a link fragment is read as `#r=<number>` only", () => {
    expect(receiptIdFromFragment(`#r=${OP}`)).toBe(OP);
    expect(receiptIdFromFragment(`#r=${OP}&x=1`)).toBeNull();
    expect(receiptIdFromFragment(`?r=${OP}`)).toBeNull();
    expect(receiptIdFromFragment("")).toBeNull();
  });

  test("only a known signed-out state counts as signed out (DEL2-R1-01 / D2A-05)", () => {
    const base = { loading: false, userId: null, sessionUnavailable: false, transitionPending: false };
    expect(knownSignedOut(base)).toBe(true);
    expect(knownSignedOut({ ...base, loading: true })).toBe(false);
    expect(knownSignedOut({ ...base, sessionUnavailable: true })).toBe(false);
    expect(knownSignedOut({ ...base, transitionPending: true })).toBe(false);
    expect(knownSignedOut({ ...base, userId: OWNER })).toBe(false);
  });
});
