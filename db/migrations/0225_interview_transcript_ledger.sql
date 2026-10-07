-- 0225_interview_transcript_ledger.sql
-- 재설계 D6 1단계(DB 층): 인터뷰 대화록 · 층 판정 원장 · 시기 카드 제안·결정 원장 · 저장 안 한
-- 대화의 소유자 없는 집계 · 응답 블록 id.
--
-- 결정: RD-261007-06 = ① (DECISIONS 26.10.07 08:32) "D6이 #2131 코드를 가져와 0225에서 다섯 곳을
-- 고친다. 0220 번호는 2ndb-74 몫으로 남는다". RD-261007-08 = 설계 Q3~Q16 초안 추천을 기본값으로.
-- 설계: docs/design/d6-verdict-ledger-261007.md (2 · 3 · 5 · 6절). #2131(닫힘, 브랜치
-- fix/qa261007-interview @ 6fea477a)의 0220 표 · 함수를 새 번호로 옮기고 아래 다섯 곳을 고쳤다.
--
-- ── #2131(0220)과 다른 다섯 곳 ─────────────────────────────────────────────
--   1. 저장 안 한 세션: 0220 은 소유자를 비운 세션 행을 남겼다. 여기서는 숫자 · 열거값만
--      interview_unsaved_rollup 에 주 단위로 더하고 세션 · 판정 행은 지운다(03:00 보정 · D2).
--   2. 그 세션의 감사 행(ai_audit_log)은 prompt_hash · output_hash 를 '' 로 비운다(D2 · Q8).
--      두 열은 NOT NULL 이라 빈 문자열로 둔다. 감사 행 자체 · 사용자 · 시각은 남는다(C3).
--   3. 판정 행은 대화록 턴 번호(turn_no)를 갖고, 담기 때 (transcript_id, turn_no) 로
--      interview_transcript_turns 에 붙는다. 답 해시(answer_digest)로 같은 턴인지 대조한 뒤 비운다.
--   4. 행마다 모델 판정(model_layer · verdict) · 로컬 판정(local_gate) · 최종 인정(final_credit) ·
--      규칙 판(rule_set)을 따로 남긴다. 칸 계산은 final_credit 만 본다. 기준선 동안 규칙 판은
--      'r0'(지금 화면 규칙: credited AND pass) 하나만 받는다.
--   5. 판정 기록 함수는 벤더를 받는다(openai · claude). 어느 프록시든 같은 함수를 부른다.
--
-- ── 보안 게이트 1회차(daybreak D6-01~08 · astra D6-51~61)에서 고친 곳 ──────────
--   감사 해시 수명: 세션 이름으로 온 감사 id 를 결과와 무관하게 전부 적고(interview_session_audit_ids),
--     판정 행이 어느 길로 지워지든 해시를 먼저 비우고(interview_verdict_erasure), 접은 세션 id 는
--     tombstone 으로 막는다. 감사 행은 사용자 · purpose · server_verified 를 확인하고, 비우기도 그
--     사용자의 행만 건드린다(D6-01 · D6-02 = D6-52 · D6-54 · D6-55).
--   승인 카드 지우기: 클라이언트 역할의 승인 행 직접 DELETE 를 트리거로 막고 delete_period_card 가 체인을
--     다시 잇고 L5 행을 지운다. 레코드 삭제 트리거는 승인과 같은 사용자 잠금을 잡는다(D6-07 = D6-53 · D6-51).
--   계정 울타리: 서비스 writer 셋이 0192 공유 잠금 · tombstone 을 본다. 응답 블록 id 는 사용자를 갖고
--     등록부 · 계정 연쇄 · 레코드 삭제에 묶인다(D6-04 · D6-05).
--   입력 · 동시성: credited 는 모델 층 NOT NULL · 첫 담기 경합은 already_committed · 시간당 세션 상한은
--     만든 횟수 · 닫은 뒤 재시도는 판정을 바꾸지 않는다(D6-59 · D6-57 · D6-58 · D6-56).
--   위기 hold 최소 조치: 화면 값을 서버가 내리지 않고, 프록시가 red 로 적은 호출이 있으면 올리며, 턴과
--     추론 뷰까지 hold 를 따른다(D6-03 의 일부. Polaris 두 함수는 그대로).
--   롤백: 저장 안 한 세션을 먼저 접고, 남는 표의 수명주기 장치는 남긴다(rollback/0225_down.sql, D6-06 = D6-61).
--   그대로 둔 것: D6-60(작은 집단은 보고 때 가린다, Q7), D6-08(직접 쓰기 회수는 다음 번호).
--
-- ── 무엇을 하지 않나 ───────────────────────────────────────────────────────
--   * 클라이언트 직접 쓰기 회수(interview_coverage INSERT · UPDATE, star_tier_history 'ratify'
--     행)는 여기 없다. 새 화면이 웹 · QA APK 에 다 나간 뒤 그때 빈 번호로 한다(설계 5.1).
--   * 인터뷰 규칙 · 층 이름 · 밝기 정의 · 미성년 게이트는 바꾸지 않는다. 새 함수는 나이를 보지 않는다.
--   * 삭제 등록부 행은 0226 이 더한다(0189 롤백이 등록부 전용 파일만 다시 적용할 수 있게, G7).
--   * 판정 원장 · 집계 · 블록 id 의 원문 칸은 없다. 원문은 저장을 고른 대화만 대화록 표에 온다.
--
-- 최상위 BEGIN/COMMIT 없음(Supabase CLI 가 감싼다). 다시 적용해도 같은 상태가 되게 썼다
-- (IF NOT EXISTS · OR REPLACE · 트리거 · 정책 · 예약은 지우고 다시 건다).

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 0. 사전 조건
----------------------------------------------------------------------
DO $prerequisites$
BEGIN
  IF to_regclass('public.records') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                     WHERE attrelid = 'public.records'::regclass AND attname = 'system_tags' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                     WHERE attrelid = 'public.records'::regclass AND attname = 'client_request_id' AND NOT attisdropped) THEN
    RAISE EXCEPTION '0225: records.system_tags (0218) and records.client_request_id (0178) are required';
  END IF;
  IF to_regclass('public.interview_coverage') IS NULL
     OR to_regclass('public.star_tier_history') IS NULL
     OR to_regclass('public.account_deletion_tombstones') IS NULL
     OR to_regclass('public.ai_audit_log') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                     WHERE attrelid = 'public.ai_audit_log'::regclass AND attname = 'purpose' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                     WHERE attrelid = 'public.star_tier_history'::regclass AND attname = 'evidence_origin' AND NOT attisdropped)
     OR to_regprocedure('public.assert_polaris_account_active(uuid)') IS NULL
     OR to_regprocedure('public.billing_request_role()') IS NULL THEN
    RAISE EXCEPTION '0225: prerequisites from 0004/0045/0060/0073/0143/0192/0195 are missing';
  END IF;
END
$prerequisites$;

----------------------------------------------------------------------
-- 1. 표
----------------------------------------------------------------------

-- 1.1 세션 (화면 한 번). 저장한 세션만 오래 남는다. 저장하지 않은 세션은 fold 가 지운다.
CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id            uuid        PRIMARY KEY,   -- 클라이언트가 세션 시작 때 만든 무작위 uuid(v4)
  owner_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period        text        NOT NULL
    CONSTRAINT interview_sessions_period_check
      CHECK (period IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')),
  locale        text        NOT NULL
    CONSTRAINT interview_sessions_locale_check CHECK (locale IN ('ko', 'en')),
  -- 판정을 처음 쓴 프록시의 벤더. 판정 호출이 없던 세션은 NULL.
  vendor        text        NULL
    CONSTRAINT interview_sessions_vendor_check CHECK (vendor IN ('openai', 'claude')),
  started_at    timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_seen_at  timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ended_at      timestamptz NULL,
  end_reason    text        NULL
    CONSTRAINT interview_sessions_end_reason_check CHECK (end_reason IN (
      'complete', 'user_end', 'user_stop', 'skip_exhausted', 'scaffold_exhausted',
      'verdict_exhausted', 'switch_declined', 'no_question', 'day_limit', 'crisis', 'error', 'left')),
  -- 서버가 볼 수 없는 턴의 셈(로컬 막힘 · 고정 발판). 클라이언트가 보고한 값이다.
  local_blocks  integer     NULL
    CONSTRAINT interview_sessions_local_blocks_check CHECK (local_blocks BETWEEN 0 AND 10000),
  scaffolds     integer     NULL
    CONSTRAINT interview_sessions_scaffolds_check CHECK (scaffolds BETWEEN 0 AND 10000),
  committed_at  timestamptz NULL,
  -- 담기로 만든 레코드. 레코드를 지우면 interview_record_erasure 트리거가 먼저 세션을 접는다.
  record_id     uuid        NULL REFERENCES public.records(id) ON DELETE SET NULL,
  CONSTRAINT interview_sessions_end_pair CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);

-- 1.2 판정 원장. 판정 호출 1회 또는 담기 때 채운 답 턴 1개 = 1행. 원문 없음.
CREATE TABLE IF NOT EXISTS public.interview_probe_verdicts (
  id                uuid        PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  session_id        uuid        NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  -- 그 호출의 ai_audit_log.id. 같은 턴을 다시 부르면 앞의 id 는 prior_audit_ids 로 간다.
  audit_id          uuid        NULL
    CONSTRAINT interview_probe_verdicts_audit_id_key UNIQUE,
  prior_audit_ids   uuid[]      NOT NULL DEFAULT '{}'::uuid[],
  scene_seq         integer     NOT NULL
    CONSTRAINT interview_probe_verdicts_scene_seq_check CHECK (scene_seq BETWEEN 1 AND 10000),
  turn_seq          integer     NOT NULL
    CONSTRAINT interview_probe_verdicts_turn_seq_check CHECK (turn_seq BETWEEN 1 AND 10000),
  -- 대화록 전체에서의 턴 번호(질문 · 답 모두 셈, 1부터).
  turn_no           integer     NOT NULL
    CONSTRAINT interview_probe_verdicts_turn_no_check CHECK (turn_no BETWEEN 1 AND 4000),
  -- 담기 뒤 대화록 머리. (transcript_id, turn_no) 가 대화록 턴을 가리킨다.
  transcript_id     uuid        NULL,
  asked_layer       text        NULL
    CONSTRAINT interview_probe_verdicts_asked_layer_check
      CHECK (asked_layer IN ('fact', 'feeling', 'meaning', 'belief', 'echo')),
  -- 이 답이 어떤 질문에 대한 답인가. 담기 때 채운 행은 직전 질문 턴의 ask_kind(없으면 NULL).
  probe_kind        text        NULL
    CONSTRAINT interview_probe_verdicts_probe_kind_check
      CHECK (probe_kind IN ('seed', 'drill', 'scaffold', 'confirm', 'loop_check', 'switch_offer', 'fallback')),
  -- 프록시가 같은 함수로 다시 계산한 로컬 문턱. 담기 때 채운 행은 서버가 계산하지 않아 NULL.
  local_gate        text        NULL
    CONSTRAINT interview_probe_verdicts_local_gate_check
      CHECK (local_gate IN ('pass', 'short', 'non_answer', 'mismatch', 'unverified')),
  model_layer       text        NULL
    CONSTRAINT interview_probe_verdicts_model_layer_check
      CHECK (model_layer IN ('fact', 'feeling', 'meaning', 'belief', 'echo')),
  verdict           text        NOT NULL
    CONSTRAINT interview_probe_verdicts_verdict_check CHECK (verdict IN (
      'credited', 'none', 'other_layer', 'no_verdict', 'unasked', 'error',   -- 프록시가 본 것
      'local_block', 'control', 'unrecorded')),                              -- 담기 때 채운 클라이언트 보고
  -- 최종 인정. 칸 계산은 이것만 본다.
  final_credit      boolean     NOT NULL DEFAULT false,
  rule_set          text        NOT NULL DEFAULT 'r0'
    CONSTRAINT interview_probe_verdicts_rule_set_check CHECK (rule_set ~ '^r[0-9]{1,3}[a-z0-9-]{0,16}$'),
  source            text        NOT NULL DEFAULT 'proxy'
    CONSTRAINT interview_probe_verdicts_source_check CHECK (source IN ('proxy', 'client')),
  -- 담기 때 정한다. NULL = 아직 담기 전.
  link_state        text        NULL
    CONSTRAINT interview_probe_verdicts_link_state_check
      CHECK (link_state IN ('linked', 'text_mismatch', 'undelivered', 'orphan')),
  vendor            text        NULL
    CONSTRAINT interview_probe_verdicts_vendor_check CHECK (vendor IN ('openai', 'claude')),
  opener_unedited   boolean     NULL,
  openers_offered   smallint    NULL
    CONSTRAINT interview_probe_verdicts_openers_check CHECK (openers_offered BETWEEN 0 AND 2),
  -- 정규화한 답 길이 구간(0: 0-4 · 1: 5-7 · 2: 8-13 · 3: 14+).
  answer_len_bucket smallint    NULL
    CONSTRAINT interview_probe_verdicts_len_bucket_check CHECK (answer_len_bucket BETWEEN 0 AND 3),
  -- sha256(session_id ':' turn_no ':' 답). 담기 때 대조한 뒤 비운다. 저장 안 한 세션은 행과 함께 사라진다.
  answer_digest     text        NULL
    CONSTRAINT interview_probe_verdicts_digest_check CHECK (answer_digest ~ '^[0-9a-f]{64}$'),
  call_count        smallint    NOT NULL DEFAULT 1
    CONSTRAINT interview_probe_verdicts_call_count_check CHECK (call_count BETWEEN 1 AND 50),
  created_at        timestamptz NOT NULL DEFAULT pg_catalog.now(),
  -- model_layer 가 NULL 이면 `model_layer = asked_layer` 가 NULL 이 되어 CHECK 를 통과한다(D6-59).
  -- 그래서 NOT NULL 을 따로 적는다.
  CONSTRAINT interview_probe_verdicts_credited_shape CHECK (
    verdict <> 'credited'
    OR (asked_layer IS NOT NULL AND model_layer IS NOT NULL AND model_layer = asked_layer)),
  CONSTRAINT interview_probe_verdicts_source_shape CHECK (
    (source = 'proxy'
       AND verdict IN ('credited', 'none', 'other_layer', 'no_verdict', 'unasked', 'error')
       AND vendor IS NOT NULL AND local_gate IS NOT NULL AND probe_kind IS NOT NULL)
    OR (source = 'client'
       AND verdict IN ('local_block', 'control', 'unrecorded', 'error')
       AND audit_id IS NULL AND model_layer IS NULL AND local_gate IS NULL
       AND final_credit = false AND vendor IS NULL AND answer_digest IS NULL)),
  CONSTRAINT interview_probe_verdicts_link_shape CHECK (
    (transcript_id IS NULL) = (link_state IS NULL OR link_state = 'orphan'))
);

