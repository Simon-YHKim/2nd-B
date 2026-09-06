import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import ts from "typescript";

const root = join(process.cwd(), "supabase/functions");
const sharedSource = readFileSync(
  resolve(__dirname, "../../../../supabase/functions/_shared/llm-proxy-common.ts"),
  "utf8",
);
const sources = Object.fromEntries(
  ["claude-proxy", "gemini-proxy", "openai-proxy", "xai-proxy"].map((name) => [
    name,
    readFileSync(join(root, name, "index.ts"), "utf8"),
  ]),
) as Record<string, string>;

type BodyApi = {
  LLM_PROXY_JSON_BODY_LIMIT_BYTES: number;
  LLM_UPSTREAM_RESPONSE_LIMIT_BYTES: number;
  readLlmProxyJsonObject: (request: Request) => Promise<Record<string, unknown>>;
  readLlmUpstreamJsonObject: (response: Response) => Promise<Record<string, unknown>>;
  readLlmUpstreamErrorText: (response: Response) => Promise<string>;
};
type AuditAdmin = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
};
type AuditApi = {
  auditUpstreamFailure: (
    admin: AuditAdmin,
    options: {
      userId: string;
      purpose: string | null;
      model: string;
      vendor: string;
      outcome: string;
      latencyMs: number;
      keyCombo: string;
      promptHash: string;
    },
  ) => Promise<void>;
};

