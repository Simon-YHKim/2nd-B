-- 0189_erasure_registry.sql
-- Integration candidate only: re-scan remote/local migration numbers immediately
-- before push and renumber if 0189 was taken in the meantime.
--
-- Simon 확정 결정 4 (DECISIONS.md 26.09.20 08:45) 의 1단계. 설계는
-- docs/S3-SERVER-DELETION.md (S3-E). 이 마이그레이션은 서버 조각 하나만 놓는다:
-- 삭제 등록부 표와 그 등록부를 읽어 도는 erase_my_data() RPC.
--
-- ⚠ 클라이언트는 아직 이 함수를 부르지 않는다. 배포가 먼저, 전환이 나중이다
--   (0127/0130 과 같은 함정: 변수를 먼저 켜면 전부 실패한다).
--
-- 왜 표에 등록부를 두는가. 지울 표의 목록이 손으로 관리됐고, 스키마와 어긋났고,
-- 아무 검사도 그걸 보지 않았다. 설계서가 센 세 가지:
--   F1 chat_usage 삭제는 항상 0행이다. 0025 가 chat_usage_owner_all 을 내리고
--      SELECT 전용 정책만 남겼는데, RLS 는 행을 걸러낼 뿐 오류를 내지 않아서
--      아무것도 안 지운 삭제가 성공으로 보고됐다.
--   F2 delete-bulk.ts 주석은 personas 에 DELETE 정책이 없다고 적었지만
--      personas_owner_all 은 0009 부터 FOR ALL 이다.
--   F4 소유자가 지울 수 있는 표 열한 개가 목록 밖에 있었다.
--
-- 원본은 db/erasure-registry.json 하나다. 아래 시드 블록은 그 파일에서
-- scripts/generate-erasure-registry.ts --sql 로 뽑은 것이고,
-- scripts/check-erasure-registry.ts 가 둘이 어긋나면 CI 를 깨뜨린다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로
-- 감싸므로 여기서 또 열면 중첩된다 (supabase-dry-run.yml 이 0147 이상에 대해 막는다).

----------------------------------------------------------------------
-- 1. 등록부 표.
--
-- 사용자 데이터가 아니라 스키마 메타데이터다. 소유자 열이 없으므로
-- generate-erasure-registry 의 탐색에도 걸리지 않는다 (자기 자신을 분류하지 않는다).
--
-- RLS 를 켜고 정책을 하나도 만들지 않는다 = authenticated 에게 완전 차단.
-- erase_my_data 가 SECURITY DEFINER 라 함수 안에서는 읽힌다. 이 표가
-- 클라이언트에게 쓰기 가능해지면 임의 표 삭제로 바뀌므로 그쪽을 막는 것이 핵심이다.
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.erasure_registry (
  table_name   text PRIMARY KEY,
  owner_column text NOT NULL,
  class        text NOT NULL
                 CHECK (class IN ('client_erasable', 'retained', 'account_delete_only')),
  delete_order int,
  reason       text NOT NULL,
  -- 순서는 client_erasable 에만 있고, 거기에는 반드시 있다. FK 와 CHECK 가
  -- 진짜 순서를 강요한다 (wiki_pages 는 sources 보다 먼저).
  CONSTRAINT erasure_registry_order_pair CHECK (
    (class = 'client_erasable' AND delete_order IS NOT NULL)
    OR (class <> 'client_erasable' AND delete_order IS NULL)
  )
);

ALTER TABLE public.erasure_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erasure_registry FROM anon, authenticated;

COMMENT ON TABLE public.erasure_registry IS
  'db/erasure-registry.json 의 DB 사본. 손으로 고치지 않는다 - 그 JSON 을 고치고 scripts/generate-erasure-registry.ts --sql 로 다시 뽑는다.';

----------------------------------------------------------------------
-- 2. 시드. 아래 블록은 생성물이다.
----------------------------------------------------------------------

