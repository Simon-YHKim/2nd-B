-- 0093_reasoning_prefs.sql
-- Server-persisted reasoning preferences (스펙 docs/reasoning-ux-spec_260718.html
-- 화면 A — 설정 · 자동 리즈닝, PR-B).
--
-- The automatic-reasoning toggle lived CLIENT-only (localStorage / AsyncStorage
-- key reasoning.auto.v1.<uid>), so it silently diverged across devices and a
-- reinstall reset it. This follows the users.privacy_prefs pattern (0032): one
-- jsonb column, client resolves unknown/missing keys to their defaults, RLS
-- self-row policies already cover reads/writes (privacy_prefs precedent — the
-- app updates users directly).
--
-- Key contract (src/lib/reasoning/auto-pref.ts is the client SoT):
--   auto: boolean — automatic reasoning on new captures. Default false (spec A
--   기본·OFF; minors also default OFF and may explicitly enable — the actual
--   LLM run stays age-fail-closed regardless of this preference).
--
-- The client is fail-soft while this column is not yet applied to an
-- environment: reads fall back to the local mirror, writes keep the local
-- mirror and warn. Nothing user-facing breaks pre-apply.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reasoning_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.reasoning_prefs IS
  'Reasoning feature preferences (jsonb). Known keys: auto (boolean, default false — automatic reasoning on new captures). Client contract: src/lib/reasoning/auto-pref.ts; unknown keys are ignored client-side.';
