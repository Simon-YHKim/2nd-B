-- 0073_ai_audit_axis_columns.sql
-- D-27: (vendor × model × effort) re-decomposition columns for ai_audit_log.
--
-- The axis-key scheme (docs/LLM-ROUTING.md "Axis key attribution") gives the
-- VENDOR dashboard a per-combo usage split via a dedicated API key per
-- (vendor, model, effort). These columns give the SAME split INSIDE our own DB
-- PLUS the axes a key can NEVER separate — purpose, user, time — so spend/usage
-- can be re-decomposed with plain SQL. Complementary to the vendor-dashboard
-- view (key = "which combo"; these columns = "which combo, for which purpose,
-- which user, when, how many tokens").
--
-- All columns are NULLABLE and additive. Existing writers keep working and just
-- leave the new columns NULL:
--   * the service-role vendor proxies (claude/openai/gemini) POPULATE them;
--   * the native-path log_ai_audit RPC (0038) is intentionally left unchanged,
--     so direct-client Gemini rows leave them NULL (a follow-up can thread them
--     through the RPC + src/lib/supabase/audit.ts if native re-decomposition is
--     wanted — not required for the paid-vendor attribution goal).
-- C3 (an audit row on every LLM call) is unaffected: the row is still written;
-- these only ENRICH it. RLS (0038) is unaffected — service_role bypasses it and
-- the RPC's column set is unchanged.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

ALTER TABLE public.ai_audit_log
  ADD COLUMN IF NOT EXISTS purpose          text,    -- PromptPurpose label (the "situation")
  ADD COLUMN IF NOT EXISTS reasoning_vendor text,    -- 'gemini' | 'claude' | 'openai'
  ADD COLUMN IF NOT EXISTS reasoning_effort text,    -- clamped effort actually sent upstream
  ADD COLUMN IF NOT EXISTS key_combo        text,    -- combo secret name used, or the base '<PREFIX>_API_KEY' on fallback
  ADD COLUMN IF NOT EXISTS total_tokens     integer; -- vendor-reported usage total (input + output/thinking)

-- Attribution rollup index (vendor × model × effort over time) for the
-- re-decomposition queries. Partial: attributed rows only (skips legacy NULLs).
CREATE INDEX IF NOT EXISTS ai_audit_log_attribution_idx
  ON public.ai_audit_log (reasoning_vendor, model_used, reasoning_effort, created_at DESC)
  WHERE reasoning_vendor IS NOT NULL;

COMMENT ON COLUMN public.ai_audit_log.purpose          IS 'D-27: PromptPurpose label — re-decomposition axis a vendor key cannot split';
COMMENT ON COLUMN public.ai_audit_log.reasoning_vendor IS 'D-27: upstream vendor — gemini | claude | openai';
COMMENT ON COLUMN public.ai_audit_log.reasoning_effort IS 'D-27: clamped reasoning effort actually sent upstream (low/medium/high/xhigh/none)';
COMMENT ON COLUMN public.ai_audit_log.key_combo        IS 'D-27: combo secret name that signed the call, or the base <PREFIX>_API_KEY on fallback';
COMMENT ON COLUMN public.ai_audit_log.total_tokens     IS 'D-27: vendor-reported total token usage for the call';