-- <<< erasure-registry:generated from db/erasure-registry.json >>>
-- 손으로 고치지 않는다. db/erasure-registry.json 을 고치고
--   npx tsx scripts/generate-erasure-registry.ts --sql
-- 를 돌려 이 블록을 통째로 갈아 끼운다. check:erasure-registry 가 대조한다.
WITH incoming (table_name, owner_column, class, delete_order, reason) AS (
  VALUES
    ('account_export_rate_limits', 'user_id', 'retained', NULL, '내보내기 남용 방지 한도. 지울 수 있게 두면 한도가 매번 초기화되어 제한이 사라진다.'),
    ('ai_audit_log', 'user_id', 'retained', NULL, '하드 제약 C3 의 감사 원장. 0011 이 FK 를 ON DELETE SET NULL 로 바꿔 계정이 사라져도 행이 남는다(설계서 F5). 해시만 저장해 원문은 없다.'),
    ('billing_self_service_log', 'user_id', 'retained', NULL, '환불·해지 요청의 멱등 청구권이 이 행 위의 부분 유니크 색인으로 서 있다. 지우면 같은 거래에 두 번째 환불이 통과한다(0115).'),
    ('billing_self_service_rate_limits', 'user_id', 'retained', NULL, '결제 셀프서비스 남용 방지 한도. 지우면 한도를 되감을 수 있다(0184).'),
    ('chat_usage', 'user_id', 'retained', NULL, '일일 대화 쿼터 원장. 0025 가 owner_all 을 내리고 SELECT 전용만 남겨 소유자 DELETE 는 항상 0행이다(설계서 F1). 지울 수 있게 되면 쿼터 상한을 우회한다.'),
    ('clipper_templates', 'owner_id', 'client_erasable', 71, '내가 만든 클리퍼 템플릿. 남이 채택해 간 사본은 독립된 행이라 건드리지 않는다(0027).'),
    ('community_blocks', 'blocker_id', 'retained', NULL, '커뮤니티는 CLAUDE.md 의 미결 항목이다. 게이트를 임의로 풀지 말라는 지시가 있어 이 경로의 대상으로 올리지 않는다. 전환 전에 결정이 필요하다.'),
    ('community_invites', 'created_by', 'retained', NULL, '커뮤니티는 CLAUDE.md 의 미결 항목이다. 초대를 일괄 회수하면 남의 방 상태가 같이 바뀐다. 전환 전에 결정이 필요하다.'),
    ('community_message_reports', 'reporter_id', 'account_delete_only', NULL, '신고 원장에 소유자 DELETE 정책이 없다(0126). 조정 기록이라 신고자가 지울 수 없게 둔 것이다.'),
    ('community_messages', 'sender_id', 'retained', NULL, '커뮤니티는 CLAUDE.md 의 미결 항목이다. 내 메시지를 지우면 남의 대화 맥락이 함께 끊긴다. 전환 전에 결정이 필요하다.'),
    ('community_profiles', 'user_id', 'account_delete_only', NULL, '커뮤니티 프로필에 소유자 DELETE 정책이 없다(0126). 방 참여 기록이 가리키는 대상이라 계정 삭제로만 사라진다.'),
    ('community_room_members', 'user_id', 'retained', NULL, '커뮤니티는 CLAUDE.md 의 미결 항목이다. 전체 삭제가 모든 방을 자동 탈퇴시키는 것이 맞는지 정해지지 않았다.'),
    ('community_rooms', 'created_by', 'account_delete_only', NULL, '만든 사람이 지우면 참여자 전원의 방이 사라진다. 그래서 DELETE 정책이 없고 계정 삭제 때는 created_by 만 SET NULL 로 풀린다(설계서 F5).'),
    ('consent_changes', 'user_id', 'retained', NULL, 'PIPA 제37조 동의 철회와 GDPR 제7조 3항을 증명하는 append-only 전환 원장. 철회는 설정값의 부재로 추정하는 것이 아니라 증명할 수 있어야 한다(0062).'),
    ('consent_records', 'user_id', 'retained', NULL, 'PIPA 동의 이력 원장(append-only). 지우면 동의를 받았다는 근거 자체가 사라진다(0031).'),
    ('content_reports', 'reporter_id', 'account_delete_only', NULL, 'UGC 신고 원장에 소유자 DELETE 정책이 없다(0097). 신고자가 지우면 조정 근거가 사라지기 때문이다.'),
    ('credit_backfill_0135', 'user_id', 'retained', NULL, '0135 컷오버 시점 잔액의 유일한 증거이고 되돌리기 경로가 여기서 재계산한다. 마이그레이션 COMMENT 가 ''지우지 않고 남긴다'' 고 직접 적었다.'),
    ('credit_balance', 'user_id', 'retained', NULL, '크레딧 잔액. 지울 수 있게 두면 소비한 크레딧이 되살아난다(0134).'),
    ('credit_ledger', 'user_id', 'retained', NULL, '구매 사실과 미사용 잔량의 증거. 취소권 기간이 계정보다 오래 살아남으므로 계정 삭제 때도 SET NULL 로 남긴다(0134 · 설계서 F5).'),
    ('esm_responses', 'user_id', 'client_erasable', 54, '순간 경험 응답. 내가 적은 것이고 esm_owner_all 이 FOR ALL 이다(0042).'),
    ('gemini_spend_daily', 'user_id', 'retained', NULL, '세 벤더 공용 일일 지출 상한 카운터(이름만 gemini 다). 소유자에게 SELECT 만 열려 있고, 지울 수 있으면 상한을 무한히 되감는다(0035).'),
    ('guardian_consents', 'child_user_id', 'retained', NULL, '14세 미만 가입에 필요한 PIPA 제22조의2 법정대리인 동의 원장. 0029 가 service_role 전용으로 잠가 클라이언트 경로 자체가 없다.'),
    ('health_samples', 'user_id', 'client_erasable', 53, '민감한 건강 표본. 내 것이고 health_samples_owner_all 이 FOR ALL 이다(0049). 별도 동의로 받은 만큼 철회도 실제로 지워져야 한다.'),
    ('informant_consents', 'subject_user_id', 'retained', NULL, '제3자 정보제공자 본인의 옵트인 기록이라 동의 주체가 다르다. 대상 사용자의 삭제로 지우면 타인의 동의 증거가 사라진다(0064).'),
    ('ingest_log', 'user_id', 'account_delete_only', NULL, '가져오기 중복 판정 로그에 소유자 DELETE 정책이 없다(0044 · 설계서 F3). 계정 삭제 연쇄로만 사라진다.'),
    ('interview_coverage', 'user_id', 'account_delete_only', NULL, '별 밝기를 세는 커버리지 표에 소유자 DELETE 정책이 없다(0143 · 설계서 F3). 계정 삭제 연쇄로만 사라진다.'),
    ('knowledge_sources', 'added_by', 'retained', NULL, '하드 제약 C8 의 공용 큐레이션 자료라 내 것이 아니다. 0186 이 added_by 는 CASCADE, verified_by 는 SET NULL 로 갈라 두었다.'),
    ('llm_proxy_purpose_daily', 'user_id', 'retained', NULL, '좌석별 일일 쿼터 카운터. 지우면 상한이 초기화된다(0185).'),
    ('memorized_patterns', 'user_id', 'account_delete_only', NULL, '소유자에게 SELECT 와 INSERT 만 열려 있다(0017 · 설계서 F3). 계정 삭제 연쇄로만 사라진다.'),
    ('oauth_naver_identities', 'user_id', 'retained', NULL, '네이버 주체와 사용자를 묶는 결합 기록. 지우면 같은 네이버 계정으로 두 번째 사용자가 만들어질 수 있고 로그인이 끊긴다(0183).'),
    ('ops_daily_brief', 'user_id', 'client_erasable', 66, '개인 비서 일일 브리핑. 내 것이고 owner_all 이 FOR ALL 이다(0069).'),
    ('ops_ledger', 'user_id', 'client_erasable', 62, '개인 비서 가계 기록. 내 것이고 owner_all 이 FOR ALL 이다(0052). 매출 원장 revenue_events 와는 다른 표다.'),
    ('ops_meal_plan', 'user_id', 'client_erasable', 65, '개인 비서 식단. 내 것이고 owner_all 이 FOR ALL 이다(0055).'),
    ('ops_milestones', 'user_id', 'client_erasable', 64, '개인 비서 마일스톤. 내 것이고 owner_all 이 FOR ALL 이다(0054).'),
    ('ops_reading', 'user_id', 'client_erasable', 63, '개인 비서 독서 기록. 내 것이고 owner_all 이 FOR ALL 이다(0053).'),
    ('ops_routine_logs', 'user_id', 'client_erasable', 60, '루틴 수행 로그. ops_routines 를 지우면 연쇄로 사라지지만 순서를 명시해 둔다(0048).'),
    ('ops_routines', 'user_id', 'client_erasable', 61, '개인 비서 루틴. 내 것이고 owner_all 이 FOR ALL 이다(0048).'),
    ('paddle_webhook_events', 'user_id', 'retained', NULL, 'Paddle 웹훅 재전송을 한 번만 처리하게 만드는 중복 제거 원장. 지우면 같은 결제가 다시 적용된다(0087 · 설계서 F5 의 SET NULL 목록).'),
    ('peer_invitations', 'user_id', 'account_delete_only', NULL, '동료 관찰 초대에 소유자 DELETE 정책이 없다(0064). 상대방이 응답을 남긴 초대라 한쪽이 지우게 두지 않았다.'),
    ('peer_observations', 'subject_user_id', 'account_delete_only', NULL, '동료가 나에 대해 남긴 관찰이다. 대상자에게 DELETE 정책이 없다(0064) - 내가 남의 기록을 지우는 모양이 되기 때문이다.'),
    ('persona_entity', 'user_id', 'client_erasable', 44, '페르소나 그래프의 개체. 내 것이고 persona_entity_owner 가 FOR ALL 이다(0103).'),
    ('persona_reasoning_trace', 'user_id', 'client_erasable', 43, '페르소나 추론 자취. 내 것이고 persona_trace_owner 가 FOR ALL 이다(0103). entity_id 가 SET NULL 이라 개체보다 먼저 지운다.'),
    ('persona_relation', 'user_id', 'client_erasable', 42, '페르소나 그래프의 관계. src·dst 가 persona_entity 를 CASCADE 로 물고 있어 개체보다 먼저 지운다(0103).'),
    ('personas', 'user_id', 'client_erasable', 41, '북극성 페르소나(위키의 파생 요약). personas_owner_all 이 FOR ALL 이라 DELETE 가 열려 있다(0009) - delete-bulk.ts 주석이 ''정책이 없다'' 고 적은 것은 틀렸다(설계서 F2).'),
    ('public_data_quota_daily', 'user_id', 'retained', NULL, '공공데이터 프록시 일일 쿼터. 지우면 상한이 초기화된다(0171).'),
    ('reasoning_runs', 'user_id', 'account_delete_only', NULL, '추론 실행 기록에 소유자 DELETE 정책이 없다(0092). 유료 자격 판정이 이 행을 세므로 지울 수 있게 열려면 쿼터 영향을 먼저 봐야 한다.'),
    ('records', 'user_id', 'client_erasable', 30, '사용자가 쓴 기록 본체. records_owner_all 이 FOR ALL 이다(0009).'),
    ('recreation_items', 'user_id', 'client_erasable', 56, '휴식 항목. 내 것이고 owner_all 이 FOR ALL 이다(0059 · 0061).'),
    ('relation_people', 'user_id', 'client_erasable', 55, '내가 적어 둔 관계 인물. 내 것이고 owner_all 이 FOR ALL 이다(0058 · 0061). 제3자의 개인정보가 들어 있어 더욱 지워져야 한다.'),
    ('resurface_ledger', 'user_id', 'account_delete_only', NULL, '꺼내기 원장에 소유자 DELETE 정책이 없다(0145 · 설계서 F3). 계정 삭제 연쇄로만 사라진다.'),
    ('revenue_events', 'user_id', 'retained', NULL, '하드 제약 C4 의 매출 원장. user_id 가 SET NULL 이라 계정이 사라져도 거래 사실은 남는다(0005 · 설계서 F5).'),
    ('reward_ssv_tickets', 'user_id', 'retained', NULL, '서명된 광고 콜백을 사용자에게 묶는 단기 권한의 소비 기록. 지우면 같은 티켓을 다시 쓸 수 있다(0177).'),
    ('rewarded_ssv_txns', 'user_id', 'retained', NULL, '광고 transaction_id 기준 재생 방지 원장. 지우면 한 번의 시청을 월 상한까지 반복 적립할 수 있다(0079).'),
    ('self_contexts', 'user_id', 'client_erasable', 40, '대화에서 뽑아 둔 자기 맥락. 내 것이고 self_contexts_owner_all 이 FOR ALL 이다(0021).'),
    ('sources', 'user_id', 'client_erasable', 20, '가져온 원본 자료. wiki_pages 의 source_kind_pair CHECK 때문에 위키 페이지보다 나중에 지운다(0022).'),
    ('srs_cards', 'user_id', 'client_erasable', 52, '복습 카드. 내 것이고 owner_all 이 FOR ALL 이다(0051).'),
    ('srs_reviews', 'user_id', 'client_erasable', 51, '복습 이력. srs_cards 를 CASCADE 로 물고 있어 카드보다 먼저 지운다(0051 · 0084).'),
    ('star_tier_history', 'user_id', 'client_erasable', 50, '별 밝기 등급 이력. 내 것이고 owner_all 이 FOR ALL 이다(0045 · 0061).'),
    ('template_blocks', 'blocker_id', 'client_erasable', 70, '내가 건 템플릿 차단 목록. 내 설정이고 owner_delete 정책이 있다(0097). clipper_templates 를 CASCADE 로 물고 있어 먼저 지운다.'),
    ('testimonials', 'user_id', 'client_erasable', 80, '내가 쓴 후기 본문. testimonials_owner_all 이 FOR ALL 이다(0009). 하드 제약 C5 는 남아 있는 행의 consent_given_at 가 NOT NULL 이어야 한다는 것이라 행 삭제와 충돌하지 않는다.'),
    ('usage_counters', 'user_id', 'retained', NULL, '월 단위 추론 사용량 카운터. 소유자에게 SELECT·INSERT·UPDATE 만 열려 있다(0057 · 설계서 F3). 지우면 유료 상한이 그 달에 초기화된다.'),
    ('user_notice_reads', 'user_id', 'account_delete_only', NULL, '공지 읽음 표시에 소유자 DELETE 정책이 없다(0113). 지워 봐야 읽지 않은 상태로 되돌아갈 뿐이라 열어 둘 이유도 없다.'),
    ('user_roles', 'user_id', 'retained', NULL, 'admin·developer·support 직무 권한이고 service_role 만 쓴다. 결제가 운영 권한을 덮어쓰지 못하게 subscription_tier 와 일부러 분리한 표다(0139).'),
    ('wiki_links', 'user_id', 'client_erasable', 11, '위키 페이지 사이의 연결. wiki_pages 를 CASCADE 로 물고 있지만 순서를 명시해 둔다(0022).'),
    ('wiki_pages', 'user_id', 'client_erasable', 10, 'LLM 위키의 페이지 본문. source_kind_pair CHECK 때문에 sources 보다 먼저 지워야 한다(0022).'),
    ('xp_events', 'user_id', 'account_delete_only', NULL, '소유자에게 SELECT 만 열려 있다(0019 · 설계서 F3). 계정 삭제 연쇄로만 사라진다.')
),
upserted AS (
  INSERT INTO public.erasure_registry AS r (table_name, owner_column, class, delete_order, reason)
  SELECT i.table_name, i.owner_column, i.class, i.delete_order::int, i.reason
  FROM incoming AS i
  ON CONFLICT (table_name) DO UPDATE
    SET owner_column = EXCLUDED.owner_column,
        class        = EXCLUDED.class,
        delete_order = EXCLUDED.delete_order,
        reason       = EXCLUDED.reason
  RETURNING r.table_name
)
DELETE FROM public.erasure_registry AS r
WHERE NOT EXISTS (SELECT 1 FROM incoming AS i WHERE i.table_name = r.table_name);
-- <<< /erasure-registry:generated >>>

