jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://project.example.test",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  }),
}));

import {
  invokeFunctionWithCapturedSession,
  rpcWithCapturedSession,
} from "../captured-session-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("captured-session Supabase transport", () => {
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
