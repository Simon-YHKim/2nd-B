// Claude proxy Edge Function -- the Anthropic backend for D-26 Phase 2
// purpose-keyed vendor routing (and, legacy, EXPO_PUBLIC_REASONING_PROVIDER=claude).
//
// Why: like gemini-proxy, this keeps the model API key server-side. The
// Anthropic key (ANTHROPIC_API_KEY) NEVER reaches the client bundle; the client
// sends the prompt, this function signs and forwards it, the answer comes back.
// It mirrors gemini-proxy's security boundary 1:1 -- only the upstream provider
// differs -- so the same auth, crisis gate, spend cap, entitlement gate, and
// audit row all apply. Shared plumbing lives in ../_shared/llm-proxy-common.ts.
//
// Auth: requires a valid Supabase JWT (verify_jwt is set in config.toml).
//
// Secrets the operator sets via the Supabase Dashboard:
//   ANTHROPIC_API_KEY        -- the Anthropic Console key (workspace "2ndb-reasoning")
//   ANTHROPIC_MODEL          -- optional GLOBAL kill-switch: when set it beats
//                              every built-in PURPOSE_MODEL seat (fleet-wide
//                              downgrade in a cost/outage incident). Only the
//                              per-purpose JSON below outranks it.
//   ANTHROPIC_PURPOSE_MODELS -- optional JSON object { purpose: model-id } that
//                              overrides individual seats without a code change
//                              (e.g. flip persona_narrative to sonnet-5 if the
//                              KO-prose pilot rejects opus). Highest priority.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically and used
// for the server-side spend cap + ai_audit_log write (shared with gemini-proxy).
//
// D-26: the MODEL CHOICE IS SERVER-OWNED. The client's `model` field is
// accepted-but-ignored; the purpose label picks the seat. A tampered client can
// therefore never self-select an expensive model (SAME-QUALITY stays intact --
// seats key on purpose, never on subscription tier).
//
// Request shape:
//   { system: string | null, user: string, model?: string (ignored),
//     purpose?: string, effort?: 'low'|'medium'|'high'|'xhigh'|'max',
//     responseSchema?: object (Gemini-style; normalized to JSON Schema here) }
// Response shape (identical to gemini-proxy):
//   { text: string, modelUsed: string, latencyMs: number, audited?: boolean }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  BRAIN_RANK,
  LlmBodyError,
  MAX_ASSEMBLED_LEN,
  MAX_USER_LEN,
  SAFETY_PREAMBLE,
  TIER_RANK,
  UPSTREAM_DETAIL_TRUNCATE,
  auditUpstreamFailure,
  clampLlmPurposeEffort,
  consumeLlmPurposeQuota,
  corsPreflight,
  dailyCapForRank,
  djb2,
  hasCrisisTerm,
  isLlmJsonObject,
  isUsableHeaderValue,
  jsonResponse,
  llmCapacityWeight,
  normalizeResponseSchema,
  readLlmProxyJsonObject,
  readLlmUpstreamErrorText,
  readLlmUpstreamJsonObject,
  requestMatchesLlmPurposeModality,
  reserveLlmProxyCapacity,
  resolveApiKey,
  resolveLlmPurposePolicy,
  transitionLlmProxyCapacity,
  userIdFromJwt,
  utcDay,
} from '../_shared/llm-proxy-common.ts';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const PROVIDER_TIMEOUT_MS = 30_000;
const REASONING_RUN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// D-26 Phase 2 Anthropic seats (server-owned routing). VERY-HIGH-stakes
// self-understanding narrative surfaces run opus; interactive/short surfaces
// run sonnet. persona_narrative starts on opus pending the KO-prose pilot
// (D-26 §4 minority view: flip to sonnet-5 via ANTHROPIC_PURPOSE_MODELS if the
// pilot rejects opus). claude-fable-5 is BANNED by verdict (30-day retention
// requirement + refusal risk conflict with the journal-adjacent trust promise).
// ── OPUS-ONLY as of 2026-08-23 (Simon) ──────────────────────────────────────
// Anthropic is a specialist here, not a general-purpose vendor: it is expensive,
// so it is spent on low-frequency deep reads of the user's whole corpus at top
// quality. Eight sonnet seats (advisor, secondb_chat, gap_synthesize,
// self_model_propose, northstar_propose, ops_recommend, ops_daily_brief,
// ttfv_first_insight) were removed from this map. Those purposes route to
// OpenAI client-side (PHASE2_VENDOR), which is where they now belong.
//
// The shared purpose policy is the allowlist. An outage switch may route only
// explicitly seated purposes here; missing seats fail closed rather than
// turning this key into a generic Sonnet/Opus completion endpoint.
const PURPOSE_MODEL: Record<string, string> = {
  // The defender in the adversarial cross-check (REQ-260823-03). Opus at max,
  // because its rewrite is what the user actually reads.
  crosscheck_defend: 'claude-opus-4-8',
  persona_narrative: 'claude-opus-4-8',
  axis_estimate: 'claude-opus-4-8',
  persona_synthesis: 'claude-opus-4-8',
  digest_weekly: 'claude-opus-4-8',
};