----------------------------------------------------------------------
-- 3. 등록부가 실재하는 스키마를 가리키는지 적용 시점에 확인한다.
--
-- 정적 검사(check:erasure-registry)는 db/migrations 텍스트를 읽지만 이 DO 블록은
-- 실제 카탈로그를 읽는다. CI 의 supabase-dry-run 이 0001~0188 을 올린 뒤 이 파일을
-- 적용하므로, 등록부에 오타가 있으면 초록으로 지나가지 않고 여기서 멈춘다.
----------------------------------------------------------------------

DO $registry_check$
DECLARE
  v_missing text;
BEGIN
  SELECT pg_catalog.string_agg(r.table_name || '.' || r.owner_column, ', ' ORDER BY r.table_name)
    INTO v_missing
  FROM public.erasure_registry AS r
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS a
    JOIN pg_catalog.pg_class     AS c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = r.table_name
      AND a.attname = r.owner_column
      AND a.attnum > 0
      AND NOT a.attisdropped
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'erasure_registry names columns that do not exist: %', v_missing;
  END IF;
END;
$registry_check$;

----------------------------------------------------------------------
-- 4. erase_my_data(p_scope).
--
-- 반환은 영수증이다 (설계서 I2 · I3). 표별 삭제 행수와, 남긴 표 + 그 사유를
-- 같이 돌려준다. 클라이언트가 받은 0 하나로는 "없었다" 와 "못 지웠다" 를
-- 구분할 수 없다는 것이 F1 의 교훈이라, 둘을 서로 다른 칸에 넣는다:
--   deleted[table] = n  -> 지울 수 있는 표였고 n 행 지웠다 (n=0 이면 원래 없었다)
--   kept[]              -> 애초에 대상이 아니다. class 와 사유가 함께 붙는다
--
-- SECURITY DEFINER 는 RLS 를 우회한다. 그래서 소유자 범위를 좁히는 것은
-- 정책이 아니라 이 함수 안의 `WHERE <owner> = auth.uid()` 뿐이고,
-- auth.uid() 가 NULL 이면 아무 일도 하기 전에 예외를 던진다.
--
-- 그럼에도 등록부의 client_erasable 집합은 "소유자가 스스로 지울 수 있는 것" 과
-- 같게 유지한다 (check:erasure-registry G3). DEFINER 가 무엇이든 지울 수 있다는
-- 사실은 이 RPC 가 보존 원장을 지우는 뒷문이 되어도 된다는 뜻이 아니다.
--
-- search_path 는 '' 로 고정한다. 그래서 아래 모든 참조가 스키마 한정이다.
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erase_my_data(p_scope text DEFAULT 'content')
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $erase_my_data$
DECLARE
  v_uid       uuid := auth.uid();
  v_row       record;
  v_deleted   bigint;
  v_counts    jsonb := '{}'::jsonb;
  v_kept      jsonb;
  v_total     bigint := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'erase_my_data requires an authenticated caller'
      USING ERRCODE = '28000';
  END IF;

  -- 지금은 콘텐츠 삭제 하나뿐이다. 계정 삭제는 다른 길이고 건강하다 (설계서 F5):
  -- public.users -> auth.users 연쇄가 45개 표를 데려가고 보존 대상만 SET NULL 이다.
  -- 그 경로를 이 함수로 끌어오지 않는다.
  IF p_scope IS DISTINCT FROM 'content' THEN
    RAISE EXCEPTION 'erase_my_data: unknown scope %', p_scope
      USING ERRCODE = '22023';
  END IF;

  FOR v_row IN
    SELECT r.table_name, r.owner_column
    FROM public.erasure_registry AS r
    WHERE r.class = 'client_erasable'
    ORDER BY r.delete_order, r.table_name
  LOOP
    EXECUTE pg_catalog.format(
      'DELETE FROM public.%I WHERE %I = $1', v_row.table_name, v_row.owner_column
    ) USING v_uid;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_counts := v_counts || pg_catalog.jsonb_build_object(v_row.table_name, v_deleted);
    v_total  := v_total + v_deleted;
  END LOOP;

  SELECT pg_catalog.coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'table',  r.table_name,
               'class',  r.class,
               'reason', r.reason
             )
             ORDER BY r.class, r.table_name
           ),
           '[]'::jsonb
         )
    INTO v_kept
  FROM public.erasure_registry AS r
  WHERE r.class <> 'client_erasable';

  RETURN pg_catalog.jsonb_build_object(
    'scope',         p_scope,
    'erased_at',     pg_catalog.to_jsonb(pg_catalog.clock_timestamp()),
    'deleted',       v_counts,
    'deleted_total', v_total,
    'kept',          v_kept
  );
END;
$erase_my_data$;

----------------------------------------------------------------------
-- 5. 권한. Supabase 는 새 함수에 anon EXECUTE 를 자동으로 준다.
--    PUBLIC 에서만 회수하면 anon 의 명시적 부여가 그대로 남는다 (0036 · 0082).
--    scripts/check-definer-grants.ts 규칙 B 가 이 줄을 강제한다.
----------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.erase_my_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erase_my_data(text) TO authenticated;

COMMENT ON FUNCTION public.erase_my_data(text) IS
  '콘텐츠 삭제(계정 유지). 대상은 public.erasure_registry 의 client_erasable 행이고, 반환은 표별 행수 + 남긴 표와 사유가 담긴 영수증이다.';
