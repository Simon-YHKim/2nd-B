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
import { insertCrisisEvent } from "../../supabase/crisis-events";

const mockRpc = jest.fn(
  async (..._args: unknown[]): Promise<{ error: null | { code: string; message: string } }> => ({ error: null }),
);

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

const root = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(join(root, "db", "migrations", "0095_ai_audit_purpose_rpc.sql"), "utf8");
const auditTs = readFileSync(join(root, "src", "lib", "supabase", "audit.ts"), "utf8");
const boundaryTs = readFileSync(join(root, "src", "lib", "llm", "boundary.ts"), "utf8");
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

// 0179 added the keyed writers and 0181 replaced their bodies (lock + payload
// assert + client_unverified). Both are live (ledger 2026-09-26 17:52 / 17:54
// KST). The client only ever sends the keyed shape through these two helpers.
describe("0179/0181 keyed audit writers", () => {
  const idempotencySql = readFileSync(
    join(root, "db", "migrations", "0179_audit_outbox_idempotency.sql"),
    "utf8",
  );
  const hardeningSql = readFileSync(
    join(root, "db", "migrations", "0181_client_audit_ingest_hardening.sql"),
    "utf8",
  );
  const KEY = "3f0b4a52-9c1e-4d7a-8b6f-2e5d9a1c7b40";
  const auditArgs = {
    userId: "u1",
    promptHash: "1a2b3c4d",
    outputHash: "5e6f7a8b",
    modelUsed: "gpt-5.4",
    vertexBackend: false,
    safetyZone: "green" as const,
    latencyMs: 12,
    purpose: "secondb_chat" as const,
    effort: "low" as const,
    reasoningProvider: "openai" as const,
  };
  const crisisArgs = {
    classifierConfidence: 0.95,
    triggerCategories: ["input_red"],
    routingTemplateVersion: "routecrisis-inline-v1",
    locale: "en" as const,
  };

  beforeEach(() => mockRpc.mockClear());

  test("a key selects the *_once RPC with the same payload plus p_outbox_event_id", async () => {
    await insertAiAuditLog(auditArgs);
    await insertAiAuditLog(auditArgs, undefined, undefined, KEY);
    await insertCrisisEvent(crisisArgs);
    await insertCrisisEvent(crisisArgs, undefined, undefined, KEY);

    expect(mockRpc.mock.calls.map(([name]) => name)).toEqual([
      "log_ai_audit",
      "log_ai_audit_once",
      "log_crisis_event",
      "log_crisis_event_once",
    ]);
    const args = mockRpc.mock.calls.map((call) => call[1] as Record<string, unknown>);
    expect(args[1]).toEqual({ p_outbox_event_id: KEY, ...args[0] });
    expect(args[3]).toEqual({ p_outbox_event_id: KEY, ...args[2] });
    // Minimization holds on the keyed path too.
    expect(args[3]).toEqual(expect.objectContaining({ p_cssrs_level: null }));
  });

  test("a malformed key fails before any RPC", async () => {
    await expect(insertAiAuditLog(auditArgs, undefined, undefined, "has space")).rejects.toThrow(
      "invalid_audit_outbox_event_id",
    );
    await expect(insertCrisisEvent(crisisArgs, undefined, undefined, "x".repeat(129))).rejects.toThrow(
      "invalid_audit_outbox_event_id",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("a failed keyed write is surfaced, never retried through the unkeyed RPC", async () => {
    mockRpc.mockResolvedValueOnce({ error: { code: "57014", message: "canceling statement" } });
    await expect(insertAiAuditLog(auditArgs, undefined, undefined, KEY)).rejects.toMatchObject({
      code: "57014",
    });
    expect(mockRpc.mock.calls.map(([name]) => name)).toEqual(["log_ai_audit_once"]);
  });

  test("0179: owner-scoped partial unique keys and the same id format the client checks", () => {
    expect(idempotencySql).toMatch(
      /UNIQUE INDEX IF NOT EXISTS ai_audit_log_owner_outbox_event_unique\s+ON public\.ai_audit_log \(user_id, outbox_event_id\)\s+WHERE outbox_event_id IS NOT NULL/,
    );
    expect(idempotencySql).toMatch(
      /UNIQUE INDEX IF NOT EXISTS crisis_events_owner_outbox_event_unique\s+ON public\.crisis_events \(user_id_hash, outbox_event_id\)\s+WHERE outbox_event_id IS NOT NULL/,
    );
    expect(idempotencySql).toMatch(/char_length\(outbox_event_id\) BETWEEN 1 AND 128/);
    expect(idempotencySql).toContain("outbox_event_id ~ '^[A-Za-z0-9._:-]+$'");
  });

  test("0181 (live body): owner from auth.uid(), replay compared under the lock before the rate guard", () => {
    for (const fn of ["log_ai_audit_once", "log_crisis_event_once"]) {
      const start = hardeningSql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      const body = hardeningSql.slice(start, hardeningSql.indexOf("$$;", start));
      expect(start).toBeGreaterThan(-1);
      expect(body).toContain("v_owner_id uuid := auth.uid()");
      const lock = body.indexOf("pg_advisory_xact_lock");
      const replay = body.indexOf("IF FOUND THEN");
      const rate = body.indexOf("enforce_client_audit_ingest_rate");
      expect(lock).toBeGreaterThan(-1);
      expect(replay).toBeGreaterThan(lock);
      expect(rate).toBeGreaterThan(replay);
      expect(body).toContain("'client_unverified'");
    }
    expect(hardeningSql).toContain("audit_outbox_idempotency_conflict");
    expect(hardeningSql).toContain("crisis_outbox_idempotency_conflict");
  });

  test("0181: the keyed writers are callable by authenticated only", () => {
    for (const sig of [
      "public.log_ai_audit_once(text, text, text, text, boolean, text, integer, text, text, text)",
      "public.log_crisis_event_once(text, numeric, text[], integer, text, text)",
    ]) {
      expect(hardeningSql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;`);
      expect(hardeningSql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM anon;`);
      expect(hardeningSql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM service_role;`);
      expect(hardeningSql).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`);
    }
  });
});

describe("gemini.ts / safety.ts - every client-written audit row carries a purpose", () => {
  test("callLlm rows (mock + output-swap + direct/fallback) attribute input.purpose", () => {
    // Three audit literals: mock, output-swap, and the normal (direct path /
    // proxy-unaudited fallback) row.
    expect(boundaryTs.match(/purpose: input\.purpose,/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // Crisis routing threads the caller's purpose through routeCrisis opts.
    expect(boundaryTs).toMatch(
      /opts: \{\s*recordCrisisEvent\?: boolean;\s*purpose\?: string;\s*session\?: AuthenticatedAccountSessionLease;\s*\}/,
    );
    expect(
      boundaryTs.match(/purpose: input\.purpose,\s*session: input\.session/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  test("embed / transcription / advisor rows use the proxy-continuity labels", () => {
    expect(boundaryTs.match(/purpose: "embed_index",/g)).toHaveLength(2);
    // 3 audit rows (mock / output-swap / live) + the pre-existing proxy
    // invoke-body self-report share the label — that sharing IS the continuity.
    expect(boundaryTs.match(/purpose: "voice_transcribe",/g)).toHaveLength(4);
    expect(boundaryTs.match(/purpose: "advisor",/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  test("the client-side safety classifier audits under the A18 seat name", () => {
    expect(safetyTs).toMatch(/purpose: "safety_classify",/);
  });
});
