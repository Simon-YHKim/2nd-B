import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const SHARED_PATH = resolve(ROOT, "supabase/functions/_shared/llm-proxy-common.ts");
const GEMINI_PATH = resolve(ROOT, "supabase/functions/gemini-proxy/index.ts");
const XAI_PATH = resolve(ROOT, "supabase/functions/xai-proxy/index.ts");
const VENDOR_PLACEMENT_PATH = resolve(ROOT, "docs/LLM-VENDOR-PLACEMENT.md");
const CONSENT_DRAFT_PATH = resolve(
  ROOT,
  "db/migration-drafts/UNNUMBERED_effective_llm_consent_current_contract.sql",
);
const CONSENT_CONTRACT_PATH = resolve(
  ROOT,
  "db/migrations/0150_signup_consent_contract_20260902.sql",
);
const CONSENT_WRITER_PATH = resolve(ROOT, "src/lib/supabase/consent.ts");

const sharedSource = readFileSync(SHARED_PATH, "utf8");
const geminiSource = readFileSync(GEMINI_PATH, "utf8");
const xaiSource = readFileSync(XAI_PATH, "utf8");
const vendorPlacement = readFileSync(VENDOR_PLACEMENT_PATH, "utf8");
const consentDraft = existsSync(CONSENT_DRAFT_PATH)
  ? readFileSync(CONSENT_DRAFT_PATH, "utf8")
  : "";
const consentContract = readFileSync(CONSENT_CONTRACT_PATH, "utf8");
const consentWriter = readFileSync(CONSENT_WRITER_PATH, "utf8");

type Normalize = (node: unknown) => Record<string, unknown> | null;

function loadGeminiNormalizer(): Normalize {
  const start = sharedSource.indexOf("export function normalizeResponseSchema");
  const end = sharedSource.indexOf("// --- (vendor", start);
  if (start < 0 || end < 0) throw new Error("response schema helpers not found");
  const snippet = `${sharedSource.slice(start, end)}\nexports.normalizeGeminiResponseSchema = normalizeGeminiResponseSchema;\n`;
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exportsObj: { normalizeGeminiResponseSchema?: Normalize } = {};
  new Function("exports", js)(exportsObj);
  if (typeof exportsObj.normalizeGeminiResponseSchema !== "function") {
    throw new Error("normalizeGeminiResponseSchema did not evaluate to a function");
  }
  return exportsObj.normalizeGeminiResponseSchema;
}

function loadGenericNormalizer(): Normalize {
  const start = sharedSource.indexOf("export function normalizeResponseSchema");
  const end = sharedSource.indexOf("// --- (vendor", start);
  if (start < 0 || end < 0) throw new Error("response schema helpers not found");
  const snippet = `${sharedSource.slice(start, end)}\nexports.normalizeResponseSchema = normalizeResponseSchema;\n`;
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exportsObj: { normalizeResponseSchema?: Normalize } = {};
  new Function("exports", js)(exportsObj);
  if (typeof exportsObj.normalizeResponseSchema !== "function") {
    throw new Error("normalizeResponseSchema did not evaluate to a function");
  }
  return exportsObj.normalizeResponseSchema;
}

function readConst(name: string): string {
  const match = consentWriter.match(new RegExp(`export const ${name} = "([^"]+)"`));
  if (!match) throw new Error(`${name} missing`);
  return match[1];
}

describe("W7 Gemini schema wire contract", () => {
  test("keeps the legacy Gemini Schema dialect uppercase and bounded", () => {
    const normalize = loadGeminiNormalizer();
    const result = normalize({
      type: "object",
      ignored: "drop-me",
      properties: {
        zone: {
          type: "string",
          format: "enum",
          enum: ["green", "yellow", "red"],
        },
        scores: {
          type: "ARRAY",
          items: { type: "integer", description: "whole numbers" },
        },
      },
      required: ["zone", "ghost"],
      additionalProperties: false,
    });

    expect(result).toEqual({
      type: "OBJECT",
      properties: {
        zone: {
          type: "STRING",
          format: "enum",
          enum: ["green", "yellow", "red"],
        },
        scores: {
          type: "ARRAY",
          items: { type: "INTEGER", description: "whole numbers" },
        },
      },
      required: ["zone"],
    });
    expect(JSON.stringify(result)).not.toContain("additionalProperties");
  });

  test("rejects union, unknown, malformed child, and over-budget schemas", () => {
    const normalize = loadGeminiNormalizer();
    expect(normalize({ type: ["OBJECT", "NULL"] })).toBeNull();
    expect(normalize({ type: "mystery" })).toBeNull();
    expect(normalize({
      type: "OBJECT",
      properties: { bad: { type: ["STRING", "NULL"] } },
    })).toBeNull();
    expect(normalize({ type: "STRING", description: "x".repeat(33 * 1024) })).toBeNull();
  });

  test("Gemini alone uses its Schema sanitizer while JSON-schema vendors stay unchanged", () => {
    expect(loadGenericNormalizer()({ type: "STRING", format: "enum" })).toEqual({
      type: "string",
    });
    expect(geminiSource).toContain("normalizeGeminiResponseSchema,");
    expect(geminiSource).toContain(
      "const responseSchema = normalizeGeminiResponseSchema(body?.responseSchema);",
    );
    expect(geminiSource).toContain("responseSchema.type !== 'OBJECT'");
    expect(geminiSource).toContain("gc.responseSchema = responseSchema;");
    expect(geminiSource).not.toContain("gc.responseJsonSchema");
    expect(geminiSource).not.toContain(
      "const responseSchema = normalizeResponseSchema(body?.responseSchema);",
    );

    for (const relative of [
      "supabase/functions/claude-proxy/index.ts",
      "supabase/functions/openai-proxy/index.ts",
      "supabase/functions/xai-proxy/index.ts",
    ]) {
      const source = readFileSync(resolve(ROOT, relative), "utf8");
      expect(source).toContain("normalizeResponseSchema,");
      expect(source).not.toContain("normalizeGeminiResponseSchema");
    }
  });
});

