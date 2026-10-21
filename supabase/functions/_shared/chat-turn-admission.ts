// T39 E1-Ea: the database owns eligibility and atomically registers/charges a turn.
// No retry or ordinary-quota fallback: a late commit may already have used a slot.
export const CHAT_TURN_ADMISSION_FN = 'begin_chat_turn_attempt_with_quota';
export const CHAT_TURN_ADMISSION_TIMEOUT_MS = 5000;

export type ChatTurnAdmissionMode = 'legacy' | 'enforce';
export type ChatAttemptIntent = 'first' | 'reask';
export type TurnAdmission = {
  mode: ChatTurnAdmissionMode;
  allowed: boolean | null;
  kind: 'first' | 'reask' | 'unbound' | 'rejected' | null;
  attempt: 1 | 2 | null;
  quotaCharged: boolean | null;
  bindingEligible: boolean | null;
  reaskAvailable: boolean | null;
};
type AdmissionError = 'reask_ineligible' | 'first_already_registered'
  | 'purpose_limit_exceeded' | 'chat_admission_unavailable';
export type ChatAdmissionResult = {
  admission: TurnAdmission;
  denial?: { error: AdmissionError; status: 409 | 429 | 503 };
};
type AdmissionRpc = (
  name: string, args: Record<string, unknown>,
) => PromiseLike<{ data?: unknown; error?: unknown }>;

export function resolveChatTurnAdmissionMode(read: (name: string) => string | undefined): ChatTurnAdmissionMode {
  const value = read('CHAT_TURN_ADMISSION_MODE');
  if (value === 'enforce') return 'enforce';
  if (value !== undefined && value !== '' && value !== 'legacy') {
    // Do not log arbitrary environment content.
    console.warn('[openai-proxy] unknown chat admission mode; using legacy');
  }
  return 'legacy';
}

export function readChatAttemptIntent(raw: unknown): ChatAttemptIntent | null {
  if (raw === undefined) return 'first';
  return raw === 'first' || raw === 'reask' ? raw : null;
}

export function legacyTurnAdmission(allowed: boolean, quotaCharged: boolean | null): TurnAdmission {
  return {
    mode: 'legacy', allowed, kind: null, attempt: null, quotaCharged,
    bindingEligible: null, reaskAvailable: null,
  };
}

export function rejectedTurnAdmission(mode: ChatTurnAdmissionMode): TurnAdmission {
  return {
    mode, allowed: false, kind: 'rejected', attempt: null, quotaCharged: false,
    bindingEligible: false, reaskAvailable: false,
  };
}

export function unavailableTurnAdmission(): ChatAdmissionResult {
  return {
    admission: {
      mode: 'enforce', allowed: null, kind: null, attempt: null, quotaCharged: null,
      bindingEligible: null, reaskAvailable: null,
    },
    denial: { error: 'chat_admission_unavailable', status: 503 },
  };
}

// Validate the actual E1-S jsonb object, including cross-field invariants. Never
// derive kind/attempt from the request intent: reask can register attempt one.
function parseAdmission(data: unknown): ChatAdmissionResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return unavailableTurnAdmission();
  const row = data as Record<string, unknown>;
  if (row.allowed === false && row.kind === 'rejected' && row.attempt === null
      && row.quotaCharged === false && row.bindingEligible === false && row.reaskAvailable === false
      && (row.error === 'reask_ineligible' || row.error === 'first_already_registered')) {
    return {
      admission: rejectedTurnAdmission('enforce'),
      denial: { error: row.error, status: 409 },
    };
  }
  if (row.allowed !== true || row.error !== null) return unavailableTurnAdmission();
  const first = row.kind === 'first' && row.attempt === 1 && row.quotaCharged === true
    && row.bindingEligible === true && row.reaskAvailable === true;
  const reask = row.kind === 'reask' && row.attempt === 2 && row.quotaCharged === false
    && row.bindingEligible === true && row.reaskAvailable === false;
  const unbound = row.kind === 'unbound' && row.attempt === null && row.quotaCharged === true
    && row.bindingEligible === false && row.reaskAvailable === false;
  if (!first && !reask && !unbound) return unavailableTurnAdmission();
  return { admission: {
    mode: 'enforce', allowed: true,
    kind: first ? 'first' : reask ? 'reask' : 'unbound',
    attempt: first ? 1 : reask ? 2 : null,
    quotaCharged: !reask, bindingEligible: !unbound, reaskAvailable: first,
  } };
}

export async function admitChatTurn(
  rpc: AdmissionRpc,
  ids: { userId: string; auditId: string; turnId: string },
  intent: ChatAttemptIntent,
): Promise<ChatAdmissionResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = Promise.resolve(rpc(CHAT_TURN_ADMISSION_FN, {
      p_user_id: ids.userId, p_audit_id: ids.auditId, p_turn_id: ids.turnId,
      p_provider: 'openai', p_attempt_intent: intent,
    })).then(({ data, error }) => {
      if (error) {
        // 22023 also represents lower-level policy errors. Only T3901 proves
        // quota exhaustion AND rollback of this request's registration.
        if (typeof error === 'object' && (error as { code?: unknown }).code === 'T3901') {
          return {
            admission: { ...rejectedTurnAdmission('enforce'), reaskAvailable: null },
            denial: { error: 'purpose_limit_exceeded', status: 429 },
          } satisfies ChatAdmissionResult;
        }
        return unavailableTurnAdmission();
      }
      return parseAdmission(data);
    }, () => unavailableTurnAdmission());
    const limit = new Promise<ChatAdmissionResult>((resolve) => {
      timer = setTimeout(() => resolve(unavailableTurnAdmission()), CHAT_TURN_ADMISSION_TIMEOUT_MS);
    });
    return await Promise.race([call, limit]);
  } catch {
    return unavailableTurnAdmission();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
