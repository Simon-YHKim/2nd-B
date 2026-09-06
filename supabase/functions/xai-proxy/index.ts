// xai-proxy -- Grok (xAI) as a reasoning vendor. REQ-260821-01, Simon 2026-08-21.
//
// The fourth vendor proxy, and the shape is deliberately the same as its three
// siblings: same shared guards in the same order, same spend counter, same
// audit row, same response envelope. What differs is the vendor call in the
// middle. Anything that touches money or the ledger is shared code
// (_shared/llm-proxy-common.ts) precisely so the four cannot drift on it.
//
// ── WHY THIS EXISTS, STATED PLAINLY ──────────────────────────────────────────
//
// The coding session recommended NOT lighting a new proxy path in the last week
// before the 2026-08-31 Gemini deadline (docs/LLM-VENDOR-PLACEMENT.md 3).
// Simon overrode that on 2026-08-21: put Grok in. So this file exists, and the
// concern is answered by keeping the blast radius small rather than by arguing:
//
//   * NOTHING routes here by default. Every switch still defaults elsewhere;
//     reaching this proxy takes a deliberate variable change.
//   * The seat list is the 12 reasoning seats plus chat. The nine backbone
//     purposes are deliberately NOT seated -- see the note on PURPOSE_MODEL.
//   * Every model id and every optional request field has an env override, so
//     a wrong guess is a variable change and not a redeploy.
//
// ── WHAT IS UNVERIFIED, AND WHAT WAS DONE ABOUT IT ───────────────────────────
//
// This proxy was written without an account to probe. Three things are
// therefore marked UNVERIFIED, and each one is behind a lever rather than a
// literal, because a wrong constant here is a 400 on a whole seat:
//
//   1. The model id. Default 'grok-4'. refresh-models.ts already discovers the
//      frontier id nightly and writes XAI_MODEL, which overrides this.
//   2. reasoning_effort. xAI accepts it on some models and rejects it on
//      others, and an unsupported PARAMETER is a 400 on the entire call, not a
//      degradation. So it is NOT sent unless XAI_SEND_REASONING_EFFORT=1. The
//      effort still bounds max_tokens and is still recorded in the audit row,
//      so the cost lever works either way.
//   3. Structured output. Sent as json_schema, the same dialect openai-proxy
//      uses. XAI_RESPONSE_FORMAT can downgrade it to json_object or turn it
//      off entirely without a redeploy.
//
// Confirm all three against the account before pointing a live seat here, and
// watch ai_audit_log.reasoning_vendor='xai' for the first rows.

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
  type LlmPolicyModelTier,
  transitionLlmProxyCapacity,
  userIdFromJwt,
  utcDay,
} from '../_shared/llm-proxy-common.ts';

