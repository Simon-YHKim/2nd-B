import {
  WebInterviewLifecycleError,
  copyWebInterviewLogoutIntent,
  type WebInterviewLogoutIntent,
  type WebInterviewLifecycle,
  type WebInterviewPurgeReceipt,
  type WebInterviewTicket,
} from "../interview/web-draft-lifecycle";
import {
  AuthLocalClearUnavailableError,
  AuthSessionOwnerChangedError,
  assertExpectedSessionInsideMutation,
  captureAuthSessionExpectation,
  runWithWebAuthMutationContext,
  signOutExpectedSessionInsideMutation,
  type AuthMutationContext,
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
    || typeof lifecycle.lookup !== "function" || typeof lifecycle.inspect !== "function") {
    throw new WebInterviewLifecycleError("unsupported");
  }
}

function guardedClient(client: SessionClient, assertCurrent: () => void): SessionClient {
  return {
    async getSession() {
      assertCurrent();
      const result = await client.getSession();
      assertCurrent();
      return result;
    },
    async signOut(options) {
      assertCurrent();
      const result = await client.signOut(options);
      assertCurrent();
      return result;
    },
  };
}

function copyAuthOnlyExpected(value: AuthSessionExpectation): AuthSessionExpectation {
  const copy = { userId: value?.userId, sessionId: value?.sessionId, accessToken: value?.accessToken };
  if (copy.userId === null) {
    if (copy.sessionId === null && copy.accessToken === null) return copy;
  } else if (typeof copy.userId === "string" && copy.userId
    && (copy.sessionId === null || (typeof copy.sessionId === "string" && copy.sessionId))
    && (copy.accessToken === null || (typeof copy.accessToken === "string" && copy.accessToken))) {
    return copy;
  }
  throw new AuthSessionOwnerChangedError();
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
  return runtime.runMutation((context) => signOutExpectedWebInterviewSessionInsideMutation(
    client, runtime, context, lifecycle, expected, ticket, logoutId, scope,
  ), { requireCrossTab: true });
}

/** Required real M context. Returns the registered task itself for safe drain.
 * B0a still requires the original explicit ticket/ID; no restart resolver. */
export function signOutExpectedWebInterviewSessionInsideMutation(
  client: SessionClient,
  runtime: AuthStorageRuntime,
  context: AuthMutationContext,
  lifecycle: WebInterviewLifecycle,
  expectedValue: AuthSessionExpectation,
  ticketValue: WebInterviewTicket,
  logoutId: string,
  scope: "global" | "local" = "global",
): Promise<WebInterviewPurgeReceipt> {
  return runWithWebAuthMutationContext(runtime, context, async (assertCurrent) => {
    requireLifecycle(runtime, lifecycle);
    const expected = copyExpected(expectedValue);
    const ticket = { ...ticketValue };
    if (ticket.ownerId !== expected.userId || ticket.sessionId !== expected.sessionId) {
      throw new AuthSessionOwnerChangedError();
    }
    const checkedClient = guardedClient(client, assertCurrent);
    await assertStableSession(checkedClient, runtime, expected, true);
    assertCurrent();
    const receipt = await lifecycle.purge(ticket, logoutId, scope);
    assertCurrent();
    if (!receipt || receipt.phase !== "inactive" || receipt.logoutId !== logoutId
      || receipt.ownerId !== ticket.ownerId || receipt.sessionId !== ticket.sessionId
      || receipt.storageGeneration !== ticket.storageGeneration || receipt.revision !== ticket.revision + 1) {
      throw new WebInterviewLifecycleError("unconfirmed");
    }
    // This rechecks current auth after D. A later auth mismatch cannot restore
    // deleted content and must not sign out the newly observed session.
    await signOutExpectedSessionInsideMutation(checkedClient, expected, scope);
    return receipt;
  });
}

export interface WebInterviewAuthOnlyResult {
  readonly kind: "auth-only";
}

/** No cached observation input. Each attempt proves initial emptiness inside M.
 * This result is neither a draft purge receipt nor evidence of past non-use. */
export function signOutEmptyWebInterviewSessionInsideMutation(
  client: SessionClient,
  runtime: AuthStorageRuntime,
  context: AuthMutationContext,
  lifecycle: WebInterviewLifecycle,
  expectedValue: AuthSessionExpectation,
  scope: "global" | "local" = "global",
): Promise<WebInterviewAuthOnlyResult> {
  return runWithWebAuthMutationContext(runtime, context, async (assertCurrent) => {
    requireLifecycle(runtime, lifecycle);
    const expected = copyAuthOnlyExpected(expectedValue);
    const checkedClient = guardedClient(client, assertCurrent);
    await assertExpectedSessionInsideMutation(checkedClient, expected, { allowAlreadyCleared: true });
    assertCurrent();
    const observed = await lifecycle.inspect();
    assertCurrent();
    if (!observed || Array.isArray(observed) || observed.kind !== "empty" || Object.keys(observed).length !== 1) {
      throw new WebInterviewLifecycleError("unconfirmed");
    }
    await signOutExpectedSessionInsideMutation(checkedClient, expected, scope);
    return { kind: "auth-only" };
  });
}

