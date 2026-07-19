// QA-F2 (2026-07-18) follow-up — structural + functional guard for the 0095
// audit-enrichment chain: db/migrations/0095_ai_audit_purpose_rpc.sql recreates
// log_ai_audit with p_purpose / p_reasoning_vendor / p_reasoning_effort
// (DEFAULT NULL, old 6-arg callers keep working), src/lib/supabase/audit.ts
// forwards them from AuditMeta, and every CLIENT-written audit row in
// gemini.ts / safety.ts now carries a purpose label (mock, output-swap, crisis
// routing, direct path, embeds, transcription, advisor, safety classifier).
// Before this chain the proxy rows had purpose attribution (0073) while every
// client row was NULL — the audit-continuity gap the 07-18 live QA flagged.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { insertAiAuditLog } from "../../supabase/audit";

const mockRpc = jest.fn(async (..._args: unknown[]) => ({ error: null }));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

const root = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(join(root, "db", "migrations", "0095_ai_audit_purpose_rpc.sql"), "utf8");
const auditTs = readFileSync(join(root, "src", "lib", "supabase", "audit.ts"), "utf8");
const geminiTs = readFileSync(join(root, "src", "lib", "llm", "gemini.ts"), "utf8");
const safetyTs = readFileSync(join(root, "src", "lib", "llm", "safety.ts"), "utf8");

describe("0095_ai_audit_purpose_rpc.sql - signature migration", () => {
  test("drops the 0038 6-arg signature and recreates with three DEFAULT NULL params", () => {
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.log_ai_audit\(text, text, text, boolean, text, integer\);/,
    );
    expect(sql).toMatch(/p_purpose\s+text DEFAULT NULL/);
    expect(sql).toMatch(/p_reasoning_vendor text DEFAULT NULL/);
    expect(sql).toMatch(/p_reasoning_effort text DEFAULT NULL/);
  });

  test("keeps the safety_zone validation and the server-stamped user_id", () => {
    expect(sql).toMatch(/p_safety_zone NOT IN \('green', 'yellow', 'red'\)/);
    expect(sql).toMatch(/auth\.uid\(\),/);
  });

  test("normalizes enrichments instead of raising (C3: never lose the row)", () => {
    // purpose: trimmed + clamped to the 0073 column expectation, empty -> NULL.
    expect(sql).toMatch(/NULLIF\(left\(btrim\(p_purpose\), 64\), ''\)/);
    // vendor/effort: allowlisted; anything else -> NULL rather than an error.
    expect(sql).toMatch(/p_reasoning_vendor IN \('gemini', 'claude', 'openai'\)/);
    expect(sql).toMatch(/p_reasoning_effort IN \('low', 'medium', 'high', 'xhigh', 'max', 'none'\)/);
    // The only RAISE stays the pre-existing safety_zone guard.
    expect(sql.match(/RAISE EXCEPTION/g)).toHaveLength(1);
  });

  test("inserts the 0073 columns", () => {
    expect(sql).toMatch(/purpose, reasoning_vendor, reasoning_effort/);
  });

  test("re-grants the NEW signature: authenticated only, anon explicitly revoked", () => {
    const nineArg = "text, text, text, boolean, text, integer, text, text, text";
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.log_ai_audit(${nineArg}) FROM PUBLIC;`);
    expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.log_ai_audit(${nineArg}) FROM anon;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.log_ai_audit(${nineArg}) TO authenticated;`);
  });
});

describe("audit.ts - RPC mapping forwards the enrichment axes", () => {
  test("source passes p_purpose / p_reasoning_vendor / p_reasoning_effort", () => {
    expect(auditTs).toMatch(/p_purpose: meta\.purpose \?\? null/);
    expect(auditTs).toMatch(/p_reasoning_vendor: meta\.reasoningProvider \?\? null/);
    expect(auditTs).toMatch(/p_reasoning_effort: meta\.effort \?\? null/);
  });

  test("insertAiAuditLog sends the enrichment values when present", async () => {
    mockRpc.mockClear();
    await insertAiAuditLog({
      userId: "u1",
      promptHash: "p",
      outputHash: "o",
      modelUsed: "gemini-2.5-pro",
      vertexBackend: false,
      safetyZone: "green",
      latencyMs: 12,
      purpose: "reasoning_connect",
      effort: "high",
      reasoningProvider: "gemini",
    });
    expect(mockRpc).toHaveBeenCalledWith(
      "log_ai_audit",
      expect.objectContaining({
        p_purpose: "reasoning_connect",
        p_reasoning_vendor: "gemini",
        p_reasoning_effort: "high",
      }),
    );
  });

  test("insertAiAuditLog sends explicit NULLs when the row has no call context", async () => {
    mockRpc.mockClear();
    await insertAiAuditLog({
      userId: "u1",
      promptHash: "p",
      outputHash: "o",
      modelUsed: "none-crisis-routed",
      vertexBackend: false,
      safetyZone: "red",
      latencyMs: 0,
    });
    expect(mockRpc).toHaveBeenCalledWith(
      "log_ai_audit",
      expect.objectContaining({
        p_purpose: null,
        p_reasoning_vendor: null,
        p_reasoning_effort: null,
      }),
    );
  });
});

describe("gemini.ts / safety.ts - every client-written audit row carries a purpose", () => {
  test("callGemini rows (mock + output-swap + direct/fallback) attribute input.purpose", () => {
    // Three audit literals: mock, output-swap, and the normal (direct path /
    // proxy-unaudited fallback) row.
    expect(geminiTs.match(/purpose: input\.purpose,/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // Crisis routing threads the caller's purpose through routeCrisis opts.
    expect(geminiTs).toMatch(/opts: \{ recordCrisisEvent\?: boolean; purpose\?: string \}/);
    expect(geminiTs.match(/purpose: input\.purpose \}/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  test("embed / transcription / advisor rows use the proxy-continuity labels", () => {
    expect(geminiTs.match(/purpose: "embed_index",/g)).toHaveLength(2);
    // 3 audit rows (mock / output-swap / live) + the pre-existing proxy
    // invoke-body self-report share the label — that sharing IS the continuity.
    expect(geminiTs.match(/purpose: "voice_transcribe",/g)).toHaveLength(4);
    expect(geminiTs.match(/purpose: "advisor",/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  test("the client-side safety classifier audits under the A18 seat name", () => {
    expect(safetyTs).toMatch(/purpose: "safety_classify",/);
  });
});