CREATE UNIQUE INDEX IF NOT EXISTS interview_probe_verdicts_turn_key
  ON public.interview_probe_verdicts (session_id, turn_no);
CREATE INDEX IF NOT EXISTS interview_probe_verdicts_transcript_idx
  ON public.interview_probe_verdicts (transcript_id) WHERE transcript_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS interview_sessions_owner_idx
  ON public.interview_sessions (owner_id, started_at);
CREATE INDEX IF NOT EXISTS interview_sessions_pending_idx
  ON public.interview_sessions (last_seen_at) WHERE committed_at IS NULL;
CREATE INDEX IF NOT EXISTS interview_sessions_record_idx
  ON public.interview_sessions (record_id) WHERE record_id IS NOT NULL;

-- 1.2a 세션의 감사 id. 프록시가 이 세션 이름으로 보낸 판정 호출의 ai_audit_log.id 를 결과와 무관하게
-- 전부 적는다(기록 · 교체 · 장면 역행 · 상한 초과 · 종료 뒤 재시도). 거절한 호출도 화면에는 응답이
-- 갔을 수 있으므로, 그 해시는 세션이 저장된 동안만 남고 세션을 접을 때 함께 비운다(D6-54).
-- 판정 행의 audit_id · prior_audit_ids 도 모두 여기 있다. 소유자 열 없음: 세션을 따라 지워진다.
CREATE TABLE IF NOT EXISTS public.interview_session_audit_ids (
  audit_id    uuid        PRIMARY KEY,
  session_id  uuid        NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX IF NOT EXISTS interview_session_audit_ids_session_idx
  ON public.interview_session_audit_ids (session_id);

-- 1.2b 접은 세션 id. 접힌 뒤 늦게 온 판정 · 닫기가 같은 id 로 세션을 다시 만들지 못하게 한다(D6-55).
-- 소유자 · 숫자 없이 id 와 시각만. 7일 뒤 prune 이 지운다(늦은 호출은 몇 분 안에 온다).
CREATE TABLE IF NOT EXISTS public.interview_session_tombstones (
  session_id  uuid        PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- 1.2c 세션 만든 횟수(10분 칸). 버리기(discard)가 세션 행을 지워도 줄지 않는다(D6-58).
-- 닫기가 지난 한 시간의 합으로 새 세션 상한을 본다. 두 시간이 지난 칸은 sweep 이 지운다.
CREATE TABLE IF NOT EXISTS public.interview_session_starts (
  owner_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_start  timestamptz NOT NULL,
  created       integer     NOT NULL DEFAULT 0
    CONSTRAINT interview_session_starts_created_check CHECK (created BETWEEN 0 AND 1000000),
  PRIMARY KEY (owner_id, bucket_start)
);

-- 1.3 대화록. 저장을 고른 대화만 온다(쓰는 곳은 commit_interview_session 하나).
CREATE TABLE IF NOT EXISTS public.interview_transcripts (
  id            uuid        PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid        NOT NULL
    CONSTRAINT interview_transcripts_session_key UNIQUE
    REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  -- 레코드를 지우면 대화록도 지워진다(D5 '사용자 삭제는 실제 삭제').
  record_id     uuid        NOT NULL
    CONSTRAINT interview_transcripts_record_key UNIQUE
    REFERENCES public.records(id) ON DELETE CASCADE,
  period        text        NOT NULL
    CONSTRAINT interview_transcripts_period_check
      CHECK (period IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')),
  locale        text        NOT NULL
    CONSTRAINT interview_transcripts_locale_check CHECK (locale IN ('ko', 'en')),
  turn_count    smallint    NOT NULL
    CONSTRAINT interview_transcripts_turn_count_check CHECK (turn_count BETWEEN 1 AND 4000),
  -- D4: 저장 때 위기 판정(createRecord 의 C9)이면 대화록 전체를 AI 처리에서 뺀다.
  ai_hold       boolean     NOT NULL DEFAULT false,
  -- D5: 앱은 원문을 고치지 않고 새 판을 더한다. 지금은 새 판을 만드는 길이 없다(예약 열).
  superseded_by uuid        NULL REFERENCES public.interview_transcripts(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS public.interview_transcript_turns (
  transcript_id   uuid     NOT NULL REFERENCES public.interview_transcripts(id) ON DELETE CASCADE,
  user_id         uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_no         integer  NOT NULL
    CONSTRAINT interview_transcript_turns_turn_no_check CHECK (turn_no BETWEEN 1 AND 4000),
  role            text     NOT NULL
    CONSTRAINT interview_transcript_turns_role_check CHECK (role IN ('interviewer', 'user')),
  scene_seq       integer  NOT NULL
    CONSTRAINT interview_transcript_turns_scene_check CHECK (scene_seq BETWEEN 1 AND 10000),
  asked_layer     text     NULL
    CONSTRAINT interview_transcript_turns_layer_check
      CHECK (asked_layer IN ('fact', 'feeling', 'meaning', 'belief', 'echo')),
  -- 질문 턴: model = LLM 질문, fixed = 씨앗 · 발판 · 되묻기 · 대체 질문. 답 턴은 언제나 user.
  origin          text     NOT NULL
    CONSTRAINT interview_transcript_turns_origin_check CHECK (origin IN ('user', 'model', 'fixed')),
  ask_kind        text     NULL
    CONSTRAINT interview_transcript_turns_ask_kind_check
      CHECK (ask_kind IN ('seed', 'drill', 'scaffold', 'confirm', 'loop_check', 'switch_offer', 'fallback')),
  opener_unedited boolean  NULL,
  text            text     NOT NULL
    CONSTRAINT interview_transcript_turns_text_check CHECK (pg_catalog.char_length(text) BETWEEN 1 AND 8000),
  ai_hold         boolean  NOT NULL DEFAULT false,
  PRIMARY KEY (transcript_id, turn_no),
  CONSTRAINT interview_transcript_turns_origin_shape CHECK ((role = 'user') = (origin = 'user')),
  CONSTRAINT interview_transcript_turns_opener_shape CHECK (role = 'user' OR opener_unedited IS NULL)
);
CREATE INDEX IF NOT EXISTS interview_transcripts_user_idx
  ON public.interview_transcripts (user_id, period, created_at);
CREATE INDEX IF NOT EXISTS interview_transcript_turns_user_idx
  ON public.interview_transcript_turns (user_id);

-- 판정 행 → 대화록 턴. 턴 하나를 지우면 그 턴의 판정 행도 지워진다(D5 "원장 참조에도 같은 규칙").
DO $turn_fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                  WHERE conrelid = 'public.interview_probe_verdicts'::regclass
                    AND conname = 'interview_probe_verdicts_turn_fk') THEN
    ALTER TABLE public.interview_probe_verdicts ADD CONSTRAINT interview_probe_verdicts_turn_fk
      FOREIGN KEY (transcript_id, turn_no)
      REFERENCES public.interview_transcript_turns (transcript_id, turn_no) ON DELETE CASCADE;
  END IF;
END
$turn_fk$;

-- 1.4 시기 카드 제안 · 결정 원장. 제안 1건 = 1행, 승인 · 거절 · 빗나간 곳은 같은 행의 상태다.
CREATE TABLE IF NOT EXISTS public.period_card_proposals (
  id              uuid        PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_kind       text        NOT NULL DEFAULT 'period'
    CONSTRAINT period_card_proposals_kind_check CHECK (card_kind IN ('period')),
  star_id         text        NOT NULL
    CONSTRAINT period_card_proposals_star_check
      CHECK (star_id IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')),
  request_key     text        NOT NULL
    CONSTRAINT period_card_proposals_request_key_check CHECK (pg_catalog.char_length(request_key) BETWEEN 8 AND 120),
  -- self_model_propose 호출의 감사 행(FK 없음: 감사 행은 계정 삭제 뒤에도 남는다). 기록 함수가
  -- 같은 사용자 · purpose · server_verified 인지 확인한 것만 온다(D6-01).
  audit_id        uuid        NOT NULL,
  vendor          text        NOT NULL
    CONSTRAINT period_card_proposals_vendor_check CHECK (vendor IN ('openai', 'claude')),
  proposal_text   text        NOT NULL
    CONSTRAINT period_card_proposals_text_check CHECK (pg_catalog.char_length(proposal_text) BETWEEN 1 AND 280),
  rationale       text        NULL
    CONSTRAINT period_card_proposals_rationale_check CHECK (pg_catalog.char_length(rationale) <= 600),
  -- 서버가 모델에 보낸 근거(턴 단위 record:<uuid>#t<n>, 발췌 해시까지 대조한 것만).
  evidence_sent   text[]      NOT NULL,
  -- 모델이 인용했고 evidence_sent 안에 있는 것만.
  evidence_cited  text[]      NOT NULL,
  content_sha     text        NOT NULL
    CONSTRAINT period_card_proposals_sha_check CHECK (content_sha ~ '^[0-9a-f]{64}$'),
  level_before    smallint    NOT NULL
    CONSTRAINT period_card_proposals_level_check CHECK (level_before BETWEEN 0 AND 5),
  status          text        NOT NULL DEFAULT 'proposed'
    CONSTRAINT period_card_proposals_status_check
      CHECK (status IN ('proposed', 'ratified', 'declined', 'missed', 'expired', 'void')),
  miss_text       text        NULL
    CONSTRAINT period_card_proposals_miss_text_check CHECK (pg_catalog.char_length(miss_text) BETWEEN 1 AND 500),
  miss_ai_hold    boolean     NOT NULL DEFAULT false,
  decided_at      timestamptz NULL,
  superseded_by   uuid        NULL REFERENCES public.period_card_proposals(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT period_card_proposals_request_key UNIQUE (user_id, request_key),
  CONSTRAINT period_card_proposals_sent_shape CHECK (
    pg_catalog.cardinality(evidence_sent) BETWEEN 1 AND 40
    AND pg_catalog.array_to_string(evidence_sent, ',')
        ~ '^record:[0-9a-f-]{36}#t[0-9]{1,4}(,record:[0-9a-f-]{36}#t[0-9]{1,4})*$'),
  CONSTRAINT period_card_proposals_cited_shape CHECK (
    pg_catalog.cardinality(evidence_cited) BETWEEN 1 AND 40 AND evidence_cited <@ evidence_sent),
  CONSTRAINT period_card_proposals_miss_shape CHECK ((status = 'missed') = (miss_text IS NOT NULL)),
  CONSTRAINT period_card_proposals_decided_shape CHECK ((status = 'proposed') = (decided_at IS NULL)),
  CONSTRAINT period_card_proposals_superseded_shape CHECK (superseded_by IS NULL OR status = 'ratified')
);
-- 별마다 '지금 서 있는' 승인 카드는 하나, 결정을 기다리는 제안도 하나.
CREATE UNIQUE INDEX IF NOT EXISTS period_card_current_ratified
  ON public.period_card_proposals (user_id, star_id) WHERE status = 'ratified' AND superseded_by IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS period_card_one_open
  ON public.period_card_proposals (user_id, star_id) WHERE status = 'proposed';

-- 1.5 소유자 없는 집계. 소유자 열 · 세션 id · 원문 · 해시 · 시각이 없다. 주(KST 월요일) 단위.
CREATE TABLE IF NOT EXISTS public.interview_unsaved_rollup (
  week_kst        date      NOT NULL
    CONSTRAINT interview_unsaved_rollup_week_check CHECK (pg_catalog.date_part('isodow', week_kst) = 1),
  period          text      NOT NULL
    CONSTRAINT interview_unsaved_rollup_period_check
      CHECK (period IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')),
  locale          text      NOT NULL
    CONSTRAINT interview_unsaved_rollup_locale_check CHECK (locale IN ('ko', 'en')),
  vendor          text      NOT NULL
    CONSTRAINT interview_unsaved_rollup_vendor_check CHECK (vendor IN ('openai', 'claude', 'none')),
  rule_set        text      NOT NULL
    CONSTRAINT interview_unsaved_rollup_rule_set_check CHECK (rule_set ~ '^r[0-9]{1,3}[a-z0-9-]{0,16}$'),
  outcome         text      NOT NULL
    CONSTRAINT interview_unsaved_rollup_outcome_check CHECK (outcome IN ('left', 'discarded', 'deleted_after_save')),
  end_reason      text      NOT NULL
    CONSTRAINT interview_unsaved_rollup_end_reason_check CHECK (end_reason IN (
      'complete', 'user_end', 'user_stop', 'skip_exhausted', 'scaffold_exhausted',
      'verdict_exhausted', 'switch_declined', 'no_question', 'day_limit', 'crisis', 'error', 'left')),
  sessions           integer   NOT NULL DEFAULT 0 CHECK (sessions >= 0),
  scenes             integer   NOT NULL DEFAULT 0 CHECK (scenes >= 0),
  scenes_hist        integer[] NOT NULL DEFAULT '{0,0,0,0,0,0}',   -- 세션당 장면 1, 2, 3, 4, 5, 6+
  depth_hist         integer[] NOT NULL DEFAULT '{0,0,0,0,0,0}',   -- 장면 도달 깊이 0..5
  judged             integer   NOT NULL DEFAULT 0,                 -- 프록시 행
  v_credited         integer   NOT NULL DEFAULT 0,
  v_none             integer   NOT NULL DEFAULT 0,
  v_other_layer      integer   NOT NULL DEFAULT 0,
  v_no_verdict       integer   NOT NULL DEFAULT 0,
  v_unasked          integer   NOT NULL DEFAULT 0,
  v_error            integer   NOT NULL DEFAULT 0,
  final_credit       integer   NOT NULL DEFAULT 0,
  gate_short         integer   NOT NULL DEFAULT 0,
  gate_untrusted     integer   NOT NULL DEFAULT 0,                 -- mismatch + unverified
  local_blocks       integer   NOT NULL DEFAULT 0,                 -- 세션 행의 클라이언트 보고 셈
  scaffold_answers   integer   NOT NULL DEFAULT 0,
  scaffold_recovered integer   NOT NULL DEFAULT 0,
  opener_unedited    integer   NOT NULL DEFAULT 0,
  openers_offered    integer   NOT NULL DEFAULT 0,
  layer_judged       integer[] NOT NULL DEFAULT '{0,0,0,0,0}',     -- 층별(fact..echo)
  layer_other        integer[] NOT NULL DEFAULT '{0,0,0,0,0}',
  layer_no_verdict   integer[] NOT NULL DEFAULT '{0,0,0,0,0}',
  layer_credited     integer[] NOT NULL DEFAULT '{0,0,0,0,0}',
  PRIMARY KEY (week_kst, period, locale, vendor, rule_set, outcome, end_reason),
  CONSTRAINT interview_unsaved_rollup_array_shape CHECK (
    pg_catalog.cardinality(scenes_hist) = 6 AND pg_catalog.cardinality(depth_hist) = 6
    AND pg_catalog.cardinality(layer_judged) = 5 AND pg_catalog.cardinality(layer_other) = 5
    AND pg_catalog.cardinality(layer_no_verdict) = 5 AND pg_catalog.cardinality(layer_credited) = 5)
);

-- 1.6 세컨비 응답이 문맥에 실은 블록 id. id 만, 내용 없음. 읽기 계층 R 이 채운다(계약만).
-- 감사 행은 계정 삭제 뒤에도 남으므로(user_id SET NULL) 감사 FK 연쇄로는 지워지지 않는다. 그래서
-- 감사 행에서 확인한 사용자를 따로 적어 계정 연쇄 · 삭제 등록부(0226)에 묶는다(D6-05). 레코드를
-- 지우면 그 레코드 id 를 실은 행은 records 삭제 트리거가 지운다.
CREATE TABLE IF NOT EXISTS public.ai_audit_context_blocks (
  audit_id       uuid        PRIMARY KEY REFERENCES public.ai_audit_log(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose        text        NOT NULL
    CONSTRAINT ai_audit_context_blocks_purpose_check CHECK (purpose IN ('secondb_chat')),
  reader_version text        NOT NULL
    CONSTRAINT ai_audit_context_blocks_reader_check CHECK (reader_version ~ '^r[0-9]{1,4}$'),
  block_ids      text[]      NOT NULL
    CONSTRAINT ai_audit_context_blocks_ids_check CHECK (
      pg_catalog.cardinality(block_ids) <= 64
      AND pg_catalog.array_to_string(block_ids, ',')
          ~ '^$|^(record|wiki|card|idcard|source):[A-Za-z0-9._#-]{1,120}(,(record|wiki|card|idcard|source):[A-Za-z0-9._#-]{1,120})*$'),
  cited_ids      text[]      NULL
    CONSTRAINT ai_audit_context_blocks_cited_check CHECK (cited_ids IS NULL OR cited_ids <@ block_ids),
  created_at     timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX IF NOT EXISTS ai_audit_context_blocks_user_idx
  ON public.ai_audit_context_blocks (user_id);

COMMENT ON TABLE public.interview_sessions IS
  '0225 인터뷰 세션(화면 한 번). 종료 사유 · 저장 시각. 원문 없음. 저장하지 않은 세션은 fold 가 집계로 접고 지운다.';
COMMENT ON TABLE public.interview_probe_verdicts IS
  '0225 인터뷰 판정 원장(하나뿐). 판정 호출 또는 담은 답 턴 1개 = 1행. 원문 없음, 답 해시는 담기 때 비운다.';
COMMENT ON TABLE public.interview_transcripts IS
  '0225 인터뷰 대화록 머리. 저장을 고른 대화만. 레코드를 지우면 함께 지워진다.';
COMMENT ON TABLE public.interview_transcript_turns IS
  '0225 인터뷰 대화록 턴(원문). 답 턴의 판정은 interview_probe_verdicts 가 턴 번호로 가리킨다.';
COMMENT ON TABLE public.period_card_proposals IS
  '0225 시기 카드 제안 · 결정 원장. 승인된 행의 proposal_text 가 그때의 나 문장이다. L5 행은 서버만 쓴다.';
COMMENT ON TABLE public.interview_unsaved_rollup IS
  '0225 저장하지 않은 인터뷰의 소유자 없는 주 단위 집계. 숫자와 열거값만.';
COMMENT ON TABLE public.ai_audit_context_blocks IS
  '0225 세컨비 응답이 문맥에 실은 블록 id(내용 없음). 계정 · 그 레코드를 지우면 함께 지워지고 90일 뒤 정리된다.';
COMMENT ON TABLE public.interview_session_audit_ids IS
  '0225 세션 이름으로 온 판정 호출의 감사 id 전부(거절 포함). 세션을 접을 때 그 해시를 비운다.';
COMMENT ON TABLE public.interview_session_tombstones IS
  '0225 접은 세션 id. 늦은 호출이 세션을 다시 만들지 못하게 한다. 소유자 없음, 7일 보관.';
COMMENT ON TABLE public.interview_session_starts IS
  '0225 사용자별 세션 생성 횟수(10분 칸). 버리기로 줄지 않는 생성 상한용. 2시간 보관.';

-- RLS: 모든 표 강제. 클라이언트는 대화록 두 표 · 제안 표의 자기 행만 읽고 지운다(삭제 등록부 G3).
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_probe_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_probe_verdicts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_transcripts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_transcript_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_transcript_turns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.period_card_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_card_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_unsaved_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_unsaved_rollup FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_context_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_context_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_session_audit_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_session_audit_ids FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_session_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_session_tombstones FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interview_session_starts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_session_starts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interview_transcripts_select_own ON public.interview_transcripts;
CREATE POLICY interview_transcripts_select_own ON public.interview_transcripts
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS interview_transcripts_delete_own ON public.interview_transcripts;
CREATE POLICY interview_transcripts_delete_own ON public.interview_transcripts
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS interview_transcript_turns_select_own ON public.interview_transcript_turns;
CREATE POLICY interview_transcript_turns_select_own ON public.interview_transcript_turns
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS interview_transcript_turns_delete_own ON public.interview_transcript_turns;
CREATE POLICY interview_transcript_turns_delete_own ON public.interview_transcript_turns
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS period_card_proposals_select_own ON public.period_card_proposals;
CREATE POLICY period_card_proposals_select_own ON public.period_card_proposals
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
-- 제안 표의 본인 DELETE 는 남긴다(삭제 등록부 client_erasable 49: erase_my_data 가 이 표를 지우고,
-- 거절 · 빗나간 곳 행에는 사용자가 쓴 miss_text 가 있다). 다만 승인 카드는 체인(superseded_by)과
-- L5 행이 걸려 있어 직접 지우면 깨진다(D6-07 · D6-53). 그래서 승인 행의 클라이언트 직접 DELETE 는
-- 아래 트리거(period_card_delete_guard)가 막고, 소유자는 delete_period_card 로 지운다.
DROP POLICY IF EXISTS period_card_proposals_delete_own ON public.period_card_proposals;
CREATE POLICY period_card_proposals_delete_own ON public.period_card_proposals
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- Supabase 기본 권한이 새 표에 anon · authenticated 로 ALL 을 주므로 먼저 전부 걷는다(0143 의 함정).
-- 필요한 것은 파일 끝의 권한 블록에서 다시 준다.
REVOKE ALL ON TABLE public.interview_sessions, public.interview_probe_verdicts,
  public.interview_transcripts, public.interview_transcript_turns, public.period_card_proposals,
  public.interview_unsaved_rollup, public.ai_audit_context_blocks,
  public.interview_session_audit_ids, public.interview_session_tombstones, public.interview_session_starts
  FROM PUBLIC, anon, authenticated, service_role;

----------------------------------------------------------------------
-- 2. 뷰 (service_role 만)
----------------------------------------------------------------------
-- 장면 한 줄. 깊이는 최종 인정된 가장 깊은 층(사실 1 … 울림 5), 없으면 0.
CREATE OR REPLACE VIEW public.interview_scene_metrics
WITH (security_invoker = true) AS
SELECT
  s.id AS session_id,
  s.owner_id,
  s.period,
  s.locale,
  s.vendor,
  s.end_reason,
  (s.committed_at IS NOT NULL) AS committed,
  pg_catalog.date_trunc('day', s.started_at) AS started_day,
  v.scene_seq,
  pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer AS judged_calls,
  COALESCE(pg_catalog.max(
    CASE WHEN v.final_credit THEN
      CASE v.asked_layer
        WHEN 'fact' THEN 1 WHEN 'feeling' THEN 2 WHEN 'meaning' THEN 3
        WHEN 'belief' THEN 4 WHEN 'echo' THEN 5 END
    END), 0) AS depth,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'credited')::integer AS verdict_credited,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'none')::integer AS verdict_none,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'other_layer')::integer AS verdict_other_layer,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'no_verdict')::integer AS verdict_missing,
  pg_catalog.count(*) FILTER (WHERE v.final_credit)::integer AS final_credit,
  pg_catalog.count(*) FILTER (WHERE v.local_gate = 'short')::integer AS gate_short,
  pg_catalog.count(*) FILTER (WHERE v.local_gate IN ('mismatch', 'unverified'))::integer AS gate_untrusted,
  pg_catalog.count(*) FILTER (WHERE v.verdict = 'local_block')::integer AS local_blocks_logged,
  pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold')::integer AS scaffold_answers,
  pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold' AND v.final_credit)::integer AS scaffold_recovered,
  pg_catalog.count(*) FILTER (WHERE v.opener_unedited)::integer AS opener_unedited,
  COALESCE(pg_catalog.sum(v.openers_offered), 0)::integer AS openers_offered,
  pg_catalog.max(v.rule_set) AS rule_set
FROM public.interview_sessions AS s
JOIN public.interview_probe_verdicts AS v ON v.session_id = s.id
GROUP BY s.id, v.scene_seq;

COMMENT ON VIEW public.interview_scene_metrics IS
  '0225: 인터뷰 장면 단위 지표(깊이 · 종료 사유 · 거부율 · 발판 회복 · 말문 후보). service_role 만.';

-- 층 판정(basis = 추론)을 레코드에 턴 번호로 연결한 모양. 읽기 계층이 그대로 합칠 수 있게.
-- AI 처리에서 뺀 대화록(ai_hold)은 싣지 않는다(D6-03 의 최소 보수 조치).
CREATE OR REPLACE VIEW public.record_layer_inferences
WITH (security_invoker = true) AS
SELECT t.record_id, v.turn_no, v.asked_layer AS layer, 'inferred'::text AS basis,
       v.final_credit, v.verdict, v.model_layer, v.local_gate, v.rule_set
  FROM public.interview_probe_verdicts AS v
  JOIN public.interview_transcripts AS t ON t.id = v.transcript_id
 WHERE v.link_state = 'linked'
   AND NOT t.ai_hold;

COMMENT ON VIEW public.record_layer_inferences IS
  '0225: 담은 인터뷰 레코드의 턴별 층 판정(추론). service_role 만.';

REVOKE ALL ON TABLE public.interview_scene_metrics, public.record_layer_inferences
  FROM PUBLIC, anon, authenticated, service_role;

----------------------------------------------------------------------
-- 3. 내부 도우미 (어느 클라이언트 역할도 부르지 못한다)
----------------------------------------------------------------------

-- 같은 길이의 정수 배열을 칸마다 더한다(집계 upsert 용).
CREATE OR REPLACE FUNCTION public.interview_int_array_add(p_a integer[], p_b integer[])
RETURNS integer[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.array_agg(t.x + t.y ORDER BY t.i)
    FROM unnest(p_a, p_b) WITH ORDINALITY AS t(x, y, i)
$$;

-- 대화록 턴 목록 → 레코드 본문. src/app/interview.tsx keepIt 의 식과 같은 바이트를 낸다:
-- 질문 턴은 '질문: ' (en 'Q: '), 답 턴은 '답변: ' (en 'A: '), 턴 사이는 빈 줄 하나.
CREATE OR REPLACE FUNCTION public.interview_transcript_body(p_locale text, p_turns jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.string_agg(
           CASE WHEN t.value ->> 'role' = 'interviewer'
                THEN CASE WHEN p_locale = 'ko' THEN '질문' ELSE 'Q' END
                ELSE CASE WHEN p_locale = 'ko' THEN '답변' ELSE 'A' END
           END || ': ' || (t.value ->> 'text'),
           E'\n\n' ORDER BY (t.value ->> 'n')::integer)
    FROM pg_catalog.jsonb_array_elements(p_turns) AS t(value)
$$;

-- 감사 행의 두 해시를 빈 문자열로 비운다(D2). 감사 행 자체 · 사용자 · 시각 · 토큰은 남는다(C3).
-- 링크 스크랩(S6a)도 같은 함수를 쓴다(Q8). 그 사용자 · 그 purpose 의 행만 건드린다(D6-01): 잘못
-- 묶인 id 가 와도 남의 감사 행은 비우지 않는다.
CREATE OR REPLACE FUNCTION public.erase_audit_hashes(p_user_id uuid, p_ids uuid[], p_purpose text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_user_id IS NULL OR p_ids IS NULL OR pg_catalog.cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  UPDATE public.ai_audit_log AS a
     SET prompt_hash = '',
         output_hash = ''
   WHERE a.id = ANY (p_ids)
     AND a.user_id = p_user_id
     AND a.purpose IS NOT DISTINCT FROM p_purpose
     AND (a.prompt_hash <> '' OR a.output_hash <> '');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- 서비스 writer 의 계정 울타리(D6-04). 0192 begin_account_deletion 의 배타 잠금과 같은 키의 공유 잠금을
-- 잡고, 사용자 행이 있고 삭제 tombstone 이 없을 때만 참이다. assert_polaris_account_active(0195)와 같은
-- 규칙이지만 예외 대신 거짓을 돌려줘 프록시 writer 가 사유 문자열로 답할 수 있게 한다.
CREATE OR REPLACE FUNCTION public.interview_account_writable(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_user_id::text, 260913));
  RETURN EXISTS (SELECT 1 FROM public.users AS u WHERE u.id = p_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.account_deletion_tombstones AS t WHERE t.user_id = p_user_id);
END;
$$;

-- 세션 하나를 소유자 없는 집계로 접고 지운다(D2 흔적 0).
--   ① 세션 · 판정 행을 주(KST) × 시기 × 언어 × 벤더 × 규칙 판 × outcome × 종료 사유로 세어 더한다.
--   ② 이 세션 이름으로 온 감사 id 전부(판정 행의 현재 · 앞선 호출, 거절한 호출)의 해시를 비운다.
--   ③ 세션 id 를 tombstone 에 남긴다(늦은 호출이 같은 id 로 다시 만들지 못하게, D6-55).
--   ④ 판정 행 · 세션 행을 지운다(대화록 · 감사 id 행은 세션 FK 연쇄로 함께 지워진다).
CREATE OR REPLACE FUNCTION public.fold_interview_session(p_session_id uuid, p_outcome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  c_layers constant text[] := ARRAY['fact', 'feeling', 'meaning', 'belief', 'echo'];
  v_s public.interview_sessions%ROWTYPE;
  v_week date;
  v_rule text;
  v_scenes integer;
  v_scenes_hist integer[] := ARRAY[0, 0, 0, 0, 0, 0];
  v_depth_hist integer[] := ARRAY[0, 0, 0, 0, 0, 0];
  v_lj integer[] := ARRAY[0, 0, 0, 0, 0];
  v_lo integer[] := ARRAY[0, 0, 0, 0, 0];
  v_ln integer[] := ARRAY[0, 0, 0, 0, 0];
  v_lc integer[] := ARRAY[0, 0, 0, 0, 0];
  v_scene record;
  v_agg record;
  v_i integer;
  v_ids uuid[];
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('left', 'discarded', 'deleted_after_save') THEN
    RAISE EXCEPTION 'interview_fold_outcome_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.interview_sessions AS s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_week := pg_catalog.date_trunc('week', v_s.started_at AT TIME ZONE 'Asia/Seoul')::date;
  SELECT COALESCE(pg_catalog.max(v.rule_set), 'r0') INTO v_rule
    FROM public.interview_probe_verdicts AS v WHERE v.session_id = p_session_id;
  SELECT pg_catalog.count(DISTINCT v.scene_seq)::integer INTO v_scenes
    FROM public.interview_probe_verdicts AS v WHERE v.session_id = p_session_id;
  IF v_scenes > 0 THEN
    v_scenes_hist[LEAST(v_scenes, 6)] := 1;
  END IF;
  FOR v_scene IN
    SELECT COALESCE(pg_catalog.max(CASE WHEN v.final_credit
             THEN pg_catalog.array_position(c_layers, v.asked_layer) END), 0) AS depth
      FROM public.interview_probe_verdicts AS v
     WHERE v.session_id = p_session_id
     GROUP BY v.scene_seq
  LOOP
    v_depth_hist[v_scene.depth + 1] := v_depth_hist[v_scene.depth + 1] + 1;
  END LOOP;
  FOR v_i IN 1..5 LOOP
    SELECT pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer AS judged,
           pg_catalog.count(*) FILTER (WHERE v.verdict = 'other_layer')::integer AS other_layer,
           pg_catalog.count(*) FILTER (WHERE v.verdict = 'no_verdict')::integer AS no_verdict,
           pg_catalog.count(*) FILTER (WHERE v.final_credit)::integer AS credited
      INTO v_agg
      FROM public.interview_probe_verdicts AS v
     WHERE v.session_id = p_session_id AND v.asked_layer = c_layers[v_i];
    v_lj[v_i] := v_agg.judged;
    v_lo[v_i] := v_agg.other_layer;
    v_ln[v_i] := v_agg.no_verdict;
    v_lc[v_i] := v_agg.credited;
  END LOOP;
  SELECT pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer AS judged,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'credited')::integer AS credited,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'none')::integer AS none_,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'other_layer')::integer AS other_layer,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'no_verdict')::integer AS no_verdict,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'unasked')::integer AS unasked,
         pg_catalog.count(*) FILTER (WHERE v.verdict = 'error')::integer AS error_,
         pg_catalog.count(*) FILTER (WHERE v.final_credit)::integer AS final_credit,
         pg_catalog.count(*) FILTER (WHERE v.local_gate = 'short')::integer AS gate_short,
         pg_catalog.count(*) FILTER (WHERE v.local_gate IN ('mismatch', 'unverified'))::integer AS gate_untrusted,
         pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold')::integer AS scaffold_answers,
         pg_catalog.count(*) FILTER (WHERE v.probe_kind = 'scaffold' AND v.final_credit)::integer AS scaffold_recovered,
         pg_catalog.count(*) FILTER (WHERE v.opener_unedited)::integer AS opener_unedited,
         COALESCE(pg_catalog.sum(v.openers_offered), 0)::integer AS openers_offered
    INTO v_agg
    FROM public.interview_probe_verdicts AS v
   WHERE v.session_id = p_session_id;

  INSERT INTO public.interview_unsaved_rollup AS u (
    week_kst, period, locale, vendor, rule_set, outcome, end_reason,
    sessions, scenes, scenes_hist, depth_hist, judged,
    v_credited, v_none, v_other_layer, v_no_verdict, v_unasked, v_error, final_credit,
    gate_short, gate_untrusted, local_blocks, scaffold_answers, scaffold_recovered,
    opener_unedited, openers_offered, layer_judged, layer_other, layer_no_verdict, layer_credited
  ) VALUES (
    v_week, v_s.period, v_s.locale, COALESCE(v_s.vendor, 'none'), v_rule, p_outcome,
    COALESCE(v_s.end_reason, 'left'),
    1, v_scenes, v_scenes_hist, v_depth_hist, v_agg.judged,
    v_agg.credited, v_agg.none_, v_agg.other_layer, v_agg.no_verdict, v_agg.unasked, v_agg.error_,
    v_agg.final_credit, v_agg.gate_short, v_agg.gate_untrusted, COALESCE(v_s.local_blocks, 0),
    v_agg.scaffold_answers, v_agg.scaffold_recovered, v_agg.opener_unedited, v_agg.openers_offered,
    v_lj, v_lo, v_ln, v_lc
  )
  ON CONFLICT (week_kst, period, locale, vendor, rule_set, outcome, end_reason) DO UPDATE SET
    sessions = u.sessions + EXCLUDED.sessions,
    scenes = u.scenes + EXCLUDED.scenes,
    scenes_hist = public.interview_int_array_add(u.scenes_hist, EXCLUDED.scenes_hist),
    depth_hist = public.interview_int_array_add(u.depth_hist, EXCLUDED.depth_hist),
    judged = u.judged + EXCLUDED.judged,
    v_credited = u.v_credited + EXCLUDED.v_credited,
    v_none = u.v_none + EXCLUDED.v_none,
    v_other_layer = u.v_other_layer + EXCLUDED.v_other_layer,
    v_no_verdict = u.v_no_verdict + EXCLUDED.v_no_verdict,
    v_unasked = u.v_unasked + EXCLUDED.v_unasked,
    v_error = u.v_error + EXCLUDED.v_error,
    final_credit = u.final_credit + EXCLUDED.final_credit,
    gate_short = u.gate_short + EXCLUDED.gate_short,
    gate_untrusted = u.gate_untrusted + EXCLUDED.gate_untrusted,
    local_blocks = u.local_blocks + EXCLUDED.local_blocks,
    scaffold_answers = u.scaffold_answers + EXCLUDED.scaffold_answers,
    scaffold_recovered = u.scaffold_recovered + EXCLUDED.scaffold_recovered,
    opener_unedited = u.opener_unedited + EXCLUDED.opener_unedited,
    openers_offered = u.openers_offered + EXCLUDED.openers_offered,
    layer_judged = public.interview_int_array_add(u.layer_judged, EXCLUDED.layer_judged),
    layer_other = public.interview_int_array_add(u.layer_other, EXCLUDED.layer_other),
    layer_no_verdict = public.interview_int_array_add(u.layer_no_verdict, EXCLUDED.layer_no_verdict),
    layer_credited = public.interview_int_array_add(u.layer_credited, EXCLUDED.layer_credited);

  SELECT pg_catalog.array_agg(DISTINCT ids.id) INTO v_ids
    FROM (SELECT v.audit_id AS id FROM public.interview_probe_verdicts AS v
           WHERE v.session_id = p_session_id AND v.audit_id IS NOT NULL
          UNION ALL
          SELECT pg_catalog.unnest(v.prior_audit_ids) FROM public.interview_probe_verdicts AS v
           WHERE v.session_id = p_session_id
          UNION ALL
          SELECT i.audit_id FROM public.interview_session_audit_ids AS i
           WHERE i.session_id = p_session_id) AS ids;
  PERFORM public.erase_audit_hashes(v_s.owner_id, v_ids, 'interview_probe');

  INSERT INTO public.interview_session_tombstones AS t (session_id) VALUES (p_session_id)
  ON CONFLICT (session_id) DO UPDATE SET created_at = pg_catalog.now();

  DELETE FROM public.interview_probe_verdicts AS v WHERE v.session_id = p_session_id;
  DELETE FROM public.interview_sessions AS s WHERE s.id = p_session_id;
END;
$$;

-- 판정 행이 어느 길로 지워지든(대화록 턴 · 머리를 먼저 지우는 삭제 등록부 순서 28 → 29 → 30, 소유자의
-- 직접 DELETE, fold) 그 행의 감사 id 해시를 먼저 비운다(D6-02). 소유자는 세션 행에서 읽는다. 세션이
-- 이미 없으면(계정 삭제 연쇄) 감사 행도 사용자 연결이 끊기므로(SET NULL) 건너뛴다.
CREATE OR REPLACE FUNCTION public.interview_verdict_erasure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT s.owner_id INTO v_owner FROM public.interview_sessions AS s WHERE s.id = OLD.session_id;
  IF v_owner IS NOT NULL THEN
    PERFORM public.erase_audit_hashes(v_owner,
      pg_catalog.array_remove(OLD.prior_audit_ids || OLD.audit_id, NULL), 'interview_probe');
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS interview_verdict_erasure ON public.interview_probe_verdicts;
CREATE TRIGGER interview_verdict_erasure
  BEFORE DELETE ON public.interview_probe_verdicts
  FOR EACH ROW WHEN (OLD.audit_id IS NOT NULL OR pg_catalog.cardinality(OLD.prior_audit_ids) > 0)
  EXECUTE FUNCTION public.interview_verdict_erasure();

-- 세션을 만들 때마다 만든 사람의 10분 칸을 하나 올린다(D6-58). 어느 길(프록시 판정 · 닫기 · 담기)로
-- 만들든 센다. 버리기(fold)가 세션 행을 지워도 이 칸은 줄지 않는다.
CREATE OR REPLACE FUNCTION public.interview_session_count_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.interview_session_starts AS c (owner_id, bucket_start, created)
  VALUES (NEW.owner_id,
          pg_catalog.date_bin(INTERVAL '10 minutes', NEW.started_at, TIMESTAMPTZ '2000-01-01 00:00:00+00'), 1)
  ON CONFLICT (owner_id, bucket_start) DO UPDATE SET created = LEAST(c.created + 1, 1000000);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS interview_session_count_start ON public.interview_sessions;
CREATE TRIGGER interview_session_count_start
  AFTER INSERT ON public.interview_sessions
  FOR EACH ROW EXECUTE FUNCTION public.interview_session_count_start();

----------------------------------------------------------------------
-- 4. 판정 기록 (프록시 전용, service_role)
----------------------------------------------------------------------
-- 프록시(openai · claude 공용 모듈)는 판정 호출의 감사 행을 쓴 뒤 이 함수를 부른다. 행은 프록시가
-- 직접 본 것으로 만든다: verdict · model_layer 는 모델 출력에서, local_gate 는 실제 프롬프트의
-- 마지막 답에서 다시 계산한 값, final_credit 은 공용 규칙 모듈(r0) 값이다. 실패해도 프록시는 응답을
-- 막지 않는다(감사 행 쓰기와 같은 규율).
--
-- 세션 행이 없으면 만든다(소유자 = JWT 사용자). 남의 세션 · 담기가 끝난 세션 · 시기나 언어가 다른
-- 세션 · 장면 번호가 거꾸로 간 호출은 적지 않고 사유를 돌려준다. 같은 턴을 다시 부르면(장애 전환
-- 재시도 · 화면의 다시 묻기) 나중 것이 이기고 앞 감사 id 는 prior_audit_ids 로 옮긴다.
--
-- 감사 해시의 수명(D6-01 · D6-54 · D6-55): 먼저 계정 울타리(0192 공유 잠금 · tombstone)를 지나고, 감사
-- 행이 이 사용자 · interview_probe · server_verified 인지 확인한다. 확인된 감사 id 는 결과와 무관하게
-- 세션의 감사 id(interview_session_audit_ids)로 적어, 세션이 접힐 때 함께 비운다. 세션에 붙일 수 없는
-- 호출(이미 접힌 세션 · 남의 세션)은 그 자리에서 해시를 비운다. 접힌 세션은 다시 만들지 않는다.
-- 세션을 닫은 뒤 같은 턴의 재시도는 판정 · 시각을 바꾸지 않는다(D6-56: 종료 시점의 판정이 칸을 정한다).
CREATE OR REPLACE FUNCTION public.record_interview_probe_verdict(
  p_user_id uuid,
  p_audit_id uuid,
  p_session_id uuid,
  p_period text,
  p_locale text,
  p_scene_seq integer,
  p_turn_seq integer,
  p_turn_no integer,
  p_asked_layer text,
  p_probe_kind text,
  p_local_gate text,
  p_model_layer text,
  p_verdict text,
  p_final_credit boolean,
  p_rule_set text,
  p_vendor text,
  p_opener_unedited boolean,
  p_openers_offered integer,
  p_answer_len_bucket integer,
  p_answer_digest text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  -- 한 세션의 원장 상한. 하루 판정 몫이 먼저 끊으므로 정상 대화는 닿지 않는다.
  c_max_rows constant integer := 2000;
  v_session public.interview_sessions%ROWTYPE;
  v_existing public.interview_probe_verdicts%ROWTYPE;
  v_max_scene integer;
  v_rows integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_audit_id IS NULL OR p_session_id IS NULL
     OR p_period IS NULL OR p_period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR p_locale IS NULL OR p_locale NOT IN ('ko', 'en')
     OR p_scene_seq IS NULL OR p_scene_seq NOT BETWEEN 1 AND 10000
     OR p_turn_seq IS NULL OR p_turn_seq NOT BETWEEN 1 AND 10000
     OR p_turn_no IS NULL OR p_turn_no NOT BETWEEN 1 AND 4000
     OR (p_asked_layer IS NOT NULL AND p_asked_layer NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
     OR p_probe_kind IS NULL
     OR p_probe_kind NOT IN ('seed', 'drill', 'scaffold', 'confirm', 'loop_check', 'switch_offer', 'fallback')
     OR p_local_gate IS NULL OR p_local_gate NOT IN ('pass', 'short', 'non_answer', 'mismatch', 'unverified')
     OR (p_model_layer IS NOT NULL AND p_model_layer NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
     OR p_verdict IS NULL OR p_verdict NOT IN ('credited', 'none', 'other_layer', 'no_verdict', 'unasked', 'error')
     OR p_final_credit IS NULL
     OR p_rule_set IS NULL
     OR p_vendor IS NULL OR p_vendor NOT IN ('openai', 'claude')
     OR p_opener_unedited IS NULL
     OR (p_openers_offered IS NOT NULL AND p_openers_offered NOT BETWEEN 0 AND 2)
     OR (p_answer_len_bucket IS NOT NULL AND p_answer_len_bucket NOT BETWEEN 0 AND 3)
     OR (p_answer_digest IS NOT NULL AND p_answer_digest !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'interview_verdict_invalid' USING ERRCODE = '22023';
  END IF;
  -- 기준선 동안 규칙 판은 r0 하나다(설계 T-11). r0 의 최종 인정 = credited AND pass(continuity.ts).
  IF p_rule_set <> 'r0' THEN
    RAISE EXCEPTION 'interview_rule_set_locked' USING ERRCODE = '22023';
  END IF;
  IF p_final_credit IS DISTINCT FROM (p_verdict = 'credited' AND p_local_gate = 'pass') THEN
    RAISE EXCEPTION 'interview_final_credit_mismatch' USING ERRCODE = '22023';
  END IF;
  -- 인정은 모델이 질문 층을 말했을 때만이다. NULL 층의 credited 는 CHECK 에 닿기 전에 거절한다(D6-59).
  IF p_verdict = 'credited'
     AND (p_asked_layer IS NULL OR p_model_layer IS NULL OR p_model_layer <> p_asked_layer) THEN
    RAISE EXCEPTION 'interview_verdict_invalid' USING ERRCODE = '22023';
  END IF;
  -- 계정이 지워지는 중이거나 지워졌으면 아무것도 만들지 않는다(D6-04).
  IF NOT public.interview_account_writable(p_user_id) THEN
    RETURN 'no_account';
  END IF;
  -- 감사 행 결속(D6-01). 남의 감사 행이면 적지도 비우지도 않는다.
  IF NOT EXISTS (SELECT 1 FROM public.ai_audit_log AS a
                  WHERE a.id = p_audit_id AND a.user_id = p_user_id
                    AND a.purpose = 'interview_probe' AND a.event_source = 'server_verified') THEN
    RETURN 'audit_mismatch';
  END IF;
  -- 같은 감사 행으로 두 번 온 호출(프록시 재시도). 첫 결과만 남긴다.
  IF EXISTS (SELECT 1 FROM public.interview_session_audit_ids AS i WHERE i.audit_id = p_audit_id) THEN
    RETURN 'duplicate';
  END IF;

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    -- 이미 접힌 세션(버리기 · 유휴 정리 · 레코드 삭제)에 늦게 온 호출. 다시 만들지 않는다(D6-55).
    IF EXISTS (SELECT 1 FROM public.interview_session_tombstones AS t WHERE t.session_id = p_session_id) THEN
      PERFORM public.erase_audit_hashes(p_user_id, ARRAY[p_audit_id], 'interview_probe');
      RETURN 'session_closed';
    END IF;
    INSERT INTO public.interview_sessions AS s (id, owner_id, period, locale, vendor)
    VALUES (p_session_id, p_user_id, p_period, p_locale, p_vendor)
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO v_session
      FROM public.interview_sessions AS s
     WHERE s.id = p_session_id
     FOR UPDATE;
  END IF;
  IF v_session.owner_id IS DISTINCT FROM p_user_id THEN
    PERFORM public.erase_audit_hashes(p_user_id, ARRAY[p_audit_id], 'interview_probe');
    RETURN 'session_not_owned';
  END IF;

  -- 여기부터 이 감사 id 는 이 세션의 것이다. 아래에서 거절해도 세션을 접을 때 함께 비운다(D6-54).
  INSERT INTO public.interview_session_audit_ids AS i (audit_id, session_id)
  VALUES (p_audit_id, p_session_id)
  ON CONFLICT (audit_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;
  IF v_session.committed_at IS NOT NULL THEN
    RETURN 'session_committed';
  END IF;
  IF v_session.period <> p_period OR v_session.locale <> p_locale THEN
    RETURN 'session_mismatch';
  END IF;

  -- 같은 턴의 재호출은 장면이 거꾸로 간 것이 아니다. 먼저 찾아 바꾼다(장면 번호는 바뀌지 않는다).
  SELECT * INTO v_existing
    FROM public.interview_probe_verdicts AS v
   WHERE v.session_id = p_session_id AND v.turn_no = p_turn_no
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.source <> 'proxy' THEN
      RETURN 'session_committed';
    END IF;
    IF v_existing.scene_seq <> p_scene_seq THEN
      RETURN 'scene_regressed';
    END IF;
    -- 닫힌 뒤의 재시도는 호출 수만 센다. 화면이 닫을 때 본 판정과 그 시각이 칸을 정한다(D6-56).
    IF v_session.ended_at IS NOT NULL THEN
      UPDATE public.interview_probe_verdicts AS v
         SET call_count = LEAST(v.call_count + 1, 50)
       WHERE v.id = v_existing.id;
      RETURN 'session_closed';
    END IF;
    UPDATE public.interview_probe_verdicts AS v
       SET prior_audit_ids = CASE WHEN v.audit_id IS NULL THEN v.prior_audit_ids
                                  ELSE v.prior_audit_ids || v.audit_id END,
           audit_id = p_audit_id,
           scene_seq = p_scene_seq,
           turn_seq = p_turn_seq,
           asked_layer = p_asked_layer,
           probe_kind = p_probe_kind,
           local_gate = p_local_gate,
           model_layer = p_model_layer,
           verdict = p_verdict,
           final_credit = p_final_credit,
           rule_set = p_rule_set,
           vendor = p_vendor,
           opener_unedited = p_opener_unedited,
           openers_offered = p_openers_offered,
           answer_len_bucket = p_answer_len_bucket,
           answer_digest = p_answer_digest,
           call_count = LEAST(v.call_count + 1, 50),
           created_at = pg_catalog.now()
     WHERE v.id = v_existing.id;
    UPDATE public.interview_sessions AS s SET last_seen_at = pg_catalog.now() WHERE s.id = p_session_id;
    RETURN 'replaced';
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
    session_id, audit_id, scene_seq, turn_seq, turn_no, asked_layer, probe_kind, local_gate,
    model_layer, verdict, final_credit, rule_set, source, vendor, opener_unedited,
    openers_offered, answer_len_bucket, answer_digest
  ) VALUES (
    p_session_id, p_audit_id, p_scene_seq, p_turn_seq, p_turn_no, p_asked_layer, p_probe_kind, p_local_gate,
    p_model_layer, p_verdict, p_final_credit, p_rule_set, 'proxy', p_vendor, p_opener_unedited,
    p_openers_offered, p_answer_len_bucket, p_answer_digest
  );

  UPDATE public.interview_sessions AS s
     SET last_seen_at = pg_catalog.now(),
         vendor = COALESCE(s.vendor, p_vendor)
   WHERE s.id = p_session_id;
  RETURN 'recorded';
END;
$$;

----------------------------------------------------------------------
-- 5. 세션 닫기 · 버리기 (화면, authenticated)
----------------------------------------------------------------------
-- 종료 사유는 클라이언트가 보고한 값이다(속일 수 있다). 판정 호출이 한 번도 없던 대화는 세션 행이
-- 없으므로 여기서 만든다. 한 시간에 새 세션 30개를 넘게 만들지는 못한다 - 남은 세션 행이 아니라
-- 만든 횟수(interview_session_starts)를 센다. 버리기가 행을 지워도 되감기지 않는다(D6-58).
-- 이미 접힌 세션 id 는 다시 만들지 않는다(D6-55). 처음 적힌 사유가 이긴다.
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
SET row_security = off
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
       'verdict_exhausted', 'switch_declined', 'no_question', 'day_limit', 'crisis', 'error', 'left')
     OR p_local_blocks IS NULL OR p_local_blocks NOT BETWEEN 0 AND 10000
     OR p_scaffolds IS NULL OR p_scaffolds NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'interview_session_close_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_polaris_account_active(v_uid);

  -- 같은 사용자의 새 세션 만들기를 줄 세운다(셈과 삽입 사이의 경합).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('interview_session_close:' || v_uid::text, 0));

  IF NOT EXISTS (SELECT 1 FROM public.interview_sessions AS s WHERE s.id = p_session_id) THEN
    IF EXISTS (SELECT 1 FROM public.interview_session_tombstones AS t WHERE t.session_id = p_session_id) THEN
      RETURN 'not_found';
    END IF;
    IF (SELECT COALESCE(pg_catalog.sum(c.created), 0) FROM public.interview_session_starts AS c
         WHERE c.owner_id = v_uid
           AND c.bucket_start > pg_catalog.now() - INTERVAL '1 hour') >= c_new_sessions_per_hour THEN
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
  -- 남의 세션은 없는 것과 같게 답한다.
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

-- 화면이 저장 없이 떠날 때 바로 접는다(저장 안 한 대화는 다시 담을 수 없다).
CREATE OR REPLACE FUNCTION public.discard_interview_session(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'interview_session_discard_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND OR v_session.owner_id IS DISTINCT FROM v_uid THEN
    RETURN 'not_found';
  END IF;
  IF v_session.committed_at IS NOT NULL THEN
    RETURN 'already_committed';
  END IF;
  PERFORM public.fold_interview_session(p_session_id, 'discarded');
  RETURN 'discarded';
END;
$$;

----------------------------------------------------------------------
-- 6. 담기 (화면, authenticated) -- 대화록을 쓰고 칸은 원장에서 계산한다
----------------------------------------------------------------------
-- p_turns: [{n, role, scene, layer, ask_kind, origin, text, opener_unedited, state}], n 은 1부터 빈틈없이.
-- state 는 답 턴만: judged · unsettled · local_block · control.
--   1. 세션(자기 것 · 아직 안 담음)을 잠근다. 세션 행이 없으면(판정 호출 없이 닫지도 않음 · 유휴로
--      이미 접힘) 레코드 확인을 통과할 때 새로 만들고, 답 턴은 전부 클라이언트 행이 된다.
--   2. 레코드: 자기 것 · audit_response · system_tags 에 interview · 세션 시기 ·
--      client_request_id = 'interview:' || 세션. tags(사용자 태그)는 읽지 않는다(0218).
--   3. 턴을 검사하고, 렌더링한 본문이 records.body 와 바이트 단위로 같은지 본다(원문 두 벌 대조, Q3).
--   4. 대화록 머리 · 턴을 쓴다.
--   5. 답 턴마다 판정 행 정확히 하나: 프록시 행이면 답 해시를 대조해 linked · text_mismatch ·
--      undelivered 로 붙이고 해시를 비운다. 없으면 클라이언트 행(local_block · control · error ·
--      unrecorded)을 넣는다. 대화록에 없는 턴의 프록시 행은 orphan.
--   6. 칸: final_credit AND linked 인 행을 장면마다 층당 1 로 interview_coverage 에 원자적으로 더한다.
--      hold 면 더하지 않는다(지금 화면이 저장 시 red 면 칸을 안 쓰는 것과 같다).
--   7. 끝에서 판정 행 수 = 답 턴 수를 확인한다(완료조건 1 의 서버 쪽 불변식).
-- hold(D6-03, 최소 보수 조치): 화면이 보낸 p_crisis_hold 를 서버가 내리지는 않는다. 이 세션의 감사 행
-- 중 프록시가 red 로 적은 것이 있으면 화면이 false 를 보내도 올린다. hold 는 머리와 모든 턴에 같이 적는다.
-- 동시에 온 첫 담기 둘(세션 행 없음)은 한쪽이 세션을 만들고 다른 쪽은 그 잠금 뒤에서 already_committed
-- 를 받는다(D6-57: 일반 INSERT 의 23505 대신).
CREATE OR REPLACE FUNCTION public.commit_interview_session(
  p_session_id uuid,
  p_record_id uuid,
  p_turns jsonb,
  p_crisis_hold boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.interview_sessions%ROWTYPE;
  v_record_body text;
  v_record_period text;
  v_count integer;
  v_turn jsonb;
  v_i integer;
  v_role text;
  v_state text;
  v_text text;
  v_locale text;
  v_transcript uuid;
  v_existing public.interview_probe_verdicts%ROWTYPE;
  v_digest text;
  v_prev_ask text;
  v_scene integer;
  v_last_scene integer := 0;
  v_turn_seq integer := 0;
  v_user_turns integer := 0;
  v_rows integer;
  v_proxy integer;
  v_mismatch integer;
  v_orphans integer;
  v_cells integer := 0;
  v_created boolean := false;
  v_hold boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_record_id IS NULL OR p_crisis_hold IS NULL
     OR p_turns IS NULL OR pg_catalog.jsonb_typeof(p_turns) <> 'array' THEN
    RAISE EXCEPTION 'interview_session_commit_invalid' USING ERRCODE = '22023';
  END IF;
  v_count := pg_catalog.jsonb_array_length(p_turns);
  IF v_count NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'interview_session_commit_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_polaris_account_active(v_uid);

  SELECT * INTO v_session
    FROM public.interview_sessions AS s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_session.owner_id IS DISTINCT FROM v_uid THEN
      RETURN pg_catalog.jsonb_build_object('status', 'not_found');
    END IF;
    IF v_session.committed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'already_committed', 'record_id', v_session.record_id);
    END IF;
  END IF;

  SELECT r.body, r.audit_period INTO v_record_body, v_record_period
    FROM public.records AS r
   WHERE r.id = p_record_id
     AND r.user_id = v_uid
     AND r.kind::text = 'audit_response'
     AND r.system_tags @> ARRAY['interview']::text[]
     AND r.client_request_id = 'interview:' || p_session_id::text
   FOR SHARE;
  IF NOT FOUND
     OR v_record_period IS NULL
     OR v_record_period NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR (v_session.id IS NOT NULL AND v_record_period <> v_session.period) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'record_mismatch');
  END IF;

  -- 턴 검사. 어긋나면 아무것도 쓰지 않는다.
  FOR v_i IN 0 .. v_count - 1 LOOP
    v_turn := p_turns -> v_i;
    IF pg_catalog.jsonb_typeof(v_turn) <> 'object'
       OR pg_catalog.jsonb_typeof(v_turn -> 'n') <> 'number'
       OR (v_turn ->> 'n') !~ '^[0-9]{1,4}$' OR (v_turn ->> 'n')::integer <> v_i + 1
       OR pg_catalog.jsonb_typeof(v_turn -> 'scene') <> 'number'
       OR (v_turn ->> 'scene') !~ '^[0-9]{1,5}$' OR (v_turn ->> 'scene')::integer NOT BETWEEN 1 AND 10000
       OR pg_catalog.jsonb_typeof(v_turn -> 'text') <> 'string'
       OR pg_catalog.char_length(v_turn ->> 'text') NOT BETWEEN 1 AND 8000
       OR (v_turn ? 'layer' AND pg_catalog.jsonb_typeof(v_turn -> 'layer') <> 'null'
           AND (v_turn ->> 'layer') NOT IN ('fact', 'feeling', 'meaning', 'belief', 'echo'))
       OR (v_turn ? 'ask_kind' AND pg_catalog.jsonb_typeof(v_turn -> 'ask_kind') <> 'null'
           AND (v_turn ->> 'ask_kind') NOT IN ('seed', 'drill', 'scaffold', 'confirm', 'loop_check', 'switch_offer', 'fallback')) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
    END IF;
    v_role := v_turn ->> 'role';
    IF v_role = 'interviewer' THEN
      IF (v_turn ->> 'origin') IS NULL OR (v_turn ->> 'origin') NOT IN ('model', 'fixed')
         OR (v_turn ? 'opener_unedited' AND pg_catalog.jsonb_typeof(v_turn -> 'opener_unedited') <> 'null')
         OR (v_turn ? 'state' AND pg_catalog.jsonb_typeof(v_turn -> 'state') <> 'null') THEN
        RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
      END IF;
    ELSIF v_role = 'user' THEN
      IF (v_turn ->> 'origin') IS DISTINCT FROM 'user'
         OR (v_turn ->> 'state') IS NULL
         OR (v_turn ->> 'state') NOT IN ('judged', 'unsettled', 'local_block', 'control')
         OR (v_turn ? 'opener_unedited' AND pg_catalog.jsonb_typeof(v_turn -> 'opener_unedited') NOT IN ('boolean', 'null'))
         OR (v_turn ? 'ask_kind' AND pg_catalog.jsonb_typeof(v_turn -> 'ask_kind') <> 'null') THEN
        RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
      END IF;
    ELSE
      RETURN pg_catalog.jsonb_build_object('status', 'turns_invalid', 'at', v_i + 1);
    END IF;
  END LOOP;

  -- 원문 두 벌 대조: 렌더링한 본문이 레코드 본문과 같은 바이트여야 한다.
  IF v_record_body = public.interview_transcript_body('ko', p_turns) THEN
    v_locale := 'ko';
  ELSIF v_record_body = public.interview_transcript_body('en', p_turns) THEN
    v_locale := 'en';
  END IF;
  IF v_locale IS NULL OR (v_session.id IS NOT NULL AND v_locale <> v_session.locale) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'transcript_mismatch');
  END IF;

  IF v_session.id IS NULL THEN
    -- 처음 보는 세션. 동시에 온 다른 담기가 먼저 만들었을 수 있으므로 충돌을 받아 넘기고,
    -- 그 잠금 뒤에서 소유자 · 담기 여부 · 시기 · 언어를 다시 본다(D6-57).
    INSERT INTO public.interview_sessions AS s (id, owner_id, period, locale)
    VALUES (p_session_id, v_uid, v_record_period, v_locale)
    ON CONFLICT (id) DO NOTHING;
    v_created := FOUND;
    SELECT * INTO v_session FROM public.interview_sessions AS s WHERE s.id = p_session_id FOR UPDATE;
    IF NOT FOUND OR v_session.owner_id IS DISTINCT FROM v_uid THEN
      RETURN pg_catalog.jsonb_build_object('status', 'not_found');
    END IF;
    IF v_session.committed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'already_committed', 'record_id', v_session.record_id);
    END IF;
    IF v_session.period <> v_record_period THEN
      RETURN pg_catalog.jsonb_build_object('status', 'record_mismatch');
    END IF;
    IF v_session.locale <> v_locale THEN
      RETURN pg_catalog.jsonb_build_object('status', 'transcript_mismatch');
    END IF;
  END IF;

  v_hold := p_crisis_hold
    OR EXISTS (SELECT 1
                 FROM public.interview_session_audit_ids AS i
                 JOIN public.ai_audit_log AS a ON a.id = i.audit_id
                WHERE i.session_id = p_session_id AND a.user_id = v_uid AND a.safety_zone = 'red');

  INSERT INTO public.interview_transcripts AS t (user_id, session_id, record_id, period, locale, turn_count, ai_hold)
  VALUES (v_uid, p_session_id, p_record_id, v_session.period, v_locale, v_count, v_hold)
  RETURNING t.id INTO v_transcript;

  INSERT INTO public.interview_transcript_turns AS tt (
    transcript_id, user_id, turn_no, role, scene_seq, asked_layer, origin, ask_kind, opener_unedited, text, ai_hold)
  SELECT v_transcript, v_uid, (e.value ->> 'n')::integer, e.value ->> 'role', (e.value ->> 'scene')::integer,
         e.value ->> 'layer', e.value ->> 'origin', e.value ->> 'ask_kind',
         CASE WHEN e.value ->> 'role' = 'user' THEN (e.value ->> 'opener_unedited')::boolean END,
         e.value ->> 'text', v_hold
    FROM pg_catalog.jsonb_array_elements(p_turns) AS e(value);

  -- 판정 행 맞추기: 답 턴마다 정확히 한 행.
  FOR v_turn IN
    SELECT e.value FROM pg_catalog.jsonb_array_elements(p_turns) AS e(value)
     ORDER BY (e.value ->> 'n')::integer
  LOOP
    v_role := v_turn ->> 'role';
    IF v_role = 'interviewer' THEN
      v_prev_ask := v_turn ->> 'ask_kind';
      CONTINUE;
    END IF;
    v_user_turns := v_user_turns + 1;
    v_scene := (v_turn ->> 'scene')::integer;
    IF v_scene <> v_last_scene THEN
      v_turn_seq := 0;
      v_last_scene := v_scene;
    END IF;
    v_turn_seq := v_turn_seq + 1;
    v_state := v_turn ->> 'state';
    v_text := v_turn ->> 'text';

    SELECT * INTO v_existing
      FROM public.interview_probe_verdicts AS v
     WHERE v.session_id = p_session_id AND v.turn_no = (v_turn ->> 'n')::integer
     FOR UPDATE;
    IF FOUND THEN
      v_digest := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        p_session_id::text || ':' || (v_turn ->> 'n') || ':' || v_text, 'UTF8')), 'hex');
      UPDATE public.interview_probe_verdicts AS v
         SET transcript_id = v_transcript,
             answer_digest = NULL,
             link_state = CASE
               WHEN v_state = 'unsettled' THEN 'undelivered'
               WHEN v_existing.answer_digest IS NOT NULL AND v_existing.answer_digest = v_digest THEN 'linked'
               ELSE 'text_mismatch' END
       WHERE v.id = v_existing.id;
    ELSE
      INSERT INTO public.interview_probe_verdicts AS v (
        session_id, scene_seq, turn_seq, turn_no, transcript_id, asked_layer, probe_kind,
        verdict, final_credit, rule_set, source, link_state, opener_unedited)
      VALUES (
        p_session_id, v_scene, LEAST(v_turn_seq, 10000), (v_turn ->> 'n')::integer, v_transcript,
        v_turn ->> 'layer', v_prev_ask,
        CASE v_state WHEN 'local_block' THEN 'local_block' WHEN 'control' THEN 'control'
                     WHEN 'unsettled' THEN 'error' ELSE 'unrecorded' END,
        false, 'r0', 'client', 'linked', (v_turn ->> 'opener_unedited')::boolean);
    END IF;
  END LOOP;

  -- 대화록에 붙지 않은 프록시 행(화면이 버린 늦은 응답, 질문 턴을 가리킨 행)은 orphan.
  UPDATE public.interview_probe_verdicts AS v
     SET link_state = 'orphan', answer_digest = NULL
   WHERE v.session_id = p_session_id AND v.transcript_id IS NULL;
  GET DIAGNOSTICS v_orphans = ROW_COUNT;

  SELECT pg_catalog.count(*)::integer,
         pg_catalog.count(*) FILTER (WHERE v.source = 'proxy')::integer,
         pg_catalog.count(*) FILTER (WHERE v.link_state = 'text_mismatch')::integer
    INTO v_rows, v_proxy, v_mismatch
    FROM public.interview_probe_verdicts AS v
   WHERE v.transcript_id = v_transcript;
  IF v_rows <> v_user_turns THEN
    RAISE EXCEPTION 'interview_ledger_turn_count % <> %', v_rows, v_user_turns USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_hold THEN
    WITH credited AS (
      SELECT v.asked_layer AS layer, pg_catalog.count(DISTINCT v.scene_seq)::integer AS scenes
        FROM public.interview_probe_verdicts AS v
       WHERE v.transcript_id = v_transcript
         AND v.final_credit
         AND v.link_state = 'linked'
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
  END IF;

  UPDATE public.interview_sessions AS s
     SET committed_at = pg_catalog.now(),
         record_id = p_record_id,
         last_seen_at = pg_catalog.now()
   WHERE s.id = p_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'committed',
    'session_created', v_created,
    'ai_hold', v_hold,
    'user_turns', v_user_turns,
    'ledger_rows', v_rows,
    'proxy_rows', v_proxy,
    'cells_added', v_cells,
    'mismatches', v_mismatch,
    'orphans', v_orphans);
END;
$$;

----------------------------------------------------------------------
-- 7. 저장 안 한 세션 정리 (pg_cron · service_role)
----------------------------------------------------------------------
-- 마지막 활동에서 6시간이 지나도 담지 않은 세션을 접는다(Q6). 두 시간이 지난 세션 생성 칸도 지운다
-- (상한은 한 시간만 본다).
CREATE OR REPLACE FUNCTION public.sweep_interview_sessions(p_batch integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  c_idle constant interval := INTERVAL '6 hours';
  v_role text := public.billing_request_role();
  v_batch integer := LEAST(GREATEST(COALESCE(p_batch, 5000), 1), 50000);
  v_id uuid;
  v_n integer := 0;
BEGIN
  -- pg_cron(JWT 없음)과 service_role 만. authenticated · anon 은 EXECUTE 도 없다.
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  FOR v_id IN
    SELECT s.id
      FROM public.interview_sessions AS s
     WHERE s.committed_at IS NULL
       AND s.last_seen_at < pg_catalog.now() - c_idle
     ORDER BY s.last_seen_at
     LIMIT v_batch
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.fold_interview_session(v_id, 'left');
    v_n := v_n + 1;
  END LOOP;
  DELETE FROM public.interview_session_starts AS c
   WHERE c.bucket_start < pg_catalog.now() - INTERVAL '2 hours';
  RETURN v_n;
END;
$$;

----------------------------------------------------------------------
-- 8. 레코드를 지우면 (D5)
----------------------------------------------------------------------
-- 승인 카드 지우기의 공용 몸통(D6-07 · D6-53). 부르는 쪽이 'period_card:' 사용자 잠금을 쥐고 있어야 한다.
--   ① 지울 카드를 가리키는 남는 카드(superseded_by)를 다음 생존 카드로 옮긴다. 한 별의 승인 이력은
--      A → B → C 한 줄이라, 가운데 B 를 지울 때 A 를 C 에 다시 잇지 않으면 FK 의 SET NULL 이 A 를
--      '지금 카드'로 되돌려 C 와 함께 유니크 색인(period_card_current_ratified)에 걸린다. 뒤의 카드가 모두
--      지워지면 그대로 두어, ③ 의 SET NULL 이 그 카드를 지금 카드로 되돌린다(복원 규칙: 지금 카드를
--      지우면 직전에 승인한 카드가 다시 선다. 그 카드의 L5 행은 그대로라 밝기도 그대로다).
--   ② 그 카드가 승인 때 쓴 star_tier_history 'ratify' L5 행을 지운다. 연결 열이 없으므로 decide_period_card
--      가 같은 값으로 쓴 (별, 근거 배열, 시각 = decided_at)으로 찾는다.
--   ③ 카드 행을 지운다.
CREATE OR REPLACE FUNCTION public.period_card_remove(p_user_id uuid, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_steps integer := 0;
  v_n integer;
BEGIN
  IF p_user_id IS NULL OR p_ids IS NULL OR pg_catalog.cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  LOOP
    UPDATE public.period_card_proposals AS p
       SET superseded_by = n.superseded_by
      FROM public.period_card_proposals AS n
     WHERE p.user_id = p_user_id
       AND n.user_id = p_user_id
       AND p.superseded_by = n.id
       AND n.id = ANY (p_ids)
       AND n.superseded_by IS NOT NULL
       AND NOT (p.id = ANY (p_ids));
    EXIT WHEN NOT FOUND;
    v_steps := v_steps + 1;
    IF v_steps > 64 THEN
      RAISE EXCEPTION 'period_card_chain_too_long' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  DELETE FROM public.star_tier_history AS h
   USING public.period_card_proposals AS p
   WHERE p.id = ANY (p_ids)
     AND p.user_id = p_user_id
     AND p.status = 'ratified'
     AND h.user_id = p_user_id
     AND h.star_id = 'seven:' || p.star_id
     AND h.evidence_origin = 'ratify'
     AND h.level = 5
     AND h.recorded_at = p.decided_at
     AND h.evidence_citations = p.evidence_cited;

  DELETE FROM public.period_card_proposals AS p
   WHERE p.id = ANY (p_ids) AND p.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- 인터뷰 레코드를 지우면 그 세션의 판정 행을 집계로 접고(outcome deleted_after_save), 감사 행 해시를
-- 비우고, 판정 · 세션 행을 지운다(대화록은 세션 · 레코드 FK 연쇄로 지워진다). 그 레코드를 인용한
-- 시기 카드는 결정 전이면 void, 승인이면 행을 지우고 그 카드가 만든 star_tier_history 'ratify' 행도
-- 지운다(Q5 기본값: 카드 · L5 는 지우고 칸은 그대로). 계정 삭제 중에는 연쇄가 전부 지우므로 접지 않는다.
-- 승인(decide_period_card)과 같은 'period_card:' 사용자 잠금을 잡고 시작한다(D6-51): 승인이 근거를 다시
-- 확인하고 L5 를 쓰는 동안 근거 삭제가 끼어들지 못하고, 늦게 들어온 쪽은 앞쪽이 커밋한 결과를 본다.
-- 잠금 순서: 이 트리거는 레코드 행 잠금 뒤에 사용자 잠금을 잡는다. 사용자 잠금을 쥐는 쪽(제안 기록 ·
-- 승인 · 카드 지우기)은 레코드 행을 잠그지 않으므로 순환이 생기지 않는다.
-- 트리거로만 돈다. 파일 끝에서 모든 역할의 EXECUTE 를 걷는다.
CREATE OR REPLACE FUNCTION public.interview_record_erasure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session uuid;
  v_prefix text := 'record:' || OLD.id::text;
  v_cards uuid[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.account_deletion_tombstones AS t WHERE t.user_id = OLD.user_id)
     OR NOT EXISTS (SELECT 1 FROM public.users AS u WHERE u.id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('period_card:' || OLD.user_id::text));

  FOR v_session IN
    SELECT s.id FROM public.interview_sessions AS s WHERE s.record_id = OLD.id
  LOOP
    PERFORM public.fold_interview_session(v_session, 'deleted_after_save');
  END LOOP;

  DELETE FROM public.star_tier_history AS h
   WHERE h.user_id = OLD.user_id
     AND h.evidence_origin = 'ratify'
     AND h.star_id LIKE 'seven:%'
     AND EXISTS (SELECT 1 FROM pg_catalog.unnest(h.evidence_citations) AS c(ref)
                  WHERE c.ref = v_prefix OR c.ref LIKE v_prefix || '#%');
  SELECT pg_catalog.array_agg(p.id) INTO v_cards
    FROM public.period_card_proposals AS p
   WHERE p.user_id = OLD.user_id
     AND p.status = 'ratified'
     AND EXISTS (SELECT 1 FROM pg_catalog.unnest(p.evidence_cited) AS c(ref) WHERE c.ref LIKE v_prefix || '#%');
  PERFORM public.period_card_remove(OLD.user_id, v_cards);
  UPDATE public.period_card_proposals AS p
     SET status = 'void', decided_at = pg_catalog.now()
   WHERE p.user_id = OLD.user_id
     AND p.status = 'proposed'
     AND EXISTS (SELECT 1 FROM pg_catalog.unnest(p.evidence_sent) AS c(ref) WHERE c.ref LIKE v_prefix || '#%');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS interview_record_erasure ON public.records;
CREATE TRIGGER interview_record_erasure
  BEFORE DELETE ON public.records
  FOR EACH ROW WHEN (OLD.kind = 'audit_response')
  EXECUTE FUNCTION public.interview_record_erasure();

-- 응답 블록 id(D6-05): 지운 레코드(종류 무관)의 id 를 실은 행을 지운다. 문장 단위 한 번에 지운 행
-- 전체를 본다(삭제가 수천 행이어도 사용자 블록 행을 한 번만 훑는다).
CREATE OR REPLACE FUNCTION public.ai_context_block_record_erasure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  DELETE FROM public.ai_audit_context_blocks AS b
   WHERE b.user_id IN (SELECT DISTINCT g.user_id FROM gone AS g)
     AND EXISTS (SELECT 1
                   FROM pg_catalog.unnest(b.block_ids) AS x(id)
                   JOIN gone AS g ON g.user_id = b.user_id
                  WHERE x.id = 'record:' || g.id::text OR x.id LIKE 'record:' || g.id::text || '#%');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ai_context_block_record_erasure ON public.records;
CREATE TRIGGER ai_context_block_record_erasure
  AFTER DELETE ON public.records
  REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT EXECUTE FUNCTION public.ai_context_block_record_erasure();

-- 승인 카드는 클라이언트 역할이 직접 지우지 못한다(D6-07). 체인 재연결 · L5 정리를 하는
-- delete_period_card 로 지운다. 정의자 함수(삭제 등록부 erase_my_data · 레코드 삭제 트리거 ·
-- 계정 연쇄)는 그 함수의 소유자로 돌므로 막히지 않는다. 결정 전 · 거절 · 빗나간 곳 · 만료 · void 행은
-- 체인도 L5 도 없어 직접 지워도 된다. 정의자 함수가 아니다 - current_user 가 지우는 역할이어야 한다.
CREATE OR REPLACE FUNCTION public.period_card_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'period_card_delete_via_rpc' USING ERRCODE = '42501',
      HINT = 'a ratified card is deleted with delete_period_card()';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS period_card_delete_guard ON public.period_card_proposals;
CREATE TRIGGER period_card_delete_guard
  BEFORE DELETE ON public.period_card_proposals
  FOR EACH ROW WHEN (OLD.status = 'ratified')
  EXECUTE FUNCTION public.period_card_delete_guard();

----------------------------------------------------------------------
-- 9. 시기 카드 제안 (프록시 전용, service_role)
----------------------------------------------------------------------
-- p_sent: [{ref: 'record:<uuid>#t<n>', len, sha256}] -- 프록시가 전달할 user 프롬프트 안에서 확인한
-- 표식만. 서버는 각 ref 가 자기 레코드 · audit_response · system_tags interview · 그 별의 시기 ·
-- 대화록 답 턴 · ai_hold 아님인지 보고, sha256(left(턴 원문, len)) 이 보낸 해시와 같은지(발췌 해시,
-- Q9 B) 대조해 통과한 것만 남긴다. len 은 유니코드 코드 포인트 수다. p_cited 는 모델이 인용한 것.
-- 'record:<uuid>' 처럼 턴 없이 인용하면 그 레코드의 남은 턴 전부로 펼친다. 인용 ∩ 보낸 것이 비면
-- 행을 만들지 않는다.
-- 계정 울타리(0192 공유 잠금 · tombstone, D6-04)를 지나고, 감사 행이 이 사용자 · self_model_propose ·
-- server_verified 인지 확인한다(D6-01, 감사 id 필수). 근거를 확인하기 전에 'period_card:' 사용자 잠금을
-- 잡아, 그 사이에 근거 레코드가 지워지면 둘 중 늦은 쪽이 앞쪽 결과를 보게 한다(D6-51).
CREATE OR REPLACE FUNCTION public.record_period_card_proposal(
  p_user_id uuid,
  p_audit_id uuid,
  p_vendor text,
  p_star text,
  p_request_key text,
  p_proposal_text text,
  p_rationale text,
  p_sent jsonb,
  p_cited text[],
  p_level_before integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_item jsonb;
  v_ref text;
  v_record uuid;
  v_turn_no integer;
  v_len integer;
  v_sent text[] := '{}';
  v_cited text[] := '{}';
  v_c text;
  v_sha text;
  v_id uuid;
  v_existing public.period_card_proposals%ROWTYPE;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_audit_id IS NULL
     OR p_vendor IS NULL OR p_vendor NOT IN ('openai', 'claude')
     OR p_star IS NULL OR p_star NOT IN ('infancy', 'school', 'twenties', 'later', 'work', 'now')
     OR p_request_key IS NULL OR pg_catalog.char_length(p_request_key) NOT BETWEEN 8 AND 120
     OR p_proposal_text IS NULL OR pg_catalog.char_length(p_proposal_text) NOT BETWEEN 1 AND 280
     OR (p_rationale IS NOT NULL AND pg_catalog.char_length(p_rationale) > 600)
     OR p_sent IS NULL OR pg_catalog.jsonb_typeof(p_sent) <> 'array'
     OR pg_catalog.jsonb_array_length(p_sent) NOT BETWEEN 1 AND 40
     OR p_cited IS NULL OR pg_catalog.cardinality(p_cited) NOT BETWEEN 1 AND 40
     OR p_level_before IS NULL OR p_level_before NOT BETWEEN 0 AND 5 THEN
    RAISE EXCEPTION 'period_card_proposal_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT public.interview_account_writable(p_user_id) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'no_account');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_audit_log AS a
                  WHERE a.id = p_audit_id AND a.user_id = p_user_id
                    AND a.purpose = 'self_model_propose' AND a.event_source = 'server_verified') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'audit_mismatch');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('period_card:' || p_user_id::text));

  FOR v_item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_sent) AS e(value) LOOP
    v_ref := v_item ->> 'ref';
    IF v_ref IS NULL OR v_ref !~ '^record:[0-9a-f-]{36}#t[0-9]{1,4}$'
       OR pg_catalog.jsonb_typeof(v_item -> 'len') <> 'number' OR (v_item ->> 'len') !~ '^[0-9]{1,4}$'
       OR (v_item ->> 'sha256') IS NULL OR (v_item ->> 'sha256') !~ '^[0-9a-f]{64}$' THEN
      CONTINUE;
    END IF;
    v_record := pg_catalog.substring(v_ref, '^record:([0-9a-f-]{36})#')::uuid;
    v_turn_no := pg_catalog.substring(v_ref, '#t([0-9]{1,4})$')::integer;
    v_len := (v_item ->> 'len')::integer;
    IF v_len < 1 OR v_ref = ANY (v_sent) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.interview_transcript_turns AS tt
        JOIN public.interview_transcripts AS tr ON tr.id = tt.transcript_id
        JOIN public.records AS r ON r.id = tr.record_id
       WHERE tr.record_id = v_record
         AND tr.user_id = p_user_id
         AND r.user_id = p_user_id
         AND r.kind::text = 'audit_response'
         AND r.system_tags @> ARRAY['interview']::text[]
         AND r.audit_period = p_star
         AND tr.period = p_star
         AND NOT tr.ai_hold
         AND tt.turn_no = v_turn_no
         AND tt.role = 'user'
         AND NOT tt.ai_hold
         AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
               pg_catalog.left(tt.text, v_len), 'UTF8')), 'hex') = (v_item ->> 'sha256')
    ) THEN
      v_sent := v_sent || v_ref;
    END IF;
  END LOOP;
  IF pg_catalog.cardinality(v_sent) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'no_sent_evidence');
  END IF;

  FOREACH v_c IN ARRAY p_cited LOOP
    IF v_c = ANY (v_sent) THEN
      IF NOT v_c = ANY (v_cited) THEN v_cited := v_cited || v_c; END IF;
    ELSIF v_c ~ '^record:[0-9a-f-]{36}$' THEN
      SELECT v_cited || COALESCE(pg_catalog.array_agg(s.ref ORDER BY s.ref), '{}')
        INTO v_cited
        FROM pg_catalog.unnest(v_sent) AS s(ref)
       WHERE s.ref LIKE v_c || '#%' AND NOT s.ref = ANY (v_cited);
    END IF;
  END LOOP;
  IF pg_catalog.cardinality(v_cited) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'no_cited_evidence');
  END IF;
  IF pg_catalog.cardinality(v_cited) > 40 THEN
    v_cited := v_cited[1:40];
  END IF;

  v_sha := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_proposal_text || E'\n' || COALESCE(p_rationale, '') || E'\n' || pg_catalog.array_to_string(v_cited, ','),
    'UTF8')), 'hex');

  SELECT * INTO v_existing FROM public.period_card_proposals AS p
   WHERE p.user_id = p_user_id AND p.request_key = p_request_key;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'duplicate', 'proposal_id', v_existing.id,
      'content_sha', v_existing.content_sha);
  END IF;
  UPDATE public.period_card_proposals AS p
     SET status = 'expired', decided_at = pg_catalog.now()
   WHERE p.user_id = p_user_id AND p.star_id = p_star AND p.status = 'proposed';

  INSERT INTO public.period_card_proposals AS p (
    user_id, star_id, request_key, audit_id, vendor, proposal_text, rationale,
    evidence_sent, evidence_cited, content_sha, level_before)
  VALUES (
    p_user_id, p_star, p_request_key, p_audit_id, p_vendor, p_proposal_text, p_rationale,
    v_sent, v_cited, v_sha, p_level_before)
  RETURNING p.id INTO v_id;
  RETURN pg_catalog.jsonb_build_object('status', 'recorded', 'proposal_id', v_id, 'content_sha', v_sha);