function resolveModel(purpose: string): string | null {
  // Precedence: per-purpose env JSON > ANTHROPIC_MODEL (TRUE global
  // kill-switch -- e.g. fleet-wide opus->sonnet downgrade during a cost
  // incident) > built-in seat. The shared policy rejects missing seats first.
  const raw = (Deno.env.get('ANTHROPIC_PURPOSE_MODELS') ?? '').trim();
  if (raw.length > 0) {
    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      const m = map?.[purpose];
      if (typeof m === 'string' && m.trim().length > 0) return m.trim();
    } catch {
      console.error('[claude-proxy] ANTHROPIC_PURPOSE_MODELS is not valid JSON -- ignoring');
    }
  }
  const globalOverride = (Deno.env.get('ANTHROPIC_MODEL') ?? '').trim();
  if (globalOverride.length > 0) return globalOverride;
  if (Object.prototype.hasOwnProperty.call(PURPOSE_MODEL, purpose)) {
    return PURPOSE_MODEL[purpose];
  }
  return null;
}

// D-26 per-purpose EFFORT CEILING (server-owned -- `effort` is client-reported,
// and price = model x effort x max_tokens, so without this clamp a tampered
// client could run the opus seats at the top rung).
//
// "max" IS now approved, for two seats and no others (Simon, 2026-08-23). The
// comment here used to say no seat was approved for it, and the rank table
// below did not carry the rung at all - which is why effortToAnthropic folded
// max into xhigh and ANTHROPIC_API_KEY__MAX, already registered in production,
// could never be reached. Unknown/unseated purposes are rejected before here.
const PURPOSE_EFFORT_MAX: Record<string, string> = {
  advisor: 'high',
  secondb_chat: 'low',
  gap_synthesize: 'low',
  self_model_propose: 'high',
  northstar_propose: 'high',
  ops_recommend: 'medium',
  ops_daily_brief: 'medium',
  ttfv_first_insight: 'xhigh',
  // Frequency x unit cost, which is the rule Simon gave: max is for the
  // low-frequency reads of the WHOLE corpus, nothing else.
  //   persona_synthesis  whole corpus, rare, and the output is 북극성 itself -> max
  //   digest_weekly      the other whole-corpus read, weekly at most      -> max
  //                      (still has no call site; the rung costs nothing until
  //                       it is wired, and having it wrong later costs more)
  //   persona_narrative  2-3 sentences, cached but mounted on three screens -> high
  //   axis_estimate      structured estimate, not a corpus read            -> high
  persona_narrative: 'high',
  axis_estimate: 'high',
  persona_synthesis: 'max',
  digest_weekly: 'max',
  crosscheck_defend: 'max',
};

