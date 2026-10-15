import {
  WebInterviewLifecycleError,
  type WebInterviewLifecycle,
  type WebInterviewPurgeReceipt,
  type WebInterviewTicket,
} from "../interview/web-draft-lifecycle";
import {
  AuthLocalClearUnavailableError,
  AuthSessionOwnerChangedError,
  captureAuthSessionExpectation,
  signOutExpectedSessionInsideMutation,
  type AuthSessionExpectation,
  type AuthStorageRuntime,
} from "./session-mutation";

// Keep the SDK dependency at the existing reviewed auth primitive boundary.
type SessionClient = Parameters<typeof signOutExpectedSessionInsideMutation>[0];

function copyExpected(expected: AuthSessionExpectation): AuthSessionExpectation {
  const copy = { userId: expected?.userId, sessionId: expected?.sessionId, accessToken: expected?.accessToken };
  if (typeof copy.userId !== "string" || !copy.userId
    || typeof copy.sessionId !== "string" || !copy.sessionId) {
    throw new AuthSessionOwnerChangedError();
  }
  return copy;
}

function requireLifecycle(runtime: AuthStorageRuntime, lifecycle: WebInterviewLifecycle): void {
  if (!lifecycle || lifecycle.storageKey !== runtime.storageKey
    || typeof lifecycle.activate !== "function" || typeof lifecycle.purge !== "function"
    || typeof lifecycle.lookup !== "function") {
    throw new WebInterviewLifecycleError("unsupported");
  }
}

async function assertStableSession(
  client: SessionClient, runtime: AuthStorageRuntime, expected: AuthSessionExpectation, allowCleared: boolean,
): Promise<void> {
  // Public getSession acquires and RELEASES S here, before any D transaction.
  const current = await captureAuthSessionExpectation(client, runtime);
  if (allowCleared && current.userId === null) return;
  if (current.userId !== expected.userId || current.sessionId !== expected.sessionId) {
    throw new AuthSessionOwnerChangedError();
  }
}

/** Dormant: local lifetime only, not server content-generation authority. */
export async function activateExpectedWebInterviewSession(
  client: SessionClient,
  runtime: AuthStorageRuntime,
  lifecycle: WebInterviewLifecycle,
  expectedValue: AuthSessionExpectation,
  storageGeneration: string,
  previousValue: WebInterviewPurgeReceipt | null,
): Promise<WebInterviewTicket> {
  requireLifecycle(runtime, lifecycle);
  const expected = copyExpected(expectedValue);
  const previous = previousValue === null ? null : { ...previousValue };
  return runtime.runMutation(async ({ destructiveSafe }) => {
    if (!destructiveSafe) throw new AuthLocalClearUnavailableError();
    await assertStableSession(client, runtime, expected, false);
    const ticket = await lifecycle.activate({ ownerId: expected.userId!, sessionId: expected.sessionId!, storageGeneration }, previous);
    if (!ticket || ticket.ownerId !== expected.userId || ticket.sessionId !== expected.sessionId
      || ticket.storageGeneration !== storageGeneration || ticket.revision !== (previous?.revision ?? 0) + 1) {
      throw new WebInterviewLifecycleError("unconfirmed");
    }
    return ticket;
  }, { requireCrossTab: true });
}

/** Dormant M -> S(snapshot ends) -> D(oncomplete ACK) -> S(public signOut).
 * Required D has no fallback. Ordinary native logout does not call this path.
 * A null live session permits only the supplied exact, durable registry ticket;
 * null alone is never evidence identifying an owner or storage generation. */
export async function signOutExpectedWebInterviewSession(
  client: SessionClient,
  runtime: AuthStorageRuntime,
  lifecycle: WebInterviewLifecycle,
  expectedValue: AuthSessionExpectation,
  ticketValue: WebInterviewTicket,
  logoutId: string,
  scope: "global" | "local" = "global",
): Promise<WebInterviewPurgeReceipt> {
  requireLifecycle(runtime, lifecycle);
  const expected = copyExpected(expectedValue);
  const ticket = { ...ticketValue };
  if (ticket.ownerId !== expected.userId || ticket.sessionId !== expected.sessionId) {
    throw new AuthSessionOwnerChangedError();
  }
  return runtime.runMutation(async ({ destructiveSafe }) => {
    if (!destructiveSafe) throw new AuthLocalClearUnavailableError();
    await assertStableSession(client, runtime, expected, true);
    const receipt = await lifecycle.purge(ticket, logoutId);
    if (!receipt || receipt.phase !== "inactive" || receipt.logoutId !== logoutId
      || receipt.ownerId !== ticket.ownerId || receipt.sessionId !== ticket.sessionId
      || receipt.storageGeneration !== ticket.storageGeneration || receipt.revision !== ticket.revision + 1) {
      throw new WebInterviewLifecycleError("unconfirmed");
    }
    // This rechecks current auth after D. A later auth mismatch cannot restore
    // deleted content and must not sign out the newly observed session.
    await signOutExpectedSessionInsideMutation(client, expected, scope);
    return receipt;
  }, { requireCrossTab: true });
}