END;
$$;

----------------------------------------------------------------------
-- 10. 시기 카드 결정 (화면, authenticated) -- 0195 ratify_polaris_role_card 의 규율
----------------------------------------------------------------------
-- 소유자(남의 제안은 not_found) · 계정 살아 있음(assert_polaris_account_active) · 사용자 단위 직렬화 ·
-- CAS(content_sha) · 상태 검사. 승인이면 인용 근거가 아직 있는지 다시 보고, 같은 별의 지금 승인 카드를
-- 대체하고, 서버가 star_tier_history 에 'seven:<별>' L5 'ratify' 행을 쓴다.
CREATE OR REPLACE FUNCTION public.decide_period_card(
  p_proposal_id uuid,
  p_expected_sha text,
  p_decision text,
  p_miss_text text DEFAULT NULL,
  p_miss_ai_hold boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.period_card_proposals%ROWTYPE;
  v_ref text;
  v_ok boolean := true;
  v_was_l5 boolean;
  v_now timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_proposal_id IS NULL OR p_expected_sha IS NULL OR p_expected_sha !~ '^[0-9a-f]{64}$'
     OR p_decision IS NULL OR p_decision NOT IN ('ratified', 'declined', 'missed')
     OR p_miss_ai_hold IS NULL
     OR (p_decision = 'missed' AND (p_miss_text IS NULL OR pg_catalog.char_length(p_miss_text) NOT BETWEEN 1 AND 500))
     OR (p_decision <> 'missed' AND p_miss_text IS NOT NULL) THEN
    RAISE EXCEPTION 'period_card_decision_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_polaris_account_active(v_uid);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('period_card:' || v_uid::text));

  SELECT * INTO v_p FROM public.period_card_proposals AS p
   WHERE p.id = p_proposal_id AND p.user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  IF v_p.content_sha <> p_expected_sha THEN
    RAISE EXCEPTION 'period_card_changed' USING ERRCODE = 'P0001';
  END IF;
  v_was_l5 := EXISTS (SELECT 1 FROM public.star_tier_history AS h
                       WHERE h.user_id = v_uid AND h.star_id = 'seven:' || v_p.star_id
                         AND h.evidence_origin = 'ratify');
  IF v_p.status = p_decision THEN
    RETURN pg_catalog.jsonb_build_object('status', v_p.status,
      'level', CASE WHEN v_p.status = 'ratified' THEN 5 ELSE v_p.level_before END,
      'was_l5_before', v_was_l5);
  END IF;
  IF v_p.status <> 'proposed' THEN
    RAISE EXCEPTION 'invalid_period_card' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'ratified' THEN
    FOREACH v_ref IN ARRAY v_p.evidence_cited LOOP
      IF NOT EXISTS (
        SELECT 1
          FROM public.interview_transcript_turns AS tt
          JOIN public.interview_transcripts AS tr ON tr.id = tt.transcript_id
         WHERE tr.record_id = pg_catalog.substring(v_ref, '^record:([0-9a-f-]{36})#')::uuid
           AND tr.user_id = v_uid
           AND NOT tr.ai_hold
           AND tt.turn_no = pg_catalog.substring(v_ref, '#t([0-9]{1,4})$')::integer
           AND tt.role = 'user'
           AND NOT tt.ai_hold) THEN
        v_ok := false;
      END IF;
    END LOOP;
    IF NOT v_ok THEN
      UPDATE public.period_card_proposals AS p
         SET status = 'void', decided_at = pg_catalog.now()
       WHERE p.id = v_p.id;
      RETURN pg_catalog.jsonb_build_object('status', 'void', 'reason', 'period_card_evidence_changed',
        'level', v_p.level_before, 'was_l5_before', v_was_l5);
    END IF;
    UPDATE public.period_card_proposals AS p
       SET superseded_by = v_p.id
     WHERE p.user_id = v_uid AND p.star_id = v_p.star_id
       AND p.status = 'ratified' AND p.superseded_by IS NULL AND p.id <> v_p.id;
    -- 승인 시각과 L5 행 시각을 같은 값으로 쓴다. period_card_remove 가 이 쌍으로 그 카드의 L5 행을 찾는다.
    -- now() 는 트랜잭션 시각이라 한 트랜잭션의 두 승인이 같은 값을 갖는다. 호출마다 다른 벽시계 값을 쓴다.
    v_now := pg_catalog.clock_timestamp();
    UPDATE public.period_card_proposals AS p
       SET status = 'ratified', decided_at = v_now
     WHERE p.id = v_p.id;
    INSERT INTO public.star_tier_history AS h (user_id, star_id, level, recorded_at, evidence_origin, evidence_citations)
    VALUES (v_uid, 'seven:' || v_p.star_id, 5, v_now, 'ratify', v_p.evidence_cited);
    RETURN pg_catalog.jsonb_build_object('status', 'ratified', 'level', 5, 'was_l5_before', v_was_l5);
  END IF;

  UPDATE public.period_card_proposals AS p
     SET status = p_decision,
         decided_at = pg_catalog.now(),
         miss_text = CASE WHEN p_decision = 'missed' THEN p_miss_text END,
         miss_ai_hold = CASE WHEN p_decision = 'missed' THEN p_miss_ai_hold ELSE false END
   WHERE p.id = v_p.id;
  RETURN pg_catalog.jsonb_build_object('status', p_decision, 'level', v_p.level_before,
    'was_l5_before', v_was_l5);
END;
$$;

-- 소유자가 자기 카드 한 장을 지운다(D6-07). 승인 카드면 period_card_remove 가 체인을 다시 잇고 그 카드의
-- L5 행을 함께 지운다. 지금 카드를 지우면 직전에 승인한 카드가 다시 선다. 결정 전 · 거절 · 빗나간 곳 행은
-- 그냥 지운다. 승인과 같은 사용자 잠금 아래에서 돈다.
CREATE OR REPLACE FUNCTION public.delete_period_card(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.period_card_proposals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_proposal_id IS NULL THEN
    RAISE EXCEPTION 'period_card_delete_invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_polaris_account_active(v_uid);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('period_card:' || v_uid::text));
  SELECT * INTO v_p FROM public.period_card_proposals AS p
   WHERE p.id = p_proposal_id AND p.user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  PERFORM public.period_card_remove(v_uid, ARRAY[v_p.id]);
  RETURN pg_catalog.jsonb_build_object('status', 'deleted',
    'was_current', v_p.status = 'ratified' AND v_p.superseded_by IS NULL);
END;
$$;

----------------------------------------------------------------------
-- 11. 응답 블록 id (프록시 전용, service_role)
----------------------------------------------------------------------
-- 형식이 맞지 않는 id 가 하나라도 있으면 통째로 버린다(내용 문자열이 섞여 들어오는 것을 막는다).
-- cited 가 block_ids 의 부분집합이 아니면 cited 만 버린다. 사용자는 감사 행(server_verified)에서 읽고,
-- 사용자가 없거나(계정 삭제 뒤 SET NULL) 삭제 중이면 적지 않는다(D6-04 · D6-05: 계정 울타리 공유 잠금).
CREATE OR REPLACE FUNCTION public.record_context_blocks(
  p_audit_id uuid,
  p_purpose text,
  p_reader_version text,
  p_block_ids text[],
  p_cited_ids text[]
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  c_id constant text := '^(record|wiki|card|idcard|source):[A-Za-z0-9._#-]{1,120}$';
  v_cited text[] := p_cited_ids;
  v_user uuid;
  v_n integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_audit_id IS NULL OR p_purpose IS NULL OR p_purpose NOT IN ('secondb_chat')
     OR p_reader_version IS NULL OR p_reader_version !~ '^r[0-9]{1,4}$'
     OR p_block_ids IS NULL OR pg_catalog.cardinality(p_block_ids) > 64
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_block_ids) AS b(id) WHERE b.id IS NULL OR b.id !~ c_id) THEN
    RETURN 'rejected';
  END IF;
  IF v_cited IS NOT NULL AND NOT (v_cited <@ p_block_ids) THEN
    v_cited := NULL;
  END IF;
  SELECT a.user_id INTO v_user
    FROM public.ai_audit_log AS a
   WHERE a.id = p_audit_id AND a.purpose IS NOT DISTINCT FROM p_purpose AND a.event_source = 'server_verified';
  IF NOT FOUND THEN
    RETURN 'no_audit';
  END IF;
  IF v_user IS NULL OR NOT public.interview_account_writable(v_user) THEN
    RETURN 'no_account';
  END IF;
  INSERT INTO public.ai_audit_context_blocks AS b (audit_id, user_id, purpose, reader_version, block_ids, cited_ids)
  VALUES (p_audit_id, v_user, p_purpose, p_reader_version, p_block_ids, v_cited)
  ON CONFLICT (audit_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN CASE WHEN v_n = 0 THEN 'duplicate' ELSE 'recorded' END;
END;
$$;

----------------------------------------------------------------------
-- 12. 본인 판정 내보내기 (authenticated, 읽기 전용)
----------------------------------------------------------------------
-- 판정 일치율(설계 7.3): 자기가 담은 대화의 답 턴별 판정과 그 답 원문. 남의 것은 볼 수 없다.
CREATE OR REPLACE FUNCTION public.export_my_interview_judgements(p_since timestamptz DEFAULT NULL)
RETURNS TABLE (
  session_id uuid, period text, locale text, scene_seq integer, turn_no integer,
  asked_layer text, model_layer text, verdict text, local_gate text, final_credit boolean,
  rule_set text, vendor text, judged_at timestamptz, answer_text text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT s.id, s.period, s.locale, v.scene_seq, v.turn_no,
         v.asked_layer, v.model_layer, v.verdict, v.local_gate, v.final_credit,
         v.rule_set, v.vendor, v.created_at, tt.text
    FROM public.interview_sessions AS s
    JOIN public.interview_probe_verdicts AS v ON v.session_id = s.id
    JOIN public.interview_transcript_turns AS tt
      ON tt.transcript_id = v.transcript_id AND tt.turn_no = v.turn_no
   WHERE (SELECT auth.uid()) IS NOT NULL
     AND s.owner_id = (SELECT auth.uid())
     AND s.committed_at IS NOT NULL
     AND v.link_state = 'linked'
     AND tt.role = 'user'
     AND NOT tt.ai_hold
     AND (p_since IS NULL OR v.created_at >= p_since)
   ORDER BY v.created_at, v.turn_no
$$;

----------------------------------------------------------------------
-- 13. 보관 정리 (pg_cron · service_role)
----------------------------------------------------------------------
-- 결정 전 제안 30일 → expired, 결정된 비승인(declined · missed · expired · void) 365일 → 삭제(Q15),
-- 집계 730일, 응답 블록 id 90일, 접은 세션 id 7일.
CREATE OR REPLACE FUNCTION public.prune_interview_ledgers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_role text := public.billing_request_role();
  v_expired integer;
  v_proposals integer;
  v_rollup integer;
  v_blocks integer;
  v_tombstones integer;
BEGIN
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  UPDATE public.period_card_proposals AS p
     SET status = 'expired', decided_at = pg_catalog.now()
   WHERE p.status = 'proposed' AND p.created_at < pg_catalog.now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  DELETE FROM public.period_card_proposals AS p
   WHERE p.status IN ('declined', 'missed', 'expired', 'void')
     AND p.decided_at < pg_catalog.now() - INTERVAL '365 days';
  GET DIAGNOSTICS v_proposals = ROW_COUNT;
  DELETE FROM public.interview_unsaved_rollup AS u
   WHERE u.week_kst < (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date - 730;
  GET DIAGNOSTICS v_rollup = ROW_COUNT;
  DELETE FROM public.ai_audit_context_blocks AS b
   WHERE b.created_at < pg_catalog.now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_blocks = ROW_COUNT;
  DELETE FROM public.interview_session_tombstones AS t
   WHERE t.created_at < pg_catalog.now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_tombstones = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('expired', v_expired, 'proposals_deleted', v_proposals,
    'rollup_deleted', v_rollup, 'blocks_deleted', v_blocks, 'tombstones_deleted', v_tombstones);
END;
$$;

----------------------------------------------------------------------
-- 14. interview_coverage: 칸은 줄지도, 다른 칸으로 옮겨지지도 않는다 (#2131 그대로)
----------------------------------------------------------------------
-- 0143 은 DELETE 정책을 두지 않아 골라 지우기를 막았지만, UPDATE 로 0 을 쓰면 같은 효과가 났다
-- (R2F-12). 클라이언트의 절대값 upsert 는 옛 화면 폴백으로 아직 살아 있으므로 회수 대신 줄이는
-- UPDATE 만 막는다. 원자적 증가(commit_interview_session)는 이 트리거를 지난다.
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
-- 15. 예약 (pg_cron)
----------------------------------------------------------------------
DO $schedule$
DECLARE
  v_job_id bigint;
  v_name text;
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    FOREACH v_name IN ARRAY ARRAY['sweep-interview-sessions', 'prune-interview-ledgers'] LOOP
      FOR v_job_id IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1' USING v_name LOOP
        EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
      END LOOP;
    END LOOP;
    EXECUTE 'SELECT cron.schedule($1, $2, $3)' INTO v_job_id
      USING 'sweep-interview-sessions', '23 * * * *', 'SELECT public.sweep_interview_sessions();';
    EXECUTE 'SELECT cron.schedule($1, $2, $3)' INTO v_job_id
      USING 'prune-interview-ledgers', '41 18 * * *', 'SELECT public.prune_interview_ledgers();';
  ELSE
    RAISE NOTICE '0225: pg_cron unavailable; sweep_interview_sessions() and prune_interview_ledgers() are not scheduled';
  END IF;
END
$schedule$;

----------------------------------------------------------------------
-- 16. 사후 조건 (권한은 회귀 SQL 이 본다 -- 권한 블록은 파일 끝에 있어야 해서)
----------------------------------------------------------------------
DO $postcondition$
DECLARE
  v_table text;
  v_n integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['interview_sessions', 'interview_probe_verdicts', 'interview_transcripts',
      'interview_transcript_turns', 'period_card_proposals', 'interview_unsaved_rollup', 'ai_audit_context_blocks',
      'interview_session_audit_ids', 'interview_session_tombstones', 'interview_session_starts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c
                    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = v_table
                     AND c.relrowsecurity AND c.relforcerowsecurity) THEN
      RAISE EXCEPTION '0225: % is missing or not under forced RLS', v_table;
    END IF;
  END LOOP;

  -- 판정 원장은 하나다(설계 T-14): model_layer 와 verdict 를 함께 가진 public 표는 하나뿐.
  SELECT pg_catalog.count(*) INTO v_n
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a WHERE a.attrelid = c.oid AND a.attname = 'model_layer' AND NOT a.attisdropped)
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a WHERE a.attrelid = c.oid AND a.attname = 'verdict' AND NOT a.attisdropped);
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0225: expected exactly one verdict ledger table, found %', v_n;
  END IF;

  -- 집계에 원문 · 시각 · id 가 들어갈 자리가 없다(설계 T-15): uuid · 시각 열 0, text 열은 모두 CHECK 안.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a
              WHERE a.attrelid = 'public.interview_unsaved_rollup'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                AND a.atttypid IN ('uuid'::regtype, 'timestamptz'::regtype, 'timestamp'::regtype, 'bytea'::regtype, 'jsonb'::regtype))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a
                 WHERE a.attrelid = 'public.interview_unsaved_rollup'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                   AND a.atttypid = 'text'::regtype
                   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k
                                    WHERE k.conrelid = a.attrelid AND k.contype = 'c' AND a.attnum = ANY (k.conkey))) THEN
    RAISE EXCEPTION '0225: interview_unsaved_rollup has a column that could carry an id, a time or free text';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS g
       WHERE NOT g.tgisinternal
         AND (g.tgrelid, g.tgname) IN (
           ('public.records'::regclass, 'interview_record_erasure'),
           ('public.records'::regclass, 'ai_context_block_record_erasure'),
           ('public.interview_coverage'::regclass, 'trg_interview_coverage_no_decrease'),
           ('public.interview_probe_verdicts'::regclass, 'interview_verdict_erasure'),
           ('public.interview_sessions'::regclass, 'interview_session_count_start'),
           ('public.period_card_proposals'::regclass, 'period_card_delete_guard'))) <> 6 THEN
    RAISE EXCEPTION '0225: a ledger trigger is missing';
  END IF;

  -- 함수는 모두 search_path 를 비운다(SECURITY DEFINER 와 트리거 함수 모두).
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
              JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname IN ('erase_audit_hashes', 'interview_account_writable', 'fold_interview_session',
                                 'interview_verdict_erasure', 'interview_session_count_start',
                                 'record_interview_probe_verdict', 'close_interview_session',
                                 'discard_interview_session', 'commit_interview_session', 'sweep_interview_sessions',
                                 'period_card_remove', 'interview_record_erasure', 'ai_context_block_record_erasure',
                                 'period_card_delete_guard', 'record_period_card_proposal', 'decide_period_card',
                                 'delete_period_card', 'record_context_blocks', 'export_my_interview_judgements',
                                 'prune_interview_ledgers')
               AND NOT (COALESCE(p.proconfig, '{}') @> ARRAY['search_path=""'])) THEN
    RAISE EXCEPTION '0225: a ledger function does not pin an empty search_path';
  END IF;
  -- 승인 카드 지우기 막기는 지우는 역할을 봐야 하므로 정의자 함수가 아니어야 한다.
  IF (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p
       WHERE p.oid = 'public.period_card_delete_guard()'::regprocedure) THEN
    RAISE EXCEPTION '0225: period_card_delete_guard must run as the deleting role';
  END IF;
