import { getEnv } from "../env";

export interface CapturedSessionRequestError extends Error {
  readonly context: Response;
}

interface CapturedFunctionOptions {
  body: unknown;
  signal?: AbortSignal;
  region?: "ap-northeast-2";
}

type CapturedFunctionResult<T> =
  | { data: T; error: null }
  | { data: null; error: CapturedSessionRequestError };

function assertRouteSegment(value: string): void {
  if (!/^[a-z0-9_-]+$/i.test(value)) throw new Error("captured_session_route_invalid");
}

function capturedHeaders(accessToken: string): Record<string, string> {
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("captured_session_token_missing");
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: getEnv().EXPO_PUBLIC_SUPABASE_ANON_KEY,
    "content-type": "application/json",
  };
}

function requestError(response: Response): CapturedSessionRequestError {
  const error = new Error("captured_session_request_failed") as CapturedSessionRequestError;
  Object.defineProperty(error, "context", {
    configurable: false,
    enumerable: false,
    value: response,
    writable: false,
  });
  return error;
}

function supabaseUrl(): string {
  return getEnv().EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
}

/** Invoke an Edge Function with one immutable, caller-captured JWT. */
export async function invokeFunctionWithCapturedSession<T = unknown>(
  functionName: string,
  accessToken: string,
  options: CapturedFunctionOptions,
): Promise<CapturedFunctionResult<T>> {
  assertRouteSegment(functionName);
  // Supabase's query option pins execution without adding a CORS request header.
  const regionQuery = options.region ? `?forceFunctionRegion=${encodeURIComponent(options.region)}` : "";
  const response = await globalThis.fetch(
    `${supabaseUrl()}/functions/v1/${functionName}${regionQuery}`,
    {
      method: "POST",
      headers: capturedHeaders(accessToken),
      body: JSON.stringify(options.body),
      signal: options.signal,
    },
  );
  if (!response.ok) return { data: null, error: requestError(response.clone()) };
  const context = response.clone();
  try {
    return { data: await response.json() as T, error: null };
  } catch {
    return { data: null, error: requestError(context) };
  }
}

/** Call a PostgREST RPC with one immutable, caller-captured JWT. */
export async function rpcWithCapturedSession(
  functionName: string,
  args: Readonly<Record<string, unknown>>,
  accessToken: string,
  signal?: AbortSignal,
): Promise<{ error: CapturedSessionRequestError | null }> {
  assertRouteSegment(functionName);
  const response = await globalThis.fetch(
    `${supabaseUrl()}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: capturedHeaders(accessToken),
      body: JSON.stringify(args),
      signal,
    },
  );
  return response.ok
    ? { error: null }
    : { error: requestError(response.clone()) };
}

/**
 * Return a PostgREST RPC's JSON without rereading the mutable auth session.
 * This is transport data, not a validated quota or mutation receipt. Callers
 * must validate the value and record any issued mutation's outcome before
 * checking whether it may still publish to the current owner or screen.
 */
export async function rpcJsonWithCapturedSession<T = unknown>(
  functionName: string,
  args: Readonly<Record<string, unknown>>,
  accessToken: string,
  signal?: AbortSignal,
): Promise<CapturedFunctionResult<T>> {
  assertRouteSegment(functionName);
  const response = await globalThis.fetch(
    `${supabaseUrl()}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: capturedHeaders(accessToken),
      body: JSON.stringify(args),
      signal,
    },
  );
  if (!response.ok) return { data: null, error: requestError(response.clone()) };
  const context = response.clone();
  try {
    return { data: await response.json() as T, error: null };
  } catch {
    // A malformed success response does not prove that a write did not happen.
    return { data: null, error: requestError(context) };
  }
}
