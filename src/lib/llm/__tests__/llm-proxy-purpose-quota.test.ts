import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

const sharedPath = resolve(
  __dirname,
  "../../../../supabase/functions/_shared/llm-proxy-common.ts",
);
const sharedSource = readFileSync(sharedPath, "utf8");
const quotaMigrationSource = readFileSync(
  resolve(__dirname, "../../../../db/migrations/0185_llm_proxy_purpose_quota.sql"),
  "utf8",
);

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
  consumeLlmPurposeQuota: (
    executeRpc: ExecuteRpc,
    userId: string,
    provider: Vendor,
    purpose: string,
  ) => Promise<
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

// 19 = the 16 PromptPurpose members plus the proxy-only labels embed_index,
// safety_classify and voice_transcribe. 29 until S0.5 (2026-10-07) removed the
// ten seats in REMOVED_SEATS.
const expectedPurposes = [
  "advisor",
  "audit_qa",
  "capture_ocr",
  "clipper_classify",
  "clipper_template_propose",
  "embed_index",
  "gap_synthesize",
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
  "voice_transcribe",
];

// S0.5 removed these from the policy and every proxy. They are no longer
// labels at all, so every vendor must refuse them.
const REMOVED_SEATS = [
  "axis_estimate",
  "capture_classify",
  "capture_voice",
  "cluster_infer",
  "crosscheck_challenge",
  "crosscheck_defend",
  "digest_weekly",
  "imagine",
  "import_ingest",
  "ttfv_first_insight",
];

const expectedSeats: Record<Vendor, string[]> = {
  gemini: [
    "advisor", "audit_qa", "capture_ocr", "clipper_classify", "clipper_template_propose",
    "embed_index", "gap_synthesize", "interview_probe", "northstar_propose",
    "ops_daily_brief", "ops_recommend", "persona_narrative", "persona_synthesis",
    "reasoning_connect", "safety_classify", "secondb_chat", "self_model_propose",
    "source_ingest", "voice_transcribe",
  ],
  openai: [
    "advisor", "audit_qa", "capture_ocr", "clipper_classify", "clipper_template_propose",
    "embed_index", "gap_synthesize", "interview_probe", "northstar_propose",
    "ops_daily_brief", "ops_recommend", "persona_narrative", "persona_synthesis",
    "reasoning_connect", "safety_classify", "secondb_chat", "self_model_propose",
    "source_ingest", "voice_transcribe",
  ],
  claude: [
    "persona_narrative", "persona_synthesis",
  ],
  xai: [
    "advisor", "gap_synthesize", "northstar_propose", "ops_daily_brief", "ops_recommend",
    "persona_narrative", "persona_synthesis", "secondb_chat", "self_model_propose",
  ],
};

// 0185 is deliberately NOT narrowed in S0.5: a wider SQL allowlist cannot
// spend anything, because every proxy refuses the label before it reaches the
// quota RPC. These are exactly the seats 0185 still admits that the policy no
// longer does - the list S1's quota-function replacement migration narrows.
// Pinned both ways: a removed seat revived in the policy shrinks the gap and
// fails, and a new 0185 seat the policy lacks widens it and fails.
const NARROW_IN_S1: Record<Vendor, string[]> = {
  gemini: [
    "axis_estimate", "capture_classify", "cluster_infer", "digest_weekly", "imagine",
    "import_ingest", "ttfv_first_insight",
  ],
  openai: [
    "axis_estimate", "capture_classify", "cluster_infer", "crosscheck_challenge",
    "digest_weekly", "imagine", "import_ingest", "ttfv_first_insight",
  ],
  claude: ["axis_estimate", "crosscheck_defend", "digest_weekly"],
  xai: ["axis_estimate", "cluster_infer", "digest_weekly", "ttfv_first_insight"],
};

function parseQuotaRpcSignature(): string {
  const match = quotaMigrationSource.match(
    /CREATE OR REPLACE FUNCTION public\.consume_llm_proxy_purpose_quota\(([\s\S]*?)\)\s*RETURNS TABLE/,
  );
  if (!match) throw new Error("purpose quota RPC signature not found");
  return match[1].replace(/\s+/g, " ").trim();
}