function transpileContract<T>(startMarker: string, endMarker?: string): T {
  const start = sharedSource.indexOf(startMarker);
  const end = endMarker ? sharedSource.indexOf(endMarker, start) : sharedSource.length;
  if (start < 0 || end < 0) throw new Error(`contract not found: ${startMarker}`);
  const js = ts.transpileModule(sharedSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const exported: Record<string, unknown> = {};
  new Function("exports", js)(exported);
  return exported as T;
}

describe("shared bounded JSON/body readers", () => {
  const api = transpileContract<BodyApi>(
    "export const MAX_USER_LEN",
    "// --- global LLM capacity guard",
  );

  test("fixes independent finite request and upstream byte limits", () => {
    expect(api.LLM_PROXY_JSON_BODY_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    expect(api.LLM_UPSTREAM_RESPONSE_LIMIT_BYTES).toBe(2 * 1024 * 1024);
    expect(api.LLM_UPSTREAM_RESPONSE_LIMIT_BYTES)
      .toBeLessThan(api.LLM_PROXY_JSON_BODY_LIMIT_BYTES);
  });

  test("accepts only a request JSON object and rejects declared oversize bodies", async () => {
    const valid = new Request("https://local.invalid", {
      method: "POST",
      body: JSON.stringify({ purpose: "secondb_chat" }),
    });
    await expect(api.readLlmProxyJsonObject(valid))
      .resolves.toEqual({ purpose: "secondb_chat" });

    const array = new Request("https://local.invalid", {
      method: "POST",
      body: "[]",
    });
    await expect(api.readLlmProxyJsonObject(array))
      .rejects.toMatchObject({ code: "invalid_json" });

    const declaredOversize = new Request("https://local.invalid", {
      method: "POST",
      headers: {
        "content-length": String(api.LLM_PROXY_JSON_BODY_LIMIT_BYTES + 1),
      },
      body: "{}",
    });
    await expect(api.readLlmProxyJsonObject(declaredOversize))
      .rejects.toMatchObject({
        code: "request_body_too_large",
        maxBytes: api.LLM_PROXY_JSON_BODY_LIMIT_BYTES,
      });
  });

  test("enforces streamed upstream size, fatal UTF-8, and object JSON shape", async () => {
    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(api.LLM_UPSTREAM_RESPONSE_LIMIT_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await expect(api.readLlmUpstreamJsonObject(new Response(oversizedStream)))
      .rejects.toMatchObject({ code: "upstream_response_too_large" });

    await expect(api.readLlmUpstreamJsonObject(new Response("[]")))
      .rejects.toMatchObject({ code: "upstream_bad_payload" });
    await expect(api.readLlmUpstreamJsonObject(new Response(new Uint8Array([0xc3, 0x28]))))
      .rejects.toMatchObject({ code: "upstream_bad_payload" });
    await expect(api.readLlmUpstreamErrorText(new Response(new Uint8Array([0xc3, 0x28]))))
      .rejects.toMatchObject({ code: "upstream_bad_payload" });
    await expect(api.readLlmUpstreamJsonObject(new Response('{"ok":true}')))
      .resolves.toEqual({ ok: true });
  });
});

describe("shared upstream failure audit", () => {
  const api = transpileContract<AuditApi>("export async function auditUpstreamFailure");

  test("stores hashes and server metadata, never prompt or completion payloads", async () => {
    const insert = jest.fn(async (_row: Record<string, unknown>) => ({ error: null }));
    const admin: AuditAdmin = {
      from: jest.fn(() => ({ insert })),
    };
    await api.auditUpstreamFailure(admin, {
      userId: "user-id",
      purpose: "secondb_chat",
      model: "model-id",
      vendor: "gemini",
      outcome: "upstream_503",
      latencyMs: 42,
      keyCombo: "GEMINI_API_KEY",
      promptHash: "hashed-only",
    });

    expect(admin.from).toHaveBeenCalledWith("ai_audit_log");
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: "user-id",
      event_source: "server_verified",
      prompt_hash: "hashed-only",
      output_hash: "0",
      model_used: "model-id+upstream_503",
    });
    for (const sensitive of ["prompt", "system", "user", "input", "output", "messages"]) {
      expect(row).not.toHaveProperty(sensitive);
    }
  });

  test("does not turn an audit outage into a second upstream failure", async () => {
    const admin: AuditAdmin = {
      from: () => ({
        insert: async () => {
          throw new Error("audit unavailable");
        },
      }),
    };
    await expect(api.auditUpstreamFailure(admin, {
      userId: "user-id",
      purpose: null,
      model: "model-id",
      vendor: "xai",
      outcome: "upstream_unreachable",
      latencyMs: 1,
      keyCombo: "XAI_API_KEY",
      promptHash: "hash",
    })).resolves.toBeUndefined();
  });
});

const responseShapeMarkers: Record<string, string[]> = {
  "claude-proxy": [
    "Array.isArray(data.content)",
    "isLlmJsonObject(block)",
    "isLlmJsonObject(data.usage)",
    "typeof data.stop_reason",
  ],
  "gemini-proxy": [
    "Array.isArray(data.candidates)",
    "isLlmJsonObject(candidate)",
    "isLlmJsonObject(candidate.content)",
    "isLlmJsonObject(data.usageMetadata)",
    "embed_shape_mismatch",
  ],
  "openai-proxy": [
    "Array.isArray(data.choices)",
    "isLlmJsonObject(firstChoice)",
    "isLlmJsonObject(firstChoice.message)",
    "typeof data.text",
    "embed_shape_mismatch",
    "Number.isFinite(value)",
  ],
  "xai-proxy": [
    "Array.isArray(data.choices)",
    "isLlmJsonObject(firstChoice)",
    "isLlmJsonObject(firstChoice.message)",
    "isLlmJsonObject(data.usage)",
  ],
};

describe.each(Object.entries(sources))("%s upstream resilience", (name, source) => {
  test("bounds the request and every provider fetch with no redirect following", () => {
    const fetches = source.match(/await fetch\(/g)?.length ?? 0;
    const deadlines = source.match(
      /signal: AbortSignal\.timeout\(PROVIDER_TIMEOUT_MS\)/g,
    )?.length ?? 0;
    const redirects = source.match(/redirect: 'error'/g)?.length ?? 0;

    expect(source).toContain("const PROVIDER_TIMEOUT_MS = 30_000;");
    expect(source).toContain("readLlmProxyJsonObject(req)");
    expect(fetches).toBeGreaterThan(0);
    expect(deadlines).toBe(fetches);
    expect(redirects).toBe(fetches);
    expect(source).not.toMatch(/\breq\.json\(\)|\bupstream\.json\(\)|\bupstream\.text\(\)/);
  });

  test("bounds error/success responses and validates provider-specific JSON shape", () => {
    expect(source).toContain("readLlmUpstreamErrorText");
    expect(source).toContain("readLlmUpstreamJsonObject");
    expect(source).toMatch(/if \(!(?:embedUpstream|upstream)\.ok\)/);
    for (const marker of responseShapeMarkers[name]) {
      expect(source).toContain(marker);
    }
    expect(source).toContain("upstream_bad_payload");
  });

  test("settles and audits after dispatch without a spend refund or capacity release", () => {
    const dispatch = source.lastIndexOf("const t0 = Date.now()");
    const tail = source.slice(dispatch);

    expect(dispatch).toBeGreaterThan(-1);
    expect(tail).toMatch(/catch \(e\)[\s\S]*'settle'[\s\S]*auditUpstreamFailure/);
    expect(tail).toContain("readLlmUpstreamJsonObject");
    expect(tail).toContain("'settle'");
    expect(tail).not.toContain("refundBeforeDispatch(");
    expect(tail).not.toContain("refundOnFailure(");
    expect(tail).not.toContain("'release'");
  });

  test("successful audit rows contain hashes, not raw prompt fields", () => {
    const auditRows = [...source.matchAll(
      /\.from\('ai_audit_log'\)\.insert\(\{([\s\S]*?)\n\s*\}\);/g,
    )].map((match) => match[1]);
    expect(auditRows.length).toBeGreaterThan(0);
    for (const row of auditRows) {
      expect(row).toContain("prompt_hash: djb2(");
      expect(row).toContain("output_hash: djb2(");
      expect(row).not.toMatch(/(?:^|\n)\s*(?:prompt|system|user|input|output|messages)\s*:/m);
    }
    expect(source).not.toMatch(/console\.(?:log|warn|error)\((?:userText|systemText|texts)/);
  });
});

describe("embedding post-dispatch parity", () => {
  test.each([
    ["gemini", sources["gemini-proxy"], "const userText"],
    ["openai", sources["openai-proxy"], "const userText"],
  ])(
    "%s refunds only before dispatch and audits/settles every ambiguous failure",
    (_name, source, endMarker) => {
      const start = source.indexOf("if (body?.op === 'embed')");
      const end = source.indexOf(endMarker, start);
      const branch = source.slice(start, end);
      const dispatch = branch.indexOf("await fetch(");
      const beforeDispatch = branch.slice(0, dispatch);
      const afterDispatch = branch.slice(dispatch);

      expect(dispatch).toBeGreaterThan(-1);
      expect(branch).toMatch(/const refundEmbedBeforeDispatch = async \(\) =>/);
      expect(beforeDispatch).toContain("await refundEmbedBeforeDispatch();");
      expect(afterDispatch).toMatch(/catch \(e\)[\s\S]*transitionLlmProxyCapacity\([\s\S]*'settle'/);
      expect(afterDispatch).toContain("auditUpstreamFailure");
      expect(afterDispatch).not.toContain("refundEmbedBeforeDispatch(");
      expect(afterDispatch).not.toContain("refundEmbedFailure(");
      expect(afterDispatch).not.toContain("refundOnFailure(");
      expect(afterDispatch).not.toContain("'release'");
    },
  );
});
