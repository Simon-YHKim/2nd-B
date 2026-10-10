import { captureLlmConsent, recheckLlmConsent } from '../_shared/llm-consent.ts';
import { hasRedZoneInput } from '../_shared/llm-input-safety.ts';
import {
  dailyCapForRank, djb2, hasCrisisTerm, isUsableHeaderValue, llmCapacityWeight,
  readLlmUpstreamJsonObject, reserveLlmProxyCapacity, SAFETY_PREAMBLE, TIER_RANK,
  transitionLlmProxyCapacity, utcDay,
} from '../_shared/llm-proxy-common.ts';
import type { LlmCapacityRpc } from '../_shared/llm-proxy-common.ts';

export interface BoardProviderDependencies {
  model: string;
  apiKey: string;
  rpc: LlmCapacityRpc;
  fetch: typeof fetch;
}
export interface BoardProviderInput {
  userId: string; runId: string; purpose: string; prompt: string; system: string; consentToken: string;
  payload: Readonly<Record<string, unknown>>;
}

// G2-03: provisional cheapest rung, pending Simon's per-seat decision. W1
// produces short JSON several times a day; do not inherit the API's high default.
export const BOARD_PURPOSE_EFFORT: Readonly<Record<string, string>> = Object.freeze({
  daily_note: 'low', day_summary: 'low', inbox_triage: 'low',
});
// Reviewed against the Sonnet 5 effort docs and claude-proxy's adaptive request.
// A new model needs a capability review, not an implicit parameter fallback.
const EFFORT_MODELS = new Set(['claude-sonnet-5']);

/** Server-only Sonnet seats. Quota is the atomic W1 claim, not a caller label.
 * Reuses the proxies' safety, consent, spend, fleet capacity and audit contract.
 * No provider fallback or retry: ambiguous dispatches consume the reservation. */
export function createBoardProvider(deps: BoardProviderDependencies) {
  return async (input: BoardProviderInput): Promise<unknown> => {
    const fail = (): never => { throw new Error('dashboard_generation_unavailable'); };
    const effort = Object.hasOwn(BOARD_PURPOSE_EFFORT, input.purpose) ? BOARD_PURPOSE_EFFORT[input.purpose] : null;
    if (!effort || !EFFORT_MODELS.has(deps.model) || !isUsableHeaderValue(deps.apiKey) ||
        !deps.apiKey || input.prompt.length > 24_000 || !input.payload ||
        typeof input.payload !== 'object' || Array.isArray(input.payload)) return fail();
    const attempt = (crisis: boolean) => deps.rpc('dashboard_generation_audit_attempt', {
      p_user_id: input.userId, p_run_id: input.runId, p_model: deps.model,
      p_effort: effort, p_prompt_hash: djb2(input.system + input.prompt), p_crisis: crisis,
    });
    // C9 / G2-01: classify each original string before spend, capacity or
    // dispatch. JSON escaping can hide whitespace from a prompt-only scan.
    // Retain the existing prompt backstop and all response checks.
    if (hasRedZoneInput([input.payload, input.prompt, input.system]) || hasCrisisTerm(input.prompt)) {
      // No paid dispatch, but the early exit is still a C3 attempt.
      await attempt(true);
      return fail();
    }
    const consent = await captureLlmConsent(deps.rpc, input.userId, 'enforce');
    if (consent.denial || consent.lease.token !== input.consentToken) return fail();
    const tier = await deps.rpc('effective_subscription_tier', { p_user_id: input.userId });
    if (tier.error || typeof tier.data !== 'string' || !Object.hasOwn(TIER_RANK, tier.data)) return fail();
    const day = utcDay();
    const spent = await deps.rpc('bump_gemini_spend', {
      p_user_id: input.userId, p_day: day, p_cap: dailyCapForRank(TIER_RANK[tier.data]),
    });
    if (spent.error) return fail();
    const capacity = await reserveLlmProxyCapacity(deps.rpc, 'claude', deps.model, llmCapacityWeight(4096));
    if (!capacity.ok) {
      await deps.rpc('refund_gemini_spend', { p_user_id: input.userId, p_day: day });
      return fail();
    }
    if (await recheckLlmConsent(deps.rpc, consent.lease)) {
      await transitionLlmProxyCapacity(deps.rpc, capacity.reservationId, 'release');
      await deps.rpc('refund_gemini_spend', { p_user_id: input.userId, p_day: day });
      return fail();
    }
    // The DB commits the attempt INSERT and existing dispatch together. An
    // error (including an ambiguous RPC response) must never reach the vendor.
    let dispatch;
    try { dispatch = await attempt(false); } catch { dispatch = { error: true }; }
    if (dispatch.error || dispatch.data !== true) {
      await transitionLlmProxyCapacity(deps.rpc, capacity.reservationId, 'release');
      await deps.rpc('refund_gemini_spend', { p_user_id: input.userId, p_day: day });
      return fail();
    }
    const started = Date.now();
    let outcome = 'transport_failed'; let output: unknown = null; let tokens: number | null = null; let responseText = '';
    try {
      const response = await deps.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25_000),
        headers: { 'content-type': 'application/json', 'x-api-key': deps.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: deps.model, max_tokens: 4096,
          thinking: { type: 'adaptive' }, output_config: { effort },
          system: SAFETY_PREAMBLE + '\n' + input.system, messages: [{ role: 'user', content: input.prompt }] }),
      });
      outcome = `http_${response.status}`;
      if (response.ok) {
        outcome = 'invalid_response';
        const body = await readLlmUpstreamJsonObject(response);
        const usage = body.usage as Record<string, unknown> | undefined;
        if (typeof usage?.input_tokens === 'number' && typeof usage.output_tokens === 'number') {
          const total = usage.input_tokens + usage.output_tokens;
          if (Number.isSafeInteger(total) && total >= 0) tokens = total;
        }
        if (Array.isArray(body.content) && body.stop_reason === 'end_turn') {
          responseText = body.content.filter((part: Record<string, unknown>) => part.type === 'text' && typeof part.text === 'string')
            .map((part: Record<string, unknown>) => part.text).join('');
          outcome = 'rejected_output';
          if (responseText.length <= 32_768 && !hasCrisisTerm(responseText)) {
            // Some valid JSON responses arrive in one Markdown code block.
            // Unwrap only that entire block; never extract JSON from prose.
            // The handler still enforces every field and evidence reference.
            const trimmed = responseText.trim();
            const block = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
            outcome = 'invalid_json';
            output = JSON.parse(block ? block[1] : trimmed); outcome = 'completed';
          }
        }
      }
    } catch { /* Ambiguous dispatch: keep the spend and quota, suppress raw details. */ }
    finally { await transitionLlmProxyCapacity(deps.rpc, capacity.reservationId, 'settle'); }
    if (await recheckLlmConsent(deps.rpc, consent.lease)) { output = null; outcome = 'consent_withheld'; }
    const audited = await deps.rpc('dashboard_generation_audit_result', {
      p_user_id: input.userId, p_run_id: input.runId, p_output_hash: djb2(responseText),
      p_outcome: outcome, p_latency_ms: Date.now() - started,
      p_safety_zone: hasCrisisTerm(responseText) ? 'red' : 'green', p_total_tokens: tokens,
    });
    if (audited.error || audited.data !== true || output === null) return fail();
    return output;
  };
}
