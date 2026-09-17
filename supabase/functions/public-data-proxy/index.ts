// Authenticated, server-keyed gateway for the two public-data enrichments.
// Migration 0171 owns the atomic per-user and provider-global quota ledger;
// apply it before deploying this function. Client source names stay compatible
// (`mfds` / `exim`) while the server maps them to the migration's provider IDs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  PublicDataProxyError,
  buildPublicDataUpstreamUrl,
  parsePublicDataRequest,
  parsePublicDataUpstream,
  publicDataProviderFor,
  publicDataSecretFor,
  readPublicDataBodyBounded,
  type PublicDataSource,
} from "../_shared/public-data-proxy.ts";
import {
  JsonBodyError,
  PUBLIC_DATA_PROXY_JSON_BODY_LIMIT_BYTES,
  PUBLIC_DATA_PROXY_JSON_MAX_DEPTH,
  readStrictJsonObject,
} from "../_shared/request-json.ts";

const FETCH_TIMEOUT_MS = 7_000;
const MAX_UPSTREAM_BYTES = 262_144;
const DAILY_USER_CAP: Record<PublicDataSource, number> = {
  exim: 20,
  mfds: 50,
};

const STATIC_ALLOWED_ORIGINS: readonly string[] = [
  "https://simon-yhkim.github.io",
  "http://localhost:8081",
  "http://localhost:19006",
];

function parseEnvOrigins(): string[] {
  const raw = Deno.env.get("PUBLIC_DATA_PROXY_ALLOWED_ORIGINS") ?? "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => {
      try {
        const url = new URL(origin);
        const localHttp =
          url.protocol === "http:" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1");
        return url.origin === origin && (url.protocol === "https:" || localHttp);
      } catch {
        return false;
      }
    });
}

const ALLOWED_ORIGINS = new Set<string>([...STATIC_ALLOWED_ORIGINS, ...parseEnvOrigins()]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGINS.has(origin)
    ? { "access-control-allow-origin": origin, vary: "origin" }
    : { vary: "origin" };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...corsHeaders(req),
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function corsPreflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-max-age": "86400",
    },
  });
}

// The gateway verifies the JWT because config.toml pins verify_jwt=true. This
// second gate rejects a valid anon token: quota may only be spent for a signed-
// in user, and the resulting subject is the only user id sent to the DB RPC.
function authenticatedUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.slice(authHeader.toLowerCase().indexOf("bearer ") + 7).trim();
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64 + "==".slice(0, (4 - (base64.length % 4)) % 4)));
    const sub = typeof claims?.sub === "string" ? claims.sub : "";
    const role = typeof claims?.role === "string" ? claims.role : "";
    return role === "authenticated" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

function providerErrorStatus(error: string): number {
  return error === "provider_quota_exceeded" ? 429 : 502;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(req, { error: "missing_authorization" }, 401);
  }
  const userId = authenticatedUserIdFromJwt(authHeader);
  if (!userId) return jsonResponse(req, { error: "authentication_required" }, 401);

  // Strict before quota is spent: a repeated key must not mean one thing to a
  // proxy or log reader and another thing to parsePublicDataRequest below.
  let rawBody: unknown;
  try {
    rawBody = await readStrictJsonObject(req, PUBLIC_DATA_PROXY_JSON_BODY_LIMIT_BYTES, PUBLIC_DATA_PROXY_JSON_MAX_DEPTH);
  } catch (error) {
    if (error instanceof JsonBodyError && error.code === "request_body_too_large") {
      return jsonResponse(req, { error: error.code }, 413);
    }
    if (error instanceof JsonBodyError && error.code === "unsupported_media_type") {
      return jsonResponse(req, { error: error.code }, 415);
    }
    return jsonResponse(req, { error: "invalid_json" }, 400);
  }
  const parsedRequest = parsePublicDataRequest(rawBody);
  if (!parsedRequest.ok) return jsonResponse(req, { error: parsedRequest.error }, 400);
  const request = parsedRequest.value;

  const serverKey = (Deno.env.get(publicDataSecretFor(request.source)) ?? "").trim();
  if (!serverKey) return jsonResponse(req, { error: "source_unconfigured" }, 503);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: "quota_service_unconfigured" }, 503);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const provider = publicDataProviderFor(request.source);
  const { data: quotaAllowed, error: quotaError } = await admin.rpc("consume_public_data_quota", {
    p_user_id: userId,
    p_provider: provider,
    p_day: new Date().toISOString().slice(0, 10),
    p_cap: DAILY_USER_CAP[request.source],
  });
  if (quotaError) return jsonResponse(req, { error: "quota_check_unavailable" }, 503);
  if (quotaAllowed !== true) return jsonResponse(req, { error: "proxy_quota_exceeded" }, 429);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response;
  let text: string;
  try {
    upstream = await fetch(buildPublicDataUpstreamUrl(request, serverKey), {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (upstream.type === "opaqueredirect" || (upstream.status >= 300 && upstream.status < 400)) {
      await upstream.body?.cancel().catch(() => undefined);
      return jsonResponse(req, { error: "upstream_redirect_blocked" }, 502);
    }
    text = await readPublicDataBodyBounded(upstream, MAX_UPSTREAM_BYTES, {
      timeoutMs: FETCH_TIMEOUT_MS,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return jsonResponse(req, { error: "upstream_timeout" }, 504);
    }
    if (error instanceof PublicDataProxyError) {
      const status = error.code === "upstream_body_timed_out" ? 504 : 502;
      return jsonResponse(req, { error: error.code }, status);
    }
    return jsonResponse(req, { error: "upstream_unreachable" }, 502);
  } finally {
    clearTimeout(timeout);
  }

  if (upstream.status === 429) {
    return jsonResponse(req, { error: "provider_quota_exceeded", provider }, 429);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return jsonResponse(req, { error: "provider_key_rejected", provider }, 502);
  }

  const parsedUpstream = parsePublicDataUpstream(request.source, text);
  if (!parsedUpstream.ok && parsedUpstream.error !== "upstream_bad_payload") {
    return jsonResponse(
      req,
      {
        error: parsedUpstream.error,
        provider,
        ...(parsedUpstream.providerCode ? { providerCode: parsedUpstream.providerCode } : {}),
      },
      providerErrorStatus(parsedUpstream.error),
    );
  }
  if (!upstream.ok) return jsonResponse(req, { error: "upstream_http_error", provider }, 502);
  if (!parsedUpstream.ok) return jsonResponse(req, { error: parsedUpstream.error }, 502);

  // Keep the deployed client contract stable: callers already unwrap `{ data }`.
  return jsonResponse(req, { data: parsedUpstream.data });
});
