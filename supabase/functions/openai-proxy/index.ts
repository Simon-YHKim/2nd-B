// OpenAI proxy Edge Function -- the OpenAI backend for D-26 Phase 2
// purpose-keyed vendor routing (seat: cluster_infer on gpt-5.4, plus the
// safety_classify outage-fallback seat on gpt-5.4-nano).
//
// Fork of claude-proxy -- the security boundary mirrors gemini-proxy 1:1: same
// JWT auth, same server-side crisis gate, same PER-USER/DAY spend counter
// (bump_gemini_spend -- one pool across ALL vendor proxies so provider-hopping
// can't multiply a user's budget), same premium-purpose gate, same
// ai_audit_log write. Shared plumbing: ../_shared/llm-proxy-common.ts.
//
// Auth: requires a valid Supabase JWT (verify_jwt is set in config.toml).
//
// Secrets the operator sets via the Supabase Dashboard:
//   OPENAI_API_KEY        -- the OpenAI platform key (project-scoped key
//                            recommended). No key = this function 500s; the
//                            client's D-26 outage failover (callLlm /
//                            callAdvisor retry-once-via-gemini-proxy) then
//                            serves the call on the Phase 1 route.
//   OPENAI_MODEL          -- optional GLOBAL kill-switch: when set it beats
//                            every built-in PURPOSE_MODEL seat. Only the
//                            per-purpose JSON below outranks it.
//   OPENAI_PURPOSE_MODELS -- optional JSON object { purpose: model-id }
//                            overriding individual seats. Highest priority.
//
// D-26: MODEL CHOICE IS SERVER-OWNED (client `model` accepted-but-ignored);
// the purpose label picks the seat. Seats key on purpose, never on
// subscription tier (SAME-QUALITY).
//
// Request shape (same wire contract as claude-proxy):
//   { system: string | null, user: string, model?: string (ignored),
//     purpose?: string, effort?: 'low'|'medium'|'high'|'xhigh'|'max',
//     responseSchema?: object (Gemini-style; normalized to JSON Schema here),
//     image?: { mimeType: string, data: string },   // base64, no data: prefix
//     audio?: { mimeType: string, data: string } }  // base64 voice memo
// An `audio` payload switches this function to the transcription endpoint; the
// response envelope is unchanged either way.
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
  auditUpstreamFailure,
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

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// Transcription is a DIFFERENT endpoint with a different shape (multipart in,
// {text} out) -- not a chat completion with an audio part. Kept separate rather
// than folded in, because everything else about the request differs.
const OPENAI_TRANSCRIBE_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_EMBED_ENDPOINT = 'https://api.openai.com/v1/embeddings';

// Embeddings (2026-08-24). The ONLY live path off Gemini that no vendor switch
// reached: embedTexts invoked gemini-proxy by name, so the four routing
// switches never touched it, and Google stops accepting Standard keys in
// September. RAG rides on this.
//
// The dimension is not a preference. wiki_pages.embedding and records.embedding
// are vector(768) in the schema, so anything else fails to store. OpenAI's
// text-embedding-3-* family takes a `dimensions` parameter (MRL), which is why
// this vendor can serve the existing column at all.
//
// ⚠ UNVERIFIED against the account: the model id below. Overridable without a
// redeploy, same discipline as the transcription seat.
const OPENAI_EMBED_MODEL = () =>
  (Deno.env.get('OPENAI_EMBED_MODEL') ?? '').trim() || 'text-embedding-3-large';
const EMBED_DIM = 768;
const MAX_EMBED_TEXTS = 50;
const MAX_EMBED_TEXT_LEN = 2000;

// ── Multimodal (REQ-260821-01) ──────────────────────────────────────────────
//
// Until 2026-08-21 only gemini-proxy forwarded images and audio, so OCR and
// voice memos were pinned to Gemini by BOTH an owner directive and a technical
// fact. Simon retired Gemini as a vendor, and Google stops accepting Standard
// keys in September, so the technical fact had to go first or the two features
// die on a calendar date.
//
// The caps and the mime allowlists are copied from gemini-proxy deliberately:
// the client already validates against those exact limits, so a payload that
// was acceptable yesterday must stay acceptable today. Do not widen them here
// without widening them there.
const MAX_IMAGE_BASE64_LEN = 2_700_000; // ~2MB binary
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_AUDIO_BASE64_LEN = 4_100_000; // ~3MB binary ~ a 3-minute m4a memo
const ALLOWED_AUDIO_MIME = new Set([
  'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg',
  'audio/wav', 'audio/webm', 'audio/ogg', 'audio/3gpp',
]);

