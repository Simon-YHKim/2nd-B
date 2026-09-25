// Every proxy must be deployed/canaried before collect exposes the writer.
// Enforce additionally requires active-account coverage. Tokens are server input.
export type LlmConsentMode = 'off' | 'collect' | 'enforce';
export function resolveLlmConsentMode(read: (key: string) => string | undefined): LlmConsentMode | null {
  const mode = read('LLM_CONSENT_MODE');
  if (mode !== undefined && mode !== 'off' && mode !== 'collect' && mode !== 'enforce') return null;
  // The old strict switch can never be weakened by a newer collect/off setting.
  if (read('LLM_REQUIRE_VERIFIED_CONSENT') === 'true') return 'enforce';
  return mode ?? 'off';
}
export type LlmConsentRpc = (name: string, args: Record<string, unknown>) =>
  PromiseLike<{ data?: unknown; error?: unknown }>;
export type LlmConsentLease = Readonly<{ userId: string; mode: LlmConsentMode; token: string | null }>;
export type LlmConsentDenial = { error: 'consent_required'; status: 403 }
  | { error: 'consent_check_unavailable'; status: 503 };
type Capture = { lease: LlmConsentLease; denial?: never } | { lease?: never; denial: LlmConsentDenial };

export async function captureLlmConsent(
  rpc: LlmConsentRpc, userId: string, mode: LlmConsentMode | null,
): Promise<Capture> {
  if (mode === null) return { denial: { error: 'consent_check_unavailable', status: 503 } };
  if (mode === 'off') return { lease: { userId, mode, token: null } };
  try {
    const { data, error } = await rpc('effective_llm_consent_snapshot_v2', {
      p_user_id: userId, ...(mode === 'collect' ? { p_allow_legacy: true } : {}),
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return { denial: { error: 'consent_check_unavailable', status: 503 } };
    }
    const snapshot = data as Record<string, unknown>;
    if (Object.keys(snapshot).length !== 2 || typeof snapshot.allowed !== 'boolean' ||
      (snapshot.allowed ? typeof snapshot.token !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.token)
        : snapshot.token !== null)) {
      return { denial: { error: 'consent_check_unavailable', status: 503 } };
    }
    if (!snapshot.allowed) return { denial: { error: 'consent_required', status: 403 } };
    return { lease: { userId, mode, token: snapshot.token as string } };
  } catch {
    // RPC exceptions may contain credentials, bodies or database details.
    return { denial: { error: 'consent_check_unavailable', status: 503 } };
  }
}

export async function recheckLlmConsent(rpc: LlmConsentRpc, lease: LlmConsentLease): Promise<LlmConsentDenial | null> {
  const current = await captureLlmConsent(rpc, lease.userId, lease.mode);
  if (current.denial) return current.denial;
  return current.lease.token === lease.token ? null : { error: 'consent_required', status: 403 };
}

type AuditQuery = PromiseLike<{ error?: unknown }> & { eq: (key: string, value: string) => AuditQuery };
type AuditAdmin = { from: (table: string) => { update: (row: Record<string, unknown>) => AuditQuery } };

/** Preserve the one actual provider call and its tokens/hashes. A second audit
 * row would inflate ai_audit_daily_health.calls even with total_tokens=null. */
export async function markConsentWithheld(admin: AuditAdmin, userId: string, auditId: string, model: string): Promise<void> {
  try {
    const result = await admin.from('ai_audit_log').update({ model_used: `${model}+consent_withheld` })
      .eq('id', auditId).eq('user_id', userId).eq('event_source', 'server_verified');
    if (!result.error) return;
  } catch { /* Denial must survive audit unavailability. */ }
  console.warn('[llm-consent] withheld audit marker unavailable');
}
