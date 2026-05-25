// Gemini proxy Edge Function.
//
// Why: the Web build ships the client bundle to GitHub Pages where any
// visitor can extract an EXPO_PUBLIC_GOOGLE_API_KEY via DevTools. Routing
// Gemini calls through this Edge Function keeps the API key in Edge
// Function Secrets (server-only) — clients send the prompt, the function
// signs and forwards it, the response comes back.
//
// Auth: requires a valid Supabase JWT (verify_jwt is set in config).
//
// Secrets the operator sets via the Supabase Dashboard:
//   GEMINI_API_KEY                — the Google AI Studio key
//
// The function is intentionally minimal — it doesn't re-run the safety
// classifier (C9 still happens client-side before the invoke()) nor write
// the audit log (the client writes it after receiving the reply). The
// only thing this function 'owns' is the API key.
//
// Request shape:
//   { system: string | null, user: string, model: 'gemini-2.5-flash' | 'gemini-2.5-pro' }
//
// Response shape:
//   { text: string, modelUsed: string, latencyMs: number }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const MODELS_ALLOWED = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '86400',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey || apiKey.length === 0) {
    return jsonResponse({ error: 'server_misconfigured_missing_GEMINI_API_KEY' }, 500);
  }

  let body: { user?: unknown; system?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const userText: string = typeof body?.user === 'string' ? body.user : '';
  const systemText: string | null = typeof body?.system === 'string' ? body.system : null;
  const model: string = typeof body?.model === 'string' ? body.model : 'gemini-2.5-flash';

  if (userText.length === 0) return jsonResponse({ error: 'user_required' }, 400);
  if (!MODELS_ALLOWED.has(model)) return jsonResponse({ error: 'model_not_allowed' }, 400);

  const geminiBody: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: userText }] }],
  };
  if (systemText && systemText.length > 0) {
    geminiBody.systemInstruction = { parts: [{ text: systemText }] };
  }

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_ENDPOINT(model), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(geminiBody),
    });
  } catch (e) {
    return jsonResponse({ error: 'upstream_unreachable', detail: String(e) }, 502);
  }
  const latencyMs = Date.now() - t0;

  if (!upstream.ok) {
    const errBody = await upstream.text();
    return jsonResponse({ error: 'upstream_error', status: upstream.status, detail: errBody.slice(0, 500) }, 502);
  }

  const data = await upstream.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const modelUsed: string = data?.modelVersion ?? model;

  return jsonResponse({ text, modelUsed, latencyMs });
});