export async function signOutEmptyWebInterviewSession(
  client: SessionClient,
  runtime: AuthStorageRuntime,
  lifecycle: WebInterviewLifecycle,
  expectedValue: AuthSessionExpectation,
  scope: "global" | "local" = "global",
): Promise<WebInterviewAuthOnlyResult> {
  requireLifecycle(runtime, lifecycle);
  const expected = copyAuthOnlyExpected(expectedValue);
  return runtime.runMutation((context) => signOutEmptyWebInterviewSessionInsideMutation(
    client, runtime, context, lifecycle, expected, scope,
  ), { requireCrossTab: true });
}

/** The caller retains this exact captured origin if an attempted prepare is
 * unconfirmed. No expectation or ID is synthesized from an inactive receipt. */
export interface WebInterviewLogoutOrigin {
  readonly expected: AuthSessionExpectation;
  readonly ticket: WebInterviewTicket;
  readonly logoutId: string;
  readonly scope: "global" | "local";
}

export type WebInterviewLogoutRequest =
  | { readonly kind: "new"; readonly scope: "global" | "local";
      /** Called once, only after current stable auth and a fresh active/no-intent
       * D. The caller can retain the copied ticket together with the ID it makes. */
      readonly createLogoutId: (ticket: WebInterviewTicket) => string }
  | { readonly kind: "resume"; readonly emptyScope: "global" | "local";
      readonly original?: WebInterviewLogoutOrigin };

export type WebInterviewSignOutResult = WebInterviewAuthOnlyResult
  | { readonly kind: "draft-purged"; readonly receipt: WebInterviewPurgeReceipt };

function validScope(scope: unknown): scope is "global" | "local" {
  return scope === "global" || scope === "local";
}

function intentFor(ticket: WebInterviewTicket, logoutId: string, scope: "global" | "local"): WebInterviewLogoutIntent {
  return copyWebInterviewLogoutIntent({ v: 1, kind: "web-interview-logout", ownerId: ticket?.ownerId,
    sessionId: ticket?.sessionId, storageGeneration: ticket?.storageGeneration,
    activeRevision: ticket?.revision, logoutId, scope });
}

function ticketFor(intent: WebInterviewLogoutIntent): WebInterviewTicket {
  return { ownerId: intent.ownerId, sessionId: intent.sessionId,
    storageGeneration: intent.storageGeneration, revision: intent.activeRevision };
}

function sameIntent(a: WebInterviewLogoutIntent, b: WebInterviewLogoutIntent): boolean {
  return a.ownerId === b.ownerId && a.sessionId === b.sessionId && a.storageGeneration === b.storageGeneration
    && a.activeRevision === b.activeRevision && a.logoutId === b.logoutId && a.scope === b.scope;
}

function copyLogoutRequest(request: WebInterviewLogoutRequest): WebInterviewLogoutRequest {
  if (request?.kind === "new" && validScope(request.scope) && typeof request.createLogoutId === "function") {
    return { kind: "new", scope: request.scope, createLogoutId: request.createLogoutId };
  }
  if (request?.kind === "resume" && validScope(request.emptyScope)) {
    const original = request.original;
    if (original === undefined) return { kind: "resume", emptyScope: request.emptyScope };
    const expected = copyExpected(original.expected);
    const intent = intentFor(original.ticket, original.logoutId, original.scope);
    if (expected.userId !== intent.ownerId || expected.sessionId !== intent.sessionId) {
      throw new AuthSessionOwnerChangedError();
    }
    return { kind: "resume", emptyScope: request.emptyScope,
      original: { expected, ticket: ticketFor(intent), logoutId: intent.logoutId, scope: intent.scope } };
  }
  throw new WebInterviewLifecycleError("invalid");
}

/** Required B0b resolver. Observation is always fresh within this real M.
 * Durable intent identifies a local operation; it grants no server authority. */