// The transcription endpoint sniffs the format from the FILENAME, not from the
// part's content-type, so the extension has to be right or a valid m4a is
// rejected as an unsupported format.
const AUDIO_EXT: Record<string, string> = {
  'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mp4': 'mp4', 'audio/aac': 'aac',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
  'audio/3gpp': '3gp',
};

// ⚠ CONFIRM THIS ID ON THE ACCOUNT before relying on it. Every other model id
// in this file is one the project has already seen work; this one has not been
// exercised here, and an unknown id fails the upstream call. It is env-settable
// so it can be corrected with NO redeploy, exactly like OPENAI_PURPOSE_MODELS.
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-1';
function transcribeModel(): string {
  return (Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? '').trim() || DEFAULT_TRANSCRIBE_MODEL;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// D-26 default seat: gpt-5.4 (value frontier -- the cluster_infer seat).
const DEFAULT_OPENAI_MODEL = 'gpt-5.4';

// D-26 Phase 2 OpenAI seats (server-owned routing). This is ALSO the purpose
// ALLOWLIST -- unlike claude-proxy (which must keep serving the legacy
// reasoning seam), openai-proxy has exactly these seats; any other purpose is
// rejected 400 before any paid call, so the function never becomes an
// arbitrary-purpose gpt-5.4 spend surface for tampered clients.
//   cluster_infer   -- record clustering / edge inference with why-sentences
//                     (batchable; kNN pre-filter upstream). NOT YET WIRED in
//                     the client (gap purpose -- lands with the cluster lane).
//   safety_classify -- OUTAGE-ONLY cross-vendor fallback for the Gemini safety
//                     chain (cheap nano, reasoning_effort none). NOT YET WIRED
//                     in the client (D-26 backlog #1).
const PURPOSE_MODEL: Record<string, string> = {
  cluster_infer: 'gpt-5.4',
  safety_classify: 'gpt-5.4-nano',
  // Backbone seats (EXPO_PUBLIC_BACKBONE_VENDOR, REQ-260821-01). These nine
  // purposes had no proxy seat anywhere but gemini-proxy, so the Gemini exit
  // could not include them: the client switch is useless while this function
  // answers 400 purpose_not_seated. Tiers mirror PURPOSE_TIER in
  // src/lib/llm/types.ts, which is where their cost intent already lived --
  // lite -> nano, flash -> mini, pro -> the frontier id.
  //
  // Note the shape of the risk: these are the app's HIGH-VOLUME surfaces (one
  // classify per capture, one per clip). Seating them on the frontier model
  // "to be safe" would be the single most expensive mistake available in this
  // file, which is why the tier is copied from an existing decision rather
  // than chosen fresh here.
  capture_classify: 'gpt-5.4-nano',
  clipper_classify: 'gpt-5.4-nano',
  audit_qa: 'gpt-5.4-mini',
  source_ingest: 'gpt-5.4-mini',
  import_ingest: 'gpt-5.4-mini',
  clipper_template_propose: 'gpt-5.4-mini',
  interview_probe: 'gpt-5.4-mini',
  // pro tier in PURPOSE_TIER: the deep-run connection rationale and the
  // 공상 -> 구체화 surface. Both are user-visible reasoning, both are rare.
  reasoning_connect: 'gpt-5.4',
  imagine: 'gpt-5.4',
  // Phase-2 reasoning seats re-routed from Claude on 2026-07-06 (Anthropic
  // credit balance exhausted; Simon chose the OpenAI backend). The nine live
  // client reasoning purposes, all on the gpt-5.4 frontier; the inert proto-rev2
  // seats (digest_weekly/ttfv_first_insight) share it. The premium gate below
  // still holds advisor/planner to the brain tier regardless of vendor.
  advisor: 'gpt-5.4',
  persona_narrative: 'gpt-5.4',
  gap_synthesize: 'gpt-5.4',
  self_model_propose: 'gpt-5.4',
  northstar_propose: 'gpt-5.4',
  axis_estimate: 'gpt-5.4',
  persona_synthesis: 'gpt-5.4',
  ops_recommend: 'gpt-5.4',
  ops_daily_brief: 'gpt-5.4',
  digest_weekly: 'gpt-5.4',
  ttfv_first_insight: 'gpt-5.4',
  // secondb_chat (Simon, 2026-08-18): chat moves off the Gemini backbone to
  // OpenAI. Unlike the seats above this is NOT a reasoning seat -- it is the
  // app's highest-volume conversational surface, so cost is controlled by the
  // effort ceiling below ('low'), not by the model tier. The frontier id is
  // used here only because it is the one this file already knows to be valid;
  // a cheaper tier is the better fit for the mid cost axis and can be set with
  // NO redeploy via OPENAI_PURPOSE_MODELS, e.g.
  //   {"secondb_chat":"gpt-5.4-mini"}
  // Confirm the id exists on the account before setting it -- an unknown model
  // fails the upstream call, and this is the main chat surface.
  secondb_chat: 'gpt-5.4',
  // OCR moved off Gemini (REQ-260821-01): a photo read verbatim, on the vision
  // capability of the frontier chat model. It IS a chat seat, so it belongs
  // here and follows frontier promotions like its neighbours.
  capture_ocr: 'gpt-5.4',
};

// Transcription is allowed but is NOT a chat-model seat, so it deliberately
// stays out of PURPOSE_MODEL: that table is the nightly refresher's frontier
// seat list (scripts/refresh-models.ts, cross-checked against this file), and a
// seat whose model id is never sent would be promoted forever to no effect.
// The model that actually serves it is transcribeModel().
//
// The label is the WIRE one. transcribeAudio sends 'voice_transcribe'; the
// routing module calls the same feature 'capture_voice'. Matching the routing
// name here would 400 every voice memo with purpose_not_seated.
const TRANSCRIBE_PURPOSES = new Set(['voice_transcribe']);

// The adversarial challenger (REQ-260823-03). Seated for the allowlist but kept
// OUT of PURPOSE_MODEL on purpose, the same way voice_transcribe is: that table
// doubles as the nightly refresher's frontier seat list, so a row there would
// be overwritten with the terra model on the next promotion and the challenger
// would quietly stop being sol. Its model comes from OPENAI_CROSSCHECK_MODEL,
// which refresh-models writes from the openai-sol seat.
const CROSSCHECK_PURPOSES = new Set(['crosscheck_challenge']);
const DEFAULT_CROSSCHECK_MODEL = 'gpt-5.4';

function resolveModel(purpose: string): string {
  const raw = (Deno.env.get('OPENAI_PURPOSE_MODELS') ?? '').trim();
  if (raw.length > 0) {
    try {
      const map = JSON.parse(raw) as Record<string, unknown>;
      const m = map?.[purpose];
      if (typeof m === 'string' && m.trim().length > 0) return m.trim();
    } catch {
      console.error('[openai-proxy] OPENAI_PURPOSE_MODELS is not valid JSON -- ignoring');
    }
  }
  const globalOverride = (Deno.env.get('OPENAI_MODEL') ?? '').trim();
  if (globalOverride.length > 0) return globalOverride;
  // After the global kill-switch on purpose: during a cost incident an
  // operator setting OPENAI_MODEL must be able to pull the most expensive
  // model in the system down too.
  if (CROSSCHECK_PURPOSES.has(purpose)) {
    const sol = (Deno.env.get('OPENAI_CROSSCHECK_MODEL') ?? '').trim();
    return sol.length > 0 ? sol : DEFAULT_CROSSCHECK_MODEL;
  }
  return PURPOSE_MODEL[purpose] ?? DEFAULT_OPENAI_MODEL;
}

// D-26 per-purpose EFFORT CEILING (server-owned; `effort` is client-reported).
// OpenAI's native ladder is none/low/medium/high/xhigh; `max` folds to xhigh
// before clamping. safety_classify pins to none (verdict: nano @ none).
const EFFORT_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, xhigh: 4 };
const PURPOSE_EFFORT_MAX: Record<string, string> = {
  cluster_infer: 'medium',
  safety_classify: 'none',
  // Re-routed reasoning seats cap at high (gpt-5.4) so a client-reported effort
  // isn't silently downgraded; the shared daily spend cap still bounds cost.
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
  // Chat is conversational, not deliberative, and it is the highest-volume
  // surface in the app. 'low' is the real cost lever here: the client already
  // asks for low (PHASE2_EFFORT), and this ceiling makes it a guarantee that a
  // tampered or stale client cannot raise.
  secondb_chat: 'low',
  // Verbatim transcription and verbatim OCR gain nothing from reasoning, and
  // both are latency-sensitive capture surfaces. gemini-proxy makes the same
  // call by disabling its thinking budget for these purposes.
  capture_ocr: 'none',
  voice_transcribe: 'none',
  // The challenger reads a whole-corpus draft looking for what is wrong with
  // it. That is the one job here where reasoning is the product.
  crosscheck_challenge: 'high',
  // Backbone ceilings (REQ-260821-01), mirroring PURPOSE_TIER's cost intent.
  // The two classifiers get 'none' for the same reason safety_classify does:
  // they run once per capture and once per clip, so they are the only rows
  // here where a wrong ceiling shows up as a bill rather than as latency.
  capture_classify: 'none',
  clipper_classify: 'none',
  audit_qa: 'low',
  source_ingest: 'low',
  import_ingest: 'low',
  clipper_template_propose: 'low',
  interview_probe: 'low',
  // V-5 (Simon, 2026-08-23): refused the reduction to medium, so these keep
  // the same high ceiling as the other pro-tier seats. The ceiling and the
  // client-side PHASE2_EFFORT must move together - a ceiling below the request
  // silently clamps and makes the decision a no-op.
  reasoning_connect: 'high',
  imagine: 'high',
};

