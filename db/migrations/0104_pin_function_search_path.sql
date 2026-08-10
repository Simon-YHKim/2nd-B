-- 0104_pin_function_search_path.sql
-- Pin search_path on the four trigger functions the Supabase linter flags as
-- role-mutable (function_search_path_mutable, 2026-08-07 advisor run).
--
-- Why empty: all four bodies touch only NEW.* fields and pg_catalog builtins
-- (now, to_char, lower, split_part). They reference no tables, so the
-- strictest setting is also the safe one — with search_path = '' nothing can
-- be shadowed by an attacker-created object in another schema, because
-- resolution never leaves pg_catalog.
--
-- award_xp / apply_billing_event already pin theirs; this closes the rest.
-- ALTER ... SET is metadata-only: no body change, no trigger re-creation.

alter function public.set_updated_at()           set search_path = '';
alter function public.set_revenue_month_bucket() set search_path = '';
alter function public.auto_judge_mode()          set search_path = '';
alter function public.enforce_judge_mode()       set search_path = '';
