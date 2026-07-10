// Claude proxy Edge Function — the Anthropic backend for D-26 Phase 2
// purpose-keyed vendor routing (and, legacy, EXPO_PUBLIC_REASONING_PROVIDER=claude).
//
// Why: like gemini-proxy, this keeps the model API key server-side. The
// Anthropic key (ANTHROPIC_API_KEY) NEVER reaches the client bundle; the client
// sends the prompt, this function signs and forwards it, the answer comes back.
// It mirrors gemini-proxy's security boundary 1:1 — only the upstream provider
// differs — so the same auth, crisis gate, spend cap, entitlement gate, and
// audit row all apply. Shared plumbing lives in ../_shared/llm-proxy-common.ts.
//
// Auth: requires a valid Supabase JWT (verify_jwt is set in config.toml).
//
// Secrets the operator sets via the Supabase Dashboard:
//   ANTHROPIC_API_KEY        — the Anthropic Console key (workspace "2ndb-reasoning")
//   ANTHROPIC_MODEL          — optional GLOBAL kill-switch: when set it beats
//                              every built-in PURPOSE_MODEL seat (fleet-wide
//                              downgrade in a cost/outage incident). Only the
//                              per-purpose JSON below outranks it.
//   ANTHROPIC_PURPOSE_MODELS — optional JSON object { purpose: model-id } that
//                              overrides individual seats without a code change
//                              (e.g. flip persona_narrative to sonnet-5 if the
//                              KO-prose pilot rejects opus). Highest priority.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically and used
// for the server-side spend cap + ai_audit_log write (shared with gemini-proxy).
//
// D-26: the MODEL CHOICE IS SERVER-OWNED. The client's `model` field is
// accepted-but-ignored; the purpose label picks the seat. A tampered client can
// therefore never self-select an expensive model (SAME-QUALITY stays intact —
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
  resolveApiKey,
  userIdFromJwt,
  utcDay,
} from '../_shared/llm-proxy-common.ts';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// D-26 default seat: sonnet-class value frontier. Global override via the
// ANTHROPIC_MODEL secret; per-purpose override via ANTHROPIC_PURPOSE_MODELS.
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';

// D-26 Phase 2 Anthropic seats (server-owned routing). VERY-HIGH-stakes
// self-understanding narrative surfaces run opus; interactive/short surfaces
// run sonnet. persona_narrative starts on opus pending the KO-prose pilot
// (D-26 §4 minority view: flip to sonnet-5 via ANTHROPIC_PURPOSE_MODELS if the
// pilot rejects opus). claude-fable-5 is BANNED by verdict (30-day retention
// requirement + refusal risk conflict with the journal-adjacent trust promise).
const PURPOSE_MODEL: Record<string, string> = {
  advisor: 'claude-sonnet-5',
  secondb_chat: 'claude-sonnet-5',
  gap_synthesize: 'claude-sonnet-5',
  self_model_propose: 'claude-sonnet-5',
  northstar_propose: 'claude-sonnet-5',
  ops_recommend: 'claude-sonnet-5',
  ops_daily_brief: 'claude-sonnet-5',
  ttfv_first_insight: 'claude-sonnet-5',
  persona_narrative: 'claude-opus-4-8',
  axis_estimate: 'claude-opus-4-8',
  persona_synthesis: 'claude-opus-4-8',
  digest_weekly: 'claude-opus-4-8',
};

function resolveModel(purpose: string | null): string {
  // Precedence: per-purpose env JSON > ANTHROPIC_MODEL (TRUE global
  // kill-switch — e.g. fleet-wide opus->sonnet downgrade during a cost
  // incident) > built-in seat > default.
  if (purpose) {
    const raw = (Deno.env.get('ANTHROPIC_PURPOSE_MODELS') ?? '').trim();
    if (raw.length > 0) {
      try {
        const map = JSON.parse(raw) as Record<string, unknown>;
        const m = map?.[purpose];
        if (typeof m === 'string' && m.trim().length > 0) return m.trim();
      } catch {
        console.error('[claude-proxy] ANTHROPIC_PURPOSE_MODELS is not valid JSON — ignoring');
      }
    }
  }
  const globalOverride = (Deno.env.get('ANTHROPIC_MODEL') ?? '').trim();
  if (globalOverride.length > 0) return globalOverride;
  if (purpose && PURPOSE_MODEL[purpose]) return PURPOSE_MODEL[purpose];
  return DEFAULT_CLAUDE_MODEL;
}

