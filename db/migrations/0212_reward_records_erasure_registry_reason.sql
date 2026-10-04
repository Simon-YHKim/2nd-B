-- 0212_reward_records_erasure_registry_reason.sql
-- 초안(Hadrianus, 2026-10-04 19:32 KST). PR-7a(W6, Simon D5 19:27~19:29 KST: 이번 작업과
-- PR-7a 에 포함). Registry-only reason revision after 0211. push 직전에 원격·로컬 번호를
-- 다시 확인하고, 0212 가 쓰였으면 번호를 바꾼다(db/erasure-registry.json forwardRevisions 의
-- 키, rollback/0189_down.sql 의 c_names 항목, CI 왕복 단계의 목록도 함께).
--
-- 0211 이 광고 보상 기록을 89일(방침 최대 90일) 뒤 지우게 되면서 등록부 사유 네 줄이 사실과
-- 달라진다. 사유(reason) 한 칸만 바꾼다. class 는 retained 그대로다(콘텐츠 삭제
-- erase_my_data 는 여전히 이 표들을 건드리지 않는다). 0189·0198·0205 는 배포된 역사라
-- 고치지 않고, db/erasure-registry.json 의 forwardRevisions 가 옛 사유를 기록한다.
--   credit_ledger                 0205 사유 + 광고 보상 로트 89일 정리
--   rewarded_ssv_txns             0189 사유(티켓 도입 전 설명) → 89일 정리 · 재전송 차단 장치
--   reward_ssv_tickets            0189 사유 + 0196 의 1일 정리
--   reward_ssv_issue_rate_limits  0198 사유(영문) → 한국어 + 89일 정리
--
-- 아래 생성 블록은 scripts/erasure-registry-forward.ts 의 renderRegistryRevisionsSql 과 같은
-- 모양으로 손으로 그렸다(박스에 node_modules 가 없어 실행하지 못함). 통합 때 JSON 을 고친 뒤
-- 생성기로 다시 그려 한 글자까지 같은지 check:erasure-registry(G7)로 확인할 것.
--
-- 이 파일은 rollback/0189_down.sql 의 c_names 에 넣어야 한다. 그래서 생성 블록과 주석만 둔다
-- (두 번 적용돼도 같은 행에 같은 사유를 쓸 뿐이다). 0211 보다 뒤에 와야 한다: 사유가 0211 의
-- 함수 이름을 가리키기 때문이다(문구일 뿐 DB 의존은 없다).
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 자기 트랜잭션으로 감싼다.

-- <<< erasure-registry:revisions from db/erasure-registry.json >>>
-- Generated reason revisions only. Owner, class, order and cascade stay as they were;
-- no row is added or removed and user data remains untouched.
DO $erasure_revisions$
DECLARE
  target record;
  v_rows bigint;