END
$postcondition$;

----------------------------------------------------------------------
-- 17. 권한 -- 파일 끝에 모은다
----------------------------------------------------------------------
-- check:definer-grants Rule A 의 정규식이 첫 함수 권한 문장부터 문장 경계를 넘어 매칭하므로 그 뒤에는
-- 아무것도 두지 않는다. 새 함수는 Supabase 기본 권한으로 anon · authenticated 에게 EXECUTE 가 붙으므로
-- 같은 파일에서 회수한다(Rule B).

REVOKE ALL ON FUNCTION public.interview_int_array_add(integer[], integer[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.interview_transcript_body(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.erase_audit_hashes(uuid, uuid[], text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.interview_account_writable(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fold_interview_session(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.interview_verdict_erasure() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.interview_session_count_start() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.period_card_remove(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.interview_record_erasure() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_context_block_record_erasure() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.period_card_delete_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.interview_coverage_no_decrease() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, integer, text, text, text, text, text, boolean, text, text, boolean, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_period_card_proposal(uuid, uuid, text, text, text, text, text, jsonb, text[], integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_context_blocks(uuid, text, text, text[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sweep_interview_sessions(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_interview_ledgers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_interview_session(uuid, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_interview_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_interview_session(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_period_card(uuid, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_period_card(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.export_my_interview_judgements(timestamptz) FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.interview_sessions, public.interview_probe_verdicts,
  public.interview_transcripts, public.interview_transcript_turns, public.period_card_proposals,
  public.interview_unsaved_rollup, public.ai_audit_context_blocks,
  public.interview_session_audit_ids, public.interview_session_tombstones, public.interview_session_starts,
  public.interview_scene_metrics, public.record_layer_inferences
  TO service_role;
GRANT SELECT, DELETE ON TABLE public.interview_transcripts, public.interview_transcript_turns,
  public.period_card_proposals
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_interview_probe_verdict(uuid, uuid, uuid, text, text, integer, integer, integer, text, text, text, text, text, boolean, text, text, boolean, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_period_card_proposal(uuid, uuid, text, text, text, text, text, jsonb, text[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_context_blocks(uuid, text, text, text[], text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sweep_interview_sessions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_interview_ledgers() TO service_role;
GRANT EXECUTE ON FUNCTION public.close_interview_session(uuid, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_interview_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_interview_session(uuid, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_period_card(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_period_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_my_interview_judgements(timestamptz) TO authenticated;
