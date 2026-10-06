-- 0220_interview_verdict_ledger.sql
-- 인터뷰 판정 · 종료 사유 · 장면 경계를 서버에 남기고, '담기' 의 칸 계산을 서버로 옮긴다.
--
-- 결정: Q-261005-09 = A (DECISIONS 26.10.05 19:53), 설계 docs/design/interview-measurement-261006.md
-- 의 추천 B(판정 원장 + 저장 RPC) 채택 (DECISIONS 26.10.06 22:33, Simon '권장 사항으로 진행하자').
-- 이 파일은 그 설계 7절의 1 · 2단계다. 3단계(4절 P1~P7 규칙 변경)는 다음 PR 이다 -- "기록 먼저,
-- 규칙은 따로". 운영 적용은 묶음 GO 뒤다(마이그레이션 PR 은 GO 전에 머지하지 않는다).
--
-- ── 왜 ──────────────────────────────────────────────────────────────────────
-- 지금은 인터뷰가 한 장면에서 몇 층까지 갔는지, 어디서 왜 멈췄는지, 모델이 몇 번 거부했는지가
-- 어디에도 남지 않는다. 밝기의 재료(interview_coverage, 0143)는 클라이언트가 읽고 더한
-- **절대값**으로 upsert 하고, 값 검사는 answers >= 0 하나다(R2F-12). 그래서 "충분히
-- 파고들었나" 를 잴 수도, 칸이 정직한지 확인할 수도 없었다.
--
-- ── 무엇을 만드나 ───────────────────────────────────────────────────────────
--   interview_sessions        세션(= 인터뷰 화면 한 번) 1행. 시기 · 언어 · 종료 사유 · 저장 시각.
--   interview_probe_verdicts  판정 호출 1회 = 1행. 숫자 · 열거값만, **원문 · 해시 없음**.
--                             openai-proxy 만 쓴다(record_interview_probe_verdict, service_role).
--   close_interview_session   화면이 대화를 끝낼 때 종료 사유를 적는다(authenticated, 자기 세션만).
--   commit_interview_session  '담기' 때 원장에서 칸을 계산해 interview_coverage 에 **더한다**
--                             (authenticated, 자기 세션만, 한 세션 한 번). 판정 호출이 있어야
--                             칸이 오르고(verdict = credited, local_gate = pass), 장면마다 층당 1.
--                             두 기기가 동시에 저장해도 원자적 증가라 증분을 잃지 않는다(LAST-04).
--   anonymize_interview_sessions  저장하지 않은 세션은 6시간 뒤 소유자 · 감사 연결을 지우고
--                             시각을 날짜로 접는다(Q3 a: 소유자 없이 집계용으로만). 매시 pg_cron.
--   interview_scene_metrics   장면 단위 집계 뷰(service_role 만). 설계 2절 M1 · M2 · M3 · M5 · M6.
--   interview_coverage 트리거 칸이 줄거나 다른 칸으로 옮겨지는 UPDATE 를 막는다(R2F-12 보강 3).
--
-- ── 무엇을 하지 않나 ────────────────────────────────────────────────────────
--   * authenticated 의 interview_coverage INSERT · UPDATE 회수는 **여기 없다.** 새 화면(RPC 로
--     저장하는 판)이 웹 · QA APK 에 다 나간 뒤 **다음 번호**로 한다(설계 6절). 여기서 회수하면
--     적용 순간 옛 화면의 '담기' 가 403 으로 실패 모달에 걸린다.
--   * 밝기 정의(결정 7 "밝기 = 판 만큼")는 바꾸지 않는다. 원장은 지표를 위한 것이다.
--   * 등록부(erasure_registry) 행은 이 파일이 아니라 등록부 전용 파일이 더한다 -- 0189 롤백이
--     그 파일만 다시 적용할 수 있게(0195 · 0198 과 같은 분리, scripts/erasure-registry-forward.ts G7).
--
-- ── 설계와 다르게 한 곳 (PR 본문에도 적는다) ────────────────────────────────
--   * verdicts.id 를 감사 행 id 로 두지 않고 audit_id 열(UNIQUE, NULL 가능)을 따로 둔다. 저장하지
--     않은 세션을 소유자 없이 남기려면(Q3 a) 감사 행(user_id 를 가진다)과의 연결도 끊어야 한다.
--   * 정리 주기: 설계는 "하루 1회" 였고 여기서는 매시 · 6시간 기준이다. 저장 안 한 대화가 사용자에
--     묶여 있는 시간을 하루에서 몇 시간으로 줄인다. '담기' 화면을 6시간 넘게 열어 두면 서버 원장은
--     소유자 없이 남고, 칸은 2단계 폴백(클라이언트 경로)이 더한다.
--   * 콘텐츠 삭제('데이터만 삭제'): 설계는 "지움(추론)" 이었으나 이 표들에는 클라이언트 권한 ·
--     정책이 없어(설계 3.3) 등록부 G3 가 client_erasable 을 허락하지 않는다. 같은 재료로 만든
--     interview_coverage(0143)와 같은 account_delete_only 로 둔다. 바꾸려면 Simon 결정이 필요하다.
--
-- 최상위 BEGIN/COMMIT 없음(Supabase CLI 가 감싼다). 다시 적용해도 같은 상태가 되게 썼다
-- (IF NOT EXISTS · OR REPLACE · 트리거와 예약은 지우고 다시 건다).

