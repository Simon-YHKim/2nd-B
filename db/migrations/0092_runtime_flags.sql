-- 0092_runtime_flags.sql
-- Deployment-free operational switches. These rows contain no secrets or user
-- data: anon/authenticated clients may read them, while only service/admin
-- paths may write them. Missing rows fail closed in every consumer.
--
-- The LLM switch is also enforced inside bump_gemini_spend(), the shared
-- server-authoritative budget gate used by Gemini, Claude, and OpenAI proxies.
-- A modified or stale edge client therefore cannot bypass the operator
-- shutdown. Direct Vertex developer configurations are outside this DB gate;
-- official preview/production profiles keep edge routing enabled.

CREATE TABLE IF NOT EXISTS public.runtime_flags (
  key        text PRIMARY KEY,
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runtime_flags_known_key CHECK (
    key IN (
      'llm_enabled',
      'analytics_enabled',
      'clarity_enabled'
    )
  )
);

INSERT INTO public.runtime_flags (key, enabled)
VALUES
  ('llm_enabled', true),
  ('analytics_enabled', false),
  ('clarity_enabled', false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.runtime_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS runtime_flags_public_read ON public.runtime_flags;
CREATE POLICY runtime_flags_public_read ON public.runtime_flags
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.runtime_flags FROM anon, authenticated;
GRANT SELECT ON TABLE public.runtime_flags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.runtime_flags TO service_role;

DROP TRIGGER IF EXISTS trg_runtime_flags_updated_at ON public.runtime_flags;
CREATE TRIGGER trg_runtime_flags_updated_at
  BEFORE UPDATE ON public.runtime_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.runtime_flags IS
  'Non-secret operational switches. Public read, admin/service write only.';

-- Preserve the atomic spend-cap behavior from 0035 while adding the shared
-- provider-independent shutdown before any upstream model call can spend.
CREATE OR REPLACE FUNCTION public.bump_gemini_spend(
  p_user_id uuid,
  p_day date,
  p_cap int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_calls int;
BEGIN
  IF COALESCE(
    (
      SELECT rf.enabled
      FROM public.runtime_flags AS rf
      WHERE key = 'llm_enabled'
    ),
    false
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'llm_runtime_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required' USING ERRCODE = '22004';
  END IF;
  IF p_cap <= 0 THEN
    RAISE EXCEPTION 'gemini_spend_exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.gemini_spend_daily AS gs (user_id, day, calls)
  VALUES (p_user_id, p_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE
    SET calls = gs.calls + 1
    WHERE gs.calls < p_cap
  RETURNING calls INTO v_calls;

  IF v_calls IS NULL THEN
    RAISE EXCEPTION 'gemini_spend_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_calls;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_gemini_spend(uuid, date, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_gemini_spend(uuid, date, int)
  TO service_role;