describe("W7 current consent and xAI activation contract", () => {
  test("adds a forward-only provenance boundary for every current required ack", () => {
    expect(consentDraft).toContain("INACTIVE DRAFT");
    expect(consentDraft).toContain("CREATE TABLE public.llm_consent_receipts");
    expect(consentDraft).toContain("CREATE OR REPLACE FUNCTION public.capture_llm_consent_provenance");
    expect(consentDraft).toContain("SECURITY INVOKER");
    expect(consentDraft).toContain("current_user IS DISTINCT FROM consent_records_owner");
    expect(consentDraft).toContain("CREATE TRIGGER capture_llm_consent_provenance_after_insert");
    expect(consentDraft).toContain("CREATE OR REPLACE FUNCTION public.effective_llm_consent_v2");
    expect(consentDraft).toContain("JOIN public.llm_consent_receipts provenance");
    expect(consentDraft).toContain("c.sensitive_data_ack IS TRUE");
    expect(consentDraft).toContain("c.safety_notice_ack IS TRUE");
    expect(consentDraft).toContain("public.signup_consent_contract('email-v3')");
    expect(consentDraft).toContain("c.consent_version = contract.consent_version");
    expect(consentDraft).toContain("c.policy_version = contract.policy_version");
    expect(consentDraft).toContain("c.terms_version = contract.terms_version");
    expect(consentDraft).toMatch(
      /REVOKE ALL ON FUNCTION public\.effective_llm_consent_v2\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(consentDraft).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.effective_llm_consent_v2\(uuid\)[\s\S]*TO service_role/,
    );
    expect(consentDraft).toMatch(
      /REVOKE ALL ON TABLE public\.llm_consent_receipts[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(consentDraft).toContain("llm_consent_contract_not_ready");
    expect(consentDraft).toContain("No historical backfill is safe");
    expect(consentDraft).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;/im);
  });

  test("the server-owned email-v3 tuple matches the current client ledger constants", () => {
    const tuple = consentContract.match(
      /\('email-v3'::text,\s*'([^']+)'::text,\s*'([^']+)'::text,\s*'([^']+)'::text,\s*true\)/,
    );
    expect(tuple).not.toBeNull();
    expect(tuple?.slice(1)).toEqual([
      readConst("CONSENT_VERSION"),
      readConst("PRIVACY_POLICY_VERSION"),
      readConst("TERMS_VERSION"),
    ]);
  });

  test("keeps xAI off by default before secrets, body parsing, or provider egress", () => {
    const gate = xaiSource.indexOf("Deno.env.get('ENABLE_XAI_PROXY') !== 'true'");
    const apiKey = xaiSource.indexOf("Deno.env.get('XAI_API_KEY')", gate);
    const body = xaiSource.indexOf("readLlmProxyJsonObject(req)", gate);
    const egress = xaiSource.indexOf("await fetch(XAI_ENDPOINT", gate);
    expect(gate).toBeGreaterThan(0);
    expect(xaiSource.slice(gate, apiKey)).toContain("vendor_disabled");
    expect(xaiSource.slice(gate, apiKey)).toContain("503");
    expect(apiKey).toBeGreaterThan(gate);
    expect(body).toBeGreaterThan(gate);
    expect(egress).toBeGreaterThan(gate);
    expect(vendorPlacement).toContain("`ENABLE_XAI_PROXY`");
    expect(vendorPlacement).toContain("`503 vendor_disabled`");
  });
});