SET LOCAL lock_timeout = '5s';

----------------------------------------------------------------------
-- 1. 표
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.interview_sessions (
  -- 클라이언트가 세션 시작 때 만든 무작위 uuid(v4).
  id            uuid        PRIMARY KEY,
  -- 진행 중 · 저장한 세션은 사용자 id. 저장하지 않은 세션은 정리 함수가 NULL 로 비운다(Q3 a).
  -- 계정 삭제 때는 소유자가 남아 있는 행이 연쇄로 지워진다(0143 과 같은 auth.users 연쇄).
  owner_id      uuid        NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 시기 키. 값 목록은 0143 과 같은 이유로 CHECK 에 박지 않고 서버 함수가 허용목록으로 검사한다.
  period        text        NOT NULL,
  locale        text        NOT NULL
    CONSTRAINT interview_sessions_locale_check CHECK (locale IN ('ko', 'en')),
  started_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_seen_at  timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ended_at      timestamptz NULL,
  end_reason    text        NULL
    CONSTRAINT interview_sessions_end_reason_check CHECK (end_reason IN (
      'complete', 'user_end', 'user_stop', 'skip_exhausted', 'scaffold_exhausted',
      'verdict_exhausted', 'no_question', 'day_limit', 'crisis', 'error', 'left')),
  -- 서버가 볼 수 없는 턴의 셈(로컬 막힘 · 고정 발판). 클라이언트가 보고한 값이다.
  local_blocks  integer     NULL
    CONSTRAINT interview_sessions_local_blocks_check CHECK (local_blocks BETWEEN 0 AND 10000),
  scaffolds     integer     NULL
    CONSTRAINT interview_sessions_scaffolds_check CHECK (scaffolds BETWEEN 0 AND 10000),
  committed_at  timestamptz NULL,
  anonymized_at timestamptz NULL,
  CONSTRAINT interview_sessions_end_pair CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
  CONSTRAINT interview_sessions_anonymized_shape CHECK (
    anonymized_at IS NULL OR (owner_id IS NULL AND committed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS public.interview_probe_verdicts (
  id                uuid        PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  session_id        uuid        NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  -- 그 호출의 ai_audit_log.id. 저장하지 않은 세션은 정리 때 NULL 이 된다(감사 행이 user_id 를 가진다).
  audit_id          uuid        NULL
    CONSTRAINT interview_probe_verdicts_audit_id_key UNIQUE,
  scene_seq         integer     NOT NULL
    CONSTRAINT interview_probe_verdicts_scene_seq_check CHECK (scene_seq BETWEEN 1 AND 10000),
  turn_seq          integer     NOT NULL
    CONSTRAINT interview_probe_verdicts_turn_seq_check CHECK (turn_seq BETWEEN 1 AND 10000),
  -- 이 답이 겨냥한 층(클라이언트). 되묻기에 대한 답처럼 겨냥한 층이 없으면 NULL.
  asked_layer       text        NULL
    CONSTRAINT interview_probe_verdicts_asked_layer_check
      CHECK (asked_layer IN ('fact', 'feeling', 'meaning', 'belief', 'echo')),
  -- 이 답이 어떤 질문에 대한 답인가(클라이언트).
  probe_kind        text        NOT NULL
    CONSTRAINT interview_probe_verdicts_probe_kind_check
      CHECK (probe_kind IN ('seed', 'drill', 'scaffold', 'confirm')),
  -- 프록시가 같은 함수(src/lib/interview/answer-gate.ts)로 다시 계산한 로컬 문턱.
  -- mismatch = 클라이언트 값과 다름, unverified = 보낸 답이 실제 프롬프트의 마지막 답인지 확인 못 함.
  local_gate        text        NOT NULL
    CONSTRAINT interview_probe_verdicts_local_gate_check
      CHECK (local_gate IN ('pass', 'short', 'non_answer', 'mismatch', 'unverified')),
  -- 모델 출력의 answeredLayer(프록시가 출력에서 읽음). none · 판정 없음은 NULL(verdict 로 가른다).
  model_layer       text        NULL
    CONSTRAINT interview_probe_verdicts_model_layer_check
      CHECK (model_layer IN ('fact', 'feeling', 'meaning', 'belief', 'echo')),
  verdict           text        NOT NULL
    CONSTRAINT interview_probe_verdicts_verdict_check
      CHECK (verdict IN ('credited', 'none', 'other_layer', 'no_verdict', 'unasked', 'error')),
  -- 직전 질문의 말문 후보를 고치지 않고 보냈는가(설계 M6, 기록만).
  opener_unedited   boolean     NOT NULL,
  -- 정규화한 답 길이의 구간(0: 0-4 · 1: 5-7 · 2: 8-13 · 3: 14+). 확인 못 한 답은 NULL.
  answer_len_bucket integer     NULL
    CONSTRAINT interview_probe_verdicts_len_bucket_check CHECK (answer_len_bucket BETWEEN 0 AND 3),
  created_at        timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT interview_probe_verdicts_credited_shape CHECK (
    verdict <> 'credited' OR (asked_layer IS NOT NULL AND model_layer = asked_layer))
);

CREATE INDEX IF NOT EXISTS interview_probe_verdicts_session_idx
  ON public.interview_probe_verdicts (session_id, scene_seq);
CREATE INDEX IF NOT EXISTS interview_sessions_owner_idx
  ON public.interview_sessions (owner_id, started_at)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS interview_sessions_pending_idx
  ON public.interview_sessions (last_seen_at)
  WHERE committed_at IS NULL AND owner_id IS NOT NULL;

COMMENT ON TABLE public.interview_sessions IS
  '0220 인터뷰 세션(화면 한 번). 종료 사유 · 저장 시각. 원문 없음. 저장 안 한 세션은 6시간 뒤 소유자 없이 집계용으로만 남는다.';
COMMENT ON TABLE public.interview_probe_verdicts IS
  '0220 인터뷰 판정 원장. 판정 호출 1회 = 1행, 숫자 · 열거값만(원문 · 해시 없음). openai-proxy 만 쓴다.';

-- 클라이언트 역할 권한 0. Supabase 기본 권한이 새 표에 authenticated · anon 으로 ALL 을 주므로
-- 명시적으로 회수한다(0143 이 적은 함정). service_role 은 집계 뷰를 읽을 SELECT 만 받는다(끝의 GRANT).
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_probe_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_probe_verdicts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.interview_sessions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.interview_probe_verdicts FROM PUBLIC, anon, authenticated, service_role;

----------------------------------------------------------------------
-- 2. 원장 쓰기 (openai-proxy 전용)
----------------------------------------------------------------------
-- 프록시는 판정 호출의 감사 행을 쓴 뒤 이 함수를 부른다. 행은 프록시가 **직접 본 것**으로 만든다:
-- verdict 와 model_layer 는 모델 출력에서, local_gate 는 실제 프롬프트의 마지막 답에서 다시
-- 계산한 값이다. 실패해도 프록시는 응답을 막지 않는다(감사 행 쓰기와 같은 규율).
--
-- 세션 행이 없으면 만든다(소유자 = JWT 사용자). 남의 세션 · 저장이 끝난 세션 · 시기나 언어가 다른
-- 세션 · 장면 번호가 거꾸로 간 호출은 적지 않고 사유를 돌려준다.
CREATE OR REPLACE FUNCTION public.record_interview_probe_verdict(
  p_user_id uuid,
  p_audit_id uuid,
  p_session_id uuid,
  p_period text,
  p_locale text,
  p_scene_seq integer,
  p_turn_seq integer,
  p_asked_layer text,
  p_probe_kind text,
  p_local_gate text,
  p_model_layer text,
  p_verdict text,
  p_opener_unedited boolean,
  p_answer_len_bucket integer
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- 한 세션의 원장 상한. 하루 판정 몫(최대 250)이 먼저 끊으므로 정상 대화는 닿지 않는다.
  c_max_rows constant integer := 2000;
  v_session public.interview_sessions%ROWTYPE;
  v_max_scene integer;
  v_rows integer;
  v_inserted integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_session_id IS NULL
     OR p_period IS NULL OR p_period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR p_locale IS NULL OR p_locale NOT IN ('ko', 'en')
     OR p_scene_seq IS NULL OR p_scene_seq NOT BETWEEN 1 AND 10000
     OR p_turn_seq IS NULL OR p_turn_seq NOT BETWEEN 1 AND 10000
     OR (p_asked_layer IS NOT NULL AND p_asked_layer NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
     OR p_probe_kind IS NULL OR p_probe_kind NOT IN ('seed', 'drill', 'scaffold', 'confirm')
     OR p_local_gate IS NULL OR p_local_gate NOT IN ('pass', 'short', 'non_answer', 'mismatch', 'unverified')
     OR (p_model_layer IS NOT NULL AND p_model_layer NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
     OR p_verdict IS NULL OR p_verdict NOT IN ('credited', 'none', 'other_layer', 'no_verdict', 'unasked', 'error')
     OR p_opener_unedited IS NULL
     OR (p_answer_len_bucket IS NOT NULL AND p_answer_len_bucket NOT BETWEEN 0 AND 3) THEN
    RAISE EXCEPTION 'interview_verdict_invalid' USING ERRCODE = '22023';
  END IF;
  -- 계정이 이미 지워졌으면 아무것도 만들지 않는다(연쇄가 지운 뒤 늦게 온 호출).
  IF NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_user_id) THEN
    RETURN 'no_account';
  END IF;

  INSERT INTO public.interview_sessions AS s (id, owner_id, period, locale)
  VALUES (p_session_id, p_user_id, p_period, p_locale)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF v_session.owner_id IS DISTINCT FROM p_user_id THEN
    RETURN 'session_not_owned';
  END IF;
  IF v_session.committed_at IS NOT NULL THEN
    RETURN 'session_committed';
  END IF;
  IF v_session.period <> p_period OR v_session.locale <> p_locale THEN
    RETURN 'session_mismatch';
  END IF;

  SELECT pg_catalog.max(v.scene_seq), pg_catalog.count(*)::integer
    INTO v_max_scene, v_rows
    FROM public.interview_probe_verdicts AS v
   WHERE v.session_id = p_session_id;
  IF v_max_scene IS NOT NULL AND p_scene_seq < v_max_scene THEN
    RETURN 'scene_regressed';
  END IF;
  IF v_rows >= c_max_rows THEN
    RETURN 'session_full';
  END IF;

  INSERT INTO public.interview_probe_verdicts AS v (
    session_id, audit_id, scene_seq, turn_seq, asked_layer, probe_kind, local_gate,
    model_layer, verdict, opener_unedited, answer_len_bucket
  ) VALUES (
    p_session_id, p_audit_id, p_scene_seq, p_turn_seq, p_asked_layer, p_probe_kind, p_local_gate,
    p_model_layer, p_verdict, p_opener_unedited, p_answer_len_bucket
  )
  ON CONFLICT (audit_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    -- 같은 감사 행으로 두 번 온 호출(재시도). 첫 행만 남긴다.
    RETURN 'duplicate';
  END IF;

  UPDATE public.interview_sessions AS s
     SET last_seen_at = pg_catalog.now()
   WHERE s.id = p_session_id;
  RETURN 'recorded';
END;
$$;

COMMENT ON FUNCTION public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, text, boolean, integer) IS
  '0220: openai-proxy(service_role)만. 판정 호출 1회 = 원장 1행(원문 없음). 세션 행이 없으면 JWT 사용자 소유로 만든다.';

----------------------------------------------------------------------
-- 3. 세션 닫기 (화면, authenticated)
----------------------------------------------------------------------
-- 종료 사유는 클라이언트가 보고한 값이다(설계 3.1: 속일 수 있다). 판정 호출이 한 번도 없던
-- 대화는 세션 행이 없으므로 여기서 만든다. 한 시간에 새 세션 30개를 넘게 만들지는 못한다
-- (빈 세션 행을 쌓는 길을 좁힌다). 처음 적힌 사유가 이긴다.
CREATE OR REPLACE FUNCTION public.close_interview_session(
  p_session_id uuid,
  p_period text,
  p_locale text,
  p_end_reason text,
  p_local_blocks integer,
  p_scaffolds integer
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_new_sessions_per_hour constant integer := 30;
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL
     OR p_period IS NULL OR p_period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR p_locale IS NULL OR p_locale NOT IN ('ko', 'en')
     OR p_end_reason IS NULL OR p_end_reason NOT IN (
       'complete', 'user_end', 'user_stop', 'skip_exhausted', 'scaffold_exhausted',
       'verdict_exhausted', 'no_question', 'day_limit', 'crisis', 'error', 'left')
     OR p_local_blocks IS NULL OR p_local_blocks NOT BETWEEN 0 AND 10000
     OR p_scaffolds IS NULL OR p_scaffolds NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'interview_session_close_invalid' USING ERRCODE = '22023';
  END IF;

  -- 같은 사용자의 새 세션 만들기를 줄 세운다(셈과 삽입 사이의 경합).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interview_session_close:' || v_uid::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public.interview_sessions AS s WHERE s.id = p_session_id) THEN
    IF (SELECT pg_catalog.count(*) FROM public.interview_sessions AS s
         WHERE s.owner_id = v_uid
           AND s.started_at > pg_catalog.now() - INTERVAL '1 hour') >= c_new_sessions_per_hour THEN
      RETURN 'rate_limited';
    END IF;
    INSERT INTO public.interview_sessions AS s (id, owner_id, period, locale)
    VALUES (p_session_id, v_uid, p_period, p_locale)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  -- 남의 세션 · 소유자가 이미 지워진 세션은 없는 것과 같게 답한다.
  IF NOT FOUND OR v_session.owner_id IS DISTINCT FROM v_uid THEN
    RETURN 'not_found';
  END IF;
  IF v_session.ended_at IS NOT NULL THEN
    RETURN 'already_closed';
  END IF;

  UPDATE public.interview_sessions AS s
     SET ended_at = pg_catalog.now(),
         end_reason = p_end_reason,
         local_blocks = p_local_blocks,
         scaffolds = p_scaffolds,
         last_seen_at = pg_catalog.now()
   WHERE s.id = p_session_id;
  RETURN 'closed';
END;
$$;

COMMENT ON FUNCTION public.close_interview_session(uuid, text, text, text, integer, integer) IS
  '0220: 인터뷰 화면이 대화를 끝낼 때 종료 사유를 적는다. 자기 세션만, 처음 사유가 이긴다.';

----------------------------------------------------------------------
-- 4. 담기 (화면, authenticated) -- 칸은 원장에서 계산한다
----------------------------------------------------------------------
-- 판정 호출이 실제로 있었고, 모델이 겨냥한 층이라고 했고(verdict = credited), 프록시가 다시 계산한
-- 로컬 문턱을 통과한(local_gate = pass) 행만 센다. 장면마다 층당 최대 1(설계 3.3). 대화를 닫은
-- 뒤에 도착한 판정(화면이 버린 늦은 응답)은 세지 않는다. 한 세션은 한 번만 더한다(committed_at).
--
-- 돌려주는 값: {status: committed | already_committed | not_found, ledger_rows, cells_added}.
-- ledger_rows = 0 이면 원장이 비어 있던 대화다(옛 프록시 · 모의 모드 · 다른 벤더). 화면은 그때만
-- 예전 클라이언트 경로로 칸을 더한다(2단계 폴백, src/lib/interview/session-ledger.ts).
CREATE OR REPLACE FUNCTION public.commit_interview_session(
  p_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_rows integer;
  v_cells integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'interview_session_commit_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
     AND s.owner_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  IF v_session.committed_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'already_committed');
  END IF;
  IF v_session.period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now') THEN
    RAISE EXCEPTION 'interview_session_period_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_rows
    FROM public.interview_probe_verdicts AS v
   WHERE v.session_id = p_session_id;

  WITH credited AS (
    SELECT v.asked_layer AS layer, pg_catalog.count(DISTINCT v.scene_seq)::integer AS scenes
      FROM public.interview_probe_verdicts AS v
     WHERE v.session_id = p_session_id
       AND v.verdict = 'credited'
       AND v.local_gate = 'pass'
       AND v.asked_layer IS NOT NULL
       AND (v_session.ended_at IS NULL OR v.created_at <= v_session.ended_at)
     GROUP BY v.asked_layer
  ), added AS (
    INSERT INTO public.interview_coverage AS c (user_id, period, layer, answers, updated_at)
    SELECT v_uid, v_session.period, credited.layer, credited.scenes, pg_catalog.now()
      FROM credited
    ON CONFLICT (user_id, period, layer) DO UPDATE
      SET answers = c.answers + EXCLUDED.answers,
          updated_at = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT COALESCE((SELECT pg_catalog.sum(credited.scenes) FROM credited), 0)::integer
    INTO v_cells
    FROM (SELECT pg_catalog.count(*) FROM added) AS done;

  UPDATE public.interview_sessions AS s
     SET committed_at = pg_catalog.now(),
         last_seen_at = pg_catalog.now()
   WHERE s.id = p_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'committed',
    'ledger_rows', v_rows,
    'cells_added', v_cells);
END;
$$;

COMMENT ON FUNCTION public.commit_interview_session(uuid) IS
  '0220: 담기. 판정 원장에서 칸을 계산해 interview_coverage 에 원자적으로 더한다(장면마다 층당 1, 세션 한 번).';

----------------------------------------------------------------------
-- 5. 저장 안 한 세션 정리 (pg_cron · service_role) -- Q3 a
----------------------------------------------------------------------
-- 마지막 활동에서 6시간이 지나도 저장하지 않은 세션은 소유자를 지우고, 판정 행의 감사 연결을
-- 끊고, 시각을 날짜로 접는다. 숫자 · 열거값만 남아 종료 사유 · 깊이 분포를 집계하는 데만 쓴다.
-- ⚠ 사용자가 아주 적은 동안은 날짜와 시기만으로도 누구의 대화인지 짐작할 수 있다(추론). 법무
--   확인이 필요하면 PR 본문의 '법무 확인 권장' 을 따른다.
CREATE OR REPLACE FUNCTION public.anonymize_interview_sessions(
  p_batch integer DEFAULT 5000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_idle constant interval := INTERVAL '6 hours';
  v_role text := public.billing_request_role();
  v_batch integer := LEAST(GREATEST(COALESCE(p_batch, 5000), 1), 50000);
  v_ids uuid[];
BEGIN
  -- pg_cron(JWT 없음) 과 service_role 만. authenticated · anon 은 EXECUTE 도 없다.
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.array_agg(picked.id) INTO v_ids
    FROM (
      SELECT s.id
        FROM public.interview_sessions AS s
       WHERE s.committed_at IS NULL
         AND s.owner_id IS NOT NULL
         AND s.last_seen_at < pg_catalog.now() - c_idle
       ORDER BY s.last_seen_at
       LIMIT v_batch
       FOR UPDATE SKIP LOCKED
    ) AS picked;
  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.interview_probe_verdicts AS v
     SET audit_id = NULL,
         created_at = pg_catalog.date_trunc('day', v.created_at)
   WHERE v.session_id = ANY (v_ids);

  UPDATE public.interview_sessions AS s
     SET owner_id = NULL,
         anonymized_at = pg_catalog.date_trunc('day', pg_catalog.now()),
         started_at = pg_catalog.date_trunc('day', s.started_at),
         last_seen_at = pg_catalog.date_trunc('day', s.last_seen_at),
         ended_at = pg_catalog.date_trunc('day', s.ended_at)
   WHERE s.id = ANY (v_ids);

  RETURN pg_catalog.cardinality(v_ids);
END;
$$;

COMMENT ON FUNCTION public.anonymize_interview_sessions(integer) IS
  '0220: 저장하지 않은 인터뷰 세션을 6시간 뒤 소유자 없이 남긴다(Q3 a). 매시 pg_cron anonymize-interview-sessions.';

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = $1'
      USING 'anonymize-interview-sessions'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      INTO v_job_id
      USING
        'anonymize-interview-sessions',
        '23 * * * *',   -- 매시 23분(GMT 기준이어도 매시라 같다)
        'SELECT public.anonymize_interview_sessions();';
  ELSE
    RAISE NOTICE '0220: pg_cron unavailable; anonymize_interview_sessions() is not scheduled';
  END IF;
END
$schedule$;

----------------------------------------------------------------------
-- 6. 집계 뷰 (service_role)
----------------------------------------------------------------------
-- 장면 한 줄. 깊이는 인정된(credited · pass) 가장 깊은 층(사실 1 … 울림 5), 없으면 0.
-- security_invoker: 뷰를 읽는 쪽의 권한으로 읽는다(service_role 만 SELECT 를 가진다).
CREATE OR REPLACE VIEW public.interview_scene_metrics
WITH (security_invoker = true) AS
SELECT
  s.id AS session_id,
  s.owner_id,
  s.period,
  s.locale,
  s.end_reason,
  (s.committed_at IS NOT NULL) AS committed,
  (s.anonymized_at IS NOT NULL) AS anonymized,
  pg_catalog.date_trunc('day', s.started_at) AS started_day,
  v.scene_seq,
  pg_catalog.count(*)::integer AS judged_calls,
  COALESCE(pg_catalog.max(
    CASE WHEN v.verdict = 'credited' AND v.local_gate = 'pass' THEN
      CASE v.asked_layer
        WHEN 'fact' THEN 1 WHEN 'feeling' THEN 2 WHEN 'meaning' THEN 3
        WHEN 'belief' THEN 4 WHEN 'echo' THEN 5 END
    END), 0) AS depth,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'credited')::integer AS verdict_credited,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'none')::integer AS verdict_none,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'other_layer')::integer AS verdict_other_layer,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'no_verdict')::integer AS verdict_missing,
  pg_catalog.count(*) FILTER (WHERE v.local_gate = 'short')::integer AS gate_short,
  pg_catalog.count(*) FILTER (WHERE v.local_gate IN ('mismatch', 'unverified'))::integer AS gate_untrusted,
  pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold')::integer AS scaffold_answers,
  pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold' AND v.verdict = 'credited' AND v.local_gate = 'pass')::integer
    AS scaffold_recovered,
  pg_catalog.count(*) FILTER (WHERE v.opener_unedited)::integer AS opener_unedited,
  s.local_blocks,
  s.scaffolds
FROM public.interview_sessions AS s
JOIN public.interview_probe_verdicts AS v ON v.session_id = s.id
GROUP BY s.id, v.scene_seq;

COMMENT ON VIEW public.interview_scene_metrics IS
  '0220: 인터뷰 장면 단위 지표(설계 M1 깊이 · M2 종료 사유 · M3 거부율 · M5 발판 회복 · M6 말문 후보). service_role 만.';

----------------------------------------------------------------------
-- 7. interview_coverage: 칸은 줄지도, 다른 칸으로 옮겨지지도 않는다
----------------------------------------------------------------------
-- 0143 은 DELETE 정책을 두지 않아 골라 지우기를 막았지만, UPDATE 로 0 을 쓰면 같은 효과가 났다
-- (R2F-12 추가 1). 클라이언트의 절대값 upsert 는 2단계 폴백으로 아직 살아 있으므로 회수 대신
-- 줄이는 UPDATE 만 막는다. 원자적 증가(commit_interview_session)는 이 트리거를 지난다.
CREATE OR REPLACE FUNCTION public.interview_coverage_no_decrease()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.period IS DISTINCT FROM OLD.period
     OR NEW.layer IS DISTINCT FROM OLD.layer THEN
    RAISE EXCEPTION 'interview_coverage_cell_is_fixed' USING ERRCODE = '23514';
  END IF;
  IF NEW.answers < OLD.answers THEN
    RAISE EXCEPTION 'interview_coverage_cannot_decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interview_coverage_no_decrease ON public.interview_coverage;
CREATE TRIGGER trg_interview_coverage_no_decrease
  BEFORE UPDATE ON public.interview_coverage
  FOR EACH ROW EXECUTE FUNCTION public.interview_coverage_no_decrease();

----------------------------------------------------------------------
-- 8. 권한 -- 파일 끝에 모은다
----------------------------------------------------------------------
-- check:definer-grants Rule A 의 정규식이 주석을 걷지 않고 문장 경계를 넘어 매칭하므로(0143),
-- 함수 GRANT 뒤에는 아무것도 두지 않는다. 새 함수는 Supabase 기본 권한으로 anon · authenticated
-- 에게 EXECUTE 가 붙으므로 같은 파일에서 회수한다(Rule B).

REVOKE ALL ON TABLE public.interview_scene_metrics FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, text, boolean, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_interview_session(uuid, text, text, text, integer, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_interview_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anonymize_interview_sessions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.interview_coverage_no_decrease() FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.interview_sessions TO service_role;
GRANT SELECT ON TABLE public.interview_probe_verdicts TO service_role;
GRANT SELECT ON TABLE public.interview_scene_metrics TO service_role;
GRANT EXECUTE ON FUNCTION public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.anonymize_interview_sessions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_interview_session(uuid, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_interview_session(uuid) TO authenticated;
