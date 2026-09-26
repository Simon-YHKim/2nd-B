const getSession = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession } }) }));
jest.mock("../../env", () => ({ getEnv: () => ({
  EXPO_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key",
}) }));

import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { emptyConsentSelections, setAllRequiredAcks } from "../../auth/consent-selections";
import { loadServiceConsent, saveServiceConsent, matchesServiceConsentContract } from "../service-consent";

const originalFetch = globalThis.fetch;
const status = {
  mode: "collect", contract_revision: "service-v1", consent_version: "2026-09-07",
  policy_version: "2026-09-26", terms_version: "2026-08-16", state: "uncovered",
  change_token: "a".repeat(64), can_grant: true,
};
const acks = setAllRequiredAcks(emptyConsentSelections(), true);
let network: jest.Mock;

beforeEach(() => {
  __resetAccountEpochForTests();
  noteResolvedOwner("owner-a");
  getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "owner-a" }, access_token: "fixture-a" } }, error: null });
  network = jest.fn().mockImplementation(async () => Response.json(status));
  globalThis.fetch = network;
});
afterEach(() => { globalThis.fetch = originalFetch; __resetAccountEpochForTests(); });

test("loads authenticated status without a caller-controlled subject in the body", async () => {
  const result = await loadServiceConsent("owner-a");
  expect(result).toEqual({ ...status, ownerId: "owner-a", ownerEpoch: currentAccountEpoch() });
  expect(network).toHaveBeenCalledWith("https://fixture.invalid/functions/v1/service-consent", expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer fixture-a" }), body: JSON.stringify({ action: "status" }),
  }));
});

test("grant carries five explicit acknowledgements and the displayed revision, without marketing", async () => {
  const before = await loadServiceConsent("owner-a");
  network.mockResolvedValueOnce(Response.json({ ...status, state: "granted", created: true, change_token: "b".repeat(64) }));
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "grant", selections: { ...acks, marketing: true }, locale: "ko" }))
    .resolves.toMatchObject({ state: "granted" });
  expect(JSON.parse(network.mock.calls[1][1].body)).toEqual({
    action: "grant", contractRevision: "service-v1", expectedChangeToken: status.change_token, locale: "ko",
    requiredAcks: { service: true, llmProcessing: true, overseasTransfer: true, sensitiveData: true, safetyNotice: true },
  });
});

test("withdrawal sends no new acknowledgements and does not require updated document acceptance", async () => {
  network.mockResolvedValueOnce(Response.json({ ...status, policy_version: "2026-10-01" }));
  const before = await loadServiceConsent("owner-a");
  expect(matchesServiceConsentContract(before)).toBe(false);
  network.mockResolvedValueOnce(Response.json({ ...status, state: "revoked", created: true, change_token: "b".repeat(64) }));
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "revoke", locale: "ko" }))
    .resolves.toMatchObject({ state: "revoked" });
  expect(JSON.parse(network.mock.calls[1][1].body).requiredAcks).toEqual({});
});

test("a committed grant can preserve an existing optional-consent block", async () => {
  const before = await loadServiceConsent("owner-a");
  network.mockResolvedValueOnce(Response.json({ ...status, state: "blocked", created: true, change_token: "c".repeat(64) }));
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "grant", selections: acks, locale: "en" }))
    .resolves.toMatchObject({ state: "blocked" });
});

test.each(["es", "pt", "id"] as const)("%s records the canonical English consent text actually displayed", async (locale) => {
  const before = await loadServiceConsent("owner-a");
  network.mockResolvedValueOnce(Response.json({ ...status, state: "granted", created: true, change_token: "b".repeat(64) }));
  await saveServiceConsent({ userId: "owner-a", status: before, action: "grant", selections: acks, locale });
  expect(JSON.parse(network.mock.calls[1][1].body).locale).toBe("en");
});

