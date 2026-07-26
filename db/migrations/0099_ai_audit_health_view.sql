-- 0098: ai_audit_log operational health view (dashboard / service_role only).
--
-- The audit ledger had writers but no reader (2026-07-26 harness map: no view,
-- no monitor, no in-app reader) — C3 makes every call reconstructable after
-- the fact, but nothing made problems VISIBLE day-of. This view is the
-- minimum queryable rollup so the owner can see, in one SELECT:
--   - call volume per day / purpose / vendor
--   - red-zone output rows
--   - degraded upstream outcomes (+refusal/+truncated/+blocked/+empty
--     model_used markers; gemini-proxy emits these since the 2026-07-26 C3
--     parity fix, claude/openai since their inception)
--   - semantic-classifier-dark health rows (model_used='lexicon-only',
--     PR #1130 R5) — lexicon-only crisis coverage on live non-Vertex builds
--   - NULL-purpose rows (should track record-save crisis scans only)
--   - latency / token aggregates per bucket
--
-- File-only: NOT applied to prod by this PR (same contract as 0096). Apply
-- with the owner's usual migration pass.
--
-- Access: dashboard/service_role only. REVOKE must name anon AND authenticated
-- explicitly — Supabase default privileges grant to those roles directly, so
-- REVOKE FROM public alone is insufficient.

create or replace view public.ai_audit_daily_health as
select
  date_trunc('day', created_at) as day,
  coalesce(purpose, '(null)') as purpose,
  coalesce(reasoning_vendor, '(null)') as vendor,
  count(*) as calls,
  count(*) filter (where safety_zone = 'red') as red_rows,
  count(*) filter (
    where model_used like '%+refusal'
       or model_used like '%+truncated'
       or model_used like '%+blocked'
       or model_used like '%+empty'
  ) as degraded_upstream,
  count(*) filter (where model_used = 'lexicon-only') as semantic_dark_rows,
  count(*) filter (where purpose is null) as null_purpose_rows,
  avg(latency_ms)::int as avg_latency_ms,
  sum(total_tokens) as total_tokens
from public.ai_audit_log
group by 1, 2, 3;

comment on view public.ai_audit_daily_health is
  'Operator-only daily rollup of ai_audit_log (C3 ledger). No client access.';

revoke all on public.ai_audit_daily_health from public;
revoke all on public.ai_audit_daily_health from anon;
revoke all on public.ai_audit_daily_health from authenticated;
