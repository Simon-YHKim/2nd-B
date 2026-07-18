-- 0092_reasoning_runs.sql
-- Reasoning-run job infrastructure (리즈닝 실행 UX 개편, spec 2026-07-18 —
-- docs/reasoning-ux-spec_260718.html 인계 계약 1~7).
--
-- #1061 shipped the /reasoning surface CLIENT-only: the run spends the weekly
-- allowance via a bare bump AFTER the LLM work, proposals live in AsyncStorage,
-- and the auto/manual split is a client precheck that also counts monthly
-- rewarded credits. That leaves four contract holes this migration closes
-- server-side:
--   1. reserve -> finalize -> refund lifecycle: a run RESERVES its spend up
--      front (atomic, idempotent) and a failure/cancel/stale-recovery REFUNDS
--      it — a crash can no longer eat a run without a reviewable result, and a
--      completed result can no longer exist without its spend.
--   2. idempotency: (user_id, idempotency_key) is unique; re-sending the same
--      command (re-tap, retry, app restart, second device) returns the
--      existing run instead of spending again.
--   3. auto/manual split (Simon 확정 2026-07-18): AUTO runs spend the WEEKLY
--      BASE only — never monthly rewarded credits — and must always leave one
--      base run for a manual deep run (auto guard: used < cap - 1, which also
--      yields the confirmed auto ceilings free 1/wk · plus 6/wk). MANUAL runs
--      spend base first, then one monthly credit (0089 order).
--   4. proposals are persisted server-side per run (payload jsonb, slim — no
--      raw bodies) with per-proposal exactly-once ratify/dismiss/apply states,
--      so review survives device switch and partial-apply retries only touch
--      the unapplied remainder.
--
-- Buckets are stamped ON the run row at reserve time, so a refund lands on the
-- ORIGINAL week/month row even when the run crosses a KST week/month boundary.
-- Tier caps are server-derived from effective_subscription_tier (0088) and the
-- CASE arms MUST match src/lib/entitlements/tier-map.ts REASONING_PER_WEEK
-- (free 2 / soma 7 / cortex 7 / brain unlimited) — pinned by the structural
-- test src/lib/reasoning/__tests__/reasoning-runs-migration.test.ts.
--
-- Concurrency: one ACTIVE (reserved/running) run per user, all tiers (spec
-- decision 7 — Pro caps concurrency at 1 even without a spend). Reserves are
-- serialized per user with a transaction-scoped advisory lock so two devices
-- cannot double-reserve past the check.

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reasoning_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  trigger_kind    text NOT NULL CHECK (trigger_kind IN ('manual', 'auto')),
  status          text NOT NULL DEFAULT 'reserved'
                  CHECK (status IN ('reserved', 'running', 'proposed', 'ratified', 'cancelled', 'failed', 'recovered')),
  spend           text NOT NULL CHECK (spend IN ('base', 'credit', 'none')),
  week_bucket     text NOT NULL,
  month_bucket    text NOT NULL,
  item_count      int  NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  error_code      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reasoning_runs_key_uniq UNIQUE (user_id, idempotency_key),
  CONSTRAINT reasoning_runs_key_len CHECK (char_length(idempotency_key) BETWEEN 8 AND 120)
);

CREATE INDEX IF NOT EXISTS reasoning_runs_active_idx
  ON public.reasoning_runs (user_id, updated_at)
  WHERE status IN ('reserved', 'running');

CREATE INDEX IF NOT EXISTS reasoning_runs_proposed_idx
  ON public.reasoning_runs (user_id, created_at DESC)
  WHERE status = 'proposed';

CREATE TABLE IF NOT EXISTS public.reasoning_run_proposals (
  run_id     uuid NOT NULL REFERENCES public.reasoning_runs (id) ON DELETE CASCADE,
  ordinal    int  NOT NULL CHECK (ordinal >= 0),
  kind       text NOT NULL DEFAULT 'domain_link',
  payload    jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'proposed'
             CHECK (status IN ('proposed', 'ratified', 'dismissed', 'applied')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, ordinal)
);

-- RLS: owners read; ALL writes go through the SECURITY DEFINER RPCs below
-- (0078 pattern — no INSERT/UPDATE policies, plus explicit REVOKEs).
ALTER TABLE public.reasoning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reasoning_run_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reasoning_runs_owner_select ON public.reasoning_runs;
CREATE POLICY reasoning_runs_owner_select ON public.reasoning_runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS reasoning_run_proposals_owner_select ON public.reasoning_run_proposals;
CREATE POLICY reasoning_run_proposals_owner_select ON public.reasoning_run_proposals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reasoning_runs r
    WHERE r.id = run_id AND r.user_id = auth.uid()
  ));