const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';
const PROVIDER_TIMEOUT_MS = 30_000;
const REASONING_RUN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UNVERIFIED against the account. XAI_MODEL overrides every seat below (true
// global kill-switch, same role ANTHROPIC_MODEL and OPENAI_MODEL play in the
// siblings), and refresh-models.ts writes it nightly from the live model list.
const DEFAULT_XAI_MODEL = 'grok-4';

// Seats. The twelve reasoning purposes plus chat -- exactly the set a vendor
// switch can point here (EXPO_PUBLIC_LLM_VENDOR, EXPO_PUBLIC_CHAT_VENDOR).
//
// ⚠ THE NINE BACKBONE PURPOSES ARE ABSENT ON PURPOSE. They are the app's
// highest-volume surfaces (one classify per capture, one per clip), and this
// file has no cheap tier confirmed against the account. Seating them on the
// frontier model to make EXPO_PUBLIC_BACKBONE_VENDOR=xai "work" would be the
// most expensive mistake available here. Unseated, that setting fails loudly
// with purpose_not_seated instead of quietly producing a bill. Seat them when a
// cheap Grok tier is confirmed, not before.
const PURPOSE_MODEL: Record<string, string> = {
  advisor: DEFAULT_XAI_MODEL,
  persona_narrative: DEFAULT_XAI_MODEL,
  gap_synthesize: DEFAULT_XAI_MODEL,
  self_model_propose: DEFAULT_XAI_MODEL,
  northstar_propose: DEFAULT_XAI_MODEL,
  axis_estimate: DEFAULT_XAI_MODEL,
  persona_synthesis: DEFAULT_XAI_MODEL,
  ops_recommend: DEFAULT_XAI_MODEL,
  ops_daily_brief: DEFAULT_XAI_MODEL,
  digest_weekly: DEFAULT_XAI_MODEL,
  ttfv_first_insight: DEFAULT_XAI_MODEL,
  cluster_infer: DEFAULT_XAI_MODEL,
  secondb_chat: DEFAULT_XAI_MODEL,
};

// Vendor-local ceilings can only lower the shared purpose ceiling.
const PURPOSE_EFFORT_MAX: Record<string, string> = {
  advisor: 'high',
  persona_narrative: 'high',
  gap_synthesize: 'high',
  self_model_propose: 'high',
  northstar_propose: 'high',
  axis_estimate: 'high',
  persona_synthesis: 'high',
  ops_recommend: 'high',
  ops_daily_brief: 'high',
  digest_weekly: 'high',
  ttfv_first_insight: 'high',
  cluster_infer: 'medium',
  // Chat is conversational, not deliberative, and it is the highest-volume
  // surface that can reach this proxy at all. 'low' is the real cost lever
  // here, and a ceiling rather than a request so a stale client cannot raise it.
  secondb_chat: 'low',
};

/**
 * Precedence: per-purpose env JSON > XAI_MODEL (global kill-switch, e.g. a
 * fleet-wide downgrade during a cost incident) > built-in seat > default.
 * Identical to the sibling proxies so an operator does not have to remember a
 * different order per vendor.
 */
function serverModelForTier(modelTier: LlmPolicyModelTier): string | null {
  // Only one xAI model has been provisioned and its cheaper families have not
  // been verified. The logical tier is still enforced here: fixed/lite labels
  // cannot silently inherit the frontier model. Flash/pro currently share the
  // same server-owned model until a cheaper verified model is configured.
  return modelTier === 'flash' || modelTier === 'pro' ? DEFAULT_XAI_MODEL : null;
}

function resolveModel(purpose: string, modelTier: LlmPolicyModelTier): string | null {
  const baseline = serverModelForTier(modelTier);
  if (!baseline) return null;
  const raw = (Deno.env.get('XAI_PURPOSE_MODELS') ?? '').trim();
  if (raw.length > 0) {
    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      const m = map?.[purpose];
      if (typeof m === 'string' && m.trim().length > 0) return m.trim();
    } catch {
      console.warn('[xai-proxy] XAI_PURPOSE_MODELS is not valid JSON -- ignoring');
    }
  }
  const global = (Deno.env.get('XAI_MODEL') ?? '').trim();
  if (global.length > 0) return global;
  return PURPOSE_MODEL[purpose] ?? baseline;
}

// Output ceiling per clamped effort. Roomy for the same reason as the siblings:
// truncation is surfaced as an error below, never as a silent 200, so a
// too-tight ceiling costs a whole call rather than shortening an answer.
function effortToMaxTokens(clampedEffort: string): number {
  switch (clampedEffort) {
    case 'none':
      return 2048;
    case 'low':
      return 3072;
    case 'medium':
      return 4096;
    case 'xhigh':
      return 24000;
    case 'high':
    default:
      return 8192;
  }
}

/**
 * UNVERIFIED (see the header). xAI's OpenAI-compatible surface accepts
 * reasoning_effort on some models and rejects it on others, and an unsupported
 * parameter fails the WHOLE request rather than being ignored. Off unless an
 * operator has confirmed the seated model takes it.
 */
