jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://project.example.test",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  }),
}));

import {
  invokeFunctionWithCapturedSession,
  rpcJsonWithCapturedSession,
  rpcWithCapturedSession,
} from "../captured-session-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("captured-session JSON RPC transport", () => {
  test.each([7, 0, null, { count: 3 }, [1, 2], "unvalidated", false])("returns JSON as transport data: %j", async (value) => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify(value)));
    globalThis.fetch = fetchMock as typeof fetch;
    const signal = new AbortController().signal;
    const args = Object.freeze({ p_day: "2026-10-16" });
    await expect(rpcJsonWithCapturedSession("bump_chat_usage_if_under_cap", args, "captured-a", signal))
      .resolves.toEqual({ data: value, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://project.example.test/rest/v1/rpc/bump_chat_usage_if_under_cap", {
      method: "POST", signal, body: JSON.stringify(args),
      headers: { Authorization: "Bearer captured-a", apikey: "public-anon-key", "content-type": "application/json" },
    });
  });

  test.each(["../escape", "name?query=1", "name/path", "", "rpc%2fother"])("rejects invalid routes before fetch: %s", async (name) => {
    globalThis.fetch = jest.fn();
    await expect(rpcJsonWithCapturedSession(name, {}, "captured-a")).rejects.toThrow("captured_session_route_invalid");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("rejects a missing token before fetch", async () => {
    globalThis.fetch = jest.fn();
    await expect(rpcJsonWithCapturedSession("get_chat_usage", {}, "")).rejects.toThrow("captured_session_token_missing");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test.each([400, 401, 409, 500])("preserves HTTP %i context without retrying or exposing its body in the error", async (status) => {
    const body = JSON.stringify({ code: "P0001", message: "private upstream detail" });
    const fetchMock = jest.fn().mockResolvedValue(new Response(body, { status }));
    globalThis.fetch = fetchMock as typeof fetch;
    const result = await rpcJsonWithCapturedSession("bump_chat_usage_if_under_cap", {}, "captured-a");
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("captured_session_request_failed");
    expect(result.error?.context.status).toBe(status);
    expect(await result.error?.context.text()).toBe(body);
    expect(JSON.stringify(result.error)).toBe("{}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test.each(["", "not-json", "{\"count\":"])("malformed success is an error with the original success context: %s", async (body) => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 200 })) as typeof fetch;
    const result = await rpcJsonWithCapturedSession("bump_chat_usage_if_under_cap", {}, "captured-a");
    expect(result.data).toBeNull();
    expect(result.error?.context.status).toBe(200);
    expect(await result.error?.context.text()).toBe(body);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("no-content success is not converted to zero or a confirmed mutation result", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 })) as typeof fetch;
    const result = await rpcJsonWithCapturedSession("bump_chat_usage_if_under_cap", {}, "captured-a");
    expect(result.data).toBeNull();
    expect(result.error?.context.status).toBe(204);
  });

  test("a rejected transport stays a rejection and never retries", async () => {
    const failure = new Error("transport unavailable");
    globalThis.fetch = jest.fn().mockRejectedValue(failure) as typeof fetch;
    await expect(rpcJsonWithCapturedSession("get_chat_usage", {}, "captured-a")).rejects.toBe(failure);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("keeps an issued response available for the original caller to settle after cancellation", async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const fetchMock = jest.fn().mockReturnValue(pending);
    globalThis.fetch = fetchMock as typeof fetch;
    const controller = new AbortController();
    const result = rpcJsonWithCapturedSession("bump_chat_usage_if_under_cap", {}, "captured-a", controller.signal);
    controller.abort();
    // A transport can already have received the server result when aborted.
    // It is the caller's job to settle its ticket and then reject publication.
    resolve(new Response("8"));
    await expect(result).resolves.toEqual({ data: 8, error: null });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("captured-session Supabase transport", () => {
  test("pins an opted-in function to Seoul without changing its token, body, signal or CORS headers", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response("null", {
      status: 200, headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;
    const controller = new AbortController();
    const options = { body: { action: "weather", place: { latitude: 0, longitude: 0 } }, signal: controller.signal, region: "ap-northeast-2" as const };

    await expect(invokeFunctionWithCapturedSession("weather", "captured-token-a", options))
      .resolves.toEqual({ data: null, error: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.example.test/functions/v1/weather?forceFunctionRegion=ap-northeast-2",
      {
        method: "POST", signal: controller.signal, body: JSON.stringify(options.body),
        headers: {
          Authorization: "Bearer captured-token-a", apikey: "public-anon-key", "content-type": "application/json",
        },
      },
    );
  });

  test("a failed Seoul invocation never retries without the region", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    globalThis.fetch = fetchMock as typeof fetch;
    const options = { body: { action: "status" }, region: "ap-northeast-2" as const };

    const result = await invokeFunctionWithCapturedSession("weather", "captured-token-a", options);
    expect(result.error?.context.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://project.example.test/functions/v1/weather?forceFunctionRegion=ap-northeast-2");
  });

  test("sends the immutable A token even when a caller's current session has become B", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ text: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;
    const controller = new AbortController();

    await expect(invokeFunctionWithCapturedSession(
      "openai-proxy",
      "captured-token-a",
      { body: { purpose: "voice_transcribe" }, signal: controller.signal },
    )).resolves.toEqual({ data: { text: "ok" }, error: null });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.example.test/functions/v1/openai-proxy",
      expect.objectContaining({
        method: "POST",
        signal: controller.signal,
        headers: expect.objectContaining({
          Authorization: "Bearer captured-token-a",
          apikey: "public-anon-key",
          "content-type": "application/json",
        }),
      }),
    );
  });

  test("binds RPC audit writes to the same captured token", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response("null", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(rpcWithCapturedSession(
      "log_ai_audit",
      { p_prompt_hash: "abc" },
      "captured-token-a",
    )).resolves.toEqual({ error: null });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.example.test/rest/v1/rpc/log_ai_audit",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer captured-token-a" }),
        body: JSON.stringify({ p_prompt_hash: "abc" }),
      }),
    );
  });

  test("returns a stable error marker without copying response or credential details", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "private upstream detail" }),
      { status: 500, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

    const result = await invokeFunctionWithCapturedSession(
      "openai-proxy",
      "captured-token-a",
      { body: {} },
    );

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("captured_session_request_failed");
    expect(JSON.stringify(result.error)).not.toContain("private upstream detail");
    expect(JSON.stringify(result.error)).not.toContain("captured-token-a");
    expect(result.error?.context).toBeInstanceOf(Response);
  });

  test("keeps stable response context when a successful response has invalid JSON", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    const result = await invokeFunctionWithCapturedSession(
      "openai-proxy",
      "captured-token-a",
      { body: {} },
    );

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("captured_session_request_failed");
    expect(result.error?.context.status).toBe(200);
  });
});
