// Dormant S2a Auth adapter. Supply the real admin.auth.getUser implementation;
// decoding a bearer alone is never verification. No endpoint/RPC is installed.
import { parseStrictJson } from './request-json.ts';

export const INTERVIEW_FINALIZE_AUTH_MAX_BYTES = 16 * 1024;
export const INTERVIEW_FINALIZE_AUTH_TIMEOUT_MS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;
interface AuthClient {
  getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
}
export interface InterviewFinalizeVerifiedAuth {
  readonly ownerId: string;
  readonly authSessionId: string;
  readonly expiresAt: string;
  readonly expiresAtEpochMs: number;
}
export type InterviewFinalizeAuthResult =
  | Readonly<{ ok: true; auth: InterviewFinalizeVerifiedAuth }>
  | Readonly<{ ok: false; code: 'invalid_authorization' | 'auth_unavailable' }>;
const invalid = (): InterviewFinalizeAuthResult => Object.freeze({ ok: false, code: 'invalid_authorization' });
const unavailable = (): InterviewFinalizeAuthResult => Object.freeze({ ok: false, code: 'auth_unavailable' });

function claimsAfterVerification(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (payload.length % 4 === 1) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const value: unknown = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes), 16);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/** Returned identity is an observation, not an execution lease. The DB must
 * recheck its live session, expiry, owner fence and generation after its own waits.
 * The caller must also bound SDK fetch; this deadline bounds our wait, not network
 * cancellation. Late getUser completion cannot change a returned failure. */
export async function verifyInterviewFinalizeAuth(
  authorization: unknown,
  dependencies: Readonly<{ auth: AuthClient; now?: () => number }>,
): Promise<InterviewFinalizeAuthResult> {
  if (typeof authorization !== 'string' || authorization.length > INTERVIEW_FINALIZE_AUTH_MAX_BYTES) return invalid();
  const match = BEARER.exec(authorization);
  if (!match) return invalid();
  const token = match[1];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('verification_timeout')), INTERVIEW_FINALIZE_AUTH_TIMEOUT_MS);
    });
    const result = await Promise.race([Promise.resolve().then(() => dependencies.auth.getUser(token)), timeout]);
    if (result.error || !result.data.user || typeof result.data.user.id !== 'string' || !UUID.test(result.data.user.id)) return invalid();
    // Only after Auth success may decoded claims provide identity/expiry fields.
    const claims = claimsAfterVerification(token);
    if (!claims || claims.sub !== result.data.user.id || claims.role !== 'authenticated'
      || typeof claims.session_id !== 'string' || !UUID.test(claims.session_id)
      || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= 0) return invalid();
    const expiresAtEpochMs = claims.exp * 1000;
    if (!Number.isSafeInteger(expiresAtEpochMs) || expiresAtEpochMs > 8_640_000_000_000_000) return invalid();
    const now = (dependencies.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || now < 0) return unavailable();
    if (expiresAtEpochMs <= now) return invalid();
    return Object.freeze({ ok: true, auth: Object.freeze({ ownerId: result.data.user.id.toLowerCase(),
      authSessionId: claims.session_id.toLowerCase(), expiresAt: new Date(expiresAtEpochMs).toISOString(), expiresAtEpochMs }) });
  } catch { return unavailable(); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