export function resolveWebInterviewSignOutInsideMutation(
  client: SessionClient, runtime: AuthStorageRuntime, context: AuthMutationContext,
  lifecycle: WebInterviewLifecycle, expectedValue: AuthSessionExpectation, requestValue: WebInterviewLogoutRequest,
): Promise<WebInterviewSignOutResult> {
  return runWithWebAuthMutationContext(runtime, context, async (assertCurrent) => {
    requireLifecycle(runtime, lifecycle);
    if (typeof lifecycle.prepareIntent !== "function") throw new WebInterviewLifecycleError("unsupported");
    const expected = copyAuthOnlyExpected(expectedValue);
    const request = copyLogoutRequest(requestValue);
    const checkedClient = guardedClient(client, assertCurrent);
    await assertExpectedSessionInsideMutation(checkedClient, expected, { allowAlreadyCleared: true });
    assertCurrent();
    const observed = await lifecycle.inspect();
    assertCurrent();
    if (observed?.kind === "empty" && !Array.isArray(observed) && Object.keys(observed).length === 1) {
      if (request.kind === "resume" && request.original) throw new WebInterviewLifecycleError("conflict");
      await signOutExpectedSessionInsideMutation(checkedClient, expected,
        request.kind === "new" ? request.scope : request.emptyScope);
      return { kind: "auth-only" };
    }
    if (!observed || (observed.kind !== "active" && observed.kind !== "inactive")) {
      throw new WebInterviewLifecycleError("unconfirmed");
    }
    let intent: WebInterviewLogoutIntent;
    let prepare = false;
    if (request.kind === "new") {
      if (observed.kind !== "active" || observed.intent !== null) throw new WebInterviewLifecycleError("conflict");
      const stable = copyExpected(expected);
      const ticket = { ...observed.ticket };
      if (ticket.ownerId !== stable.userId || ticket.sessionId !== stable.sessionId) throw new AuthSessionOwnerChangedError();
      await assertStableSession(checkedClient, runtime, stable, false);
      assertCurrent();
      // Fixed before the first write. No automatic new-ID path exists in resume.
      const logoutId = request.createLogoutId({ ...ticket });
      assertCurrent();
      intent = intentFor(ticket, logoutId, request.scope);
      prepare = true;
    } else {
      const original = request.original;
      const captured = original ? intentFor(original.ticket, original.logoutId, original.scope) : null;
      if (observed.intent !== null) {
        intent = copyWebInterviewLogoutIntent(observed.intent);
        if (captured && !sameIntent(captured, intent)) throw new WebInterviewLifecycleError("conflict");
      } else {
        if (!captured || !original) throw new WebInterviewLifecycleError("unconfirmed-missing-origin");
        if (observed.kind === "inactive") {
          // A compatibility: only the caller's actual captured origin, never
          // a retroactive intent or inactive.revision - 1 inference.
          const receipt = await signOutExpectedWebInterviewSessionInsideMutation(
            client, runtime, context, lifecycle, original.expected, original.ticket, original.logoutId, original.scope,
          );
          assertCurrent();
          return { kind: "draft-purged", receipt };
        }
        intent = captured;
        prepare = true;
      }
    }
    const originalExpected: AuthSessionExpectation = {
      userId: intent.ownerId, sessionId: intent.sessionId, accessToken: null,
    };
    await assertExpectedSessionInsideMutation(checkedClient, originalExpected, { allowAlreadyCleared: true });
    assertCurrent();
    if (prepare) {
      const prepared = copyWebInterviewLogoutIntent(await lifecycle.prepareIntent(intent));
      assertCurrent();
      if (!sameIntent(prepared, intent)) throw new WebInterviewLifecycleError("unconfirmed");
    }
    assertCurrent();
    const ticket = ticketFor(intent);
    const receipt = observed.kind === "inactive"
      ? await lifecycle.lookup(ticket, intent.logoutId, intent.scope)
      : await lifecycle.purge(ticket, intent.logoutId, intent.scope);
    assertCurrent();
    if (!receipt || receipt.phase !== "inactive" || receipt.ownerId !== intent.ownerId
      || receipt.sessionId !== intent.sessionId || receipt.storageGeneration !== intent.storageGeneration
      || receipt.revision !== intent.activeRevision + 1 || receipt.logoutId !== intent.logoutId) {
      throw new WebInterviewLifecycleError("unconfirmed");
    }
    await signOutExpectedSessionInsideMutation(checkedClient, originalExpected, intent.scope);
    return { kind: "draft-purged", receipt };
  });
}

export async function resolveWebInterviewSignOut(
  client: SessionClient, runtime: AuthStorageRuntime, lifecycle: WebInterviewLifecycle,
  expectedValue: AuthSessionExpectation, requestValue: WebInterviewLogoutRequest,
): Promise<WebInterviewSignOutResult> {
  const expected = copyAuthOnlyExpected(expectedValue);
  const request = copyLogoutRequest(requestValue);
  return runtime.runMutation((context) => resolveWebInterviewSignOutInsideMutation(
    client, runtime, context, lifecycle, expected, request,
  ), { requireCrossTab: true });
}