function sendsReasoningEffort(): boolean {
  return (Deno.env.get('XAI_SEND_REASONING_EFFORT') ?? '').trim() === '1';
}

/**
 * UNVERIFIED (see the header). 'json_schema' matches what openai-proxy sends
 * and is the intent; 'json_object' is the fallback if the schema dialect is
 * rejected; 'off' drops structured output entirely and lets the client's own
 * parser deal with prose. A lever, so discovering the answer in production
 * costs a variable and not a deploy.
 */
function responseFormatMode(): 'json_schema' | 'json_object' | 'off' {
  const raw = (Deno.env.get('XAI_RESPONSE_FORMAT') ?? '').trim().toLowerCase();
  if (raw === 'json_object' || raw === 'off') return raw;
  return 'json_schema';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }

  const apiKey = (Deno.env.get('XAI_API_KEY') ?? '').trim();
  if (!apiKey || apiKey.length === 0) {
    return jsonResponse(req, { error: 'server_misconfigured_missing_api_key' }, 500);
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
    image?: unknown;
    audio?: unknown;
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
  const purposePolicy = resolveLlmPurposePolicy(purpose, 'xai');
  if (!purpose || !purposePolicy) {
    return jsonResponse(req, { error: 'purpose_not_seated', purpose: purpose ?? null }, 400);
  }
  if (responseSchemaProvided && (!responseSchema || responseSchema.type !== 'object')) {
    return jsonResponse(req, { error: 'response_schema_invalid' }, 400);
  }
  const reasoningRunId = typeof body?.reasoningRunId === 'string' ? body.reasoningRunId : '';
  const reasoningSlot =
    body?.reasoningSlot === 'records' || body?.reasoningSlot === 'sources'
      ? body.reasoningSlot
      : '';

  // This proxy has no image or audio path. Refusing the payload is better than
  // silently dropping it: a caller that attached a photo and got a confident
  // answer about nothing would have no way to tell. The client should not send
  // one either -- MULTIMODAL_PURPOSES never resolves to this vendor -- so this
  // catches a misrouted call rather than a normal one.
  if ((body?.image && typeof body.image === 'object') || (body?.audio && typeof body.audio === 'object')) {
    return jsonResponse(req, { error: 'attachment_not_supported', vendor: 'xai' }, 415);
  }
  if (!requestMatchesLlmPurposeModality(purposePolicy, 'text')) {
    return jsonResponse(req, { error: 'purpose_modality_mismatch' }, 400);
  }

  if (userText.length === 0) return jsonResponse(req, { error: 'user_required' }, 400);
  if (userText.length > MAX_USER_LEN) {
    return jsonResponse(req, { error: 'user_too_long', max: MAX_USER_LEN, got: userText.length }, 413);
  }
  if (systemText && systemText.length > MAX_ASSEMBLED_LEN) {
    return jsonResponse(req, { error: 'system_too_long', max: MAX_ASSEMBLED_LEN, got: systemText.length }, 413);
  }

  // R1-A: server-side crisis classifier, before any paid call. Scans ONLY the
  // `user` turn, never the curated `system` channel. There is no
  // safety_classify seat here, so unlike the siblings there is no exemption to
  // carry -- if that seat is ever pointed at this vendor, port the
  // LLM_SERVER_SAFETY_SEAT flag with it or the classifier cannot read the text
  // it exists to classify.
  if (hasCrisisTerm(userText)) {
    return jsonResponse(req, { error: 'safety_red_zone', reason: 'crisis_term_detected' }, 422);
  }

  try {
    const { data: consentOk, error: consentErr } = await supabaseAdmin.rpc(
      'effective_llm_consent',
      { p_user_id: userId },
    );
    if (consentErr) {
      console.error('[xai-proxy] effective consent lookup failed');
      return jsonResponse(req, { error: 'consent_check_unavailable' }, 503);
    }
    if (consentOk !== true) return jsonResponse(req, { error: 'consent_required' }, 403);
  } catch {
    console.error('[xai-proxy] effective consent lookup threw');
    return jsonResponse(req, { error: 'consent_check_unavailable' }, 503);
  }

  // EFFECTIVE tier (0088), not the raw column: the raw one stays 'brain' after
  // expiry until the cancel webhook lands. The lookup also selects the daily
  // cap, so an error or unknown tier fails closed for every xAI seat.
  let tierRank: number | null = null;
  let tierLookupFailed = false;
  {
    try {
      const { data: effTier, error: tierErr } = await supabaseAdmin.rpc(
        'effective_subscription_tier',
        { p_user_id: userId },
      );
      if (tierErr) {
        tierLookupFailed = true;
        console.error('[xai-proxy] effective-tier lookup failed:', tierErr.message ?? String(tierErr));
      } else {
        const t = typeof effTier === 'string' ? effTier : '';
        if (!Object.prototype.hasOwnProperty.call(TIER_RANK, t)) {
          tierLookupFailed = true;
          console.error('[xai-proxy] effective-tier lookup returned an unknown tier');
        } else {
          tierRank = TIER_RANK[t];
        }
      }
    } catch {
      tierLookupFailed = true;
      console.error('[xai-proxy] effective-tier lookup threw');
    }
  }
  if (tierLookupFailed || tierRank === null) {
    return jsonResponse(req, { error: 'entitlement_check_unavailable' }, 503);
  }
  if (purposePolicy.minimumTier === 'brain' && tierRank < BRAIN_RANK) {
    return jsonResponse(req, { error: 'entitlement_required', feature: purpose }, 403);
  }

  const xaiModel = resolveModel(purpose, purposePolicy.modelTier);
  if (!xaiModel) {
    return jsonResponse(req, { error: 'purpose_model_unavailable', purpose }, 503);
  }
  const clampedEffort = clampLlmPurposeEffort(
    purposePolicy,
    effort,
    'xai',
    PURPOSE_EFFORT_MAX[purpose],
  );

  const purposeQuota = await consumeLlmPurposeQuota(capacityRpc, userId, purpose);
  if (!purposeQuota.ok) {
    if (purposeQuota.reason === 'limited') {
      return jsonResponse(req, { error: 'purpose_limit_exceeded', feature: purpose }, 429);
    }
    console.error('[xai-proxy] purpose quota unavailable');
    return jsonResponse(req, { error: 'purpose_limit_unavailable' }, 503);
  }

  // Spend cap -- the SAME shared per-user/day counter as the other three
  // proxies. Adding a vendor must not add an allowance.
  let spendErr: { message?: string } | null = null;
  try {
    const result = await supabaseAdmin.rpc('bump_gemini_spend', {
      p_user_id: userId,
      p_day: utcDay(),
      p_cap: dailyCapForRank(tierRank),
    });
    spendErr = result.error;
  } catch {
    console.error('[xai-proxy][ALERT] spend check threw -- failing closed');
    return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
  }
  if (spendErr) {
    const msg = spendErr.message ?? '';
    if (msg.includes('gemini_spend_exceeded')) {
      return jsonResponse(req, { error: 'daily_limit_exceeded' }, 429);
    }
    console.error('[xai-proxy][ALERT] spend check unavailable -- failing closed:', msg);
    return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
  }
  // True only on the clean-bump path, so a refund can never decrement a counter
  // that was never incremented.
  const spentBumped = !spendErr;

  const refundBeforeDispatch = async () => {
    if (!spentBumped) return;
    try {
      await supabaseAdmin.rpc('refund_gemini_spend', { p_user_id: userId, p_day: utcDay() });
    } catch (error) {
      console.warn('[xai-proxy] spend refund failed:', String(error).slice(0, UPSTREAM_DETAIL_TRUNCATE));
    }
  };
  // This failure alias is pre-dispatch only; billed or billing-ambiguous paths
  // below deliberately never refund spend.
  const refundOnFailure = refundBeforeDispatch;

  // D-27: sign with the (model x effort) combo key when one is provisioned,
  // else the base XAI_API_KEY. Only changes WHICH key signs an
  // already-server-owned request. An unknown model still gets a deterministic
  // combo name (modelSlug squashes it), so a model change needs no code edit.
  const resolvedKey = resolveApiKey('XAI', xaiModel, clampedEffort, apiKey);
  if (!resolvedKey.usedCombo) {
    console.warn(
      `[xai-proxy] combo key ${resolvedKey.secretName} absent -- using base XAI_API_KEY (usage attributes to base)`,
    );
  }
  const keyCombo = resolvedKey.usedCombo ? resolvedKey.secretName : 'XAI_API_KEY';

  // A key that cannot be a header value makes `fetch` THROW, and every path
  // below would report that as `upstream_unreachable` -- indistinguishable from
  // xAI being down. Name the SECRET, never its value. (This exact confusion
  // cost about thirty minutes on the OpenAI key on 2026-08-19.)
  if (!isUsableHeaderValue(resolvedKey.apiKey)) {
    await refundOnFailure();
    console.error('[xai-proxy] XAI_API_KEY is not usable as a header value (control character in the secret?)');
    return jsonResponse(req, { error: 'server_misconfigured_malformed_api_key', secret: keyCombo }, 500);
  }

  const systemPrompt =
    systemText && systemText.length > 0 ? `${SAFETY_PREAMBLE}\n\n${systemText}` : SAFETY_PREAMBLE;

  const rfMode = responseFormatMode();
  const xaiBody = {
    model: xaiModel,
    // ops_daily_brief packs up to 14 keys x 3 recs into ONE object, and that one
    // call REPLACES up to 14 per-domain calls. Floor it so the object can close;
    // a truncated brief is surfaced as an error below, i.e. a wasted call.
    max_tokens: Math.max(
      effortToMaxTokens(clampedEffort),
      purpose === 'ops_daily_brief' ? 16000 : 0,
    ),
    ...(sendsReasoningEffort() ? { reasoning_effort: clampedEffort } : {}),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    ...(responseSchema && rfMode === 'json_schema'
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              // strict:false, same as openai-proxy: the client's Gemini-dialect
              // schemas carry a required-SUBSET, and strict mode demands
              // required == every key.
              strict: false,
              schema: responseSchema,
            },
          },
        }
      : {}),
    ...(responseSchema && rfMode === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
  };

  const capacity = await reserveLlmProxyCapacity(
    capacityRpc,
    'xai',
    xaiModel,
    llmCapacityWeight(xaiBody.max_tokens),
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

  // Present on every proxy so a future seat cannot omit the one-shot run bind.
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
        console.error('[xai-proxy] reasoning reservation claim unavailable');
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
      console.error('[xai-proxy] reasoning reservation claim threw');
      await releaseCapacity();
      await refundBeforeDispatch();
      return jsonResponse(req, { error: 'reasoning_reservation_unavailable' }, 503);
    }
  }

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(XAI_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${resolvedKey.apiKey}`,
      },
      body: JSON.stringify(xaiBody),
    });
  } catch (e) {
    await transitionLlmProxyCapacity(capacityRpc, capacity.reservationId, 'settle');
    // REQ-260824-01: a failing seat must leave a trace. Without this the one
    // table that records the AI layer holds only the calls that worked.
    await auditUpstreamFailure(supabaseAdmin, {
      userId, purpose, model: xaiModel, vendor: 'xai',
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
      userId, purpose, model: xaiModel, vendor: 'xai',
      outcome: `upstream_${upstream.status}`, latencyMs,
      keyCombo, promptHash: djb2(`${systemText ?? ''}${userText}`),
    });
    // The three UNVERIFIED fields in the header all fail as a 400 here. The
    // detail is truncated but kept, because "which field did xAI reject" is
    // exactly the question an operator will have on the first bad call.
    return jsonResponse(req, {
      error: 'upstream_error',
      status: upstream.status,
      detail: errBody.slice(0, UPSTREAM_DETAIL_TRUNCATE),
    }, 502);
  }

  // A 200 with a non-JSON body must not throw into a 500 with no CORS headers
  // after the model may already have billed. 502 without refunding: billing is
  // ambiguous once there is a 200.
  let data: { choices?: unknown; model?: unknown; usage?: { total_tokens?: number } };
  try {
    data = await readLlmUpstreamJsonObject(upstream) as typeof data;
    if (!Array.isArray(data.choices) || data.choices.length === 0) {
      throw new LlmBodyError('upstream_bad_payload');
    }
    const firstChoice = data.choices[0];
    if (!isLlmJsonObject(firstChoice) || !isLlmJsonObject(firstChoice.message)) {
      throw new LlmBodyError('upstream_bad_payload');
    }
    const finishReason = firstChoice.finish_reason;
    const content = firstChoice.message.content;
    const refusal = firstChoice.message.refusal;
    if (
      (data.model !== undefined && typeof data.model !== 'string') ||
      (finishReason !== undefined && finishReason !== null && typeof finishReason !== 'string') ||
      (refusal !== undefined && refusal !== null && typeof refusal !== 'string') ||
      (typeof content !== 'string' && typeof refusal !== 'string' && finishReason !== 'content_filter')
    ) throw new LlmBodyError('upstream_bad_payload');
    if (data.usage !== undefined) {
      if (!isLlmJsonObject(data.usage)) throw new LlmBodyError('upstream_bad_payload');
      const totalTokens = data.usage.total_tokens;
      if (
        totalTokens !== undefined &&
        (!Number.isSafeInteger(totalTokens) || totalTokens < 0)
      ) throw new LlmBodyError('upstream_bad_payload');
    }
  } catch {
    await auditUpstreamFailureSupplemental({
      userId, purpose, model: xaiModel, vendor: 'xai',
      outcome: 'upstream_bad_payload', latencyMs,
      keyCombo, promptHash: djb2(`${systemText ?? ''}${userText}`),
    });
    return jsonResponse(req, { error: 'upstream_bad_payload' }, 502);
  }
  const choice = Array.isArray(data?.choices) && isLlmJsonObject(data.choices[0])
    ? data.choices[0]
    : null;
  const message = isLlmJsonObject(choice?.message) ? choice.message : null;
  const rawContent = message?.content;
  const text: string = typeof rawContent === 'string' ? rawContent : '';
  const modelUsed: string = typeof data?.model === 'string' ? data.model : xaiModel;
  const refused =
    choice?.finish_reason === 'content_filter' || typeof message?.refusal === 'string';
  const truncated = choice?.finish_reason === 'length';

  // C3: the audit row is written server-side, same as the siblings. This is the
  // ONLY place the vendor of a call is recorded, and it is how the first live
  // Grok call will be confirmed: reasoning_vendor = 'xai'.
  const totalTokens = Number(data?.usage?.total_tokens) || null;
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
      purpose,
      reasoning_vendor: 'xai',
      // The clamped effort is recorded even when it was not SENT (see
      // sendsReasoningEffort). It is still what bounded max_tokens, so the
      // ledger stays comparable across vendors.
      reasoning_effort: clampedEffort,
      key_combo: keyCombo,
      total_tokens: totalTokens,
    });
    audited = !auditErr;
    if (auditErr) console.warn('[xai-proxy] audit insert failed:', auditErr.message);
  } catch (e) {
    console.warn('[xai-proxy] audit insert threw:', String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE));
  }

  if (refused) {
    return jsonResponse(req, { error: 'upstream_refusal', modelUsed, latencyMs }, 502);
  }
  if (truncated) {
    return jsonResponse(req, { error: 'upstream_truncated', modelUsed, latencyMs }, 502);
  }

  return jsonResponse(req, { text, modelUsed, latencyMs, audited });
});
