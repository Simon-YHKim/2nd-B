import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

type PaddleApiBoundaryModule = {
  buildPaddleApiUrl: (
    configuredBase: string | null | undefined,
    path: string,
  ) => string;
  readPaddleApiResponse: (
    response: Response,
    timeoutMs: number,
  ) => Promise<{ ref: string | null; errorCode: string | null }>;
};

function transpile(path: string): string {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadPaddleApiBoundary(): PaddleApiBoundaryModule {
  const shared = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "supabase",
    "functions",
    "_shared",
  );
  const requestExports: Record<string, unknown> = {};
  new Function("exports", transpile(join(shared, "request-boundary.ts")))(requestExports);

  const paddleExports: Partial<PaddleApiBoundaryModule> = {};
  const requireShared = (specifier: string): Record<string, unknown> => {
    if (specifier === "./request-boundary.ts") return requestExports;
    throw new Error(`unexpected helper import: ${specifier}`);
  };
  new Function(
    "exports",
    "require",
    transpile(join(shared, "paddle-api-boundary.ts")),
  )(paddleExports, requireShared);
  if (
    typeof paddleExports.buildPaddleApiUrl !== "function"
    || typeof paddleExports.readPaddleApiResponse !== "function"
  ) throw new Error("Paddle API boundary helpers did not load");
  return paddleExports as PaddleApiBoundaryModule;
}

const { buildPaddleApiUrl, readPaddleApiResponse } = loadPaddleApiBoundary();

describe("Paddle API boundary", () => {
  test("allows only the two official Paddle API roots", () => {
    expect(buildPaddleApiUrl(undefined, "/adjustments"))
      .toBe("https://api.paddle.com/adjustments");
    expect(buildPaddleApiUrl("https://api.paddle.com/", "/adjustments"))
      .toBe("https://api.paddle.com/adjustments");
    expect(buildPaddleApiUrl(
      "https://sandbox-api.paddle.com",
      "/subscriptions/sub_123/cancel",
    )).toBe("https://sandbox-api.paddle.com/subscriptions/sub_123/cancel");

    for (const base of [
      "",
      " https://api.paddle.com",
      "http://api.paddle.com",
      "https://api.paddle.com.evil.example",
      "https://user@api.paddle.com",
      "https://api.paddle.com:443",
      "https://api.paddle.com/v1",
      "https://api.paddle.com?next=https://evil.example",
      "https://api.paddle.com#evil",
      "https://api.paddle.com//",
    ]) {
      expect(() => buildPaddleApiUrl(base, "/adjustments"))
        .toThrow("invalid_paddle_api_base");
    }
  });

  test("rejects endpoint paths that could escape the approved origin", () => {
    for (const path of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "/../steal",
      "/%2e%2e/steal",
      "/adjustments?redirect=https://evil.example",
      "/adjustments#fragment",
      "/adjustments\\steal",
      "/adjustments\r\nX-Evil: yes",
    ]) {
      expect(() => buildPaddleApiUrl("https://api.paddle.com", path))
        .toThrow("invalid_paddle_api_path");
    }
  });

  test("bounds and strictly parses provider JSON while discarding raw detail", async () => {
    const rawDetail = "do-not-store: Bearer provider-secret-material";
    const response = new Response(JSON.stringify({
      data: { id: "adj_123" },
      error: { code: "request_invalid", detail: rawDetail },
    }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    const result = await readPaddleApiResponse(response, 1_000);

    expect(result).toEqual({ ref: "adj_123", errorCode: "request_invalid" });
    expect(JSON.stringify(result)).not.toContain(rawDetail);
  });

  test("maps untrusted codes to a bounded status-only fallback", async () => {
    const response = new Response(JSON.stringify({
      error: {
        code: `bad\nAuthorization: Bearer secret-${"x".repeat(200)}`,
        detail: "raw provider body must never cross the boundary",
      },
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    });

    await expect(readPaddleApiResponse(response, 1_000)).resolves.toEqual({
      ref: null,
      errorCode: "http_422",
    });
  });

  test("rejects oversized, non-JSON, duplicate-key, and stalled responses", async () => {
    await expect(readPaddleApiResponse(new Response("{}", {
      headers: {
        "content-type": "text/html",
        "content-length": "2",
      },
    }), 1_000)).rejects.toMatchObject({ code: "unsupported_content_type" });

    await expect(readPaddleApiResponse(new Response("x", {
      headers: {
        "content-type": "application/json",
        "content-length": String(64 * 1024 + 1),
      },
    }), 1_000)).rejects.toMatchObject({ code: "body_too_large" });

    await expect(readPaddleApiResponse(new Response(
      '{"error":{"code":"a","code":"b"}}',
      { headers: { "content-type": "application/json" } },
    ), 1_000)).rejects.toThrow("duplicate_json_key");

    const cancel = jest.fn();
    const stalled = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel,
    });
    await expect(readPaddleApiResponse(new Response(stalled, {
      headers: { "content-type": "application/json" },
    }), 25)).rejects.toMatchObject({ code: "body_read_timeout" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