test.each(["service", "llmProcessing", "overseasTransfer", "sensitiveData", "safetyNotice"] as const)("missing %s cannot write a grant", async (key) => {
  const before = await loadServiceConsent("owner-a");
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "grant", selections: { ...acks, [key]: false }, locale: "en" }))
    .rejects.toMatchObject({ code: "invalid_selection" });
  expect(network).toHaveBeenCalledTimes(1);
});

test("a newer document tuple cannot record consent to copy this app did not show", async () => {
  network.mockResolvedValueOnce(Response.json({ ...status, policy_version: "2026-10-01" }));
  const before = await loadServiceConsent("owner-a");
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "grant", selections: acks, locale: "en" }))
    .rejects.toMatchObject({ code: "contract_changed" });
  expect(network).toHaveBeenCalledTimes(1);
});

test.each([
  { mode: "off" }, { mode: "unknown" }, { can_grant: "true" }, { change_token: "forged" },
  { state: "allowed" }, { terms_version: null }, { extra: "unreviewed" },
])("malformed/unavailable status fails closed: %j", async (patch) => {
  network.mockResolvedValueOnce(Response.json({ ...status, ...patch }));
  await expect(loadServiceConsent("owner-a")).rejects.toMatchObject({ code: "unavailable" });
});

test("a server conflict never retries or fabricates a saved state", async () => {
  const before = await loadServiceConsent("owner-a");
  network.mockResolvedValueOnce(Response.json({ error: "private details" }, { status: 409 }));
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "revoke", locale: "en" }))
    .rejects.toMatchObject({ code: "conflict" });
  expect(network).toHaveBeenCalledTimes(2);
});

test.each([
  { created: undefined, change_token: "b".repeat(64) },
  { created: true, change_token: status.change_token },
  { created: true, change_token: "b".repeat(64), policy_version: "2026-10-01" },
])("a mutation needs a new committed receipt for the displayed contract: %j", async (patch) => {
  const before = await loadServiceConsent("owner-a");
  network.mockResolvedValueOnce(Response.json({ ...status, state: "granted", ...patch }));
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "grant", selections: acks, locale: "en" })).rejects.toThrow();
  expect(network).toHaveBeenCalledTimes(2);
});

test("transition before authentication completes prevents any request", async () => {
  let complete!: (value: unknown) => void;
  getSession.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  const pending = loadServiceConsent("owner-a");
  beginAccountOwnerTransition("owner-b");
  complete({ data: { session: { user: { id: "owner-a" }, access_token: "fixture-a" } }, error: null });
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(network).not.toHaveBeenCalled();
});

test("pre-publication transition aborts the in-flight request and discards a late success", async () => {
  let complete!: (value: Response) => void;
  network.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const pending = loadServiceConsent("owner-a");
  while (!complete) await Promise.resolve();
  const signal = network.mock.calls[0][1].signal as AbortSignal;
  beginAccountOwnerTransition("owner-b");
  expect(signal.aborted).toBe(true);
  complete(Response.json(status));
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

test("an A status cannot be used to grant for B", async () => {
  const before = await loadServiceConsent("owner-a");
  await expect(saveServiceConsent({ userId: "owner-b", status: before, action: "grant", selections: acks, locale: "en" }))
    .rejects.toMatchObject({ name: "AbortError" });
  expect(network).toHaveBeenCalledTimes(1);
});

test("a prior A session's displayed acknowledgements cannot be reused after A -> B -> A", async () => {
  const before = await loadServiceConsent("owner-a");
  noteResolvedOwner("owner-b");
  noteResolvedOwner("owner-a");
  clearAccountTransition(currentAccountEpoch());
  await expect(saveServiceConsent({ userId: "owner-a", status: before, action: "grant", selections: acks, locale: "en" }))
    .rejects.toMatchObject({ name: "AbortError" });
  expect(network).toHaveBeenCalledTimes(1);
});

test("unknown transport failures expose no private diagnostic text", async () => {
  network.mockRejectedValueOnce(new Error("private request body and credential"));
  await expect(loadServiceConsent("owner-a")).rejects.toMatchObject({ message: "service_consent_unavailable" });
});
