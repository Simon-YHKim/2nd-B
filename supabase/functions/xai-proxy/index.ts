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
  MAX_ASSEMBLED_LEN,
  MAX_USER_LEN,
  PREMIUM_PURPOSES,
  SAFETY_PREAMBLE,
  TIER_RANK,
  UPSTREAM_DETAIL_TRUNCATE,
  corsPreflight,
  dailyCapForRank,
  djb2,
  hasCrisisTerm,
  isUsableHeaderValue,
  jsonResponse,
  normalizeResponseSchema,
  resolveApiKey,
  userIdFromJwt,
  utcDay,
} from '../_shared/llm-proxy-common.ts';

const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';

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

// Same ladder and same vocabulary as the siblings. Do not change the words:
// PURPOSE_EFFORT_MAX is a cross-proxy contract (none < low < medium < high < xhigh).
const EFFORT_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, xhigh: 4 };

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
function resolveModel(purpose: string): string {
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
  return PURPOSE_MODEL[purpose] ?? DEFAULT_XAI_MODEL;
}

function clampEffort(effort: string | null, purpose: string): string {
  const requested = effort === 'max' ? 'xhigh' : effort && effort in EFFORT_RANK ? effort : 'high';
  const ceiling = PURPOSE_EFFORT_MAX[purpose] ?? 'medium';
  return EFFORT_RANK[requested] <= EFFORT_RANK[ceiling] ? requested : ceiling;
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

  let body: {
    user?: unknown;
    system?: unknown;
    purpose?: unknown;
    effort?: unknown;
    responseSchema?: unknown;
    image?: unknown;
    audio?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }

  const userText: string = typeof body?.user === 'string' ? body.user : '';
  const systemText: string | null = typeof body?.system === 'string' ? body.system : null;
  const purpose: string | null = typeof body?.purpose === 'string' ? body.purpose : null;
  const effort: string | null = typeof body?.effort === 'string' ? body.effort : null;
  const responseSchema = normalizeResponseSchema(body?.responseSchema);

  // This proxy has no image or audio path. Refusing the payload is better than
  // silently dropping it: a caller that attached a photo and got a confident
  // answer about nothing would have no way to tell. The client should not send
  // one either -- MULTIMODAL_PURPOSES never resolves to this vendor -- so this
  // catches a misrouted call rather than a normal one.
  if ((body?.image && typeof body.image === 'object') || (body?.audio && typeof body.audio === 'object')) {
    return jsonResponse(req, { error: 'attachment_not_supported', vendor: 'xai' }, 415);
  }

  if (userText.length === 0) return jsonResponse(req, { error: 'user_required' }, 400);
  if (userText.length > MAX_USER_LEN) {
    return jsonResponse(req, { error: 'user_too_long', max: MAX_USER_LEN, got: userText.length }, 413);
  }
  if (systemText && systemText.length > MAX_ASSEMBLED_LEN) {
    return jsonResponse(req, { error: 'system_too_long', max: MAX_ASSEMBLED_LEN, got: systemText.length }, 413);
  }

  // Purpose allowlist -- this proxy serves EXACTLY its seats, and rejects
  // everything else before the tier lookup and any paid call, so a tampered
  // client cannot use XAI_API_KEY as a generic completion source.
  //
  // hasOwnProperty, NOT `in`: `in` walks the prototype chain, so 'toString' /
  // 'constructor' / '__proto__' passed the same gate in openai-proxy, and
  // resolveModel then returned the inherited FUNCTION as the model. Own-key.
  if (!purpose || !Object.prototype.hasOwnProperty.call(PURPOSE_MODEL, purpose)) {
    return jsonResponse(req, { error: 'purpose_not_seated', purpose: purpose ?? null }, 400);
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

  // EFFECTIVE tier (0088), not the raw column: the raw one stays 'brain' after
  // expiry until the cancel webhook lands. Fail open on a lookup ERROR -- the
  // daily cap still bounds cost.
  let tierRank: number | null = null;
  {
    const { data: effTier, error: tierErr } = await supabaseAdmin.rpc(
      'effective_subscription_tier',
      { p_user_id: userId },
    );
    if (tierErr) {
      console.error('[xai-proxy] effective-tier lookup failed:', tierErr.message ?? String(tierErr));
    } else {
      const t = (effTier as string | null) ?? 'free';
      tierRank = TIER_RANK[t] ?? 0;
    }
  }
  if (purpose && PREMIUM_PURPOSES.has(purpose) && tierRank !== null && tierRank < BRAIN_RANK) {
    return jsonResponse(req, { error: 'entitlement_required', feature: purpose }, 403);
  }

  // Spend cap -- the SAME shared per-user/day counter as the other three
  // proxies. Adding a vendor must not add an allowance.
  const { error: spendErr } = await supabaseAdmin.rpc('bump_gemini_spend', {
    p_user_id: userId,
    p_day: utcDay(),
    p_cap: dailyCapForRank(tierRank),
  });
  if (spendErr) {
    const msg = spendErr.message ?? '';
    if (msg.includes('gemini_spend_exceeded')) {
      return jsonResponse(req, { error: 'daily_limit_exceeded' }, 429);
    }
    const code = (spendErr as { code?: string }).code ?? '';
    const rpcMissing =
      code === 'PGRST202' || code === '42883' || msg.includes('Could not find the function');
    if (rpcMissing && Deno.env.get('GEMINI_SPEND_FAILOPEN') === '1') {
      console.error('[xai-proxy][ALERT] spend RPC missing -- allowing WITHOUT a cap. Apply 0035/0036:', msg);
    } else {
      console.error('[xai-proxy][ALERT] spend check unavailable -- failing closed:', msg);
      return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
    }
  }
  // True only on the clean-bump path, so a refund can never decrement a counter
  // that was never incremented.
  const spentBumped = !spendErr;

  // D6: consent egress gate, flag-gated by LLM_REQUIRE_CONSENT (default off).
  // Carried verbatim from the siblings INCLUDING its known gap: consent_records
  // is an append-only grant ledger, so this read does not see a withdrawal.
  // Before enabling the flag anywhere, the read must become withdrawal-aware
  // (PIPA 37 / GDPR 7(3)). Copying the gap knowingly is better than a fourth
  // proxy that silently has no gate at all.
  if ((Deno.env.get('LLM_REQUIRE_CONSENT') ?? 'false') === 'true') {
    let consentOk = false;
    try {
      const { data: consentRow, error: consentErr } = await supabaseAdmin
        .from('consent_records')
        .select('llm_processing_ack, overseas_transfer_ack')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      consentOk = !consentErr && !!consentRow &&
        consentRow.llm_processing_ack === true && consentRow.overseas_transfer_ack === true;
    } catch (_e) {
      consentOk = false;
    }
    if (!consentOk) return jsonResponse(req, { error: 'consent_required' }, 403);
  }

  const xaiModel = resolveModel(purpose);
  const clampedEffort = clampEffort(effort, purpose);

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
    if (spentBumped) {
      try {
        await supabaseAdmin.rpc('refund_gemini_spend', { p_user_id: userId, p_day: utcDay() });
      } catch (e) {
        console.warn('[xai-proxy] spend refund failed:', String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE));
      }
    }
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

  // Give back the daily-cap unit when the call produced nothing billable, so an
  // outage cannot burn an allowance on answers nobody got. Refund ONLY on
  // no-upstream-billing failures (unreachable / non-2xx), never on
  // refusal or truncation -- the model ran and billed for those.
  const refundOnFailure = async () => {
    if (!spentBumped) return;
    try {
      await supabaseAdmin.rpc('refund_gemini_spend', { p_user_id: userId, p_day: utcDay() });
    } catch (e) {
      console.warn('[xai-proxy] spend refund failed:', String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE));
    }
  };

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(XAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${resolvedKey.apiKey}`,
      },
      body: JSON.stringify(xaiBody),
    });
  } catch (e) {
    await refundOnFailure();
    return jsonResponse(req, { error: 'upstream_unreachable', detail: String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE) }, 502);
  }
  const latencyMs = Date.now() - t0;

  if (!upstream.ok) {
    const errBody = await upstream.text();
    await refundOnFailure();
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
    data = await upstream.json();
  } catch (_e) {
    return jsonResponse(req, { error: 'upstream_bad_payload' }, 502);
  }
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const rawContent = choice?.message?.content;
  const text: string = typeof rawContent === 'string' ? rawContent : '';
  const modelUsed: string = typeof data?.model === 'string' ? data.model : xaiModel;
  const refused =
    choice?.finish_reason === 'content_filter' || typeof choice?.message?.refusal === 'string';
  const truncated = choice?.finish_reason === 'length';

  // C3: the audit row is written server-side, same as the siblings. This is the
  // ONLY place the vendor of a call is recorded, and it is how the first live
  // Grok call will be confirmed: reasoning_vendor = 'xai'.
  const totalTokens = Number(data?.usage?.total_tokens) || null;
  let audited = false;
  try {
    const { error: auditErr } = await supabaseAdmin.from('ai_audit_log').insert({
      user_id: userId,
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
