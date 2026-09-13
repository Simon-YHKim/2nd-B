import { getEnv } from "../env";

export interface CapturedSessionRequestError extends Error {
  readonly context: Response;
}

interface CapturedFunctionOptions {
  body: unknown;
  signal?: AbortSignal;
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
  const response = await globalThis.fetch(
    `${supabaseUrl()}/functions/v1/${functionName}`,
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