REVOKE INSERT, UPDATE, DELETE ON public.reasoning_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reasoning_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reasoning_run_proposals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.reasoning_run_proposals FROM anon;

DROP TRIGGER IF EXISTS trg_reasoning_runs_updated_at ON public.reasoning_runs;
CREATE TRIGGER trg_reasoning_runs_updated_at
  BEFORE UPDATE ON public.reasoning_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_reasoning_run_proposals_updated_at ON public.reasoning_run_proposals;
CREATE TRIGGER trg_reasoning_run_proposals_updated_at
  BEFORE UPDATE ON public.reasoning_run_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Internal refund helper (no grants — callable only from the RPCs) ──────

CREATE OR REPLACE FUNCTION public.refund_reasoning_spend(
  p_user_id uuid,
  p_spend   text,
  p_week    text,
  p_month   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_spend = 'none' THEN
    RETURN;
  END IF;
  -- Both spend kinds bumped the week row (0089), so both decrement it.
  UPDATE public.usage_counters
     SET reasoning_used = GREATEST(reasoning_used - 1, 0),
         updated_at = now()
   WHERE user_id = p_user_id AND month_bucket = p_week;
  IF p_spend = 'credit' THEN
    UPDATE public.usage_counters
       SET reward_consumed = GREATEST(reward_consumed - 1, 0),
           updated_at = now()
     WHERE user_id = p_user_id AND month_bucket = p_month;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_reasoning_spend(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_reasoning_spend(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_reasoning_spend(uuid, text, text, text) FROM authenticated;

-- ── reserve_reasoning_run ─────────────────────────────────────────────────
-- Atomically reserves one run: concurrency guard, idempotency, tier-derived
-- weekly cap, auto/manual spend rules, and the usage_counters bump — all in
-- one transaction. Returns jsonb { run_id, status, spend, existing }.

CREATE OR REPLACE FUNCTION public.reserve_reasoning_run(
  p_user_id    uuid,
  p_key        text,
  p_trigger    text,
  p_item_count int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.reasoning_runs%ROWTYPE;
  v_kst   timestamp;
  v_week  text;
  v_mon   text;
  v_tier  text;
  v_cap   int;
  v_spend text;
  v_rows  int;
  v_id    uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_trigger NOT IN ('manual', 'auto') THEN
    RAISE EXCEPTION 'invalid trigger: %', p_trigger USING ERRCODE = '22023';
  END IF;
  IF p_key IS NULL OR char_length(p_key) < 8 OR char_length(p_key) > 120 THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE = '22023';
  END IF;
  IF p_item_count IS NULL
     OR (p_trigger = 'auto' AND p_item_count != 1)
     OR (p_trigger = 'manual' AND (p_item_count < 1 OR p_item_count > 5)) THEN
    RAISE EXCEPTION 'invalid item count' USING ERRCODE = '22023';
  END IF;

  -- Serialize reserves per user so two devices cannot double-reserve.
  PERFORM pg_advisory_xact_lock(hashtext('reasoning_run:' || p_user_id::text));

  -- Idempotency: the same command returns its existing run, spending nothing.
  SELECT * INTO v_existing FROM public.reasoning_runs
   WHERE user_id = p_user_id AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'run_id', v_existing.id, 'status', v_existing.status,
      'spend', v_existing.spend, 'existing', true);
  END IF;

  -- One active run per user, every tier (spec decision 7).
  IF EXISTS (SELECT 1 FROM public.reasoning_runs
              WHERE user_id = p_user_id AND status IN ('reserved', 'running')) THEN
    RAISE EXCEPTION 'reasoning_run_active' USING ERRCODE = 'P0001';
  END IF;

  -- Server-derived KST buckets (stamped on the run for boundary-safe refunds).
  v_kst := now() AT TIME ZONE 'Asia/Seoul';
  v_week := to_char(v_kst, 'IYYY-"W"IW');
  v_mon  := to_char(v_kst, 'YYYY-MM');

  -- Effective tier (judge comp + expiry, 0088). Caps MUST match tier-map.ts.
  v_tier := public.effective_subscription_tier(p_user_id);
  v_cap := CASE COALESCE(v_tier, 'free')
    WHEN 'brain'  THEN NULL   -- unlimited
    WHEN 'cortex' THEN 7
    WHEN 'soma'   THEN 7
    ELSE 2                    -- free (주 2회)
  END;

  IF v_cap IS NULL THEN
    v_spend := 'none';
  ELSIF p_trigger = 'auto' THEN
    -- AUTO: weekly base only, always leaving one base run for manual
    -- (used < cap - 1 ⇒ auto ceiling = cap - 1 = free 1 / plus 6 per week).
    -- Rewarded credits are NEVER consumed by an auto run. Single guarded
    -- upsert so a concurrent 0089 bump cannot race the fresh-week insert.
    IF v_cap - 1 < 1 THEN
      RAISE EXCEPTION 'reasoning_auto_unavailable' USING ERRCODE = 'P0001';
    END IF;
    v_rows := NULL;
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, v_week, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1,
          updated_at = now()
      WHERE uc.reasoning_used < v_cap - 1
    RETURNING 1 INTO v_rows;
    IF v_rows IS NULL THEN
      RAISE EXCEPTION 'reasoning_auto_unavailable' USING ERRCODE = 'P0001';
    END IF;
    v_spend := 'base';
  ELSE
    -- MANUAL, step 1: weekly base (0089 order).
    INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
    VALUES (p_user_id, v_week, 1)
    ON CONFLICT (user_id, month_bucket) DO UPDATE
      SET reasoning_used = uc.reasoning_used + 1,
          updated_at = now()
      WHERE uc.reasoning_used < v_cap
    RETURNING 1 INTO v_rows;
    IF v_rows IS NOT NULL THEN
      v_spend := 'base';
    ELSE
      -- Step 2: consume ONE monthly rewarded credit (manual only).
      UPDATE public.usage_counters
         SET reward_consumed = reward_consumed + 1,
             updated_at = now()
       WHERE user_id = p_user_id AND month_bucket = v_mon
         AND reward_credits > reward_consumed;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows = 0 THEN
        RAISE EXCEPTION 'reasoning_limit_exceeded' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO public.usage_counters AS uc (user_id, month_bucket, reasoning_used)
      VALUES (p_user_id, v_week, 1)
      ON CONFLICT (user_id, month_bucket) DO UPDATE
        SET reasoning_used = uc.reasoning_used + 1,
            updated_at = now();
      v_spend := 'credit';
    END IF;
  END IF;

  INSERT INTO public.reasoning_runs
    (user_id, idempotency_key, trigger_kind, status, spend, week_bucket, month_bucket, item_count)
  VALUES
    (p_user_id, p_key, p_trigger, 'reserved', v_spend, v_week, v_mon, p_item_count)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('run_id', v_id, 'status', 'reserved', 'spend', v_spend, 'existing', false);
END;
$$;

-- ── start_reasoning_run ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_reasoning_run(p_user_id uuid, p_run_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_runs
     SET status = 'running'
   WHERE id = p_run_id AND user_id = p_user_id AND status IN ('reserved', 'running')
  RETURNING status INTO v_status;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'reasoning_run_invalid_state' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_status;
END;
$$;

-- ── complete_reasoning_run ────────────────────────────────────────────────
-- Persists the run's proposals and moves it to 'proposed' in one transaction
-- (the "결과 없는 확정 금지" side of the contract). Idempotent: completing an
-- already-proposed run returns without duplicating proposals.

CREATE OR REPLACE FUNCTION public.complete_reasoning_run(
  p_user_id   uuid,
  p_run_id    uuid,
  p_proposals jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_count  int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  IF p_proposals IS NULL OR jsonb_typeof(p_proposals) != 'array'
     OR jsonb_array_length(p_proposals) > 32 THEN
    RAISE EXCEPTION 'invalid proposals payload' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_status FROM public.reasoning_runs
   WHERE id = p_run_id AND user_id = p_user_id
   FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'reasoning_run_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'proposed' THEN
    SELECT count(*)::int INTO v_count FROM public.reasoning_run_proposals WHERE run_id = p_run_id;
    RETURN v_count;
  END IF;
  IF v_status NOT IN ('reserved', 'running') THEN
    RAISE EXCEPTION 'reasoning_run_invalid_state' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reasoning_run_proposals (run_id, ordinal, kind, payload)
  SELECT p_run_id,
         (t.ord - 1)::int,
         COALESCE(t.elem->>'kind', 'domain_link'),
         COALESCE(t.elem->'payload', t.elem)
    FROM jsonb_array_elements(p_proposals) WITH ORDINALITY AS t(elem, ord);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.reasoning_runs SET status = 'proposed' WHERE id = p_run_id;
  RETURN v_count;
END;
$$;

-- ── fail / cancel / recover — the refund side ─────────────────────────────
-- Exactly-once: the refund fires only on the state-transition row that
-- actually moved (guarded UPDATE), never on a repeat call.

CREATE OR REPLACE FUNCTION public.fail_reasoning_run(
  p_user_id uuid,
  p_run_id  uuid,
  p_code    text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.reasoning_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_runs
     SET status = 'failed', error_code = left(COALESCE(p_code, 'error'), 64)
   WHERE id = p_run_id AND user_id = p_user_id AND status IN ('reserved', 'running')
  RETURNING * INTO v_run;
  IF v_run.id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM public.refund_reasoning_spend(p_user_id, v_run.spend, v_run.week_bucket, v_run.month_bucket);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_reasoning_run(p_user_id uuid, p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.reasoning_runs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_runs
     SET status = 'cancelled'
   WHERE id = p_run_id AND user_id = p_user_id AND status IN ('reserved', 'running')
  RETURNING * INTO v_run;
  IF v_run.id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM public.refund_reasoning_spend(p_user_id, v_run.spend, v_run.week_bucket, v_run.month_bucket);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_reasoning_runs(
  p_user_id       uuid,
  p_stale_minutes int DEFAULT 30
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run   public.reasoning_runs%ROWTYPE;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  FOR v_run IN
    UPDATE public.reasoning_runs
       SET status = 'recovered', error_code = 'stale'
     WHERE user_id = p_user_id AND status IN ('reserved', 'running')
       AND updated_at < now() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 30), 5))
    RETURNING *
  LOOP
    PERFORM public.refund_reasoning_spend(p_user_id, v_run.spend, v_run.week_bucket, v_run.month_bucket);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── ratify / apply — per-proposal exactly-once ────────────────────────────

CREATE OR REPLACE FUNCTION public.ratify_reasoning_proposals(
  p_user_id  uuid,
  p_run_id   uuid,
  p_ratify   int[],
  p_dismiss  int[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status    text;
  v_ratified  int;
  v_dismissed int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.reasoning_runs
   WHERE id = p_run_id AND user_id = p_user_id
   FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'reasoning_run_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status NOT IN ('proposed', 'ratified') THEN
    RAISE EXCEPTION 'reasoning_run_invalid_state' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.reasoning_run_proposals
     SET status = 'ratified'
   WHERE run_id = p_run_id AND status = 'proposed'
     AND ordinal = ANY(COALESCE(p_ratify, ARRAY[]::int[]));
  GET DIAGNOSTICS v_ratified = ROW_COUNT;

  UPDATE public.reasoning_run_proposals
     SET status = 'dismissed'
   WHERE run_id = p_run_id AND status = 'proposed'
     AND ordinal = ANY(COALESCE(p_dismiss, ARRAY[]::int[]));
  GET DIAGNOSTICS v_dismissed = ROW_COUNT;

  IF NOT EXISTS (SELECT 1 FROM public.reasoning_run_proposals
                  WHERE run_id = p_run_id AND status = 'proposed') THEN
    UPDATE public.reasoning_runs SET status = 'ratified' WHERE id = p_run_id;
  END IF;

  RETURN jsonb_build_object('ratified', v_ratified, 'dismissed', v_dismissed);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_reasoning_proposal_applied(
  p_user_id uuid,
  p_run_id  uuid,
  p_ordinal int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'caller must match p_user_id' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reasoning_run_proposals p
     SET status = 'applied'
    FROM public.reasoning_runs r
   WHERE p.run_id = p_run_id AND p.ordinal = p_ordinal AND p.status = 'ratified'
     AND r.id = p.run_id AND r.user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ── Grants (explicit anon REVOKE per house rule) ──────────────────────────

REVOKE EXECUTE ON FUNCTION public.reserve_reasoning_run(uuid, text, text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_reasoning_run(uuid, text, text, int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reserve_reasoning_run(uuid, text, text, int) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_reasoning_run(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_reasoning_run(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.start_reasoning_run(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_reasoning_run(uuid, uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fail_reasoning_run(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fail_reasoning_run(uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fail_reasoning_run(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_reasoning_run(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_reasoning_run(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.cancel_reasoning_run(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.recover_stale_reasoning_runs(uuid, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recover_stale_reasoning_runs(uuid, int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.recover_stale_reasoning_runs(uuid, int) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ratify_reasoning_proposals(uuid, uuid, int[], int[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ratify_reasoning_proposals(uuid, uuid, int[], int[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.ratify_reasoning_proposals(uuid, uuid, int[], int[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_reasoning_proposal_applied(uuid, uuid, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_reasoning_proposal_applied(uuid, uuid, int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.mark_reasoning_proposal_applied(uuid, uuid, int) TO authenticated;
