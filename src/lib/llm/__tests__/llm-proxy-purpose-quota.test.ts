import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

const sharedPath = resolve(
  __dirname,
  "../../../../supabase/functions/_shared/llm-proxy-common.ts",
);
const sharedSource = readFileSync(sharedPath, "utf8");

type Vendor = "gemini" | "openai" | "claude" | "xai";
type PurposePolicy = { vendors: readonly Vendor[] };
type PolicyApi = {
  LLM_PURPOSE_POLICY: Record<string, PurposePolicy>;
  resolveLlmPurposePolicy: (purpose: unknown, vendor: Vendor) => PurposePolicy | null;
};
type ExecuteRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
type PurposeQuotaApi = {
  LLM_PURPOSE_DAILY_QUOTAS: Set<string>;
  consumeLlmPurposeQuota: (
    executeRpc: ExecuteRpc,
    userId: string,
    purpose: string,
  ) => Promise<
    | { ok: true; protected: false }
    | { ok: true; protected: true; used: number; limit: number }
    | { ok: false; reason: "limited" | "unavailable"; used?: number; limit?: number }
  >;
};

function transpileContract<T>(startMarker: string, endMarker: string): T {
  const start = sharedSource.indexOf(startMarker);
  const end = sharedSource.indexOf(endMarker, start);
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

const expectedPurposes = [
  "advisor",
  "audit_qa",
  "axis_estimate",
  "capture_classify",
  "capture_ocr",
  "capture_voice",
  "clipper_classify",
  "clipper_template_propose",
  "cluster_infer",
  "crosscheck_challenge",
  "crosscheck_defend",
  "digest_weekly",
  "embed_index",
  "gap_synthesize",
  "imagine",
  "import_ingest",
  "interview_probe",
  "northstar_propose",
  "ops_daily_brief",
  "ops_recommend",
  "persona_narrative",
  "persona_synthesis",
  "reasoning_connect",
  "safety_classify",
  "secondb_chat",
  "self_model_propose",
  "source_ingest",
  "ttfv_first_insight",
  "voice_transcribe",
];

const expectedSeats: Record<Vendor, string[]> = {
  gemini: [
    "advisor", "audit_qa", "axis_estimate", "capture_classify", "capture_ocr",
    "clipper_classify", "clipper_template_propose", "cluster_infer", "digest_weekly",
    "embed_index", "gap_synthesize", "imagine", "import_ingest", "interview_probe",
    "northstar_propose", "ops_daily_brief", "ops_recommend", "persona_narrative",
    "persona_synthesis", "reasoning_connect", "safety_classify", "secondb_chat",
    "self_model_propose", "source_ingest", "ttfv_first_insight", "voice_transcribe",
  ],
  openai: [
    "advisor", "audit_qa", "axis_estimate", "capture_classify", "capture_ocr",
    "clipper_classify", "clipper_template_propose", "cluster_infer", "crosscheck_challenge",
    "digest_weekly", "embed_index", "gap_synthesize", "imagine", "import_ingest",
    "interview_probe", "northstar_propose", "ops_daily_brief", "ops_recommend",
    "persona_narrative", "persona_synthesis", "reasoning_connect", "safety_classify",
    "secondb_chat", "self_model_propose", "source_ingest", "ttfv_first_insight",
    "voice_transcribe",
  ],
  claude: [
    "axis_estimate", "crosscheck_defend", "digest_weekly", "persona_narrative",
    "persona_synthesis",
  ],
  xai: [
    "advisor", "axis_estimate", "cluster_infer", "digest_weekly", "gap_synthesize",
    "northstar_propose", "ops_daily_brief", "ops_recommend", "persona_narrative",
    "persona_synthesis", "secondb_chat", "self_model_propose", "ttfv_first_insight",
  ],
};

describe("authoritative LLM purpose/provider seating", () => {
  const api = transpileContract<PolicyApi>(
    "export type LlmProxyVendor",
    "// --- crisis gate",
  );

  test("keeps exactly the 29 server-known purposes", () => {
    expect(Object.keys(api.LLM_PURPOSE_POLICY).sort()).toEqual(expectedPurposes);
    expect(new Set(Object.keys(api.LLM_PURPOSE_POLICY))).toHaveProperty("size", 29);
  });

  test.each(Object.entries(expectedSeats) as [Vendor, string[]][])(
    "%s has exactly its approved seats",
    (vendor, seats) => {
      const actual = Object.entries(api.LLM_PURPOSE_POLICY)
        .filter(([, policy]) => policy.vendors.includes(vendor))
        .map(([purpose]) => purpose)
        .sort();
      expect(actual).toEqual([...seats].sort());
      for (const purpose of expectedPurposes) {
        expect(Boolean(api.resolveLlmPurposePolicy(purpose, vendor)))
          .toBe(seats.includes(purpose));
      }
    },
  );

  test("rejects unknown labels and keeps capture_voice deliberately unseated", () => {
    for (const vendor of Object.keys(expectedSeats) as Vendor[]) {
      expect(api.resolveLlmPurposePolicy("capture_voice", vendor)).toBeNull();
      expect(api.resolveLlmPurposePolicy("unknown_purpose", vendor)).toBeNull();
    }
    expect(api.resolveLlmPurposePolicy(null, "gemini")).toBeNull();
  });
});

describe("shared per-purpose paid-egress quota client", () => {
  const loadPurposeQuotaContract = () => transpileContract<PurposeQuotaApi>(
    "// --- per-purpose LLM proxy quota",
    "// --- misc",
  );

  test("shares the exact expensive-purpose boundary and skips unprotected calls", async () => {
    const api = loadPurposeQuotaContract();
    expect([...api.LLM_PURPOSE_DAILY_QUOTAS]).toEqual([
      "secondb_chat",
      "crosscheck_challenge",
      "crosscheck_defend",
      "persona_synthesis",
      "persona_narrative",
      "axis_estimate",
      "digest_weekly",
    ]);
    const rpc = jest.fn<ReturnType<ExecuteRpc>, Parameters<ExecuteRpc>>();
    await expect(api.consumeLlmPurposeQuota(rpc, "user-id", "capture_ocr"))
      .resolves.toEqual({ ok: true, protected: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("sends only the verified user and purpose; no provider or caller cap", async () => {
    const api = loadPurposeQuotaContract();
    const rpc = jest.fn(async (_name: string, _args: Record<string, unknown>) => ({
      data: [{ allowed: true, used: 2, quota_limit: 5 }],
      error: null,
    }));

    await expect(api.consumeLlmPurposeQuota(rpc, "user-id", "secondb_chat"))
      .resolves.toEqual({ ok: true, protected: true, used: 2, limit: 5 });
    expect(rpc).toHaveBeenCalledWith("consume_llm_proxy_purpose_quota", {
      p_user_id: "user-id",
      p_purpose: "secondb_chat",
    });
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(["p_purpose", "p_user_id"]);
  });

  test("maps exhaustion but fails closed on errors, rejection, or response drift", async () => {
    const api = loadPurposeQuotaContract();
    const limited = jest.fn(async () => ({
      data: [{ allowed: false, used: 5, quota_limit: 5 }],
      error: null,
    }));
    await expect(api.consumeLlmPurposeQuota(limited, "user-id", "secondb_chat"))
      .resolves.toEqual({ ok: false, reason: "limited", used: 5, limit: 5 });

    for (const rpc of [
      jest.fn(async () => ({ data: [{ allowed: true, used: 0 }], error: null })),
      jest.fn(async () => ({ data: [], error: null })),
      jest.fn(async () => ({ data: null, error: { message: "rpc missing" } })),
      jest.fn(async () => {
        throw new Error("rpc rejected");
      }),
    ]) {
      await expect(api.consumeLlmPurposeQuota(rpc, "user-id", "secondb_chat"))
        .resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });
});

describe.each([
  ["claude-proxy", 1],
  ["gemini-proxy", 2],
  ["openai-proxy", 2],
  ["xai-proxy", 1],
] as const)("%s purpose quota boundary", (proxy, quotaCalls) => {
  const source = readFileSync(
    resolve(__dirname, `../../../../supabase/functions/${proxy}/index.ts`),
    "utf8",
  );

  test("claims the route purpose after entitlement and before spend, capacity, or egress", () => {
    const tier = source.indexOf("effective_subscription_tier");
    const quota = source.indexOf("consumeLlmPurposeQuota(", tier);
    const spend = source.indexOf("'bump_gemini_spend'", quota);
    const capacity = source.indexOf("reserveLlmProxyCapacity(", spend);
    const fetch = source.indexOf("await fetch(", capacity);
    expect(quota).toBeGreaterThan(tier);
    expect(spend).toBeGreaterThan(quota);
    expect(capacity).toBeGreaterThan(spend);
    expect(fetch).toBeGreaterThan(capacity);

    const calls = source.match(/consumeLlmPurposeQuota\(/g) ?? [];
    const verifiedCalls = source.match(
      /consumeLlmPurposeQuota\(capacityRpc, userId, (?:purpose|'embed_index')\)/g,
    ) ?? [];
    expect(calls).toHaveLength(quotaCalls);
    expect(verifiedCalls).toHaveLength(quotaCalls);
  });

  test("fails closed with stable limited and unavailable responses", () => {
    expect(source).toMatch(/purposeQuota\.reason === 'limited'[\s\S]*purpose_limit_exceeded/);
    expect(source).toContain("purpose_limit_unavailable");
  });
});