BEGIN
  IF to_regclass('public.erasure_registry') IS NULL OR to_regprocedure('public.erase_my_data(text)') IS NULL THEN
    RAISE EXCEPTION 'erasure_revisions_prerequisites_missing';
  END IF;
  IF has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
     OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'erasure_revisions_rpc_must_remain_locked';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('credit_ledger', 'user_id', 'retained', NULL::int, NULL::text,
     '로트 종류마다 계정 삭제 때 운명이 다르다. 구매(purchase) 로트는 여는 행과 그 로트의 모든 행이 구매 사실과 미사용 잔량의 증거다. 취소권 기간이 계정보다 오래 살아남으므로 user_id 만 NULL 로 비우고 남긴다(0134 ON DELETE SET NULL · 설계서 F5). 광고 보상(ad_reward)·프로모(promo) 로트는 돈을 낸 기록이 아니므로, 계정 삭제 직전 public.users 의 BEFORE DELETE 트리거가 여는 행과 그 로트의 모든 행을 지운다(0202 · 0204). 콘텐츠 삭제(erase_my_data)는 이 표를 건드리지 않는다.',
     '로트 종류마다 계정 삭제 때 운명이 다르다. 구매(purchase) 로트는 여는 행과 그 로트의 모든 행이 구매 사실과 미사용 잔량의 증거다. 취소권 기간이 계정보다 오래 살아남으므로 user_id 만 NULL 로 비우고 남긴다(0134 ON DELETE SET NULL · 설계서 F5). 광고 보상(ad_reward)·프로모(promo) 로트는 돈을 낸 기록이 아니므로, 계정 삭제 직전 public.users 의 BEFORE DELETE 트리거가 여는 행과 그 로트의 모든 행을 지운다(0202 · 0204). 광고 보상 로트는 계정이 남아 있어도, 여는 행이 89일(방침 최대 90일)보다 오래되고 만료돼 합계가 0 이면 purge_reward_records() 가 매일 로트 전체를 지운다(0211, 분쟁 보류 중인 거래의 로트는 보류가 풀릴 때까지 남는다). 콘텐츠 삭제(erase_my_data)는 이 표를 건드리지 않는다.'),
    ('reward_ssv_issue_rate_limits', 'user_id', 'retained', NULL::int, NULL::text,
     'Bounded rewarded-ticket issuance counter. Content deletion must not reset the issuance limit; account deletion cascades the counter through public.users.',
     '광고 보상 티켓 발급 횟수 제한 카운터. 콘텐츠 삭제가 발급 제한을 초기화하면 안 되므로 남긴다. 마지막 갱신부터 89일(방침 최대 90일)이 지나면 purge_reward_records() 가 매일 지운다(0211). 계정 삭제 때는 public.users 연쇄로 지워진다(0198).'),
    ('reward_ssv_tickets', 'user_id', 'retained', NULL::int, NULL::text,
     '서명된 광고 콜백을 사용자에게 묶는 단기 권한의 소비 기록. 지우면 같은 티켓을 다시 쓸 수 있다(0177).',
     '서명된 광고 콜백을 사용자에게 묶는 단기 권한의 소비 기록. 콘텐츠 삭제는 지우지 않는다(지우면 아직 유효한 티켓을 다시 쓸 수 있다, 0177). 미사용 티켓은 20분 만료 뒤, 소비한 티켓은 1일 뒤 purge-reward-ssv-tickets 가 지운다(0196). 계정 삭제 때는 public.users 연쇄로 지워진다(0202).'),
    ('rewarded_ssv_txns', 'user_id', 'retained', NULL::int, NULL::text,
     '광고 transaction_id 기준 재생 방지 원장. 지우면 한 번의 시청을 월 상한까지 반복 적립할 수 있다(0079).',
     '광고 transaction_id 기준 재생 방지 원장. 콘텐츠 삭제(erase_my_data)는 지우지 않는다(지우면 아직 살아 있는 콜백으로 같은 시청을 다시 적립할 수 있다, 0079). 적립 시각부터 89일(방침 최대 90일)이 지나면 purge_reward_records() 가 매일 지운다(0211). 그 뒤 같은 콜백의 재전송은 1일 안에 지워지는 티켓(0196)과 1일 콜백 시각 검사(0213)가 막는다. 분쟁 보류(reward_dispute_holds) 중인 거래만 보류가 풀릴 때까지 남는다. 계정 삭제 때는 public.users 연쇄로 지워진다(0202).')
  ) AS revisions(table_name,owner_column,class,delete_order,cascades_from,previous_reason,reason) LOOP
    UPDATE public.erasure_registry AS r SET reason = target.reason
     WHERE r.table_name = target.table_name AND r.owner_column = target.owner_column
       AND r.class = target.class AND r.delete_order IS NOT DISTINCT FROM target.delete_order
       AND r.cascades_from IS NOT DISTINCT FROM target.cascades_from
       AND r.reason IN (target.previous_reason, target.reason);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'erasure_revisions_row_not_in_recorded_state: %', target.table_name;
    END IF;
  END LOOP;
END $erasure_revisions$;
-- <<< /erasure-registry:revisions >>>