// The table CHECK on llm_proxy_purpose_daily.purpose, as the ALTER re-adds it.
function parseQuotaCheckPurposes(): string[] {
  const match = quotaMigrationSource.match(
    /ADD CONSTRAINT llm_proxy_purpose_daily_purpose_check CHECK \(\s*purpose IN \(([\s\S]*?)\)\s*\)/,
  );
  if (!match) throw new Error("purpose quota CHECK not found");
  return [...match[1].matchAll(/'([^']+)'/g)].map((seat) => seat[1]).sort();
}

function parseQuotaSeats(provider: Vendor): string[] {
  const providerBlock = quotaMigrationSource.match(
    /IF p_provider IS NULL[\s\S]*?NOT \(CASE p_provider([\s\S]*?)\n\s*ELSE false\s*\n\s*END\) THEN/,
  )?.[1];
  if (!providerBlock) throw new Error("purpose quota provider policy not found");
  const match = providerBlock.match(
    new RegExp(`WHEN '${provider}' THEN p_purpose IN \\(([\\s\\S]*?)\\n\\s*\\)`),
  );
  if (!match) throw new Error(`purpose quota seats not found: ${provider}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((seat) => seat[1]).sort();
}

describe("authoritative LLM purpose/provider seating", () => {
  const api = transpileContract<PolicyApi>(
    "export type LlmProxyVendor",
    "// --- crisis gate",
  );

  test("keeps exactly the 19 server-known purposes", () => {
    expect(Object.keys(api.LLM_PURPOSE_POLICY).sort()).toEqual(expectedPurposes);
    expect(new Set(Object.keys(api.LLM_PURPOSE_POLICY))).toHaveProperty("size", 19);
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

  test("rejects unknown labels, including the ten S0.5 seats", () => {
    // capture_voice used to be a known-but-unseated routing alias here; S0.5
    // removed it from the table along with the other nine.
    for (const vendor of Object.keys(expectedSeats) as Vendor[]) {
      expect(api.resolveLlmPurposePolicy("unknown_purpose", vendor)).toBeNull();
      for (const removed of REMOVED_SEATS) {
        expect(api.resolveLlmPurposePolicy(removed, vendor)).toBeNull();
      }
    }
    for (const removed of REMOVED_SEATS) expect(api.LLM_PURPOSE_POLICY).not.toHaveProperty(removed);
    expect(api.resolveLlmPurposePolicy(null, "gemini")).toBeNull();
  });
});

describe("shared per-purpose paid-egress quota client", () => {
  const loadPurposeQuotaContract = () => transpileContract<PurposeQuotaApi>(
    "// --- per-purpose LLM proxy quota",
    "// --- misc",
  );

  test("matches the landed three-argument SQL ABI and admits every provider seat", () => {
    expect(parseQuotaRpcSignature()).toBe(
      "p_user_id uuid, p_provider text, p_purpose text",
    );
    for (const [provider, seats] of Object.entries(expectedSeats) as [Vendor, string[]][]) {
      const sqlSeats = parseQuotaSeats(provider);
      // policy is a subset of 0185: a seated route is never refused by the RPC
      expect(seats.filter((seat) => !sqlSeats.includes(seat))).toEqual([]);
      // and the surplus is exactly the pinned S1 narrowing list
      expect(sqlSeats.filter((seat) => !seats.includes(seat))).toEqual([...NARROW_IN_S1[provider]].sort());
    }
  });

  test("0185 still admits the S0.5 seats, and nothing else beyond the policy", () => {
    // Every surplus seat is one S0.5 removed, never a label the policy has
    // never heard of.
    const surplus = new Set(Object.values(NARROW_IN_S1).flat());
    for (const seat of surplus) expect(REMOVED_SEATS).toContain(seat);
    // capture_voice was never seated in 0185 (it was a routing alias), so it is
    // the one removed label the provider blocks do not carry.
    expect([...surplus].sort()).toEqual(REMOVED_SEATS.filter((seat) => seat !== "capture_voice"));
    // The table CHECK is the old 29-label vocabulary: the 19 live labels plus
    // all ten removed ones. S1 narrows it with the quota function.
    expect(parseQuotaCheckPurposes()).toEqual([...expectedPurposes, ...REMOVED_SEATS].sort());
  });

  test("sends the verified user, provider, and purpose for every seated route", async () => {
    const api = loadPurposeQuotaContract();
    for (const [provider, seats] of Object.entries(expectedSeats) as [Vendor, string[]][]) {
      for (const purpose of seats) {
        const rpc = jest.fn(async (_name: string, _args: Record<string, unknown>) => ({
          data: [{ allowed: true, used: 2, quota_limit: 5 }],
          error: null,
        }));

        if (purpose === "persona_synthesis" && provider !== "openai") {
          await expect(api.consumeLlmPurposeQuota(rpc, "user-id", provider, purpose))
            .resolves.toEqual({ ok: false, reason: "unavailable" });
          expect(rpc).not.toHaveBeenCalled();
          continue;
        }

        await expect(api.consumeLlmPurposeQuota(rpc, "user-id", provider, purpose))
          .resolves.toEqual({ ok: true, protected: true, used: 2, limit: 5 });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith("consume_llm_proxy_purpose_quota", {
          p_user_id: "user-id",
          p_provider: provider,
          p_purpose: purpose,
        });
        expect(Object.keys(rpc.mock.calls[0][1]).sort())
          .toEqual(["p_provider", "p_purpose", "p_user_id"]);
      }
    }
  });

  test("maps exhaustion but fails closed on errors, rejection, or response drift", async () => {
    const api = loadPurposeQuotaContract();
    const limited = jest.fn(async () => ({
      data: [{ allowed: false, used: 5, quota_limit: 5 }],
      error: null,
    }));
    await expect(api.consumeLlmPurposeQuota(limited, "user-id", "gemini", "secondb_chat"))
      .resolves.toEqual({ ok: false, reason: "limited", used: 5, limit: 5 });

    for (const rpc of [
      jest.fn(async () => ({ data: [{ allowed: true, used: 0 }], error: null })),
      jest.fn(async () => ({ data: [], error: null })),
      jest.fn(async () => ({ data: null, error: { message: "rpc missing" } })),
      jest.fn(async () => {
        throw new Error("rpc rejected");
      }),
    ]) {
      await expect(api.consumeLlmPurposeQuota(rpc, "user-id", "gemini", "secondb_chat"))
        .resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });
});

describe.each([
  ["claude-proxy", "claude", 1],
  ["gemini-proxy", "gemini", 2],
  ["openai-proxy", "openai", 2],
  ["xai-proxy", "xai", 1],
] as const)("%s purpose quota boundary", (proxy, provider, quotaCalls) => {
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
      new RegExp(
        `consumeLlmPurposeQuota\\(capacityRpc, userId, '${provider}', (?:purpose|'embed_index')\\)`,
        "g",
      ),
    ) ?? [];
    expect(calls).toHaveLength(quotaCalls);
    expect(verifiedCalls).toHaveLength(quotaCalls);
  });

  test("fails closed with stable limited and unavailable responses", () => {
    expect(source).toMatch(/purposeQuota\.reason === 'limited'[\s\S]*purpose_limit_exceeded/);
    expect(source).toContain("purpose_limit_unavailable");
  });
});

describe.each(["gemini-proxy", "openai-proxy"] as const)(
  "%s embedding quota response",
  (proxy) => {
    const source = readFileSync(
      resolve(__dirname, `../../../../supabase/functions/${proxy}/index.ts`),
      "utf8",
    );

    test("returns 429 for exhaustion and 503 only for quota unavailability", () => {
      const call = source.indexOf("'embed_index')");
      const blockEnd = source.indexOf("'bump_gemini_spend'", call);
      const quotaBlock = source.slice(call, blockEnd);

      expect(call).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(call);
      expect(quotaBlock).toMatch(
        /purposeQuota\.reason === 'limited'[\s\S]*purpose_limit_exceeded[\s\S]*429/,
      );
      expect(quotaBlock).toMatch(/purpose_limit_unavailable[\s\S]*503/);
    });
  },
);
