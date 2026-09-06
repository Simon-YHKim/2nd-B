// Authenticated, server-keyed foundation for the two public-data enrichments
// already present in the app. This function is deliberately NOT deployable yet:
// its atomic quota RPC does not exist until the deferred migration batch lands.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsPreflight, jsonResponse, userIdFromJwt } from "../_shared/llm-proxy-common.ts";
import type { PublicDataProvider } from "../_shared/public-data-proxy.ts";
import {
  PublicDataProxyError,
  buildUpstreamUrl,
  parseProviderBody,
  parsePublicDataRequest,
  providerSecretEnv,
  readTextBodyBounded,
} from "../_shared/public-data-proxy.ts";

const FETCH_TIMEOUT_MS = 7000;
const MAX_UPSTREAM_BYTES = 262_144;
const DAILY_USER_CAP: Record<PublicDataProvider, number> = {
  exim_fx: 20,
  mfds_food: 50,
};

function providerErrorStatus(error: string): number {
  if (error === "provider_quota_exceeded") return 429;
  return 502;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(req, { error: "missing_authorization" }, 401);
  }
  const userId = userIdFromJwt(authHeader);
  if (!userId) return jsonResponse(req, { error: "authentication_required" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "invalid_json" }, 400);
  }
  const parsedRequest = parsePublicDataRequest(body);
  if (!parsedRequest.ok) return jsonResponse(req, { error: parsedRequest.error }, 400);
  const request = parsedRequest.value;

  const secretEnv = providerSecretEnv(request.provider);
  const serverKey = (Deno.env.get(secretEnv) ?? "").trim();
  if (!serverKey) {
    return jsonResponse(req, { error: "server_misconfigured_missing_provider_key" }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { error: "server_misconfigured_supabase_env" }, 503);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Deferred migration contract (do not weaken to a process-local Map):
  // public.consume_public_data_quota(
  //   p_user_id uuid, p_provider text, p_day date, p_cap integer
  // ) RETURNS boolean. It must atomically insert/increment per user+provider+day,
  // return false without incrementing at the cap, use SECURITY DEFINER with an
  // empty search_path, revoke PUBLIC/anon/authenticated, and grant service_role
  // only. Until that exact RPC exists, every request fails closed here.
  const { data: quotaAllowed, error: quotaError } = await admin.rpc("consume_public_data_quota", {
    p_user_id: userId,
    p_provider: request.provider,
    p_day: new Date().toISOString().slice(0, 10),
    p_cap: DAILY_USER_CAP[request.provider],
  });
  if (quotaError) return jsonResponse(req, { error: "quota_check_unavailable" }, 503);
  if (quotaAllowed !== true) return jsonResponse(req, { error: "proxy_quota_exceeded" }, 429);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(buildUpstreamUrl(request, serverKey), {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    return jsonResponse(
      req,
      { error: controller.signal.aborted ? "upstream_timeout" : "upstream_unreachable" },
      controller.signal.aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timer);
  }

  if (upstream.type === "opaqueredirect" || (upstream.status >= 300 && upstream.status < 400)) {
    return jsonResponse(req, { error: "upstream_redirect_blocked" }, 502);
  }

  let text: string;
  try {
    text = await readTextBodyBounded(upstream, MAX_UPSTREAM_BYTES);
  } catch (error) {
    if (error instanceof PublicDataProxyError) {
      return jsonResponse(req, { error: error.code }, 502);
    }
    return jsonResponse(req, { error: "upstream_read_failed" }, 502);
  }

  if (upstream.status === 429) {
    return jsonResponse(req, { error: "provider_quota_exceeded", provider: request.provider }, 429);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return jsonResponse(req, { error: "provider_key_rejected", provider: request.provider }, 502);
  }

  const parsedBody = parseProviderBody(request.provider, text);
  if (!parsedBody.ok && parsedBody.error !== "upstream_bad_payload") {
    return jsonResponse(
      req,
      {
        error: parsedBody.error,
        provider: request.provider,
        providerCode: parsedBody.providerCode,
      },
      providerErrorStatus(parsedBody.error),
    );
  }
  if (!upstream.ok) {
    return jsonResponse(req, { error: "upstream_http_error", provider: request.provider }, 502);
  }
  if (!parsedBody.ok) return jsonResponse(req, { error: parsedBody.error }, 502);

  return jsonResponse(req, { provider: request.provider, data: parsedBody.data });
});
