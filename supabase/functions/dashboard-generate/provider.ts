import { captureLlmConsent, recheckLlmConsent } from '../_shared/llm-consent.ts';
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
  audit: (row: Record<string, unknown>) => Promise<boolean>;
}
export interface BoardProviderInput {
  userId: string; runId: string; purpose: string; prompt: string; system: string; consentToken: string;
}

/** Server-only Sonnet seats. Quota is the atomic W1 claim, not a caller label.
 * Reuses the proxies' safety, consent, spend, fleet capacity and audit contract.
 * No provider fallback or retry: ambiguous dispatches consume the reservation. */
export function createBoardProvider(deps: BoardProviderDependencies) {
  return async (input: BoardProviderInput): Promise<unknown> => {
    const fail = (): never => { throw new Error('dashboard_generation_unavailable'); };
    if (!['daily_note', 'day_summary', 'inbox_triage'].includes(input.purpose) ||
        !/^claude-sonnet-[a-z0-9-]+$/.test(deps.model) || !isUsableHeaderValue(deps.apiKey) ||
        !deps.apiKey || input.prompt.length > 24_000 || hasCrisisTerm(input.prompt)) return fail();
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
    const dispatch = await deps.rpc('dashboard_generation_dispatch', { p_user_id: input.userId, p_run_id: input.runId });
    if (dispatch.error || dispatch.data !== true) {
      await transitionLlmProxyCapacity(deps.rpc, capacity.reservationId, 'release');
      await deps.rpc('refund_gemini_spend', { p_user_id: input.userId, p_day: day });
      return fail();
    }
    const started = Date.now();
    let outcome = 'failed'; let output: unknown = null; let tokens: number | null = null; let responseText = '';
    try {
      const response = await deps.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25_000),
        headers: { 'content-type': 'application/json', 'x-api-key': deps.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: deps.model, max_tokens: 4096,
          system: SAFETY_PREAMBLE + '\n' + input.system, messages: [{ role: 'user', content: input.prompt }] }),
      });
      if (response.ok) {
        const body = await readLlmUpstreamJsonObject(response);
        if (Array.isArray(body.content) && body.stop_reason === 'end_turn') {
          responseText = body.content.filter((part: Record<string, unknown>) => part.type === 'text' && typeof part.text === 'string')
            .map((part: Record<string, unknown>) => part.text).join('');
          if (responseText.length <= 32_768 && !hasCrisisTerm(responseText)) {
            output = JSON.parse(responseText); outcome = 'completed';
          }
        }
        const usage = body.usage as Record<string, unknown> | undefined;
        if (typeof usage?.input_tokens === 'number' && typeof usage.output_tokens === 'number') {
          const total = usage.input_tokens + usage.output_tokens;
          if (Number.isSafeInteger(total) && total >= 0) tokens = total;
        }
      }
    } catch { /* Ambiguous dispatch: keep the spend and quota, suppress raw details. */ }
    finally { await transitionLlmProxyCapacity(deps.rpc, capacity.reservationId, 'settle'); }
    if (await recheckLlmConsent(deps.rpc, consent.lease)) { output = null; outcome = 'consent_withheld'; }
    const audited = await deps.audit({
      id: crypto.randomUUID(), user_id: input.userId, purpose: input.purpose,
      prompt_hash: djb2(input.system + input.prompt), output_hash: djb2(responseText),
      model_used: deps.model + (outcome === 'completed' ? '' : '+' + outcome),
      latency_ms: Date.now() - started, safety_zone: hasCrisisTerm(responseText) ? 'red' : 'green', event_source: 'server_verified',
      key_combo: 'ANTHROPIC_API_KEY', total_tokens: tokens, vertex_backend: false,
      reasoning_vendor: 'claude', reasoning_effort: 'none',
    });
    if (!audited || output === null) return fail();
    return output;
  };
}