// D-26 per-purpose EFFORT CEILING (server-owned — `effort` is client-reported,
// and price = model x effort x max_tokens, so without this clamp a tampered
// client could run the opus seats at "max". Mirrors the verdict matrix; no
// seat is approved for "max" at all. Unknown/unseated purposes clamp to the
// conservative default ceiling.
const EFFORT_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, xhigh: 3 };
const DEFAULT_EFFORT_CEILING = 'high';
const PURPOSE_EFFORT_MAX: Record<string, string> = {
  advisor: 'high',
  secondb_chat: 'low',
  gap_synthesize: 'low',
  self_model_propose: 'high',
  northstar_propose: 'high',
  ops_recommend: 'medium',
  ops_daily_brief: 'medium',
  ttfv_first_insight: 'xhigh',
  persona_narrative: 'high',
  axis_estimate: 'high',
  persona_synthesis: 'xhigh',
  digest_weekly: 'xhigh',
};

// Abstract effort -> Anthropic output_config.effort (native semantics),
// clamped to the purpose ceiling. "max" folds into "xhigh" unconditionally.
function effortToAnthropic(effort: string | null, purpose: string | null): string {
  const requested = effort === 'max' ? 'xhigh' : effort && effort in EFFORT_RANK ? effort : 'high';
  const ceiling = (purpose && PURPOSE_EFFORT_MAX[purpose]) || DEFAULT_EFFORT_CEILING;
  return EFFORT_RANK[requested] <= EFFORT_RANK[ceiling] ? requested : ceiling;
}

// Hard output ceilings per (clamped) effort. With adaptive thinking ON,
// thinking tokens count against max_tokens, so these are deliberately roomy —
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

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
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

  // R1-A: server-side crisis classifier — reject before any paid Claude call.
  // Scans ONLY the `user` turn (the genuine utterance), never the curated
  // `system` channel (which legitimately carries crisis-reference vocabulary).
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
      console.error('[claude-proxy] tier lookup failed:', tierErr.message ?? String(tierErr));
    } else {
      const t = (tierRow?.subscription_tier as string | null) ?? 'free';
      tierRank = TIER_RANK[t] ?? 0;
    }
  }
  if (purpose && PREMIUM_PURPOSES.has(purpose) && tierRank !== null && tierRank < BRAIN_RANK) {
    return jsonResponse(req, { error: 'entitlement_required', feature: purpose }, 403);
  }

  // Spend cap (cost backstop) — shared per-user/day counter with gemini-proxy.
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
    // FAIL CLOSED on a cost-critical error. The only tolerated case is "RPC does
    // not exist yet" (migration not applied) — allow + alert loudly.
    const code = (spendErr as { code?: string }).code ?? '';
    const rpcMissing =
      code === 'PGRST202' || code === '42883' || msg.includes('Could not find the function');
    if (rpcMissing && Deno.env.get('GEMINI_SPEND_FAILOPEN') === '1') {
      console.error('[claude-proxy][ALERT] spend RPC missing — allowing WITHOUT a cap. Apply 0035/0036:', msg);
    } else {
      console.error('[claude-proxy][ALERT] spend check unavailable — failing closed:', msg);
      return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
    }
  }

  const claudeModel = resolveModel(purpose);
  const clampedEffort = effortToAnthropic(effort, purpose);
  // D-27: sign with the (model × effort) combo key when provisioned, else base
  // ANTHROPIC_API_KEY (fallback keeps calls working; that usage attributes to
  // base). Only changes WHICH key signs the already-server-owned request.
  const resolvedKey = resolveApiKey('ANTHROPIC', claudeModel, clampedEffort, apiKey);
  if (!resolvedKey.usedCombo) {
    console.warn(
      `[claude-proxy] combo key ${resolvedKey.secretName} absent — using base ANTHROPIC_API_KEY (usage attributes to base)`,
    );
  }
  const keyCombo = resolvedKey.usedCombo ? resolvedKey.secretName : 'ANTHROPIC_API_KEY';
  const systemPrompt =
    systemText && systemText.length > 0 ? `${SAFETY_PREAMBLE}\n\n${systemText}` : SAFETY_PREAMBLE;
  const anthropicBody = {
    model: claudeModel,
    max_tokens: effortToMaxTokens(clampedEffort),
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

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': resolvedKey.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(anthropicBody),
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
  // Anthropic returns content as an array of blocks; concatenate the text blocks
  // (thinking blocks are skipped — raw reasoning is never forwarded).
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
  // even all-thinking/empty. NEVER return it as a 200 — parsers downstream
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