function effortToOpenAi(effort: string | null, purpose: string): string {
  const requested = effort === 'max' ? 'xhigh' : effort && effort in EFFORT_RANK ? effort : 'high';
  const ceiling = PURPOSE_EFFORT_MAX[purpose] ?? 'medium';
  return EFFORT_RANK[requested] <= EFFORT_RANK[ceiling] ? requested : ceiling;
}

// Hard output ceilings per (clamped) effort -- max_completion_tokens includes
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

  // .trim(): a secret pasted into the dashboard keeps its trailing newline, and a
  // newline in a header value makes `fetch` THROW rather than warn. See
  // ../_shared/axis-key-name.ts:pickApiKey for the outage this caused.
  const apiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
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
    op?: unknown;
    texts?: unknown;
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

  // ── op:'embed' ────────────────────────────────────────────────────────────
  // Mirrors gemini-proxy's route deliberately: same limits, same crisis
  // backstop, the same shared per-user/day counter (one batch = one call), its
  // own audit row. Divergence here would show up as a quota or a safety gap
  // rather than as an obvious bug.
  if (body?.op === 'embed') {
    if (Deno.env.get('EMBED_EGRESS_ENABLED') !== 'true') {
      return jsonResponse(req, { error: 'embedding_egress_disabled' }, 503);
    }
    const rawTexts = body?.texts;
    if (!Array.isArray(rawTexts) || rawTexts.length === 0) {
      return jsonResponse(req, { error: 'texts_required' }, 400);
    }
    if (rawTexts.length > MAX_EMBED_TEXTS) {
      return jsonResponse(req, { error: 'too_many_texts', max: MAX_EMBED_TEXTS, got: rawTexts.length }, 413);
    }
    const texts: string[] = [];
    for (const t of rawTexts) {
      if (typeof t !== 'string' || t.trim().length === 0) {
        return jsonResponse(req, { error: 'invalid_text' }, 400);
      }
      if (t.length > MAX_EMBED_TEXT_LEN) {
        return jsonResponse(req, { error: 'text_too_long', max: MAX_EMBED_TEXT_LEN, got: t.length }, 413);
      }
      // R1-A parity. The client zero-vectors red-zone text before sending (C9);
      // this is the bypassed-client backstop, and it must exist here too or
      // switching vendors would quietly remove a safety layer.
      if (hasCrisisTerm(t)) {
        return jsonResponse(req, { error: 'safety_red_zone', reason: 'crisis_term_detected' }, 422);
      }
      texts.push(t);
    }

    const { error: embedSpendErr } = await supabaseAdmin.rpc('bump_gemini_spend', {
      p_user_id: userId,
      p_day: utcDay(),
      p_cap: dailyCapForRank(null),
    });
    if (embedSpendErr) {
      const msg = embedSpendErr.message ?? '';
      if (msg.includes('gemini_spend_exceeded')) {
        return jsonResponse(req, { error: 'daily_limit_exceeded' }, 429);
      }
      console.error('[openai-proxy][ALERT] embed spend check unavailable -- failing closed:', msg);
      return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
    }

    const embedModel = OPENAI_EMBED_MODEL();
    const embedKey = resolveApiKey('OPENAI', embedModel, 'none', apiKey);
    if (!isUsableHeaderValue(embedKey.apiKey)) {
      return jsonResponse(req, {
        error: 'server_misconfigured_malformed_api_key',
        secret: embedKey.usedCombo ? embedKey.secretName : 'OPENAI_API_KEY',
      }, 500);
    }

    const et0 = Date.now();
    let embedUpstream: Response;
    try {
      embedUpstream = await fetch(OPENAI_EMBED_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${embedKey.apiKey}` },
        // `dimensions` is what makes this vendor able to serve the existing
        // vector(768) column at all. Without it the reply is the model's native
        // width and every insert fails on the column type.
        body: JSON.stringify({ model: embedModel, input: texts, dimensions: EMBED_DIM }),
      });
    } catch (e) {
      return jsonResponse(req, { error: 'upstream_unreachable', detail: String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE) }, 502);
    }
    const embedLatencyMs = Date.now() - et0;
    if (!embedUpstream.ok) {
      const errBody = await embedUpstream.text();
      return jsonResponse(req, {
        error: 'upstream_error',
        status: embedUpstream.status,
        detail: errBody.slice(0, UPSTREAM_DETAIL_TRUNCATE),
      }, 502);
    }

    let embedData: { data?: { embedding?: unknown; index?: unknown }[] };
    try {
      embedData = await embedUpstream.json();
    } catch (_e) {
      return jsonResponse(req, { error: 'upstream_bad_payload' }, 502);
    }
    // Sorted by index rather than trusted in order. The caller matches vectors
    // to texts POSITIONALLY, so a reordered reply would attach every embedding
    // to the wrong page - and the result would still look like a working
    // search, just one that returns unrelated things.
    const rows = Array.isArray(embedData?.data) ? [...embedData.data] : [];
    rows.sort((a, b) => (Number(a?.index) || 0) - (Number(b?.index) || 0));
    const vectors: number[][] = rows.map((r) => (Array.isArray(r?.embedding) ? (r.embedding as number[]) : []));
    if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBED_DIM)) {
      // Refusing beats returning a short or mis-sized batch: the caller would
      // write whatever it got, and a wrong-width vector is a corrupt index.
      return jsonResponse(req, {
        error: 'embed_shape_mismatch',
        expected: { count: texts.length, dim: EMBED_DIM },
        got: { count: vectors.length, dim: vectors[0]?.length ?? 0 },
      }, 502);
    }

    let embedAudited = false;
    try {
      const { error: auditErr } = await supabaseAdmin.from('ai_audit_log').insert({
        user_id: userId,
        prompt_hash: djb2(texts.join(' ')),
        output_hash: djb2(String(vectors.length)),
        model_used: embedModel,
        vertex_backend: false,
        safety_zone: 'green',
        latency_ms: embedLatencyMs,
        purpose: 'embed_index',
        reasoning_vendor: 'openai',
        key_combo: embedKey.usedCombo ? embedKey.secretName : 'OPENAI_API_KEY',
      });
      embedAudited = !auditErr;
    } catch (e) {
      console.warn('[openai-proxy] embed audit insert threw:', String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE));
    }

    return jsonResponse(req, { vectors, modelUsed: embedModel, latencyMs: embedLatencyMs, audited: embedAudited });
  }

  const userText: string = typeof body?.user === 'string' ? body.user : '';
  const systemText: string | null = typeof body?.system === 'string' ? body.system : null;
  const purpose: string | null = typeof body?.purpose === 'string' ? body.purpose : null;
  const effort: string | null = typeof body?.effort === 'string' ? body.effort : null;
  const responseSchema = normalizeResponseSchema(body?.responseSchema);

  // Optional image / audio attachments. Validated exactly as gemini-proxy does
  // (mime allowlist + base64 length cap) and BEFORE any paid call, so an
  // oversized or unexpected payload never reaches the vendor or the spend cap.
  let imagePart: { mimeType: string; data: string } | null = null;
  if (body?.image && typeof body.image === 'object') {
    const o = body.image as Record<string, unknown>;
    const mime = typeof o.mimeType === 'string' ? o.mimeType : '';
    const data = typeof o.data === 'string' ? o.data : '';
    if (mime && data) {
      if (!ALLOWED_IMAGE_MIME.has(mime)) {
        return jsonResponse(req, { error: 'image_mime_not_allowed', got: mime }, 415);
      }
      if (data.length > MAX_IMAGE_BASE64_LEN) {
        return jsonResponse(req, { error: 'image_too_large', max: MAX_IMAGE_BASE64_LEN, got: data.length }, 413);
      }
      imagePart = { mimeType: mime, data };
    }
  }
  let audioPart: { mimeType: string; data: string } | null = null;
  if (body?.audio && typeof body.audio === 'object') {
    const o = body.audio as Record<string, unknown>;
    const mime = typeof o.mimeType === 'string' ? o.mimeType : '';
    const data = typeof o.data === 'string' ? o.data : '';
    if (mime && data) {
      if (!ALLOWED_AUDIO_MIME.has(mime)) {
        return jsonResponse(req, { error: 'audio_mime_not_allowed', got: mime }, 415);
      }
      if (data.length > MAX_AUDIO_BASE64_LEN) {
        return jsonResponse(req, { error: 'audio_too_large', max: MAX_AUDIO_BASE64_LEN, got: data.length }, 413);
      }
      audioPart = { mimeType: mime, data };
    }
  }

  if (userText.length === 0) return jsonResponse(req, { error: 'user_required' }, 400);
  if (userText.length > MAX_USER_LEN) {
    return jsonResponse(req, { error: 'user_too_long', max: MAX_USER_LEN, got: userText.length }, 413);
  }
  if (systemText && systemText.length > MAX_ASSEMBLED_LEN) {
    return jsonResponse(req, { error: 'system_too_long', max: MAX_ASSEMBLED_LEN, got: systemText.length }, 413);
  }

  // Purpose allowlist -- this proxy serves EXACTLY its D-26 seats. Rejecting
  // everything else (before the tier lookup and any paid call) keeps a
  // tampered client from using OPENAI_API_KEY as a generic completion source.
  // hasOwnProperty, NOT `in`: `in` walks the prototype chain, so purpose values
  // like 'toString' / 'constructor' / '__proto__' passed this gate, then
  // resolveModel returned the inherited FUNCTION as the model and modelSlug
  // crashed (500, no CORS) AFTER the spend bump. Own-key check closes both.
  if (
    !purpose ||
    !(
      Object.prototype.hasOwnProperty.call(PURPOSE_MODEL, purpose) ||
      TRANSCRIBE_PURPOSES.has(purpose) ||
      CROSSCHECK_PURPOSES.has(purpose)
    )
  ) {
    return jsonResponse(req, { error: 'purpose_not_seated', purpose: purpose ?? null }, 400);
  }

  // R1-A: server-side crisis classifier -- reject before any paid OpenAI call.
  // Scans ONLY the `user` turn, never the curated `system` channel. The
  // safety_classify seat is exempt (flag-gated by LLM_SERVER_SAFETY_SEAT, default
  // off) so a cross-vendor safety fallback wired to this seat can actually see the
  // crisis text it must classify, instead of 422-ing it (mirrors gemini-proxy).
  const safetyClassifySeat =
    purpose === 'safety_classify' && Deno.env.get('LLM_SERVER_SAFETY_SEAT') === '1';
  if (!safetyClassifySeat && hasCrisisTerm(userText)) {
    return jsonResponse(req, { error: 'safety_red_zone', reason: 'crisis_term_detected' }, 422);
  }

  // EFFECTIVE tier via effective_subscription_tier (0088), NOT the raw
  // subscription_tier column -- mirrors gemini-proxy. The raw column stays
  // 'brain'/'cortex' after expiry until the cancel webhook lands, so reading it
  // let a lapsed subscriber keep the brain-only premium purposes + the brain
  // daily ceiling, and 403'd a comped judge. The RPC collapses expired->free and
  // comps judge->brain. Fail open on a lookup ERROR (the daily cap still bounds cost).
  let tierRank: number | null = null;
  {
    const { data: effTier, error: tierErr } = await supabaseAdmin.rpc(
      'effective_subscription_tier',
      { p_user_id: userId },
    );
    if (tierErr) {
      console.error('[openai-proxy] effective-tier lookup failed:', tierErr.message ?? String(tierErr));
    } else {
      const t = (effTier as string | null) ?? 'free';
      tierRank = TIER_RANK[t] ?? 0;
    }
  }
  if (purpose && PREMIUM_PURPOSES.has(purpose) && tierRank !== null && tierRank < BRAIN_RANK) {
    return jsonResponse(req, { error: 'entitlement_required', feature: purpose }, 403);
  }

  // Spend cap -- the SAME shared per-user/day counter as gemini/claude proxies.
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
      console.error('[openai-proxy][ALERT] spend RPC missing -- allowing WITHOUT a cap. Apply 0035/0036:', msg);
    } else {
      console.error('[openai-proxy][ALERT] spend check unavailable -- failing closed:', msg);
      return jsonResponse(req, { error: 'spend_check_unavailable' }, 503);
    }
  }
  // True only on the clean-bump path (not the rpc-missing fail-open), so a
  // refund can never decrement a counter that was never incremented.
  const spentBumped = !spendErr;

  // D6 (audit M5): consent egress gate. Flag-gated by LLM_REQUIRE_CONSENT
  // (default off) -- enable once legal finalizes the consent copy/versions. When
  // on, require a current consent row (llm_processing_ack + overseas_transfer_ack)
  // before sending user content to the overseas vendor; fail CLOSED if unverifiable.
  // NOTE (R1 / pre-deploy review P2): consent_records is an append-only GRANT
  // ledger (0031). Withdrawal lives ELSEWHERE -- users.privacy_prefs (current
  // state) + the consent_changes ledger (0062, grant/revoke per pref key). This
  // grant-only read does NOT see a withdrawal, so BEFORE enabling
  // LLM_REQUIRE_CONSENT the read MUST become withdrawal-aware (effective consent =
  // granted acks AND the driving external-processing pref still ON, PIPA 37 /
  // GDPR 7(3)). Which prefs constitute "overseas transfer consent" is a
  // legal/data-model decision -- resolve first. See docs/RISK-REMEDIATION-260726.md (R1).
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

  const openaiModel = resolveModel(purpose);
  const clampedEffort = effortToOpenAi(effort, purpose);
  // D-27: sign with the (model × effort) combo key when provisioned, else base
  // OPENAI_API_KEY (fallback keeps calls working; that usage attributes to
  // base). Only changes WHICH key signs the already-server-owned request.
  const resolvedKey = resolveApiKey('OPENAI', openaiModel, clampedEffort, apiKey);
  if (!resolvedKey.usedCombo) {
    console.warn(
      `[openai-proxy] combo key ${resolvedKey.secretName} absent -- using base OPENAI_API_KEY (usage attributes to base)`,
    );
  }
  const keyCombo = resolvedKey.usedCombo ? resolvedKey.secretName : 'OPENAI_API_KEY';

  // A key that cannot be a header value makes `fetch` THROW, which every path
  // below reports as `upstream_unreachable` -- indistinguishable from the vendor
  // being down. Say what is actually wrong instead, naming the SECRET but never
  // its value. (2026-08-19: this exact case took 30 minutes to identify.)
  if (!isUsableHeaderValue(resolvedKey.apiKey)) {
    // Nothing was sent upstream, so the daily-cap unit must go back -- otherwise a
    // misconfigured secret quietly eats a user's whole allowance, one unit per
    // attempt, while they see only an error. refund_gemini_spend (0110) floors at
    // 0 and no-ops when there is no row, so a stray refund is safe.
    if (spentBumped) {
      try {
        await supabaseAdmin.rpc('refund_gemini_spend', { p_user_id: userId, p_day: utcDay() });
      } catch (e) {
        console.warn('[openai-proxy] spend refund failed:', String(e).slice(0, 80));
      }
    }
    console.error(
      `[openai-proxy] OPENAI_API_KEY is not usable as a header value (control character in the secret?)`,
    );
    return jsonResponse(req, {
      error: 'server_misconfigured_malformed_api_key',
      secret: keyCombo,
    }, 500);
  }

  const systemPrompt =
    systemText && systemText.length > 0 ? `${SAFETY_PREAMBLE}\n\n${systemText}` : SAFETY_PREAMBLE;
  const openaiBody = {
    model: openaiModel,
    // ops_daily_brief packs up to 14 keys x 3 recs into ONE object; on gpt-5.x
    // reasoning tokens share max_completion_tokens, so medium (4096) is eaten by
    // reasoning before the object closes and it truncates (surfaced as an error
    // below). Floor the consolidated seat; the one call REPLACES up to 14
    // per-domain calls, a net egress cut. [ops-brief-output-floor] 16000
    max_completion_tokens: Math.max(
      effortToMaxTokens(clampedEffort),
      purpose === 'ops_daily_brief' ? 16000 : 0,
    ),
    reasoning_effort: clampedEffort,
    messages: [
      { role: 'system', content: systemPrompt },
      // With an image the user turn becomes a content ARRAY. The image goes
      // first, mirroring the Gemini path this replaces (and OCR guidance in
      // general: the instruction reads better after the thing it is about).
      imagePart
        ? {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${imagePart.mimeType};base64,${imagePart.data}` } },
              { type: 'text', text: userText },
            ],
          }
        : { role: 'user', content: userText },
    ],
    ...(responseSchema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              // strict:false -- the client's Gemini-dialect schemas may carry a
              // required-subset (strict mode demands required == all keys).
              strict: false,
              schema: responseSchema,
            },
          },
        }
      : {}),
  };

  // Give back the daily-cap unit when the call produced nothing billable, so a
  // vendor outage can't burn a user's whole allowance on answers they never got.
  // Refund ONLY on no-upstream-billing failures (unreachable / non-2xx reject),
  // never on refusal/truncation (the model ran and billed). refund_gemini_spend
  // (0110) floors at 0 and no-ops when no row exists, so a stray refund is safe.
  const refundOnFailure = async () => {
    if (!spentBumped) return;
    try {
      await supabaseAdmin.rpc('refund_gemini_spend', { p_user_id: userId, p_day: utcDay() });
    } catch (e) {
      console.warn('[openai-proxy] spend refund failed:', String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE));
    }
  };

  // Transcription takes a different endpoint, a different body (multipart) and
  // returns a different shape. Everything AFTER the call -- refund, audit,
  // response envelope -- is deliberately shared, so the two paths cannot drift
  // on the parts that touch money and the audit ledger.
  const isTranscription = audioPart !== null;
  const transcribeModelId = transcribeModel();

  const t0 = Date.now();
  let upstream: Response;
  try {
    if (isTranscription) {
      const ext = AUDIO_EXT[audioPart!.mimeType] ?? 'm4a';
      const form = new FormData();
      form.append('file', new Blob([base64ToBytes(audioPart!.data)], { type: audioPart!.mimeType }), `memo.${ext}`);
      form.append('model', transcribeModelId);
      // Verbatim only. No prompt is sent: a prompt biases a transcript, and the
      // caller's `user` field here is an instruction for Gemini's chat-shaped
      // transcription path, not something a transcription endpoint should read.
      form.append('response_format', 'json');
      upstream = await fetch(OPENAI_TRANSCRIBE_ENDPOINT, {
        method: 'POST',
        // NO content-type header: fetch must set the multipart boundary itself.
        headers: { 'authorization': `Bearer ${resolvedKey.apiKey}` },
        body: form,
      });
    } else {
      upstream = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${resolvedKey.apiKey}`,
        },
        body: JSON.stringify(openaiBody),
      });
    }
  } catch (e) {
    await refundOnFailure();
    // REQ-260824-01: leave a trace. Without this a seat can fail every call for
    // a week and ai_audit_log looks like a quiet week.
    await auditUpstreamFailure(supabaseAdmin, {
      userId, purpose, model: openaiModel, vendor: 'openai',
      outcome: 'upstream_unreachable', latencyMs: Date.now() - t0,
      keyCombo, promptHash: djb2(`${systemText ?? ''}${userText}`),
    });
    return jsonResponse(req, { error: 'upstream_unreachable', detail: String(e).slice(0, UPSTREAM_DETAIL_TRUNCATE) }, 502);
  }
  const latencyMs = Date.now() - t0;

  if (!upstream.ok) {
    const errBody = await upstream.text();
    await refundOnFailure();
    await auditUpstreamFailure(supabaseAdmin, {
      userId, purpose, model: openaiModel, vendor: 'openai',
      outcome: `upstream_${upstream.status}`, latencyMs,
      keyCombo, promptHash: djb2(`${systemText ?? ''}${userText}`),
    });
    return jsonResponse(req, {
      error: 'upstream_error',
      status: upstream.status,
      detail: errBody.slice(0, UPSTREAM_DETAIL_TRUNCATE),
    }, 502);
  }

  // A 200 with a non-JSON body previously threw here unhandled -> 500 with no
  // CORS headers, after the model may already have billed. Catch and 502 without
  // refunding (billing is ambiguous once we have a 200).
  let data: { choices?: unknown; model?: unknown; usage?: { total_tokens?: number } };
  try {
    data = await upstream.json();
  } catch (_e) {
    return jsonResponse(req, { error: 'upstream_bad_payload' }, 502);
  }
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const rawContent = choice?.message?.content;
  // The transcription endpoint answers { text } with no choices array, so the
  // chat extraction below would silently yield '' for a perfectly good call.
  const text: string = isTranscription
    ? (typeof (data as { text?: unknown })?.text === 'string' ? ((data as { text: string }).text).trim() : '')
    : typeof rawContent === 'string' ? rawContent : '';
  const modelUsed: string = isTranscription
    ? transcribeModelId
    : typeof data?.model === 'string' ? data.model : openaiModel;
  // Content-filter terminations surface as an upstream refusal (parity with
  // claude-proxy) so callers take their fail-soft paths.
  const refused =
    !isTranscription &&
    (choice?.finish_reason === 'content_filter' ||
      typeof choice?.message?.refusal === 'string');
  // Truncation (finish_reason:"length"): reasoning tokens count against
  // max_completion_tokens on gpt-5.x, so a truncated reply can be a mid-JSON
  // stump or empty. Surfaced as 502, never a silent 200 (parity claude-proxy).
  const truncated = !isTranscription && choice?.finish_reason === 'length';

  // C3: write the audit row server-side (parity with the sibling proxies).
  // D-27: usage tokens (OpenAI returns usage.total_tokens incl. reasoning).
  const openaiTotalTokens = Number(data?.usage?.total_tokens) || null;
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
      reasoning_vendor: 'openai',
      reasoning_effort: clampedEffort,
      key_combo: keyCombo,
      total_tokens: openaiTotalTokens,
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
