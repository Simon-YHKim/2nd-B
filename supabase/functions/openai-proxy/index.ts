// OpenAI proxy Edge Function — the OpenAI backend for D-26 Phase 2
// purpose-keyed vendor routing (seat: cluster_infer on gpt-5.4, plus the
// safety_classify outage-fallback seat on gpt-5.4-nano).
//
// Fork of claude-proxy — the security boundary mirrors gemini-proxy 1:1: same
// JWT auth, same server-side crisis gate, same PER-USER/DAY spend counter
// (bump_gemini_spend — one pool across ALL vendor proxies so provider-hopping
// can't multiply a user's budget), same premium-purpose gate, same
// ai_audit_log write. Shared plumbing: ../_shared/llm-proxy-common.ts.
//
// Auth: requires a valid Supabase JWT (verify_jwt is set in config.toml).
//
// Secrets the operator sets via the Supabase Dashboard:
//   OPENAI_API_KEY        — the OpenAI platform key (project-scoped key
//                            recommended). No key = this function 500s; the
//                            client's D-26 outage failover (callGemini /
//                            callAdvisor retry-once-via-gemini-proxy) then
//                            serves the call on the Phase 1 route.
//   OPENAI_MODEL          — optional GLOBAL kill-switch: when set it beats
//                            every built-in PURPOSE_MODEL seat. Only the
//                            per-purpose JSON below outranks it.
//   OPENAI_PURPOSE_MODELS — optional JSON object { purpose: model-id }
//                            overriding individual seats. Highest priority.
//
// D-26: MODEL CHOICE IS SERVER-OWNED (client `model` accepted-but-ignored);
// the purpose label picks the seat. Seats key on purpose, never on
// subscription tier (SAME-QUALITY).
//
// Request shape (same wire contract as claude-proxy):
//   { system: string | null, user: string, model?: string (ignored),
//     purpose?: string, effort?: 'low'|'medium'|'high'|'xhigh'|'max',
//     responseSchema?: object (Gemini-style; normalized to JSON Schema here) }
// Response shape (identical to gemini-proxy / claude-proxy):
//   { text: string, modelUsed: string, latencyMs: number, audited?: boolean }

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
  jsonResponse,
  normalizeResponseSchema,
  userIdFromJwt,
  utcDay,
} from '../_shared/llm-proxy-common.ts';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// D-26 default seat: gpt-5.4 (value frontier — the cluster_infer seat).
const DEFAULT_OPENAI_MODEL = 'gpt-5.4';

// D-26 Phase 2 OpenAI seats (server-owned routing). This is ALSO the purpose
// ALLOWLIST — unlike claude-proxy (which must keep serving the legacy
// reasoning seam), openai-proxy has exactly these seats; any other purpose is
// rejected 400 before any paid call, so the function never becomes an
// arbitrary-purpose gpt-5.4 spend surface for tampered clients.
//   cluster_infer   — record clustering / edge inference with why-sentences
//                     (batchable; kNN pre-filter upstream). NOT YET WIRED in
//                     the client (gap purpose — lands with the cluster lane).
//   safety_classify — OUTAGE-ONLY cross-vendor fallback for the Gemini safety
//                     chain (cheap nano, reasoning_effort none). NOT YET WIRED
//                     in the client (D-26 backlog #1).
const PURPOSE_MODEL: Record<string, string> = {
  cluster_infer: 'gpt-5.4',
  safety_classify: 'gpt-5.4-nano',
};

function resolveModel(purpose: string): string {
  const raw = (Deno.env.get('OPENAI_PURPOSE_MODELS') ?? '').trim();
  if (raw.length > 0) {
    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      const m = map?.[purpose];
      if (typeof m === 'string' && m.trim().length > 0) return m.trim();
    } catch {
      console.error('[openai-proxy] OPENAI_PURPOSE_MODELS is not valid JSON — ignoring');
    }
  }
  const globalOverride = (Deno.env.get('OPENAI_MODEL') ?? '').trim();
  if (globalOverride.length > 0) return globalOverride;
  return PURPOSE_MODEL[purpose] ?? DEFAULT_OPENAI_MODEL;
}

// D-26 per-purpose EFFORT CEILING (server-owned; `effort` is client-reported).
// OpenAI's native ladder is none/low/medium/high/xhigh; `max` folds to xhigh
// before clamping. safety_classify pins to none (verdict: nano @ none).
const EFFORT_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, xhigh: 4 };
const PURPOSE_EFFORT_MAX: Record<string, string> = {
  cluster_infer: 'medium',
  safety_classify: 'none',
};

function effortToOpenAi(effort: string | null, purpose: string): string {
  const requested = effort === 'max' ? 'xhigh' : effort && effort in EFFORT_RANK ? effort : 'high';
  const ceiling = PURPOSE_EFFORT_MAX[purpose] ?? 'medium';
  return EFFORT_RANK[requested] <= EFFORT_RANK[ceiling] ? requested : ceiling;
}