// Hard output ceilings per (clamped) effort. With adaptive thinking ON,
// thinking tokens count against max_tokens, so these are deliberately roomy --
// a 4-sentence answer at high effort could otherwise be eaten by its own
// thinking budget and truncate (which we now surface as an error below).
function effortToMaxTokens(clampedEffort: string): number {
  switch (clampedEffort) {
    case 'low':
      return 3072;
    case 'medium':
      return 4096;
    case 'xhigh':
      return 24000;
    // ⚠ UNVERIFIED against the account: no max call has been made yet. If this
    // exceeds the seated model's output limit the API answers 400 and the whole
    // seat fails rather than degrading - but the first max call is exactly the
    // ledger check this change is verified by, so a wrong number surfaces
    // immediately rather than silently.
    case 'max':
      return 32000;
    case 'high':
    default:
      return 8192;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }

  // .trim(): a secret pasted into the dashboard keeps its trailing newline, and a
  // newline in a header value makes `fetch` THROW rather than warn. See
  // ../_shared/axis-key-name.ts:pickApiKey for the outage this caused.
  const apiKey = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
  if (!apiKey || apiKey.length === 0) {
    return jsonResponse(req, { error: 'server_misconfigured_missing_ANTHROPIC_API_KEY' }, 500);
  }

  const userId = userIdFromJwt(authHeader);
  if (!userId) return jsonResponse(req, { error: 'invalid_jwt' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: 'server_misconfigured_supabase_env' }, 500);
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const capacityRpc = (functionName: string, args: Record<string, unknown>) =>
    supabaseAdmin.rpc(functionName, args);
  const auditUpstreamFailureSupplemental = (options: Parameters<typeof auditUpstreamFailure>[1]) =>
    auditUpstreamFailure(supabaseAdmin, options);

  let body: {
    user?: unknown;
    system?: unknown;
    purpose?: unknown;
    effort?: unknown;
    responseSchema?: unknown;
    reasoningRunId?: unknown;
    reasoningSlot?: unknown;
  };
  try {
    body = await readLlmProxyJsonObject(req) as typeof body;
  } catch (error) {
    if (error instanceof LlmBodyError && error.code === 'request_body_too_large') {
      return jsonResponse(req, { error: error.code, max: error.maxBytes }, 413);
    }
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }

  const userText: string = typeof body?.user === 'string' ? body.user : '';
  const systemText: string | null = typeof body?.system === 'string' ? body.system : null;
  const purpose: string | null = typeof body?.purpose === 'string' ? body.purpose : null;
  const effort: string | null = typeof body?.effort === 'string' ? body.effort : null;
  const responseSchemaProvided = body?.responseSchema !== undefined;
  const responseSchema = normalizeResponseSchema(body?.responseSchema);
  const purposePolicy = resolveLlmPurposePolicy(purpose, 'claude');
  if (!purpose || !purposePolicy) {
    return jsonResponse(req, { error: 'purpose_not_seated', purpose: purpose ?? null }, 400);
  }
  if (!requestMatchesLlmPurposeModality(purposePolicy, 'text')) {
    return jsonResponse(req, { error: 'purpose_modality_mismatch' }, 400);
  }
  if (responseSchemaProvided && (!responseSchema || responseSchema.type !== 'object')) {
    return jsonResponse(req, { error: 'response_schema_invalid' }, 400);
  }
  const claudeModel = resolveModel(purpose);
  if (!claudeModel) {
    return jsonResponse(req, { error: 'purpose_not_seated', purpose }, 400);
  }
  const reasoningRunId = typeof body?.reasoningRunId === 'string' ? body.reasoningRunId : '';
  const reasoningSlot =
    body?.reasoningSlot === 'records' || body?.reasoningSlot === 'sources'
      ? body.reasoningSlot
      : '';

  if (userText.length === 0) return jsonResponse(req, { error: 'user_required' }, 400);
  if (userText.length > MAX_USER_LEN) {
    return jsonResponse(req, { error: 'user_too_long', max: MAX_USER_LEN, got: userText.length }, 413);
  }
  if (systemText && systemText.length > MAX_ASSEMBLED_LEN) {
    return jsonResponse(req, { error: 'system_too_long', max: MAX_ASSEMBLED_LEN, got: systemText.length }, 413);
  }

  // R1-A: server-side crisis classifier -- reject before any paid Claude call.
  // Scans ONLY the `user` turn (the genuine utterance), never the curated
  // `system` channel (which legitimately carries crisis-reference vocabulary).
  if (hasCrisisTerm(userText)) {
    return jsonResponse(req, { error: 'safety_red_zone', reason: 'crisis_term_detected' }, 422);
  }

  // Mandatory withdrawal-aware consent before entitlement, spend, or egress.
  try {
    const { data: consentOk, error: consentErr } = await supabaseAdmin.rpc(
      'effective_llm_consent',
      { p_user_id: userId },
    );
    if (consentErr) {
      console.error('[claude-proxy] effective consent lookup failed');
      return jsonResponse(req, { error: 'consent_check_unavailable' }, 503);
    }
    if (consentOk !== true) return jsonResponse(req, { error: 'consent_required' }, 403);
  } catch {
    console.error('[claude-proxy] effective consent lookup threw');
    return jsonResponse(req, { error: 'consent_check_unavailable' }, 503);
  }

  // EFFECTIVE tier via effective_subscription_tier (0088), NOT the raw
  // subscription_tier column -- mirrors gemini-proxy. The raw column stays
  // 'brain'/'cortex' after expiry until the cancel webhook lands, so reading it
  // let a lapsed subscriber keep the brain-only premium purposes + the brain
  // daily ceiling, and 403'd a comped judge (raw 'free' + judge_mode). The RPC
  // collapses expired->free and comps judge->brain, matching the cap RPCs.
  let tierRank: number | null = null;
  {
    try {
      const { data: effTier, error: tierErr } = await supabaseAdmin.rpc(
        'effective_subscription_tier',
        { p_user_id: userId },
      );
      if (tierErr) {
        console.error('[claude-proxy] effective-tier lookup failed');
        return jsonResponse(req, { error: 'entitlement_check_unavailable' }, 503);
      }
      const tier = (effTier as string | null) ?? 'free';
      if (!Object.prototype.hasOwnProperty.call(TIER_RANK, tier)) {
        console.error('[claude-proxy] effective-tier lookup returned an unknown tier');
        return jsonResponse(req, { error: 'entitlement_check_unavailable' }, 503);
      }
      tierRank = TIER_RANK[tier];
    } catch {
      console.error('[claude-proxy] effective-tier lookup threw');
      return jsonResponse(req, { error: 'entitlement_check_unavailable' }, 503);
    }
  }
  const tierLookupFailed = tierRank === null;
  if (tierLookupFailed || tierRank === null) {
    return jsonResponse(req, { error: 'entitlement_check_unavailable' }, 503);
  }
  if (purposePolicy.minimumTier === 'brain') {
    if (tierRank === null || tierRank < BRAIN_RANK) {
      return jsonResponse(req, { error: 'entitlement_required', feature: purpose }, 403);
    }
  }

  const purposeQuota = await consumeLlmPurposeQuota(capacityRpc, userId, purpose);
  if (!purposeQuota.ok) {
    if (purposeQuota.reason === 'limited') {
      return jsonResponse(req, { error: 'purpose_limit_exceeded', feature: purpose }, 429);
    }
    console.error('[claude-proxy] purpose quota unavailable');
    return jsonResponse(req, { error: 'purpose_limit_unavailable' }, 503);
  }

  // Spend cap (cost backstop) -- shared per-user/day counter with gemini-proxy.
  let spendErr: { message?: string } | null = null;
  try {
    const result = await supabaseAdmin.rpc('bump_gemini_spend', {
      p_user_id: userId,
      p_day: utcDay(),
      p_cap: dailyCapForRank(tierRank),
    });
    spendErr = result.error;
  } catch {
    console.error('[claude-proxy][ALERT] spend check threw -- failing closed');
    return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
  }
  if (spendErr) {
    const msg = spendErr.message ?? '';
    if (msg.includes('gemini_spend_exceeded')) {
      return jsonResponse(req, { error: 'daily_limit_exceeded' }, 429);
    }
    console.error('[claude-proxy][ALERT] spend check unavailable -- failing closed:', msg);
    return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
  }
  // True only on the clean-bump path, so a refund can never decrement a counter
  // that was never incremented.
  const spentBumped = !spendErr;

  // Refund only while it is provable that no provider request was dispatched.
  const refundBeforeDispatch = async () => {
    if (!spentBumped) return;
    try {
      await supabaseAdmin.rpc('refund_gemini_spend', { p_user_id: userId, p_day: utcDay() });
    } catch (error) {
      console.warn('[claude-proxy] spend refund failed:', String(error).slice(0, UPSTREAM_DETAIL_TRUNCATE));
    }
  };
  // This failure alias is pre-dispatch only; billed or billing-ambiguous paths
  // below deliberately never refund spend.
  const refundOnFailure = refundBeforeDispatch;

  const clampedEffort = clampLlmPurposeEffort(
    purposePolicy,
    effort,
    'claude',
    PURPOSE_EFFORT_MAX[purpose],
  );
  // D-27: sign with the (model × effort) combo key when provisioned, else base
  // ANTHROPIC_API_KEY (fallback keeps calls working; that usage attributes to
  // base). Only changes WHICH key signs the already-server-owned request.
  const resolvedKey = resolveApiKey('ANTHROPIC', claudeModel, clampedEffort, apiKey);
  if (!resolvedKey.usedCombo) {
    console.warn(
      `[claude-proxy] combo key ${resolvedKey.secretName} absent -- using base ANTHROPIC_API_KEY (usage attributes to base)`,
    );
  }
  const keyCombo = resolvedKey.usedCombo ? resolvedKey.secretName : 'ANTHROPIC_API_KEY';

  // A key that cannot be a header value makes `fetch` THROW, which every path
  // below reports as `upstream_unreachable` -- indistinguishable from the vendor
  // being down. Say what is actually wrong instead, naming the SECRET but never
  // its value. (2026-08-19: this exact case took 30 minutes to identify.)
  if (!isUsableHeaderValue(resolvedKey.apiKey)) {
    // Nothing was sent upstream, so the daily-cap unit must go back -- otherwise a
    // misconfigured secret quietly eats a user's whole allowance, one unit per
    // attempt, while they see only an error. refund_gemini_spend (0110) floors at
    // 0 and no-ops when there is no row, so a stray refund is safe.
    await refundOnFailure();
    console.error(
      `[claude-proxy] ANTHROPIC_API_KEY is not usable as a header value (control character in the secret?)`,
    );
    return jsonResponse(req, {
      error: 'server_misconfigured_malformed_api_key',
      secret: keyCombo,
    }, 500);
  }

  const systemPrompt =
    systemText && systemText.length > 0 ? `${SAFETY_PREAMBLE}\n\n${systemText}` : SAFETY_PREAMBLE;
  const anthropicBody = {
    model: claudeModel,
    // ops_daily_brief packs up to 14 keys x 3 recs into ONE object; with adaptive
    // thinking, thinking tokens count against max_tokens, so medium (4096) is
    // eaten before the object closes and it truncates (surfaced as an error
    // below). Floor the consolidated seat; the one call REPLACES up to 14
    // per-domain calls, a net egress cut. [ops-brief-output-floor] 16000
    max_tokens: Math.max(
      effortToMaxTokens(clampedEffort),
      purpose === 'ops_daily_brief' ? 16000 : 0,
    ),
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
    // D-26: adaptive thinking + effort are the reasoning levers (the old
    // max_tokens-only wiring is retired). Explicit adaptive because opus-4-8
    // runs thinking OFF when the field is omitted (sonnet-5 defaults adaptive).
    thinking: { type: 'adaptive' },
    output_config: {
      effort: clampedEffort,
      ...(responseSchema ? { format: { type: 'json_schema', schema: responseSchema } } : {}),
    },
  };

  const capacity = await reserveLlmProxyCapacity(
    capacityRpc,
    'claude',
    claudeModel,
    llmCapacityWeight(anthropicBody.max_tokens),
  );
  if (!capacity.ok) {
    await refundBeforeDispatch();
    return jsonResponse(
      req,
      { error: capacity.reason === 'limited' ? 'llm_capacity_exceeded' : 'llm_capacity_unavailable' },
      capacity.reason === 'limited' ? 429 : 503,
    );
  }
  const releaseCapacity = () =>
    transitionLlmProxyCapacity(capacityRpc, capacity.reservationId, 'release');

  if (purpose === 'reasoning_connect') {
    if (!REASONING_RUN_ID_RE.test(reasoningRunId) || !reasoningSlot) {
      await releaseCapacity();
      await refundBeforeDispatch();
      return jsonResponse(req, { error: 'reasoning_reservation_required' }, 403);
    }
    try {
      const { data: claimOk, error: claimErr } = await supabaseAdmin.rpc(
        'claim_reasoning_proxy_call',
        { p_user_id: userId, p_run_id: reasoningRunId, p_slot: reasoningSlot },
      );
      if (claimErr) {
        console.error('[claude-proxy] reasoning reservation claim unavailable');
        await releaseCapacity();
        await refundBeforeDispatch();
        return jsonResponse(req, { error: 'reasoning_reservation_unavailable' }, 503);
      }
      if (claimOk !== true) {
        await releaseCapacity();
        await refundBeforeDispatch();
        return jsonResponse(req, { error: 'reasoning_reservation_required' }, 403);
      }
    } catch {
      console.error('[claude-proxy] reasoning reservation claim threw');
      await releaseCapacity();
      await refundBeforeDispatch();
      return jsonResponse(req, { error: 'reasoning_reservation_unavailable' }, 503);
    }
  }

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'x-api-key': resolvedKey.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (e) {
    await transitionLlmProxyCapacity(capacityRpc, capacity.reservationId, 'settle');
    // REQ-260824-01: a failing seat must leave a trace. Without this the one
    // table that records the AI layer holds only the calls that worked.
    await auditUpstreamFailure(supabaseAdmin, {
      userId, purpose, model: claudeModel, vendor: 'claude',
      outcome: 'upstream_unreachable', latencyMs: Date.now() - t0,
      keyCombo, promptHash: djb2(`${systemText ?? ''}${userText}`),
    });
    return jsonResponse(req, { error: 'upstream_unreachable', detail: String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE) }, 502);
  }
  await transitionLlmProxyCapacity(capacityRpc, capacity.reservationId, 'settle');
  const latencyMs = Date.now() - t0;

  if (!upstream.ok) {
    let errBody = '';
    try {
      errBody = await readLlmUpstreamErrorText(upstream);
    } catch {
      errBody = 'upstream response unavailable';
    }
    await auditUpstreamFailure(supabaseAdmin, {
      userId, purpose, model: claudeModel, vendor: 'claude',
      outcome: `upstream_${upstream.status}`, latencyMs,
      keyCombo, promptHash: djb2(`${systemText ?? ''}${userText}`),
    });
    return jsonResponse(req, {
      error: 'upstream_error',
      status: upstream.status,
      detail: errBody.slice(0, UPSTREAM_DETAIL_TRUNCATE),
    }, 502);
  }

  // A 200 with a non-JSON body (gateway HTML interstitial, mid-stream abort)
  // previously threw here unhandled -> 500 with no CORS headers, after the model
  // may already have billed. Catch it and 502 without refunding (billing is
  // ambiguous once we have a 200).
  let data: {
    content?: unknown;
    model?: unknown;
    stop_reason?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  try {
    data = await readLlmUpstreamJsonObject(upstream) as typeof data;
    if (!Array.isArray(data.content)) throw new LlmBodyError('upstream_bad_payload');
    if (
      (data.model !== undefined && typeof data.model !== 'string') ||
      (data.stop_reason !== undefined && data.stop_reason !== null && typeof data.stop_reason !== 'string')
    ) throw new LlmBodyError('upstream_bad_payload');
    for (const block of data.content) {
      if (!isLlmJsonObject(block) || typeof block.type !== 'string') {
        throw new LlmBodyError('upstream_bad_payload');
      }
      if (block.type === 'text' && typeof block.text !== 'string') {
        throw new LlmBodyError('upstream_bad_payload');
      }
    }
    if (data.usage !== undefined) {
      if (!isLlmJsonObject(data.usage)) throw new LlmBodyError('upstream_bad_payload');
      for (const count of [data.usage.input_tokens, data.usage.output_tokens]) {
        if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) {
          throw new LlmBodyError('upstream_bad_payload');
        }
      }
    }
  } catch {
    await auditUpstreamFailureSupplemental({
      userId, purpose, model: claudeModel, vendor: 'claude',
      outcome: 'upstream_bad_payload', latencyMs,
      keyCombo, promptHash: djb2(`${systemText ?? ''}${userText}`),
    });
    return jsonResponse(req, { error: 'upstream_bad_payload' }, 502);
  }
  // Anthropic returns content as an array of blocks; concatenate the text blocks
  // (thinking blocks are skipped -- raw reasoning is never forwarded).
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text: string = blocks
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => (typeof b?.text === 'string' ? b.text : ''))
    .join('');
  const modelUsed: string = typeof data?.model === 'string' ? data.model : claudeModel;

  // Safety-classifier refusal (HTTP 200 + stop_reason:"refusal"). Surface as an
  // upstream error so every caller takes its existing fail-soft path instead of
  // rendering an empty string. Still audited below (the model WAS called).
  const refused = data?.stop_reason === 'refusal';
  // Truncation (stop_reason:"max_tokens"): with adaptive thinking the budget
  // includes thinking tokens, so a truncated reply can be a mid-JSON stump or
  // even all-thinking/empty. NEVER return it as a 200 -- parsers downstream
  // would read it as thin data. Audited with a +truncated marker, then 502 so
  // callers take their fail-soft/failover path.
  const truncated = data?.stop_reason === 'max_tokens';

  // C3: write the audit row server-side (parity with gemini-proxy). vertex_backend
  // is false; model_used carries the claude model so the trail shows the backend.
  // D-27: usage tokens for per-combo re-decomposition (Anthropic returns
  // usage.input_tokens + usage.output_tokens).
  const claudeUsage = (data?.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
  const claudeTotalTokens =
    (Number(claudeUsage.input_tokens) || 0) + (Number(claudeUsage.output_tokens) || 0) || null;
  let audited = false;
  try {
    const { error: auditErr } = await supabaseAdmin.from('ai_audit_log').insert({
      user_id: userId,
      event_source: 'server_verified',
      prompt_hash: djb2(`${systemText ?? ''}${userText}`),
      output_hash: djb2(text),
      model_used: refused ? `${modelUsed}+refusal` : truncated ? `${modelUsed}+truncated` : modelUsed,
      vertex_backend: false,
      safety_zone: hasCrisisTerm(text) ? 'red' : 'green',
      latency_ms: latencyMs,
      // D-27 re-decomposition axes (nullable; NULL on legacy/native-path rows).
      purpose,
      reasoning_vendor: 'claude',
      reasoning_effort: clampedEffort,
      key_combo: keyCombo,
      total_tokens: claudeTotalTokens,
    });
    audited = !auditErr;
    if (auditErr) console.warn('[claude-proxy] audit insert failed:', auditErr.message);
  } catch (e) {
    console.warn('[claude-proxy] audit insert threw:', String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE));
  }

  if (refused) {
    return jsonResponse(req, { error: 'upstream_refusal', modelUsed, latencyMs }, 502);
  }
  if (truncated) {
    return jsonResponse(req, { error: 'upstream_truncated', modelUsed, latencyMs }, 502);
  }

  return jsonResponse(req, { text, modelUsed, latencyMs, audited });
});
