// Reading a deletion receipt back by number (0217, Q-261004-42 = A).
//
// The lookup must keep three answers apart: found (proof of erasure), not-found
// (a live lookup said there is no such receipt) and unavailable (we could not
// ask). Callers drop a pending request only on not-found after its lease, so an
// unreachable or undeployed function must never read as not-found.
jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "publishable-anon-key-for-tests",
  }),
}));

import {
  buildAccountDeletedHref,
  fetchAccountDeletionReceipt,
  normalizeReceiptId,
  parseAccountDeletedParams,
  parseReceiptLookupBody,
} from "../deletion-receipt";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const row = {
  id: ID,
  erased_at: "2026-10-05T12:00:00+00:00",
  expires_at: "2027-10-05T12:00:00+00:00",
  sweeps: { profile_erased: true, deletion_fenced: true, raw_clippings_erased: false, unknown_key: true },
  sweeps_reported: true,
};

function respond(status: number, body: unknown) {
  return jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

test("posts only the receipt number, with the publishable key and no session", async () => {
  const fetchImpl = respond(200, { receipt: row });
  await fetchAccountDeletionReceipt(ID.toUpperCase(), { fetchImpl });
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string; method: string }];
  expect(url).toBe("https://project.supabase.co/functions/v1/account-deletion-receipt");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ receipt_id: ID });
  expect(init.headers.authorization).toBe("Bearer publishable-anon-key-for-tests");
  expect(init.headers.apikey).toBe("publishable-anon-key-for-tests");
});

test("a found receipt keeps only the six known observations, three-valued", async () => {
  const result = await fetchAccountDeletionReceipt(ID, { fetchImpl: respond(200, { receipt: row }) });
  expect(result.status).toBe("found");
  if (result.status !== "found") return;
  expect(result.receipt.id).toBe(ID);
  expect(result.receipt.erasedAtIso).toBe("2026-10-05T12:00:00.000Z");
  expect(result.receipt.sweeps).toEqual({
    profile_erased: true,
    deletion_fenced: true,
    raw_clippings_erased: false,
    raw_clippings_empty_at_check: null,
    record_photos_erased: null,
    record_photos_empty_at_check: null,
  });
  expect(Object.isFrozen(result.receipt)).toBe(true);
});

test("an explicit null receipt is not-found", async () => {
  await expect(fetchAccountDeletionReceipt(ID, { fetchImpl: respond(200, { receipt: null }) }))
    .resolves.toEqual({ status: "not-found" });
});

test.each([
  ["the gateway's 404 for an undeployed function", 404, { code: "NOT_FOUND", message: "Requested function was not found" }],
  ["a server error", 503, { error: "server_unavailable" }],
  ["a 200 without the receipt field", 200, { ok: true }],
  ["a receipt for another number", 200, { receipt: { ...row, id: "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee" } }],
  ["a receipt without dates", 200, { receipt: { ...row, erased_at: "soon" } }],
])("%s is unavailable, never not-found", async (_label, status, body) => {
  await expect(fetchAccountDeletionReceipt(ID, { fetchImpl: respond(status, body) }))
    .resolves.toEqual({ status: "unavailable" });
});

test("a network failure or timeout is unavailable and never throws", async () => {
  const failing = jest.fn(async () => { throw new TypeError("network"); });
  await expect(fetchAccountDeletionReceipt(ID, { fetchImpl: failing })).resolves.toEqual({ status: "unavailable" });

  jest.useFakeTimers();
  try {
    const hanging = jest.fn((_url: string, init: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const pending = fetchAccountDeletionReceipt(ID, { fetchImpl: hanging, timeoutMs: 50 });
    await jest.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toEqual({ status: "unavailable" });
  } finally {
    jest.useRealTimers();
  }
});

test("receipt numbers are normalized and validated", () => {
  expect(normalizeReceiptId(` ${ID.toUpperCase()} `)).toBe(ID);
  expect(normalizeReceiptId("aaaaaaaa-bbbb-4ccc-8ddd")).toBeNull();
  expect(normalizeReceiptId(42)).toBeNull();
  expect(parseReceiptLookupBody({ receipt: null }, ID)).toEqual({ status: "not-found" });
});

test("the route carries the number and two local observations, nothing else", () => {
  const href = buildAccountDeletedHref({ receiptId: ID, localPurge: "complete", localSignOut: "unconfirmed" });
  expect(href).toBe(`/account-deleted?receipt=${ID}&local=complete&signout=unconfirmed&done=1`);
  expect(buildAccountDeletedHref({ receiptId: "nope" })).toBe("/account-deleted?done=1");
  expect(parseAccountDeletedParams({ receipt: [ID, "x"], local: "unconfirmed", done: "1" })).toEqual({
    receiptId: ID, localPurge: "unconfirmed", localSignOut: null, fromDeletion: true,
  });
});