// Hard output ceilings per (clamped) effort — max_completion_tokens includes
// reasoning tokens on gpt-5.x, roomy for the same reason as claude-proxy's
// ladder (truncation is surfaced as an error below, never a silent 200).
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(req, { error: 'missing_authorization' }, 401);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey || apiKey.length === 0) {
    return jsonResponse(req, { error: 'server_misconfigured_missing_OPENAI_API_KEY' }, 500);
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

  if (userText.length === 0) return jsonResponse(req, { error: 'user_required' }, 400);
  if (userText.length > MAX_USER_LEN) {
    return jsonResponse(req, { error: 'user_too_long', max: MAX_USER_LEN, got: userText.length }, 413);
  }
  if (systemText && systemText.length > MAX_ASSEMBLED_LEN) {
    return jsonResponse(req, { error: 'system_too_long', max: MAX_ASSEMBLED_LEN, got: systemText.length }, 413);
  }

  // Purpose allowlist — this proxy serves EXACTLY its D-26 seats. Rejecting
  // everything else (before the tier lookup and any paid call) keeps a
  // tampered client from using OPENAI_API_KEY as a generic completion source.
  if (!purpose || !(purpose in PURPOSE_MODEL)) {
    return jsonResponse(req, { error: 'purpose_not_seated', purpose: purpose ?? null }, 400);
  }

  // R1-A: server-side crisis classifier — reject before any paid OpenAI call.
  // Scans ONLY the `user` turn, never the curated `system` channel.
  if (hasCrisisTerm(userText)) {
    return jsonResponse(req, { error: 'safety_red_zone', reason: 'crisis_term_detected' }, 422);
  }

  // Tier lookup (service-role). Fail-open on a lookup ERROR for availability; an
  // explicit sub-brain row fails CLOSED for premium purposes.
  let tierRank: number | null = null;
  {
    const { data: tierRow, error: tierErr } = await supabaseAdmin
      .from('users')
      .select('subscription_tier')
      .eq('id', userId)
      .maybeSingle();
    if (tierErr) {
      console.error('[openai-proxy] tier lookup failed:', tierErr.message ?? String(tierErr));
    } else {
      const t = (tierRow?.subscription_tier as string | null) ?? 'free';
      tierRank = TIER_RANK[t] ?? 0;
    }
  }
  if (purpose && PREMIUM_PURPOSES.has(purpose) && tierRank !== null && tierRank < BRAIN_RANK) {
    return jsonResponse(req, { error: 'entitlement_required', feature: purpose }, 403);
  }

  // Spend cap — the SAME shared per-user/day counter as gemini/claude proxies.
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
      console.error('[openai-proxy][ALERT] spend RPC missing — allowing WITHOUT a cap. Apply 0035/0036:', msg);
    } else {
      console.error('[openai-proxy][ALERT] spend check unavailable — failing closed:', msg);
      return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
    }
  }

  const openaiModel = resolveModel(purpose);
  const clampedEffort = effortToOpenAi(effort, purpose);
  const systemPrompt =
    systemText && systemText.length > 0 ? `${SAFETY_PREAMBLE}\n\n${systemText}` : SAFETY_PREAMBLE;
  const openaiBody = {
    model: openaiModel,
    max_completion_tokens: effortToMaxTokens(clampedEffort),
    reasoning_effort: clampedEffort,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    ...(responseSchema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              // strict:false — the client's Gemini-dialect schemas may carry a
              // required-subset (strict mode demands required == all keys).
              strict: false,
              schema: responseSchema,
            },
          },
        }
      : {}),
  };

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiBody),
    });
  } catch (e) {
    return jsonResponse(req, { error: 'upstream_unreachable', detail: String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE) }, 502);
  }
  const latencyMs = Date.now() - t0;

  if (!upstream.ok) {
    const errBody = await upstream.text();
    return jsonResponse(req, {
      error: 'upstream_error',
      status: upstream.status,
      detail: errBody.slice(0, UPSTREAM_DETAIL_TRUNCATE),
    }, 502);
  }

  const data = await upstream.json();
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const rawContent = choice?.message?.content;
  const text: string = typeof rawContent === 'string' ? rawContent : '';
  const modelUsed: string = typeof data?.model === 'string' ? data.model : openaiModel;
  // Content-filter terminations surface as an upstream refusal (parity with
  // claude-proxy) so callers take their fail-soft paths.
  const refused =
    choice?.finish_reason === 'content_filter' ||
    typeof choice?.message?.refusal === 'string';
  // Truncation (finish_reason:"length"): reasoning tokens count against
  // max_completion_tokens on gpt-5.x, so a truncated reply can be a mid-JSON
  // stump or empty. Surfaced as 502, never a silent 200 (parity claude-proxy).
  const truncated = choice?.finish_reason === 'length';

  // C3: write the audit row server-side (parity with the sibling proxies).
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
    });
    audited = !auditErr;
    if (auditErr) console.warn('[openai-proxy] audit insert failed:', auditErr.message);
  } catch (e) {
    console.warn('[openai-proxy] audit insert threw:', String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE));
  }

  if (refused) {
    return jsonResponse(req, { error: 'upstream_refusal', modelUsed, latencyMs }, 502);
  }
  if (truncated) {
    return jsonResponse(req, { error: 'upstream_truncated', modelUsed, latencyMs }, 502);
  }

  return jsonResponse(req, { text, modelUsed, latencyMs, audited });
});
